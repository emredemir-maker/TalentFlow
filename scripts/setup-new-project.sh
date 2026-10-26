#!/usr/bin/env bash
# TalentFlow'u Hub-Inn platform projesine (agentinn-nyqpx) kuran betik — veri taşımadan, temiz kurulum.
#
# PROJE PAYLAŞILIYOR: Hub-Inn (varsayılan Hosting sitesi agentinn-nyqpx, Functions codebase `api`: `api` +
# `leadScan`, europe-west1) ve CX-Inn (Hosting sitesi cxinn, Cloud Run cx-inn-api) aynı projede. Betik HİÇBİR ŞEY
# SİLMEZ, var olanı değiştirmez (yalnızca ekler), başka uygulamaya ait hiçbir kaynağa yazmaz ve çakışma riski
# gördüğü yerde ! ile uyarır. TalentFlow'a ait her şey ayrı adlı: site, `talentflow` codebase'i, `talentflowApi`
# fonksiyonu, `talentflow-deployer` / `talentflow-runtime` servis hesapları, "TalentFlow" web uygulaması.
#
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
#   FIRESTORE_LOCATION=...    Firestore konumu (varsayılan eur3; sonradan DEĞİŞTİRİLEMEZ)
#   APP_DOMAIN=ik.ornek.com   Özel alan adı bağlanacaksa Auth izinli alanlarına eklenir
#   FORCE_SECRETS=1           Bu proje için daha önce yazılmış secret'ları yeniden sor
#   SITE_CANDIDATES="a b"     firebase.json'daki site alınmışsa denenecek yedek adlar
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

REPO="${GH_REPO:-emredemir-maker/TalentFlow}"
REGION=europe-west1          # functions/index.js ile aynı olmalı
FUNCTION=talentflowApi       # functions/index.js'deki dışa aktarım; Cloud Run servisi küçük harfle
CODEBASE=talentflow          # firebase.json → functions[0].codebase
# Başka uygulamalara ait Hosting siteleri: bu adlara ASLA dağıtılmaz (check-project-config.mjs ile aynı liste).
FOREIGN_SITES="agentinn-nyqpx cxinn"
WARN=0
ok()    { echo "  ✓ $*"; }
warn()  { echo "  ! $*"; WARN=$((WARN + 1)); }
info()  { echo "    $*"; }
step()  { echo; echo "▶ $*"; }
quiet() { "$@" >/dev/null 2>&1; }
die()   { echo "  ! $*"; exit 1; }
# jq yerine node: stdin'deki JSON'dan noktalı yol ile değer okur (ör. apps.0.appId).
jget() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let v=JSON.parse(s);
    for(const k of process.argv[1].split(".").filter(Boolean)) v=v==null?v:v[k];
    if(v!=null) process.stdout.write(typeof v==="object"?JSON.stringify(v):String(v));}catch{}})' "$1"
}
# e/H sorusu: yalnızca "e" ya da "y" evet sayılır; boş = hayır.
yes_no() { local A; read -rp "  $1 [e/H]: " A; case "$A" in e|E|y|Y|evet|yes) return 0 ;; *) return 1 ;; esac; }

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
# Bağlı değilse gcloud boşluk/sekme döndürüyor; boşluklar atılır (yoksa "bağlı (  )" diye yanlış uyarı verirdi).
PARENT=$(gcloud projects describe "$P" --format='value(parent.type,parent.id)' 2>/dev/null | tr -d '[:space:]')
if [ -n "$PARENT" ]; then warn "proje bir üst kaynağa bağlı ($PARENT). Kişisel kurulum için 'No organization' beklenir; eski şirketin organizasyonu ise DURUN."
else ok "proje herhangi bir organizasyona bağlı değil"; fi
NUM=$(gcloud projects describe "$P" --format='value(projectNumber)')
BILLING=$(gcloud billing projects describe "$P" --format='value(billingEnabled)' 2>/dev/null)
case "$BILLING" in
  True)  ok "faturalandırma açık (Blaze)" ;;
  False) die "faturalandırma kapalı. Firebase Console → ⚙ → Usage and billing → Blaze planına geçin, sonra yeniden çalıştırın." ;;
  *)     warn "faturalandırma durumu okunamadı; Blaze planında olduğundan emin olun (Functions ve Storage için şart)." ;;
esac

TOKEN=$(gcloud auth print-access-token)
H=(-H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $P" -H "Content-Type: application/json")
OUT="${TMPDIR:-/tmp}/tf-setup.json"
api() { curl -s -o "$OUT" -w '%{http_code}' "${H[@]}" "$@"; }
# Google'ın hata gövdesindeki açıklama (gizli değer içermez).
api_msg() { node -e 'try{const e=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).error;process.stdout.write(e?.message||"")}catch{}' "$OUT"; }

step "1/10 Servisler açılıyor (birkaç dakika sürebilir)"
APIS="firebase.googleapis.com firebasehosting.googleapis.com firebaserules.googleapis.com firestore.googleapis.com
 firebasestorage.googleapis.com storage.googleapis.com identitytoolkit.googleapis.com securetoken.googleapis.com
 cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
 eventarc.googleapis.com pubsub.googleapis.com compute.googleapis.com iam.googleapis.com iamcredentials.googleapis.com
 cloudresourcemanager.googleapis.com serviceusage.googleapis.com cloudbilling.googleapis.com logging.googleapis.com
 apikeys.googleapis.com generativelanguage.googleapis.com gmail.googleapis.com calendar-json.googleapis.com"
# Yalnızca AÇAR; açık bir servisi kapatmaz. Google tek çağrıda en çok 20 servis kabul ediyor: 15'erli gruplar.
# shellcheck disable=SC2086
if printf '%s\n' $APIS | xargs -n 15 sh -c 'gcloud services enable "$@" --project "'"$P"'"' _; then ok "servisler açık"
else warn "bazı servisler açılamadı; yukarıdaki hatayı okuyun ve yeniden çalıştırın"; fi

step "2/10 Firebase projeye ekli mi"
if [ "$(api "https://firebase.googleapis.com/v1beta1/projects/$P")" = 200 ]; then ok "Firebase ekli"
else
  if [ "$(api -X POST -d '{}' "https://firebase.googleapis.com/v1beta1/projects/$P:addFirebase")" = 200 ]; then
    sleep 20; ok "Firebase eklendi"
  else warn "Firebase eklenemedi: Firebase Console → Add project → mevcut '$P' projesini seçin."; fi
fi

step "3/10 Hosting: TalentFlow'un adlı sitesi (firebase.json → hosting.site)"
# Projenin varsayılan sitesi Hub-Inn'in, cxinn CX-Inn'in. TalentFlow kendi adlı sitesine dağıtılıyor. Site
# kimlikleri tüm Firebase'de tektir; ad alınmışsa yedek adlar denenir ve seçilen ad firebase.json'a yazılır
# (adın tek yeri orası).
CFG_SITE=$(node -e 'try{const h=JSON.parse(require("fs").readFileSync("firebase.json","utf8")).hosting;process.stdout.write((Array.isArray(h)?h[0]:h).site||"")}catch{}')
SITE=""
for CAND in ${CFG_SITE:-talentinn} ${SITE_CANDIDATES:-talentinn talentinn-hub talentflow-hub}; do
  case " $FOREIGN_SITES $P " in *" $CAND "*) info "$CAND başka bir uygulamanın sitesi — atlandı"; continue ;; esac
  CODE=$(api "https://firebasehosting.googleapis.com/v1beta1/projects/$P/sites/$CAND")
  if [ "$CODE" = 200 ]; then SITE=$CAND; ok "site bu projede zaten var: $CAND"; break; fi
  CODE=$(api -X POST -d '{}' "https://firebasehosting.googleapis.com/v1beta1/projects/$P/sites?siteId=$CAND")
  if [ "$CODE" = 200 ]; then SITE=$CAND; ok "site oluşturuldu: $CAND"; break; fi
  # 409 yalnız "ad alınmış" demek değil (deploy-n8n-local'de Hosting arka ucu bozuktu); Google'ın gerekçesi gösterilir.
  MSG=$(api_msg)
  info "$CAND alınamadı (HTTP $CODE${MSG:+: $MSG}) — sıradaki ad deneniyor"
done
if [ -z "$SITE" ]; then
  warn "site oluşturulamadı. SITE_CANDIDATES=\"baska-ad\" bash scripts/setup-new-project.sh ile deneyin."
elif [ "$SITE" != "$CFG_SITE" ]; then
  node -e 'const fs=require("fs");const c=JSON.parse(fs.readFileSync("firebase.json","utf8"));(Array.isArray(c.hosting)?c.hosting[0]:c.hosting).site=process.argv[1];fs.writeFileSync("firebase.json",JSON.stringify(c,null,4)+"\n")' "$SITE"
  ok "firebase.json → hosting.site = $SITE yazıldı (commit'leyin)"
fi
# Adres her zaman bir site adından türer: oluşturulamadıysa firebase.json'daki ad gösterilir (boş "https://.web.app" yok).
URL_SITE="${SITE:-${CFG_SITE:-talentinn}}"
APP_URL="https://$URL_SITE.web.app"
[ -n "$SITE" ] && ok "uygulama adresi: $APP_URL"
if [ "$(api "https://firebasehosting.googleapis.com/v1beta1/projects/$P/sites")" = 200 ]; then
  info "projedeki siteler: $(node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).sites||[];process.stdout.write(s.map(x=>x.name.split("/").pop()+(x.type==="DEFAULT_SITE"?" (varsayılan — Hub-Inn, dokunulmuyor)":"")).join(", "))' "$OUT")"
fi

step "4/10 Firestore veritabanı"
if quiet gcloud firestore databases describe --database="(default)" --project "$P"; then
  DBINFO=$(gcloud firestore databases describe --database='(default)' --project "$P" --format='value(type,locationId)' 2>/dev/null)
  case "$DBINFO" in
    DATASTORE_MODE*) warn "(default) veritabanı DATASTORE modunda ($DBINFO). Uygulama Firestore (native) ister. DURUN ve
    Emre'ye/Claude'a danışın." ;;
    *) ok "(default) zaten var ($DBINFO)" ;;
  esac
  # Hub-Inn ve CX-Inn Firestore kullanmıyor (Postgres). Başka koleksiyon görünürse firestore.rules dağıtımı onlara
  # istemci erişimini KAPATIR — TalentFlow yalnızca 'artifacts' altında yazar.
  if [ "$(api -X POST -d '{"pageSize":50}' "https://firestore.googleapis.com/v1/projects/$P/databases/(default)/documents:listCollectionIds")" = 200 ]; then
    COLS=$(node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).collectionIds||[];process.stdout.write(c.join(", "))' "$OUT")
    if [ -z "$COLS" ]; then ok "veritabanı boş"
    elif [ "$COLS" = "artifacts" ]; then ok "yalnızca 'artifacts' koleksiyonu var"
    else warn "veritabanında başka koleksiyonlar var: $COLS — TalentFlow'un firestore.rules'u bunlara istemci erişimini KAPATIR."; fi
  fi
else
  # Konum sorulmuyor: firebase.json → firestore.location ile aynı (eur3, AB çoklu bölge; fonksiyon europe-west1).
  LOC="${FIRESTORE_LOCATION:-eur3}"
  if gcloud firestore databases create --database="(default)" --location="$LOC" --type=firestore-native --project "$P" >/dev/null; then
    ok "(default) oluşturuldu ($LOC)"
  else warn "oluşturulamadı; Firebase Console → Firestore Database → Create database → Native, konum $LOC."; fi
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
  warn "varsayılan bucket yok: Firebase Console → Storage → Get started → konum AB (ör. EUROPE-WEST1; Firestore eur3 ile
    uyumlu), sonra betiği YENİDEN çalıştırın (CORS ve çalışma hesabının bucket yetkisi o zaman verilir)."
fi

step "6/10 Web uygulaması \"TalentFlow\" ve yapılandırması"
# Projede Hub-Inn/CX-Inn web uygulamaları da var: yalnızca "TalentFlow" adlı olan kullanılır, yoksa eklenir.
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
else warn "web uygulaması okunamadı/oluşturulamadı: Firebase Console → Project settings → Your apps → Web (</>) → \"TalentFlow\"."; fi
# Tarayıcı anahtarı projede Hub-Inn'le ortak olabilir. Ona HTTP yönlendiren (referrer) kısıtı konmuşsa TalentFlow'un
# adresi listede olmalı; betik kısıtı DEĞİŞTİRMEZ, yalnızca söyler.
if [ -n "$API_KEY" ]; then
  KEYNAME=$(gcloud services api-keys lookup "$API_KEY" --project "$P" --format='value(name)' 2>/dev/null)
  if [ -n "$KEYNAME" ]; then
    REFS=$(gcloud services api-keys describe "$KEYNAME" --project "$P" --format='value(restrictions.browserKeyRestrictions.allowedReferrers)' 2>/dev/null)
    if [ -z "$REFS" ]; then ok "tarayıcı anahtarında yönlendiren kısıtı yok"
    elif printf '%s' "$REFS" | grep -q "$URL_SITE"; then ok "tarayıcı anahtarının izinli adreslerinde $URL_SITE var"
    else warn "tarayıcı anahtarı yalnızca şu adreslere izinli: $REFS — Google Cloud → APIs & Services → Credentials →
    anahtar → Website restrictions'a $APP_URL/* ekleyin (Hub-Inn'in satırlarına dokunmadan)."; fi
  fi
fi
rm -f "$OUT"

step "7/10 Firebase Auth: giriş yöntemleri ve izinli alan adları"
CODE=$(api "https://identitytoolkit.googleapis.com/admin/v2/projects/$P/config")
if [ "$CODE" = 200 ]; then
  # Kullanıcı havuzu ve Auth ayarları Hub-Inn/CX-Inn ile ORTAK. Yalnızca TalentFlow'un ihtiyacı EKLENİR:
  #  - anonim giriş (aday sayfaları /join, /apply, /live-interview). Hub-Inn ve CX-Inn sunucuları anonim ve
  #    e-postası doğrulanmamış jetonları reddediyor, onlar için açmak güvenli.
  #  - e-posta/şifre (kayıt + şifre sıfırlama) — kapalıysa açılır; açıksa ayarına (passwordRequired) dokunulmaz,
  #    başka bir uygulamanın e-posta bağlantısıyla girişi bozulmasın.
  #  - izinli alan adları: yalnızca TalentFlow'un sitesi eklenir; mevcut liste aynen korunur.
  BODY=$(node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    const add=process.argv.slice(2).filter(Boolean);const cur=c.authorizedDomains||[];
    const signIn={anonymous:{enabled:true}};const mask=["signIn.anonymous.enabled"];
    if(!c.signIn?.email?.enabled){signIn.email={enabled:true,passwordRequired:true};mask.push("signIn.email.enabled","signIn.email.passwordRequired");}
    const missing=add.filter(d=>!cur.includes(d));
    if(missing.length) mask.push("authorizedDomains");
    process.stdout.write(JSON.stringify({body:{authorizedDomains:[...cur,...missing],signIn},mask:mask.join(","),missing,emailWasOn:!!c.signIn?.email?.enabled}))' \
    "$OUT" "$URL_SITE.web.app" "$URL_SITE.firebaseapp.com" "${APP_DOMAIN:-}")
  MASK=$(printf '%s' "$BODY" | jget mask); MISSING=$(printf '%s' "$BODY" | jget missing); EMAIL_ON=$(printf '%s' "$BODY" | jget emailWasOn)
  if [ "$(api -X PATCH -d "$(printf '%s' "$BODY" | jget body)" "https://identitytoolkit.googleapis.com/admin/v2/projects/$P/config?updateMask=$MASK")" = 200 ]; then
    ok "anonim giriş açık; e-posta/şifre $([ "$EMAIL_ON" = true ] && echo "zaten açıktı (dokunulmadı)" || echo "açıldı")"
    ok "izinli alan adları: $([ "$MISSING" = "[]" ] && echo "TalentFlow'unkiler zaten vardı" || echo "eklendi $MISSING") (var olanlar korundu)"
  else warn "Auth ayarı yazılamadı ($(api_msg)): Authentication → Sign-in method (Anonymous, Email/Password) ve Settings → Authorized domains → $URL_SITE.web.app."; fi
  if [ "$(api "https://identitytoolkit.googleapis.com/admin/v2/projects/$P/defaultSupportedIdpConfigs/google.com")" = 200 ] && \
     [ "$(jget enabled < "$OUT")" = true ]; then ok "Google sağlayıcısı açık (dokunulmadı)"
  else warn "Google sağlayıcısı kapalı: Authentication → Sign-in method → Google → Enable."; fi
  info "kullanıcı havuzu Hub-Inn/CX-Inn ile ortak (beklenen): TalentFlow'a yalnızca davet ya da izinli alan adıyla girilir."
else
  warn "Authentication okunamadı (HTTP $CODE): Firebase Console → Authentication → Get started, sonra yeniden çalıştırın."
fi
rm -f "$OUT"

step "8/10 Çakışma denetimi ve servis hesapları"
# Aynı bölgede aynı adlı bir fonksiyon / Cloud Run servisi başka bir uygulamanınsa TalentFlow dağıtımı onun yerine
# geçerdi. Hub-Inn'in `api`'si beklenen komşu: dokunulmuyor, yalnızca gösteriliyor.
FNS=$(gcloud functions list --project "$P" --regions="$REGION" --format='value(name)' 2>/dev/null | sed 's#.*/##' | tr '\n' ' ')
info "$REGION'daki fonksiyonlar: ${FNS:-yok} (TalentFlow dışındakilere dokunulmuyor)"
if printf ' %s ' "$FNS" | grep -q " $FUNCTION "; then
  LBL=$(gcloud functions describe "$FUNCTION" --region="$REGION" --project "$P" --format=json 2>/dev/null | jget labels.firebase-functions-codebase)
  if [ "$LBL" = "$CODEBASE" ]; then ok "$FUNCTION zaten var ($CODEBASE codebase'inde)"
  else warn "$REGION'da '$FUNCTION' var ama codebase etiketi '$LBL' — kime ait olduğunu kontrol edin, dağıtım onun yerine geçer."; fi
elif gcloud run services list --project "$P" --region="$REGION" --format='value(metadata.name)' 2>/dev/null | grep -qix "$FUNCTION"; then
  warn "$REGION'da '$(echo "$FUNCTION" | tr '[:upper:]' '[:lower:]')' adlı bir Cloud Run servisi var — ilk dağıtım onun üzerine yazar."
else ok "$REGION'da '$FUNCTION' adı boş"; fi
# Kural sürümleri proje geneli: TalentFlow'un firestore.rules / storage.rules'u var olanların yerine geçer.
if [ "$(api "https://firebaserules.googleapis.com/v1/projects/$P/releases")" = 200 ]; then
  REL=$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).releases||[];process.stdout.write(r.map(x=>x.name.split("/releases/").pop()).join(", "))' "$OUT")
  if [ -n "$REL" ]; then warn "projede yayınlanmış kurallar var ($REL) — TalentFlow dağıtımı bunların yerine geçer. Hub-Inn/CX-Inn'e ait değilse sorun yok; emin değilseniz Firebase Console → Firestore/Storage → Rules → yedekleyin."
  else ok "yayınlanmış kural yok"; fi
fi
rm -f "$OUT"

DEPLOYER="talentflow-deployer@$P.iam.gserviceaccount.com"
RUNTIME="talentflow-runtime@$P.iam.gserviceaccount.com"
COMPUTE="$NUM-compute@developer.gserviceaccount.com"
mk_sa() {  # $1 kısa ad, $2 görünen ad — varsa dokunmaz
  quiet gcloud iam service-accounts describe "$1@$P.iam.gserviceaccount.com" --project "$P" && { ok "$1 hesabı var"; return; }
  if gcloud iam service-accounts create "$1" --display-name="$2" --project "$P" >/dev/null; then ok "$1 hesabı oluşturuldu"
  else warn "$1 hesabı oluşturulamadı"; fi
}
mk_sa talentflow-deployer "TalentFlow GitHub deploy (yalnızca TalentFlow)"
mk_sa talentflow-runtime "TalentFlow fonksiyon çalışma hesabı"
sleep 5  # yeni hesabın IAM'e yayılması için
bind() { quiet gcloud projects add-iam-policy-binding "$P" --member="serviceAccount:$1" --role="$2" --condition=None || warn "$2 verilemedi ($1)"; }
act_as() {  # $2 üyesi $1 hesabı ADINA iş başlatabilsin (yalnızca o hesap üzerinde, proje genelinde DEĞİL)
  quiet gcloud iam service-accounts add-iam-policy-binding "$1" --member="serviceAccount:$2" \
    --role=roles/iam.serviceAccountUser --project "$P" || warn "serviceAccountUser verilemedi ($1)"
}

# ── Çalışma hesabı: uygulamanın kendisi ne yapıyorsa o kadar ──────────────────
# Varsayılan compute hesabı (organizasyonsuz projede Editor) Hub-Inn/CX-Inn gizli değerlerine erişebiliyor;
# TalentFlow fonksiyonu onun yerine bu hesapla çalışıyor (functions/index.js → serviceAccount).
#   datastore.user     Firestore okuma/yazma (Admin SDK)
#   firebaseauth.admin kullanıcı oluşturma/silme, rol talepleri (Admin SDK)
#   logging.logWriter  günlükler
#   storage.objectAdmin YALNIZCA varsayılan bucket'ta (CV yükleme/silme, toplu içe aktarma)
for R in roles/datastore.user roles/firebaseauth.admin roles/logging.logWriter; do bind "$RUNTIME" "$R"; done
if [ -n "$BUCKET" ]; then
  if quiet gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$RUNTIME" --role=roles/storage.objectAdmin; then
    ok "çalışma hesabı: $BUCKET üzerinde storage.objectAdmin (yalnızca bu bucket)"
  else warn "storage.objectAdmin verilemedi (gs://$BUCKET, $RUNTIME)"; fi
else warn "bucket yok — çalışma hesabının Storage yetkisi bucket oluşunca betik yeniden çalıştırılınca verilir"; fi

# ── Dağıtıcı: `firebase deploy --only hosting:<site>,functions:talentflow,firestore,storage` için en dar set ───
# roles/firebase.admin ve roles/editor BİLEREK yok: paylaşılan projede Hub-Inn/CX-Inn'in her şeyine erişirdi.
#   firebasehosting.admin          site sürümü yükleme/yayınlama (+ firebase.projects.get)
#   cloudfunctions.admin           fonksiyon oluşturma/güncelleme; herkese açık HTTPS için setIamPolicy
#                                  (CLI yeni HTTPS fonksiyonda cloudfunctions.functions.setIamPolicy arıyor)
#   run.admin                      2. nesil fonksiyonun Cloud Run servisi ve çağırıcı (invoker) izni
#   artifactregistry.writer        gcf-artifacts deposunu okuma/temizleme politikası denetimi
#   cloudbuild.builds.editor       fonksiyon derlemesinin durumunu/günlüğünü okuma
#   firebaserules.admin            firestore.rules ve storage.rules yayınlama
#   datastore.indexAdmin           firestore dağıtımının veritabanı/indeks denetimi
#   firebasestorage.viewer         storage dağıtımı varsayılan bucket'ı bu API'den buluyor
#   serviceusage.serviceUsageConsumer  CLI'nin "servis açık mı" denetimleri ve kota projesi
#   firebaseextensions.viewer      CLI'nin dağıtım öncesi eklenti listesi
for R in roles/firebasehosting.admin roles/cloudfunctions.admin roles/run.admin roles/artifactregistry.writer \
         roles/cloudbuild.builds.editor roles/firebaserules.admin roles/datastore.indexAdmin \
         roles/firebasestorage.viewer roles/serviceusage.serviceUsageConsumer roles/firebaseextensions.viewer; do
  bind "$DEPLOYER" "$R"
done
# Fonksiyon talentflow-runtime ile çalışıyor: dağıtıcı YALNIZCA bu hesap adına iş başlatabilir.
act_as "$RUNTIME" "$DEPLOYER"
# Fonksiyon kendi hesabıyla çalışsa da Firebase CLI dağıtım öncesi App Engine varsayılan hesabında
# (<proje>@appspot) actAs arıyor; yoksa "Missing permissions ... iam.serviceAccounts.ActAs" ile duruyor.
APPSPOT="$P@appspot.gserviceaccount.com"
if quiet gcloud iam service-accounts describe "$APPSPOT" --project "$P"; then act_as "$APPSPOT" "$DEPLOYER"; fi
# Cloud Functions derlemesini Cloud Build'in varsayılan hesabıyla yapıyor. Yeni projelerde bu hesap compute
# hesabı ve Cloud Functions dağıtıcıdan onun üzerinde de actAs istiyor; eski projelerde Google'ın yönettiği
# <numara>@cloudbuild hesabı ve actAs gerekmiyor. Yalnızca gerekiyorsa verilir.
BUILD_SA=$(gcloud builds get-default-service-account --project "$P" --format='value(serviceAccountEmail)' 2>/dev/null | sed 's#.*/##')
case "$BUILD_SA" in
  *@cloudbuild.gserviceaccount.com) ok "derleme hesabı $BUILD_SA (Google yönetimli) — ek actAs gerekmiyor" ;;
  "") warn "Cloud Build'in varsayılan hesabı okunamadı. İlk dağıtım 'iam.serviceAccounts.actAs ... $COMPUTE' hatası verirse:
    gcloud iam service-accounts add-iam-policy-binding $COMPUTE --member=serviceAccount:$DEPLOYER --role=roles/iam.serviceAccountUser" ;;
  *) act_as "$BUILD_SA" "$DEPLOYER"
     warn "derleme hesabı $BUILD_SA — dağıtıcıya bunun üzerinde actAs verildi (fonksiyon derlemesi için şart). Bu hesap
    projede geniş yetkili olabilir: talentflow-deployer anahtarını yalnızca GitHub secret'ında tutun." ;;
esac
ok "hesaplar ve yetkiler hazır"

step "9/10 GitHub için yayın anahtarı"
KEY="$HOME/talentflow-deployer-$P.json"
if [ -f "$KEY" ]; then
  KEMAIL=$(node -e 'try{process.stdout.write(require(process.argv[1]).client_email||"")}catch{}' "$KEY")
  if [ "$KEMAIL" = "$DEPLOYER" ]; then ok "$KEY zaten var ($DEPLOYER)"
  else warn "$KEY başka bir hesaba ait ($KEMAIL). Silip betiği yeniden çalıştırın: rm \"$KEY\""; fi
elif gcloud iam service-accounts keys create "$KEY" --iam-account="$DEPLOYER" --project "$P" >/dev/null 2>&1; then
  ok "anahtar dosyası oluşturuldu: $KEY"
else warn "anahtar oluşturulamadı (org politikası 'iam.disableServiceAccountKeyCreation' olabilir)"; fi

step "10/10 GitHub secret'ları ve değişkenleri ($REPO)"
# Durum dosyası PROJEYE göre: önceki proje (deploy-n8n-local) için yazılmış olanlar bu projede yeniden sorulur.
STATE="$HOME/.talentflow-setup-$P.state"; touch "$STATE"
GH=""
if command -v gh >/dev/null 2>&1 && quiet gh auth status && quiet gh repo view "$REPO"; then GH=1; ok "gh CLI hazır — değerler doğrudan GitHub'a yazılacak"
else warn "gh CLI yok ya da oturum açık değil — değerler $HOME/talentflow-github-$P.txt dosyasına yazılacak (elle girip silin)"; fi
FALLBACK="$HOME/talentflow-github-$P.txt"
done_for_project() { [ -z "${FORCE_SECRETS:-}" ] && grep -qx "$1" "$STATE"; }
mark() { echo "$1" >> "$STATE"; }
put_secret() {  # $1 ad, değer stdin'den — ekrana basılmaz
  if [ -n "$GH" ]; then gh secret set "$1" --repo "$REPO" >/dev/null || { warn "$1 yazılamadı"; return; }
  else { printf '%s=' "$1"; cat; echo; } >> "$FALLBACK"; chmod 600 "$FALLBACK" 2>/dev/null; fi
  mark "$1"; ok "secret $1"
}
put_var() {
  if [ -n "$GH" ]; then gh variable set "$1" --body "$2" --repo "$REPO" >/dev/null && ok "değişken $1=$2" || warn "$1 yazılamadı"
  else echo "VARIABLE $1=$2" >> "$FALLBACK"; ok "değişken $1=$2 (dosyaya)"; fi
}

# Projeye bağlı değerler: eski projeninkilerin ÜZERİNE yazılır.
[ -n "$SENDER" ] && put_var FIREBASE_MESSAGING_SENDER_ID "$SENDER"
[ -n "$APP_ID" ] && put_var FIREBASE_APP_ID "$APP_ID"
# Bucket adı türetilemiyor (appspot.com / firebasestorage.app) — workflow bu değişkeni okur.
[ -n "$BUCKET" ] && put_var FIREBASE_STORAGE_BUCKET "$BUCKET"

if done_for_project FIREBASE_SERVICE_ACCOUNT; then ok "FIREBASE_SERVICE_ACCOUNT bu proje için zaten yazıldı"
elif [ -f "$KEY" ] && [ "$(node -e 'try{process.stdout.write(require(process.argv[1]).client_email||"")}catch{}' "$KEY")" = "$DEPLOYER" ]; then
  put_secret FIREBASE_SERVICE_ACCOUNT < "$KEY"
else warn "FIREBASE_SERVICE_ACCOUNT yazılmadı (anahtar yok) — dağıtım 'başka projeye ait' diye duracak"; fi

if done_for_project VITE_FIREBASE_API_KEY; then ok "VITE_FIREBASE_API_KEY bu proje için zaten yazıldı"
elif [ -n "$API_KEY" ]; then printf %s "$API_KEY" | put_secret VITE_FIREBASE_API_KEY
else warn "VITE_FIREBASE_API_KEY yazılmadı (web uygulaması okunamadı)"; fi
unset API_KEY

# Temiz kurulum: bu projede şifrelenmiş jeton yok, yeni anahtar güvenle üretilir. Sonradan DEĞİŞTİRİLMEZ.
if done_for_project INTEGRATION_ENCRYPTION_KEY; then ok "INTEGRATION_ENCRYPTION_KEY bu proje için zaten yazıldı (dokunulmadı)"
else openssl rand -base64 32 | tr -d '\n' | put_secret INTEGRATION_ENCRYPTION_KEY; fi

# ── Projeye bağlı OLMAYAN değerler: GitHub'daki mevcut değer kullanılabilir ──────
# gh secret değerlerini okuyamaz; bu yüzden yalnızca "yeniden girilsin mi?" soruluyor. Varsayılan: atla (GitHub'daki
# değer kalır). Hiç girilmemişlerse dağıtımın "Check required secrets" adımı adıyla söyler.
if done_for_project VITE_GEMINI_API_KEY; then ok "VITE_GEMINI_API_KEY bu proje için zaten ele alındı"
else
  echo "  Gemini anahtarı: GitHub'daki mevcut anahtar önceki projeye (deploy-n8n-local) bağlı; o proje durdukça çalışır."
  read -rp "  [o] bu projede yeni anahtar üret  [y] anahtar yapıştır  [Enter] atla (mevcut kalsın): " A
  V=""
  case "$A" in
    o|O)
      KNAME="projects/$NUM/locations/global/keys/talentflow-gemini"
      quiet gcloud services api-keys describe "$KNAME" --project "$P" \
        || quiet gcloud services api-keys create --key-id=talentflow-gemini --display-name="TalentFlow Gemini (sunucu)" \
             --api-target=service=generativelanguage.googleapis.com --project "$P"
      V=$(gcloud services api-keys get-key-string "$KNAME" --project "$P" --format='value(keyString)' 2>/dev/null)
      [ -n "$V" ] || warn "Gemini anahtarı üretilemedi" ;;
    y|Y) read -rsp "  Gemini API anahtarı (ekranda görünmez): " V; echo ;;
    *) mark VITE_GEMINI_API_KEY; ok "VITE_GEMINI_API_KEY atlandı — GitHub'daki değer kullanılacak" ;;
  esac
  [ -n "$V" ] && printf %s "$V" | put_secret VITE_GEMINI_API_KEY
  unset V A
fi

if done_for_project EMAIL_USER && done_for_project EMAIL_PASS; then ok "EMAIL_USER / EMAIL_PASS bu proje için zaten ele alındı"
elif ! yes_no "Sistem e-postası (EMAIL_USER/EMAIL_PASS) yeniden girilsin mi? Hayır = GitHub'daki değerler kalır"; then
  mark EMAIL_USER; mark EMAIL_PASS; ok "EMAIL_USER / EMAIL_PASS atlandı — GitHub'daki değerler kullanılacak"
else
  echo "  Gmail SMTP: hesapta 2 adımlı doğrulama açık olmalı; şifre Google Hesabı → Güvenlik → Uygulama şifreleri'nden."
  read -rp "  Gönderen Gmail adresi: " V
  if [ -n "$V" ]; then
    printf %s "$V" | put_secret EMAIL_USER
    read -rsp "  Uygulama şifresi (ekranda görünmez): " V; echo
    if [ -n "$V" ]; then printf %s "${V// /}" | put_secret EMAIL_PASS; else warn "EMAIL_PASS boş; yeniden çalıştırın"; fi
  else warn "EMAIL_USER boş; yeniden çalıştırın"; fi
  unset V
fi

if done_for_project AI_DAILY_TOKEN_LIMIT && done_for_project AI_DAILY_GROUNDED_LIMIT; then ok "AI_DAILY_* bu proje için zaten ele alındı"
elif ! yes_no "Günlük AI tavanları (AI_DAILY_TOKEN_LIMIT / AI_DAILY_GROUNDED_LIMIT) yeniden girilsin mi? Hayır = GitHub'daki kalır"; then
  mark AI_DAILY_TOKEN_LIMIT; mark AI_DAILY_GROUNDED_LIMIT; ok "AI_DAILY_* atlandı — GitHub'daki değerler kullanılacak"
else
  for S in AI_DAILY_TOKEN_LIMIT AI_DAILY_GROUNDED_LIMIT; do
    read -rp "  $S (boş = dokunma): " V
    if [ -n "$V" ]; then printf %s "$V" | put_secret "$S"; else mark "$S"; fi
  done
  unset V
fi

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
[ -z "$SITE" ] && echo "! Site oluşturulamadı; aşağıdaki adres firebase.json'daki ad ($URL_SITE) — site açılınca geçerli olur."
cat <<EOF

Sıradaki adımlar (docs/yeni-proje-kurulumu.md):
  1. firebase.json/.firebaserc değiştiyse commit'leyin; PR'ı merge edin = ilk dağıtım (yalnızca TalentFlow'un parçaları:
     hosting:$URL_SITE, functions:$CODEBASE, firestore, storage). Bu projede ASLA düz \`firebase deploy\` çalıştırmayın.
  2. $APP_URL adresinde bir kez Google ile giriş yapın ("Erişim yetkiniz bulunmuyor" normal), sonra:
       gcloud auth application-default login
       node scripts/grant-super-admin.mjs <e-posta>
  3. Entegrasyon Merkezi'nden Google OAuth istemcisini girin (redirect: $APP_URL/auth/google/callback).
EOF
