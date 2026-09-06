// TANITIM — herkese açık vaka çalışması sayfası.
//
// ── NEDEN UYGULAMANIN İÇİNDE ────────────────────────────────────────────────
// Ürünü anlatan sayfanın ürünün kendi alan adında durması gerekiyor: paylaşılan
// link üçüncü parti bir servise değil uygulamaya çıkıyor, giriş ekranından tek
// tık uzakta ve ekran görüntüleri ürünle birlikte güncelleniyor.
//
// Giriş İSTEMİYOR (App.jsx'teki herkese açık rota bloğunda). Hiçbir veri
// okumuyor: metin ve public/tanitim altındaki görüntülerden ibaret. Rota
// düzeyinde ayrı bir parçaya bölünüyor, dolayısıyla giriş yapan kullanıcının
// yüklediği pakete girmiyor.
//
// ── EKRAN GÖRÜNTÜLERİ GERÇEK, VERİ UYDURMA ─────────────────────────────────
// Görüntüler scripts/demo-seed/shots.mjs ile, scripts/demo-seed/dataset.mjs
// içindeki uydurma veriyle üretiliyor. Gerçek adayların adı, e-postası ve
// mülakat transkripti bir tanıtım sayfasında yayımlanamaz; elle çekilen
// görüntüler de birkaç sürüm sonra ürünün bugünkü hâlini göstermeyi bırakır.

import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, ScanSearch, CalendarDays, FileText } from 'lucide-react';

/** Ürünün kendi hüküm etiketleri — tanıtımda da aynı kelimeler kullanılıyor. */
function Chip({ tone = 'n', children }) {
    const cls = {
        ok: 'bg-ok-bg text-ok',
        warn: 'bg-warn-bg text-warn',
        bad: 'bg-bad-bg text-bad-text',
        brand: 'bg-brand/10 text-brand',
        n: 'border border-n200 text-n500',
    }[tone];
    return (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap ${cls}`}>
            {children}
        </span>
    );
}

function Sekme({ children }) {
    return <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand m-0">{children}</p>;
}

/** Ekran görüntüsü — altında ne gösterdiğini söyleyen bir satırla. */
function Ekran({ src, alt, aciklama }) {
    return (
        <figure className="m-0 mt-6">
            <div className="rounded-[10px] border border-n200 overflow-hidden bg-n0 shadow-sm">
                <img src={src} alt={alt} loading="lazy" className="block w-full h-auto" />
            </div>
            <figcaption className="text-[11px] text-n400 mt-2 leading-relaxed">{aciklama}</figcaption>
        </figure>
    );
}

function Bolum({ children, className = '' }) {
    return <section className={`pt-14 ${className}`}>{children}</section>;
}

const ADIMLAR = [
    {
        baslik: 'CV içeri alınıyor',
        metin: 'Tek tek yükleme, toplu içe aktarma, başvuru formu ya da e-posta. Metin yapılandırılmış '
            + 'bir profile çevriliyor: görevler, şirketler, tarihler, beceriler, eğitim.',
    },
    {
        baslik: 'İlan maddelere ayrılıyor',
        metin: '"5 yıl deneyim, B2B ürün, SQL" gibi bir metin tek tek ölçülebilir maddelere bölünüyor. '
            + 'Her madde zorunlu ya da tercihen olarak işaretleniyor — ikisi aynı şey değil ve skor bunu biliyor.',
    },
    {
        baslik: 'Her madde için kanıt aranıyor',
        metin: 'CV\'nin tamamı her maddeye karşı ayrı ayrı taranıyor. Çıktı bir puan değil, madde başına '
            + 'bir hüküm ve o hükmü doğuran alıntı.',
    },
    {
        baslik: 'Beyan doğrulanıyor',
        metin: 'Önce CV\'nin kendi içindeki tutarlılık, sonra şirketlerin bağımsız kaydı.',
    },
    {
        baslik: 'Görüşme planı çıkıyor',
        metin: 'Açık kalan maddeler için soru üretiliyor: hangi maddeyi kapatmak için sorulduğu ve cevapta '
            + 'neye dikkat edileceği yazılı. Görüşme bitince cevaplar aynı maddelere geri bağlanıyor.',
    },
];

const YAPMADIKLARI = [
    {
        baslik: 'Kariyer boşluklarını bayraklamıyor',
        metin: 'Teknik olarak kolay ve bilerek dışarıda bırakıldı. Boşluk sahtecilik göstergesi değil: '
            + 'doğum izni, hastalık, bakım yükümlülüğü, askerlik. Bu yükü orantısız biçimde belirli gruplar taşıyor.',
    },
    {
        baslik: '"Doğrulanamadı"yı şüphe saymıyor',
        metin: 'Aksi hâlde küçük bir aile şirketinde çalışmış aday, kurumsal geçmişli adaya göre '
            + 'sistematik olarak cezalandırılırdı. Doğrulanamamak bir bulgu değil, bir boşluktur.',
    },
    {
        baslik: 'Ölçemediği yere sayı yazmıyor',
        metin: 'Sorulmamış madde eksiklik sayılmıyor, hüküm çıkmayan cevap sıfır sayılmıyor, ölçüm kısmiyse '
            + 'rapor bunu yazıyor. Skor üretilemediğinde yerine sebebi geçiyor.',
    },
    {
        baslik: 'Adayın kendi skorunu yazmasına izin vermiyor',
        metin: 'Canlı görüşmede aday tarafı transkript ve durum alanlarını yazabiliyor ama değerlendirme '
            + 'çıktısına dokunamıyor — ne tarayıcıdan ne de sunucudan.',
    },
];

const PRATIK = [
    { baslik: 'Veri nerede', metin: 'Kendi Firebase projenizde. Aday verisi, CV\'ler ve görüşme kayıtları sizin hesabınızda kalıyor; ortak bir havuz yok.' },
    { baslik: 'AI anahtarı', metin: 'Kendi Gemini anahtarınız. Faturayı siz görüyorsunuz.' },
    { baslik: 'Maliyet', metin: 'Her AI çağrısının tokenı özelliğe göre ölçülüyor; hangi özelliğin ne yaktığı yönetim ekranında gün gün görünüyor.' },
    { baslik: 'Fren', metin: 'Günlük token ve arama tavanı tanımlanabiliyor. Tavan dolduğunda yeni AI çağrısı başlamıyor.' },
    { baslik: 'Roller', metin: 'Süper admin, işe alım uzmanı, departman kullanıcısı — sonuncusu yalnızca kendi departmanının adaylarını görüyor.' },
    { baslik: 'Entegrasyon', metin: 'Google Workspace ve Microsoft 365 (takvim, e-posta), Google Takvim senkronu, PDF rapor, Excel dışa aktarım.' },
];

export default function TanitimPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-n50 text-n900">
            <div className="max-w-[52rem] mx-auto px-5 pb-24">

                {/* ── Başlık ─────────────────────────────────────────────── */}
                <header className="pt-16 pb-10 border-b border-n200 flex flex-col gap-5">
                    <Sekme>Vaka çalışması · İşe alım yazılımı</Sekme>
                    <h1 className="text-[2.1rem] sm:text-[2.9rem] leading-[1.08] font-semibold tracking-[-0.02em] m-0 max-w-[20ch] text-balance">
                        Aday hakkında karar vermez.<br />
                        <span className="text-brand">Sorulacak soruyu</span> çıkarır.
                    </h1>
                    <p className="text-[15px] text-n600 leading-relaxed m-0 max-w-[46ch]">
                        TalentFlow, CV'leri puanlayan bir araç değil; bir işe alım görüşmesinde neyin sorulması
                        gerektiğini kanıta bağlayarak çıkaran bir defter.
                    </p>
                    <button
                        onClick={() => navigate('/')}
                        className="self-start inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand hover:underline"
                    >
                        Uygulamaya giriş <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </header>

                {/* ── Sorun ──────────────────────────────────────────────── */}
                <Bolum>
                    <h2 className="text-[1.5rem] font-semibold tracking-[-0.01em] m-0 mb-3">Sorun, CV okumak değil</h2>
                    <p className="text-[15px] text-n600 leading-relaxed m-0 mb-3">
                        Bir ilana yüz başvuru geldiğinde asıl iş CV okumak değil, <strong className="text-n900 font-semibold">hangi
                        adaya ne soracağını bilmek</strong>. Otuz dakikalık bir görüşmede sorulacak soru sayısı sınırlı;
                        o süreyi adayın CV'de zaten yazdığını tekrar ettirmekle geçirmek en pahalı hata.
                    </p>
                    <p className="text-[15px] text-n600 leading-relaxed m-0 mb-3">
                        Araçların çoğu bu soruyu atlayıp doğrudan bir sayı üretiyor: "Aday %82 uyumlu." O sayının neye
                        dayandığı, hangi maddeyi karşıladığı, nerede boşluk kaldığı görünmüyor. İnsan ya sayıya güveniyor
                        ya da yok sayıyor — ikisi de kötü.
                    </p>
                    <p className="text-[15px] text-n600 leading-relaxed m-0">
                        TalentFlow tersinden kuruldu. Önce <strong className="text-n900 font-semibold">ilanın maddeleri</strong>,
                        sonra her madde için <strong className="text-n900 font-semibold">kanıt</strong>, en sonda — ve ancak
                        kanıt varsa — bir oran. Kanıt yoksa sayı da yok; yerine sebebi yazılıyor.
                    </p>

                    <Ekran
                        src="/tanitim/aday-havuzu.png"
                        alt="Aday havuzu ekranı: adaylar, aşamaları ve uyum skorları"
                        aciklama="Aday havuzu. Her satırdaki skor, o satırda yazan pozisyonun skoru — başka bir ilandan devralınan bir sayı değil. Ekrandaki veriler tanıtım için üretilmiş uydurma kayıtlardır."
                    />
                </Bolum>

                {/* ── Akış ───────────────────────────────────────────────── */}
                <Bolum>
                    <h2 className="text-[1.5rem] font-semibold tracking-[-0.01em] m-0 mb-3">Bir adayın yolu</h2>
                    <p className="text-[15px] text-n600 leading-relaxed m-0">
                        Aşağıdaki sıra gerçek bir akış: her adım bir öncekinin çıktısını girdi alıyor.
                    </p>
                    <ol className="list-none p-0 m-0 mt-6">
                        {ADIMLAR.map((a, i) => (
                            <li key={a.baslik} className="grid grid-cols-[2.2rem_1fr] gap-x-3 py-4 border-t border-n200">
                                <span className="text-[11px] font-semibold text-brand tabular-nums pt-1">
                                    {String(i + 1).padStart(2, '0')}
                                </span>
                                <div>
                                    <h3 className="text-[13px] font-semibold m-0 mb-1">{a.baslik}</h3>
                                    <p className="text-[13px] text-n600 leading-relaxed m-0">{a.metin}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </Bolum>

                {/* ── Kanıt ──────────────────────────────────────────────── */}
                <Bolum>
                    <div className="flex items-center gap-2 mb-3">
                        <ScanSearch className="w-4 h-4 text-brand" />
                        <h2 className="text-[1.5rem] font-semibold tracking-[-0.01em] m-0">Skor, kanıt oranıdır</h2>
                    </div>
                    <p className="text-[15px] text-n600 leading-relaxed m-0">
                        Ekranda bir sayı görüyorsanız arkasında şu tablo duruyor. Her satır bir ilan maddesi, her hüküm
                        bir alıntıya bağlı. Alıntı yoksa hüküm de yok — "karar verilemedi" geçerli ve sık bir sonuç.
                    </p>

                    <div className="mt-6 bg-n0 border border-n200 rounded-[10px] overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-n200 flex items-center justify-between gap-3 flex-wrap">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-n400">Gereksinim değerlendirmesi</span>
                            <span className="text-[10px] text-n400">Kanıt oranı %66 · 5 maddeden 3'ü soruldu</span>
                        </div>
                        <div className="px-4 pb-4">
                            <div className="py-3.5 border-b border-dashed border-n200">
                                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                    <span className="text-[13px] font-medium">Uçtan uca funnel sahipliği</span>
                                    <Chip>Zorunlu</Chip>
                                    <Chip tone="ok">Karşılıyor</Chip>
                                </div>
                                <p className="text-[13px] border-l-2 border-brand pl-3 m-0 mb-1 text-n700 italic">
                                    "Kayıt ekranından ilk değerli aksiyona kadar olan bütün adımlar bendeydi."
                                </p>
                                <p className="text-[11px] text-n400 m-0">Somut örnek ve rakam verdi.</p>
                            </div>
                            <div className="py-3.5 border-b border-dashed border-n200">
                                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                    <span className="text-[13px] font-medium">A/B test kurgusu</span>
                                    <Chip>Zorunlu</Chip>
                                    <Chip tone="warn">Kısmen</Chip>
                                </div>
                                <p className="text-[13px] border-l-2 border-brand pl-3 m-0 mb-1 text-n700 italic">
                                    "Deneyleri kurguluyorduk ama analizi veri ekibi yapıyordu."
                                </p>
                                <p className="text-[11px] text-n400 m-0">Sahiplik sınırı net değil — takip sorusu gerekiyor.</p>
                            </div>
                            <div className="pt-3.5">
                                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                    <span className="text-[13px] font-medium">Ölçekli sistem deneyimi</span>
                                    <Chip tone="brand">Sorulmadı</Chip>
                                </div>
                                <p className="text-[11px] text-n400 m-0">
                                    Bu madde hiç konuşulmadı. Karşılanmadığı anlamına gelmiyor — eksik olan cevap değil, soru.
                                </p>
                            </div>
                        </div>
                    </div>

                    <p className="text-[15px] text-n600 leading-relaxed m-0 mt-5">
                        Son satır bu yaklaşımın özeti. Sorulmamış bir madde, karşılanmamış bir madde değildir; rapor
                        ikisini asla aynı yere yazmıyor. Bir sistemin ölçemediği şeyi sıfır diye yazması, olmayan bir
                        ölçümü varmış gibi göstermektir.
                    </p>

                    <Ekran
                        src="/tanitim/cv-uyum.png"
                        alt="Aday detayı: CV metni, pozisyon uyum analizi ve kariyer kronolojisi"
                        aciklama="Aday detayı. CV metni, uyum analizi ve kariyer kronolojisi aynı ekranda; skorun yanında ne olduğu değil neye dayandığı duruyor."
                    />
                </Bolum>

                {/* ── Doğrulama ──────────────────────────────────────────── */}
                <Bolum>
                    <div className="flex items-center gap-2 mb-3">
                        <ShieldCheck className="w-4 h-4 text-brand" />
                        <h2 className="text-[1.5rem] font-semibold tracking-[-0.01em] m-0">Doğrulama iki katmanlı</h2>
                    </div>
                    <p className="text-[15px] text-n600 leading-relaxed m-0 mb-3">
                        <strong className="text-n900 font-semibold">Birinci katman internete hiç çıkmıyor:</strong> CV'nin
                        kendi içindeki çelişkiler. Tarihler birbirini tutuyor mu, beyan edilen toplam deneyim listelenen
                        görevlerle örtüşüyor mu, aynı anda iki tam zamanlı görev mi görünüyor. Bu sinyal daha güvenilir —
                        dış kaynak bulunamaması bir şey kanıtlamaz, ama adayın kendi iki ifadesinin çelişmesi ölçülebilir
                        bir olgudur.
                    </p>
                    <p className="text-[15px] text-n600 leading-relaxed m-0 mb-3">
                        <strong className="text-n900 font-semibold">İkinci katman şirketi arıyor:</strong> ticaret sicili,
                        kurumsal site, alan adı yaşı. Kanıtın gücü sıralı — sicil hukuken yayımlanmış bir kayıt, alan adı
                        yaşı dolaylı, arama sonucu yorum. Hiçbiri bulunamazsa kullanıcı şirketin sitesini yazıp
                        araştırmayı oradan yürütebiliyor, açıkta kalanı elle dolduruyor.
                    </p>
                    <p className="text-[15px] text-n600 leading-relaxed m-0">
                        Üç ağırlık var ve <strong className="text-n900 font-semibold">hiçbiri "yalan" demiyor</strong>:
                        çelişki, dikkat, bilgi. En ağır bayrak bile bir hüküm değil, bir soru üretiyor.
                    </p>

                    <Ekran
                        src="/tanitim/dogrulama.png"
                        alt="Doğrulama sekmesi: bulgu sayıları, mülakat öncesi sorulacaklar ve bayrak kartları"
                        aciklama="Doğrulama sekmesi. Bulguların üstünde 'bu bulgular skoru değiştirmedi' yazıyor: doğrulama adayın sıralamasını değil, sorulacak soruları etkiliyor."
                    />
                </Bolum>

                {/* ── Görüşme ────────────────────────────────────────────── */}
                <Bolum>
                    <div className="flex items-center gap-2 mb-3">
                        <CalendarDays className="w-4 h-4 text-brand" />
                        <h2 className="text-[1.5rem] font-semibold tracking-[-0.01em] m-0">Görüşme takvimden başlıyor</h2>
                    </div>
                    <p className="text-[15px] text-n600 leading-relaxed m-0 mb-3">
                        Günün planı takvimde duruyor, o yüzden akış da orada başlıyor. Google Takvim bağlandığında
                        mülakat ifadesi geçen etkinlikler ayrı renkte görünüyor ve bir tanesi bir adayın mülakatı olarak
                        işaretlenebiliyor.
                    </p>
                    <p className="text-[15px] text-n600 leading-relaxed m-0">
                        Görüşmenin nerede yapıldığı önemli değil — Meet, Teams, telefon ya da yüz yüze. Görüşme bittiğinde
                        sonuç elle giriliyor: transkript yapıştırılıyor, cevaplar sorulara dağıtılıyor, her cevap ilgili
                        ilan maddesine bağlanıyor. Çıktı, alıntılarıyla birlikte indirilebilir bir PDF rapor.
                    </p>

                    <Ekran
                        src="/tanitim/takvim.png"
                        alt="Mülakat takvimi: ay görünümü ve etkinlik renk açıklaması"
                        aciklama="Mülakat takvimi. Alttaki renk açıklaması dört durumu ayırıyor: planlı mülakat, tamamlanmış, mülakat olabilir (henüz işaretlenmemiş) ve diğer takvim etkinliği."
                    />

                    <div className="mt-6 bg-n0 border border-n200 rounded-[10px] p-4 flex items-start gap-3">
                        <FileText className="w-4 h-4 text-brand flex-shrink-0 mt-0.5" />
                        <p className="text-[13px] text-n600 leading-relaxed m-0">
                            Raporda üç ayrı karar dili bilerek ayrı duruyor: <strong className="text-n900 font-semibold">nihai
                            karar</strong> İK'nın, <strong className="text-n900 font-semibold">görüşme sonrası izlenim</strong> mülakatçının,
                            <strong className="text-n900 font-semibold"> sistem önerisi</strong> ise yalnızca kanıt oranından
                            türeyen bir öneri. Üçünü tek bir sayıya ezmek, kimin ne dediğini kaybetmek olurdu.
                        </p>
                    </div>
                </Bolum>

                {/* ── Yapmadıkları ───────────────────────────────────────── */}
                <Bolum>
                    <h2 className="text-[1.5rem] font-semibold tracking-[-0.01em] m-0 mb-3">Bilerek yapmadıkları</h2>
                    <p className="text-[15px] text-n600 leading-relaxed m-0">
                        Bir işe alım aracında neyin <em>olmadığı</em>, olanı kadar önemli. Aşağıdakiler eksik değil, tercih.
                    </p>
                    <ul className="list-none p-0 m-0 mt-6 grid gap-5">
                        {YAPMADIKLARI.map((y) => (
                            <li key={y.baslik} className="grid grid-cols-[1.1rem_1fr] gap-x-2.5">
                                <span className="text-bad font-semibold leading-tight pt-0.5">—</span>
                                <div>
                                    <h3 className="text-[13px] font-semibold m-0 mb-1">{y.baslik}</h3>
                                    <p className="text-[13px] text-n600 leading-relaxed m-0">{y.metin}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Bolum>

                {/* ── Pratik ─────────────────────────────────────────────── */}
                <Bolum>
                    <h2 className="text-[1.5rem] font-semibold tracking-[-0.01em] m-0">Pratik tarafı</h2>
                    <dl className="m-0 mt-5">
                        {PRATIK.map((f) => (
                            <div key={f.baslik} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-x-6 gap-y-1 py-3.5 border-t border-n200">
                                <dt className="text-[10px] font-semibold uppercase tracking-[0.09em] text-n400 pt-0.5">{f.baslik}</dt>
                                <dd className="text-[13px] text-n600 leading-relaxed m-0">{f.metin}</dd>
                            </div>
                        ))}
                    </dl>
                </Bolum>

                {/* ── Kapanış ────────────────────────────────────────────── */}
                <div className="mt-16 pt-8 border-t-2 border-n900">
                    <p className="text-[1.15rem] sm:text-[1.35rem] leading-snug font-medium m-0 max-w-[28ch] text-balance">
                        Bir işe alım aracının verebileceği en büyük zarar, ölçemediği bir şeyi ölçmüş gibi göstermek.
                        Buradaki her tasarım kararı o cümleye bakarak verildi.
                    </p>
                    <button
                        onClick={() => navigate('/')}
                        className="mt-7 inline-flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-md text-[13px] font-semibold hover:opacity-90"
                    >
                        Uygulamaya giriş <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>

                <footer className="mt-12 text-[11px] text-n400">
                    Bu sayfadaki ekran görüntülerinde görünen kişiler, şirketler ve kayıtların tamamı tanıtım için
                    üretilmiş uydurma verilerdir.
                </footer>
            </div>
        </div>
    );
}
