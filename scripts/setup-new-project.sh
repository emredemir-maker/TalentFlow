#!/usr/bin/env bash
# TalentFlow'u kişisel hesaptaki Firebase projesine kuran betik — veri taşımadan, temiz kurulum.
# Proje YENİDEN KULLANILAN, başka işlerle paylaşılan bir proje olabilir: betik HİÇBİR ŞEY SİLMEZ, var olanı
# değiştirmez (yalnızca ekler) ve çakışma riski gördüğü yerde ! ile uyarır.
# Windows'ta Git Bash'te çalışır (gerekenler: gcloud CLI + `gcloud auth login`, Node, curl, openssl;
# Git for Windows curl ve openssl'i getirir). Cloud Shell gerekmez; jq yerine node kullanılır.
#
#   bash scripts/setup-new-project.sh                 # proje .firebaserc'den, site firebase.json'dan
#   bash scripts/setup-new-project.sh <proje-kimliği> # farklı proje: .firebaserc'ye de yazar
#
# Tekrar çalıştırmak güvenlidir: var olan her şey atlanır, her adım ✓ ya da ! ile biter.
# Gizli değerler ekrana basılmaz: gizli sorulur ve doğrudan GitHub secret'ına yazılır (gh CLI varsa).
# Betiğin yapamadığı konsol adımları ve sırası: docs/yeni-proje-kurulumu.md.
#
# Ortam değişkenleri (isteğe bağlı):
#   GH_REPO=sahip/depo        GitHub deposu (varsayılan emredemir-maker/TalentFlow)
#   FIRESTORE_LOCATION=...    Firestore konumu (sorulmasın diye; sonradan DEĞİŞTİRİLEMEZ)
#   APP_DOMAIN=ik.ornek.com   Özel alan adı bağlanacaksa Auth izinli alanlarına eklenir
#   FORCE_SECRETS=1           Bu proje için daha önce yazılmış secret'ları yeniden sor
#   SITE_CANDIDATES="a b"     firebase.json'daki site alınmışsa denenecek yedek adlar
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

REPO="${GH_REPO:-emredemir-maker/TalentFlow}"
REGION=us-central1   # functions/index.js ile aynı olmalı
OLD_PROJECT=talentflow-84bb6
WARN=0
ok()    { echo "  ✓ $*"; }
warn()  { echo "  ! $*"; WARN=$((WARN + 1)); }
step()  { echo; echo "▶ $*"; }
quiet() { "$@" >/dev/null 2>&1; }
die()   { echo "  ! $*"; exit 1; }
# jq yerine node: stdin'deki JSON'dan noktalı yol ile değer okur (ör. apps.0.appId).
jget() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let v=JSON.parse(s);
    for(const k of process.argv[1].split(".").filter(Boolean)) v=v==null?v:v[k];
    if(v!=null) process.stdout.write(typeof v==="object"?JSON.stringify(v):String(v));}catch{}})' "$1"
}

step "0/10 Ön kontroller"
for T in gcloud node curl openssl; do command -v $T >/dev/null 2>&1 || die "$T bulunamadı; kurup yeniden çalıştırın."; done
ACCOUNT=$(gcloud config get-value account 2>/dev/null)
[ -n "$ACCOUNT" ] || die "gcloud oturumu yok: gcloud auth login"
ok "gcloud hesabı: $ACCOUNT"

CURRENT=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(".firebaserc","utf8")).projects.default||"")}catch{}')
P="${1:-$CURRENT}"
# Sıra önemli: modül yolu argv[1] olursa modül kendini komut satırından çağrılmış sanıp tam denetimi çalıştırır.
node -e 'import(require("url").pathToFileURL(process.argv[2]).href).then(m=>{const e=m.validateProjectId(process.argv[1]);if(e){console.error("  ! "+e);process.exit(1)}})' \
  "$P" scripts/check-project-config.mjs || die "Kullanım: bash scripts/setup-new-project.sh [proje-kimliği]"
if [ "$CURRENT" != "$P" ]; then
  node -e 'const f=".firebaserc",fs=require("fs");const c=JSON.parse(fs.readFileSync(f,"utf8"));c.projects={...c.projects,default:process.argv[1]};fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n")' "$P"
  ok ".firebaserc → $P yazıldı (commit'lemeyi unutmayın — kimliğin tek yeri burası)"
else ok "proje: $P (.firebaserc)"; fi

quiet gcloud projects describe "$P" || die "$P projesine erişilemiyor. Bu hesap projenin sahibi mi? (docs/yeni-proje-kurulumu.md adım 1)"
gcloud config set project "$P" >/dev/null 2>&1
PARENT=$(gcloud projects describe "$P" --format='value(parent.type,parent.id)' 2>/dev/null)
if [ -n "$PARENT" ]; then warn "proje bir üst kaynağa bağlı ($PARENT). Kişisel kurulum için 'No organization' beklenir; eski şirketin organizasyonu ise DURUN."
else ok "proje herhangi bir organizasyona bağlı değil"; fi
NUM=$(gcloud projects describe "$P" --format='value(projectNumber)')
BILLING=$(gcloud billing projects describe "$P" --format='value(billingEnabled)' 2>/dev/null)
case "$BILLING" in
  True)  ok "faturalandırma açık (Blaze)" ;;
  False) die "faturalandırma kapalı. Firebase Console → ⚙ → Usage and billing → Blaze planına geçin (adım 2), sonra yeniden çalıştırın." ;;
  *)     warn "faturalandırma durumu okunamadı; Blaze planında olduğundan emin olun (Functions ve Storage için şart)." ;;
esac

TOKEN=$(gcloud auth print-access-token)
H=(-H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $P" -H "Content-Type: application/json")
OUT="${TMPDIR:-/tmp}/tf-setup.json"
api() { curl -s -o "$OUT" -w '%{http_code}' "${H[@]}" "$@"; }

step "1/10 Servisler açılıyor (birkaç dakika sürebilir)"
APIS="firebase.googleapis.com firebasehosting.googleapis.com firebaserules.googleapis.com firestore.googleapis.com
 firebasestorage.googleapis.com storage.googleapis.com identitytoolkit.googleapis.com securetoken.googleapis.com
 cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
 eventarc.googleapis.com pubsub.googleapis.com compute.googleapis.com iam.googleapis.com iamcredentials.googleapis.com
 cloudresourcemanager.googleapis.com serviceusage.googleapis.com cloudbilling.googleapis.com logging.googleapis.com
 apikeys.googleapis.com generativelanguage.googleapis.com gmail.googleapis.com calendar-json.googleapis.com"
# Yalnızca AÇAR; açık bir servisi kapatmaz.
# shellcheck disable=SC2086
if gcloud services enable $APIS --project "$P"; then ok "servisler açık"; else warn "bazı servisler açılamadı; yukarıdaki hatayı okuyun ve yeniden çalıştırın"; fi

step "2/10 Firebase projeye ekli mi"
if [ "$(api "https://firebase.googleapis.com/v1beta1/projects/$P")" = 200 ]; then ok "Firebase ekli"
else
  if [ "$(api -X POST -d '{}' "https://firebase.googleapis.com/v1beta1/projects/$P:addFirebase")" = 200 ]; then
    sleep 20; ok "Firebase eklendi"
  else warn "Firebase eklenemedi: Firebase Console → Add project → mevcut '$P' projesini seçin (adım 1)."; fi
fi

step "3/10 Hosting: adlı site (firebase.json → hosting.site)"
# Proje paylaşıldığı için uygulama projenin varsayılan sitesine (https://$P.web.app) DEĞİL, kendi adlı sitesine
# dağıtılıyor. Site kimlikleri tüm Firebase'de tektir; ad alınmışsa yedek adlar denenir ve seçilen ad
# firebase.json'a yazılır (adın tek yeri orası).
CFG_SITE=$(node -e 'try{const h=JSON.parse(require("fs").readFileSync("firebase.json","utf8")).hosting;process.stdout.write((Array.isArray(h)?h[0]:h).site||"")}catch{}')
SITE=""
for CAND in ${CFG_SITE:-talentflow-app} ${SITE_CANDIDATES:-talentflow-app talentflow-ik talentflow-hr talentflow-$NUM}; do
  CODE=$(api "https://firebasehosting.googleapis.com/v1beta1/projects/$P/sites/$CAND")
  if [ "$CODE" = 200 ]; then SITE=$CAND; ok "site bu projede zaten var: $CAND"; break; fi
  CODE=$(api -X POST -d '{}' "https://firebasehosting.googleapis.com/v1beta1/projects/$P/sites?siteId=$CAND")
  if [ "$CODE" = 200 ]; then SITE=$CAND; ok "site oluşturuldu: $CAND"; break; fi
  echo "    $CAND alınamadı (HTTP $CODE) — sıradaki ad deneniyor"
done
if [ -z "$SITE" ]; then
  warn "site oluşturulamadı. SITE_CANDIDATES=\"baska-ad\" bash scripts/setup-new-project.sh ile deneyin."
elif [ "$SITE" != "$CFG_SITE" ]; then
  node -e 'const fs=require("fs");const c=JSON.parse(fs.readFileSync("firebase.json","utf8"));(Array.isArray(c.hosting)?c.hosting[0]:c.hosting).site=process.argv[1];fs.writeFileSync("firebase.json",JSON.stringify(c,null,4)+"\n")' "$SITE"
  ok "firebase.json → hosting.site = $SITE yazıldı (commit'leyin)"
fi
[ -n "$SITE" ] && ok "uygulama adresi: https://$SITE.web.app"
APEX=$(api "https://firebasehosting.googleapis.com/v1beta1/projects/$P/sites")
[ "$APEX" = 200 ] && echo "    projedeki siteler: $(node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).sites||[];process.stdout.write(s.map(x=>x.name.split("/").pop()+(x.type==="DEFAULT_SITE"?" (varsayılan, dokunulmuyor)":"")).join(", "))' "$OUT")"

step "4/10 Firestore veritabanı"
if quiet gcloud firestore databases describe --database="(default)" --project "$P"; then
  DBINFO=$(gcloud firestore databases describe --database='(default)' --project "$P" --format='value(type,locationId)' 2>/dev/null)
  case "$DBINFO" in
    DATASTORE_MODE*) warn "(default) veritabanı DATASTORE modunda ($DBINFO). Uygulama Firestore (native) ister ve bu mod
    değiştirilemez (veri varsa). DURUN ve Emre'ye/Claude'a danışın — başka bir proje gerekebilir." ;;
    *) ok "(default) zaten var ($DBINFO)" ;;
  esac
  # Paylaşılan projede başka bir uygulamanın verisi var mı? TalentFlow yalnızca 'artifacts' altında yazar;
  # ama firestore.rules dağıtımı TÜM veritabanının kurallarını değiştirir.
  if [ "$(api -X POST -d '{"pageSize":50}' "https://firestore.googleapis.com/v1/projects/$P/databases/(default)/documents:listCollectionIds")" = 200 ]; then
    COLS=$(node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).collectionIds||[];process.stdout.write(c.join(", "))' "$OUT")
    if [ -z "$COLS" ]; then ok "veritabanı boş"
    elif [ "$COLS" = "artifacts" ]; then ok "yalnızca 'artifacts' koleksiyonu var"
    else warn "veritabanında başka koleksiyonlar var: $COLS — TalentFlow'un firestore.rules'u bunlara istemci erişimini KAPATIR."; fi
  fi
else
  LOC="${FIRESTORE_LOCATION:-}"
  if [ -z "$LOC" ]; then
    OLDLOC=$(gcloud firestore databases describe --database="(default)" --project "$OLD_PROJECT" --format='value(locationId)' 2>/dev/null)
    [ -n "$OLDLOC" ] && echo "  Eski projenin konumu: $OLDLOC (aynı davranış için bunu seçin)."
    echo "  Konum sonradan DEĞİŞTİRİLEMEZ. Örnek: eur3 (AB çoklu bölge), europe-west1, nam5, us-central1."
    read -rp "  Firestore konumu${OLDLOC:+ [$OLDLOC]}: " LOC
    LOC="${LOC:-$OLDLOC}"
  fi
  [ -n "$LOC" ] || die "konum seçilmedi"
  if gcloud firestore databases create --database="(default)" --location="$LOC" --type=firestore-native --project "$P" >/dev/null; then
    ok "oluşturuldu ($LOC)"
  else warn "oluşturulamadı; Firebase Console → Firestore Database → Create database."; fi
fi

step "5/10 Storage varsayılan bucket ve CORS"
# Eski projelerde varsayılan bucket <proje>.appspot.com, 2024 sonrasında <proje>.firebasestorage.app.
BUCKET=""
for B in "$P.firebasestorage.app" "$P.appspot.com"; do
  quiet gcloud storage buckets describe "gs://$B" --project "$P" && { BUCKET=$B; break; }
done
if [ -n "$BUCKET" ]; then
  ok "bucket var: $BUCKET"
  # Var olan CORS ayarı silinmesin diye yalnızca boşsa uygulanır.
  CORS_NOW=$(gcloud storage buckets describe "gs://$BUCKET" --format='value(cors_config)' 2>/dev/null)
  if [ -n "$CORS_NOW" ]; then warn "bucket'ta zaten bir CORS ayarı var (dokunulmadı). cors.json ile karşılaştırın: $CORS_NOW"
  elif gcloud storage buckets update "gs://$BUCKET" --cors-file=cors.json --project "$P" >/dev/null 2>&1; then ok "cors.json uygulandı"
  else warn "CORS uygulanamadı: gcloud storage buckets update gs://$BUCKET --cors-file=cors.json"; fi
else
  warn "bucket yok: Firebase Console → Storage → Get started (konumu Firestore ile aynı bölgede seçin), sonra betiği yeniden çalıştırın."
fi

step "6/10 Web uygulaması ve yapılandırması"
# Paylaşılan projede başka web uygulamaları olabilir: yalnızca "TalentFlow" adlı olan kullanılır, yoksa eklenir.
APP_ID=""
if [ "$(api "https://firebase.googleapis.com/v1beta1/projects/$P/webApps")" = 200 ]; then
  APP_ID=$(node -e 'const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).apps||[];const t=a.find(x=>x.displayName==="TalentFlow"&&x.state!=="DELETED");if(t)process.stdout.write(t.appId)' "$OUT")
fi
if [ -z "$APP_ID" ]; then
  if [ "$(api -X POST -d '{"displayName":"TalentFlow"}' "https://firebase.googleapis.com/v1beta1/projects/$P/webApps")" = 200 ]; then
    OP=$(jget name < "$OUT")
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      sleep 3
      api "https://firebase.googleapis.com/v1beta1/$OP" >/dev/null
      [ "$(jget done < "$OUT")" = true ] && APP_ID=$(jget response.appId < "$OUT") && break
    done
  fi
fi
SENDER=""; API_KEY=""
if [ -n "$APP_ID" ] && [ "$(api "https://firebase.googleapis.com/v1beta1/projects/$P/webApps/$APP_ID/config")" = 200 ]; then
  SENDER=$(jget messagingSenderId < "$OUT"); API_KEY=$(jget apiKey < "$OUT")
  ok "web uygulaması: appId=$APP_ID  messagingSenderId=$SENDER  (apiKey ekrana basılmadı)"
else warn "web uygulaması okunamadı/oluşturulamadı: Firebase Console → Project settings → Your apps → Web (</>)."; fi
rm -f "$OUT"

step "7/10 Firebase Auth: giriş yöntemleri ve izinli alan adları"
CODE=$(api "https://identitytoolkit.googleapis.com/admin/v2/projects/$P/config")
if [ "$CODE" = 200 ]; then
  # Uygulamanın kullandığı yöntemler: e-posta/şifre (kayıt + şifre sıfırlama), anonim (aday sayfaları
  # /join, /apply, /live-interview), Google (aşağıda ayrıca denetleniyor). Var olan alanlar ve sağlayıcılar korunur.
  BODY=$(node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    const d=new Set([...(c.authorizedDomains||[]),"localhost",process.argv[2]+".firebaseapp.com",...process.argv.slice(3).filter(Boolean)]);
    process.stdout.write(JSON.stringify({authorizedDomains:[...d],signIn:{email:{enabled:true,passwordRequired:true},anonymous:{enabled:true}}}))' \
    "$OUT" "$P" "${SITE:+$SITE.web.app}" "${SITE:+$SITE.firebaseapp.com}" "${APP_DOMAIN:-}")
  if [ "$(api -X PATCH -d "$BODY" "https://identitytoolkit.googleapis.com/admin/v2/projects/$P/config?updateMask=authorizedDomains,signIn.email.enabled,signIn.email.passwordRequired,signIn.anonymous.enabled")" = 200 ]; then
    ok "e-posta/şifre ve anonim giriş açık; izinli alanlara eklendi: $P.firebaseapp.com${SITE:+, $SITE.web.app, $SITE.firebaseapp.com}${APP_DOMAIN:+, $APP_DOMAIN} (var olanlar korundu)"
  else warn "Auth ayarı yazılamadı: Authentication → Sign-in method (Email/Password, Anonymous) ve Settings → Authorized domains."; fi
  if [ "$(api "https://identitytoolkit.googleapis.com/admin/v2/projects/$P/defaultSupportedIdpConfigs/google.com")" = 200 ]; then ok "Google sağlayıcısı açık"
  else warn "Google sağlayıcısı kapalı: Authentication → Sign-in method → Google → Enable (adım 4; OAuth istemcisini konsol üretir)."; fi
  # Paylaşılan projede Auth kullanıcı havuzu da ortak: başka uygulamanın kullanıcıları TalentFlow'a davet/izinli
  # alan adı olmadan giremez ama aynı havuzda görünür.
  if [ "$(api "https://identitytoolkit.googleapis.com/v1/projects/$P/accounts:batchGet?maxResults=1")" = 200 ] && \
     [ -n "$(jget users.0.localId < "$OUT")" ]; then
    warn "Auth'ta zaten kullanıcılar var — kullanıcı havuzu başka bir uygulamayla ortak olacak (Authentication → Users'ı inceleyin)."
  else ok "Auth kullanıcı havuzu boş"; fi
else
  warn "Authentication henüz başlatılmamış (HTTP $CODE): Firebase Console → Authentication → Get started, sonra yeniden çalıştırın."
fi
rm -f "$OUT"

step "8/10 Çakışma denetimi ve servis hesapları"
# Aynı bölgede 'api' adlı bir fonksiyon / Cloud Run servisi varsa TalentFlow dağıtımı onun YERİNE geçer.
if gcloud functions list --project "$P" --regions="$REGION" --format='value(name)' 2>/dev/null | grep -qE '(^|/)api$'; then
  warn "$REGION'da zaten 'api' adlı bir fonksiyon var — ilk dağıtım onun üzerine yazar. Kime ait olduğunu kontrol edin."
elif gcloud run services list --project "$P" --region="$REGION" --format='value(metadata.name)' 2>/dev/null | grep -qx api; then
  warn "$REGION'da zaten 'api' adlı bir Cloud Run servisi var — ilk dağıtım onun üzerine yazar."
else ok "$REGION'da 'api' adı boş"; fi
# Kural sürümleri proje geneli: TalentFlow'un firestore.rules / storage.rules'u var olanların yerine geçer.
if [ "$(api "https://firebaserules.googleapis.com/v1/projects/$P/releases")" = 200 ]; then
  REL=$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).releases||[];process.stdout.write(r.map(x=>x.name.split("/releases/").pop()).join(", "))' "$OUT")
  if [ -n "$REL" ]; then warn "projede yayınlanmış kurallar var ($REL) — TalentFlow dağıtımı bunların yerine geçer. Yedek: Firebase Console → Firestore/Storage → Rules → kopyalayın."
  else ok "yayınlanmış kural yok"; fi
fi
rm -f "$OUT"

DEPLOYER="github-deployer@$P.iam.gserviceaccount.com"
COMPUTE="$NUM-compute@developer.gserviceaccount.com"
quiet gcloud iam service-accounts describe "$DEPLOYER" --project "$P" \
  || gcloud iam service-accounts create github-deployer --display-name="TalentFlow GitHub deploy" --project "$P" >/dev/null
for _ in 1 2 3 4 5 6; do quiet gcloud iam service-accounts describe "$COMPUTE" --project "$P" && break; sleep 10; done
sleep 5  # yeni hesabın IAM'e yayılması için
bind() { quiet gcloud projects add-iam-policy-binding "$P" --member="serviceAccount:$1" --role="$2" --condition=None || warn "$2 verilemedi ($1)"; }
# `firebase deploy --only hosting,functions,firestore,storage` için gerekenler. firebase.admin geniş ama
# kural dağıtımı zaten tüm veriye erişim demek; dar rollerle her ilk dağıtım bir izin hatasıyla duruyordu.
for R in roles/firebase.admin roles/cloudfunctions.admin roles/run.admin roles/artifactregistry.admin \
         roles/cloudbuild.builds.editor roles/serviceusage.serviceUsageConsumer roles/serviceusage.apiKeysViewer; do
  bind "$DEPLOYER" "$R"
done
# Fonksiyon bu hesapla çalışıyor ve derleniyor; dağıtıcı onun adına iş başlatabilmeli.
quiet gcloud iam service-accounts add-iam-policy-binding "$COMPUTE" --member="serviceAccount:$DEPLOYER" \
  --role=roles/iam.serviceAccountUser --project "$P" || warn "serviceAccountUser verilemedi ($COMPUTE)"
# Organizasyonsuz projelerde varsayılan hesap Editor alır; alamadıysa uygulamanın ihtiyacı tek tek veriliyor
# (Firestore, Auth özel rol, Storage, derleme ve günlük).
if gcloud projects get-iam-policy "$P" --flatten='bindings[].members' \
     --filter="bindings.members:serviceAccount:$COMPUTE AND bindings.role:roles/editor" --format='value(bindings.role)' 2>/dev/null | grep -q editor; then
  ok "çalışma hesabı ($COMPUTE) Editor"
else
  for R in roles/datastore.user roles/firebaseauth.admin roles/storage.objectAdmin roles/logging.logWriter \
           roles/cloudbuild.builds.builder roles/artifactregistry.writer; do bind "$COMPUTE" "$R"; done
  ok "çalışma hesabına gerekli roller verildi"
fi
ok "hesaplar ve yetkiler hazır"

step "9/10 GitHub için yayın anahtarı"
KEY="$HOME/talentflow-deployer-$P.json"
if [ -f "$KEY" ]; then ok "$KEY zaten var"
elif gcloud iam service-accounts keys create "$KEY" --iam-account="$DEPLOYER" --project "$P" >/dev/null 2>&1; then
  ok "anahtar dosyası oluşturuldu: $KEY"
else warn "anahtar oluşturulamadı (org politikası 'iam.disableServiceAccountKeyCreation' olabilir)"; fi

step "10/10 GitHub secret'ları ve değişkenleri ($REPO)"
STATE="$HOME/.talentflow-setup-$P.state"; touch "$STATE"
GH=""
if command -v gh >/dev/null 2>&1 && quiet gh auth status && quiet gh repo view "$REPO"; then GH=1; ok "gh CLI hazır — değerler doğrudan GitHub'a yazılacak"
else warn "gh CLI yok ya da oturum açık değil — değerler $HOME/talentflow-github-$P.txt dosyasına yazılacak (elle girip silin)"; fi
FALLBACK="$HOME/talentflow-github-$P.txt"
# Secret'ları önceden eski projeye ait değerlerle dolu; bu yüzden "GitHub'da var" atlama sebebi DEĞİL.
# Atlama sebebi, bu betiğin bu proje için yazmış olması (durum dosyası).
done_for_project() { [ -z "${FORCE_SECRETS:-}" ] && grep -qx "$1" "$STATE"; }
put_secret() {  # $1 ad, değer stdin'den — ekrana basılmaz
  if [ -n "$GH" ]; then gh secret set "$1" --repo "$REPO" >/dev/null || { warn "$1 yazılamadı"; return; }
  else { printf '%s=' "$1"; cat; echo; } >> "$FALLBACK"; chmod 600 "$FALLBACK" 2>/dev/null; fi
  echo "$1" >> "$STATE"; ok "secret $1"
}
put_var() {
  if [ -n "$GH" ]; then gh variable set "$1" --body "$2" --repo "$REPO" >/dev/null && ok "değişken $1=$2" || warn "$1 yazılamadı"
  else echo "VARIABLE $1=$2" >> "$FALLBACK"; ok "değişken $1=$2 (dosyaya)"; fi
}

[ -n "$SENDER" ] && put_var FIREBASE_MESSAGING_SENDER_ID "$SENDER"
[ -n "$APP_ID" ] && put_var FIREBASE_APP_ID "$APP_ID"
# Bucket adı türetilemiyor (appspot.com / firebasestorage.app) — workflow bu değişkeni okur.
[ -n "$BUCKET" ] && put_var FIREBASE_STORAGE_BUCKET "$BUCKET"

if done_for_project FIREBASE_SERVICE_ACCOUNT; then ok "FIREBASE_SERVICE_ACCOUNT zaten yazıldı"
elif [ -f "$KEY" ]; then put_secret FIREBASE_SERVICE_ACCOUNT < "$KEY"; fi

if done_for_project VITE_FIREBASE_API_KEY; then ok "VITE_FIREBASE_API_KEY zaten yazıldı"
elif [ -n "$API_KEY" ]; then printf %s "$API_KEY" | put_secret VITE_FIREBASE_API_KEY; fi
unset API_KEY

# Temiz kurulum: şifrelenmiş eski jeton yok, yeni anahtar güvenle üretilebilir. Sonradan DEĞİŞTİRİLMEZ.
if done_for_project INTEGRATION_ENCRYPTION_KEY; then ok "INTEGRATION_ENCRYPTION_KEY zaten yazıldı (dokunulmadı)"
else openssl rand -base64 32 | tr -d '\n' | put_secret INTEGRATION_ENCRYPTION_KEY; fi

if done_for_project VITE_GEMINI_API_KEY; then ok "VITE_GEMINI_API_KEY zaten yazıldı"
else
  echo "  Gemini anahtarı: AI Studio'da BU projeye bağlı bir anahtar yapıştırın; boş bırakırsanız bu projede"
  echo "  Generative Language API ile sınırlı yeni bir anahtar üretilir."
  read -rsp "  Gemini API anahtarı (ekranda görünmez, boş = üret): " V; echo
  if [ -z "$V" ]; then
    KNAME="projects/$NUM/locations/global/keys/talentflow-gemini"
    quiet gcloud services api-keys describe "$KNAME" --project "$P" \
      || quiet gcloud services api-keys create --key-id=talentflow-gemini --display-name="TalentFlow Gemini (sunucu)" \
           --api-target=service=generativelanguage.googleapis.com --project "$P"
    V=$(gcloud services api-keys get-key-string "$KNAME" --project "$P" --format='value(keyString)' 2>/dev/null)
  fi
  if [ -n "$V" ]; then printf %s "$V" | put_secret VITE_GEMINI_API_KEY; else warn "Gemini anahtarı yok; yeniden çalıştırın"; fi
  unset V
fi

if done_for_project EMAIL_USER && done_for_project EMAIL_PASS; then ok "EMAIL_USER / EMAIL_PASS zaten yazıldı"
else
  echo "  Sistem e-postası (davetler, aday bildirimleri): Gmail SMTP. Hesapta 2 adımlı doğrulama açık olmalı;"
  echo "  şifre olarak Google Hesabı → Güvenlik → Uygulama şifreleri'nden üretilen 16 haneli şifre girilir."
  read -rp "  Gönderen Gmail adresi: " V
  if [ -n "$V" ]; then
    printf %s "$V" | put_secret EMAIL_USER
    read -rsp "  Uygulama şifresi (ekranda görünmez): " V; echo
    if [ -n "$V" ]; then printf %s "${V// /}" | put_secret EMAIL_PASS; else warn "EMAIL_PASS boş; yeniden çalıştırın"; fi
  else warn "EMAIL_USER boş; yeniden çalıştırın"; fi
  unset V
fi

for S in AI_DAILY_TOKEN_LIMIT AI_DAILY_GROUNDED_LIMIT; do
  if done_for_project "$S"; then ok "$S zaten yazıldı"; continue; fi
  read -rp "  $S (günlük AI freni; boş = kapalı, sonra da eklenebilir): " V
  if [ -n "$V" ]; then printf %s "$V" | put_secret "$S"; else warn "$S boş — günlük AI bütçe freni kapalı kalır"; fi
done
unset V

echo
if [ "$WARN" -eq 0 ]; then echo "Bitti — uyarı yok."; else echo "Bitti — $WARN uyarı var (! satırları). Düzeltip betiği yeniden çalıştırın."; fi
cat <<EOF

GitHub → $REPO → Settings → Secrets and variables → Actions
  Secrets  : FIREBASE_SERVICE_ACCOUNT, VITE_FIREBASE_API_KEY, VITE_GEMINI_API_KEY, INTEGRATION_ENCRYPTION_KEY,
             EMAIL_USER, EMAIL_PASS, (isteğe bağlı) AI_DAILY_TOKEN_LIMIT, AI_DAILY_GROUNDED_LIMIT
  Variables: FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID, FIREBASE_STORAGE_BUCKET, (isteğe bağlı) APP_URL
EOF
[ -z "$GH" ] && echo "Değerler: $FALLBACK — GitHub'a girdikten sonra silin: rm \"$FALLBACK\""
[ -f "$KEY" ] && echo "Yayın anahtarı: $KEY — GitHub'a yazıldıktan sonra silin: rm \"$KEY\""
cat <<EOF

Sıradaki adımlar (docs/yeni-proje-kurulumu.md):
  1. firebase.json/.firebaserc değiştiyse commit'leyip PR açın; CI yeşil olunca merge = yeni projeye ilk dağıtım.
  2. https://$SITE.web.app adresinde bir kez Google ile giriş yapın (reddedilmesi normal), sonra:
       gcloud auth application-default login
       FIREBASE_PROJECT_ID=$P node scripts/grant-super-admin.mjs <e-posta>
  3. Entegrasyon Merkezi'nden Google OAuth istemcisini girin (redirect: https://$SITE.web.app/auth/google/callback).
EOF
