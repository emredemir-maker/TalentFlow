import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, Minus, X, Wrench, Brain, Calculator, Quote, GitCompareArrows, RotateCcw, AlertTriangle } from 'lucide-react';
import { explainHybridScore } from '../services/geminiService';
import { requirementsOf } from '../utils/positionRequirements';
import { coverageDetailState, usesCurrentRubric, assessmentsOf } from '../utils/coverageDetail';
import { isStaleFor, analysisScoreDetail } from '../utils/positionScore';
import { ShieldAlert, TrendingUp, Layers } from 'lucide-react';
import { buildScoreProvenance, dominantSource } from '../utils/scoreProvenance';
import { STAR_MAX, STAR_LABELS, anchorLabel, normalizeStarAnalysis, starPercent } from '../utils/starDimensions';

/**
 * "Bu skor neden 54?" — skorun tam kırılımı.
 *
 * Sayılar explainHybridScore'dan gelir, yani skorun KENDİ hesabından.
 * Burada yeniden hesaplanmaz; ayrı bir hesap yazılsaydı ekran zamanla
 * gerçek skordan sapar ve şeffaflık iddiası yalana dönerdi. Testler
 * madde puanlarının toplamının skora eşit kaldığını sabitliyor.
 */
/** Uzun gereksinim metnini tek satırlık bir ipucuna indirger. */
const MAX_ITEM_CHARS = 52;
const shorten = (text) => {
    const t = String(text || '').trim();
    if (t.length <= MAX_ITEM_CHARS) return t;
    // Kelimenin ortasından kesmek okumayı zorlaştırıyor; son boşluğa geri sar.
    const cut = t.slice(0, MAX_ITEM_CHARS);
    const at = cut.lastIndexOf(' ');
    return `${(at > 20 ? cut.slice(0, at) : cut).replace(/[.,;:]$/, '')}…`;
};

/** Şirket hakkında doğrulama katmanının bildikleri — ÖLÇÜM, yorum değil. */
const VERDICT_TEXT = {
    dogrulandi: 'doğrulandı',
    dogrulanamadi: 'doğrulanamadı',
    celiski: 'çelişki',
};

/**
 * BU SKOR NEYE DAYANIYOR?
 *
 * "%95, 200 kişilik bir şirkette doğrulanmış üç yıldan geliyor" ile "%95'in
 * beşte dördü, adayın kendi kurduğu 1-10 kişilik doğrulanamayan bir
 * şirketteki dönemden geliyor" bambaşka iki bilgi. İkisi de aynı sayıyı
 * üretiyor ve karar verici aradaki farkı göremiyordu.
 *
 * ── YARGI YOK, ATIF VAR ─────────────────────────────────────────────────────
 * Blok "bu iş uydurma" ya da "küçük şirket şüpheli" demiyor — kurucu geçmişi
 * meşru bir kariyer yolu. Görsel ağırlık bu bloktan değil, doğrulama
 * katmanında ZATEN ölçülmüş olgulardan geliyor.
 */
function ProvenanceBlock({ analysis, position, candidate }) {
    const prov = buildScoreProvenance({
        analysis,
        requirements: requirementsOf(position),
        candidate,
    });
    if (prov.total === 0) return null;

    // Analiz dayanak alanı taşımıyorsa atıf hiç denenemez. Bunu "atfedilemedi"
    // diye göstermek yanıltıcı olur: sorulmamış bir soruyu cevapsız saymak.
    if (!prov.hasEvidence) {
        return (
            <div className="rounded-md border border-n200 bg-n50 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                    <Layers className="w-3.5 h-3.5 text-n400" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n500">
                        Bu skorun dayanağı
                    </span>
                </div>
                <p className="text-[11px] text-n500 leading-relaxed">
                    Bu analiz madde bazında dayanak taşımıyor (eski sürümle yapılmış).
                    Skorun hangi işlerden geldiğini görmek için adayı <strong>yeniden taratın</strong>.
                </p>
            </div>
        );
    }

    const top = dominantSource(prov);
    return (
        <div className="rounded-md border border-n200 bg-n0 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-2">
                <Layers className="w-3.5 h-3.5 text-brand" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n600">
                    Bu skorun dayanağı
                </span>
                {top && prov.attributed > 1 && (
                    // "6'i" DEĞİL. Türkçede sayıya gelen ek sayıya göre
                    // değişiyor (1'i, 2'si, 3'ü, 6'sı, 9'u) ve tek bir kalıp
                    // hepsinde doğru olmuyor. "tanesi" her sayıda çalışır.
                    //
                    // "Atfedilebilen" da önemli: payda TÜM maddeler değil, işe
                    // bağlanabilenler. Başlık bunu söylemezse okuyan 8'i toplam
                    // sanıyor — oysa aşağıda ayrıca atfedilemeyenler yazıyor.
                    <span className="text-[11px] font-semibold text-n500 ml-auto">
                        Atfedilebilen {prov.attributed} maddenin {top.count} tanesi bu işi gösteriyor
                    </span>
                )}
            </div>

            <div className="space-y-2">
                {prov.groups.map((g) => (
                    <div key={`${g.company}-${g.duration}`} className="border border-n200 rounded-md px-2.5 py-2 bg-n50">
                        <div className="flex items-baseline justify-between gap-2 flex-wrap">
                            <span className="text-[12px] font-semibold text-n900">{g.company}</span>
                            <span className="text-[11px] text-n500">
                                {[g.role, g.duration].filter(Boolean).join(' · ')}
                            </span>
                        </div>

                        {/* Olgular doğrulama katmanından geliyor; burada yeniden
                            yorumlanmıyor, yalnızca skorun yanına taşınıyor. */}
                        {g.facts && (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                                {g.facts.sizeBand && (
                                    <span className="text-[11px] font-semibold px-1.5 py-px rounded border bg-n0 text-n600 border-n200">
                                        {g.facts.sizeBand} kişi
                                    </span>
                                )}
                                {g.facts.verdict && (
                                    <span className={`text-[11px] font-semibold px-1.5 py-px rounded border ${
                                        g.facts.verdict === 'celiski'
                                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                                            : g.facts.verdict === 'dogrulandi'
                                                ? 'bg-ok-bg text-ok border-transparent'
                                                : 'bg-n100 text-n600 border-n200'
                                    }`}>
                                        {VERDICT_TEXT[g.facts.verdict] || g.facts.verdict}
                                    </span>
                                )}
                                {g.facts.isFounder && (
                                    <span className="text-[11px] font-semibold px-1.5 py-px rounded border bg-warn-bg text-warn border-warn">
                                        aday kurucu
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Gereksinim metinleri çok uzun olabiliyor (canlıda tek
                            madde altı satır sürdü) ve hücre paragrafa dönüşüyor.
                            Tam metin başlıkta duruyor; buradaki iş hangi maddeler
                            olduğunu SEZDİRMEK, hepsini okutmak değil. */}
                        {/* PAYLAŞIMLI MADDE söylenmek zorunda: bir dayanak
                            birden fazla işi anabiliyor ve o madde her ikisinde
                            de sayılıyor. Söylenmezse grupların toplamı
                            atfedilenden fazla çıkıyor ve okuyan haklı olarak
                            "sayılar tutmuyor" diye düşünüyor. */}
                        {g.sharedCount > 0 && (
                            <p className="text-[11px] text-n400 mt-1">
                                {g.sharedCount === g.count
                                    ? 'Bu maddelerin hepsi başka bir işi de gösteriyor.'
                                    : `Bu maddelerin ${g.sharedCount} tanesi başka bir işi de gösteriyor.`}
                            </p>
                        )}
                        <p className="text-[11px] text-n600 mt-1.5 leading-relaxed">
                            <strong>{g.count} madde:</strong>{' '}
                            {g.items.map((i, n) => (
                                <span key={i.index} title={i.text || `#${i.index}`}>
                                    {n > 0 && ', '}
                                    {shorten(i.text || `#${i.index}`)}
                                </span>
                            ))}
                        </p>
                    </div>
                ))}
            </div>

            {prov.unattributed > 0 && (
                <p className="text-[11px] text-n400 mt-2">
                    Atfedilemedi: {prov.unattributed} madde — dayanak metni bir işe bağlanamadı.
                </p>
            )}
        </div>
    );
}

/**
 * SKOR NASIL OLUŞTU — prototipin üst kartı.
 *
 * ── PROTOTİPİN FORMÜLÜ BU UYGULAMADA YOK ────────────────────────────────────
 * Prototip "CV analizi ×½ + Mülakat kanıtı ×½ = Endeks" diyor. Uygulama
 * böyle çalışmıyor: mülakatta çıkan kanıt, madde damgalarının ÜZERİNE
 * yazılıyor (utils/interviewCoverage.js → mergeInterviewCoverage) ve aynı
 * hibrit skor yeniden hesaplanıyor. Yani mülakatın etkisi sabit bir yarım
 * ağırlık değil, hangi maddeyi kapattığına bağlı.
 *
 * Ekrana ×½ yazmak, sistemin kullanmadığı bir formülü kullanıyormuş gibi
 * göstermek olurdu. Kartın biçimi prototipten, sayılar gerçek yoldan:
 * CV skoru → mülakatın getirdiği fark → endeks skoru.
 */
function FormulaBox({ label, value, hint, tone = 'n' }) {
    return (
        <div
            className={`rounded-md px-3 py-2 ${
                tone === 'brand' ? 'bg-brand-50 border border-brand-100'
                    : tone === 'iv' ? 'bg-ok-bg'
                        : 'bg-n50 border border-n200'
            }`}
        >
            <div
                className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${
                    tone === 'brand' ? 'text-brand' : tone === 'iv' ? 'text-ok' : 'text-n500'
                }`}
            >
                {label}
            </div>
            <div className="text-[15px] font-semibold mt-0.5">{value}</div>
            {hint && <div className="text-[11px] text-n400">{hint}</div>}
        </div>
    );
}


/**
 * Kanıt kovaları — maddelerin damgalarından sayılır.
 *
 * Damgası olmayan madde HİÇBİR kovaya girmez: sorulmamış bir soruyu
 * "kanıt yok" saymak, ölçülmemiş bir şeyi ölçülmüş gibi göstermek olurdu.
 */
function evidenceBuckets(analysis) {
    const list = assessmentsOf(analysis);
    if (!Array.isArray(list) || list.length === 0) return null;
    const by = (s) => list.filter((a) => String(a?.status || '').toLowerCase() === s).length;
    return [
        { label: 'Güçlü kanıt', hint: "CV'de doğrudan dayanak", count: by('met'), icon: Check, bg: 'var(--color-ok-bg)', fg: 'var(--color-ok)' },
        { label: 'Kısmi kanıt', hint: 'İlgili ifade var, madde tam kapanmıyor', count: by('partial'), icon: Minus, bg: 'var(--color-warn-bg)', fg: 'var(--color-warn)' },
        { label: 'Kanıt yok', hint: "CV'de dayanak bulunamadı — mülakata taşınır", count: by('missing'), icon: X, bg: 'var(--color-n100)', fg: 'var(--color-n500)' },
    ];
}
/**
 * STAR KANIT YOĞUNLUĞU + KANIT KOVALARI — prototipin ikili ızgarası.
 *
 * Solda dört boyut 0-3 ölçeğinde ve çapa etiketiyle; sağda maddelerin
 * kanıt gücüne göre sayımı. İkisi de ÖZET: ayrıntılı kartlar aşağıda
 * duruyor (StarEvidenceCards) ve prototipte de böyle — özet + ayrıntı.
 *
 * ÖLÇEK UYGULAMANIN: 0-3 ve çapalar utils/starDimensions.js'ten. Prototip
 * madde satırlarında "/9,5" gibi başka bir ölçek gösteriyor ama hesap
 * mantığı değişmiyor; ekran uygulamanın gerçek ölçüsünü yazar.
 *
 * KOVA SAYILARI UYDURULMUYOR: maddelerin damgalarından (met/partial/missing)
 * geliyor. Damgası olmayan madde hiçbir kovaya girmez.
 */
function StarDensity({ dims, starPct, buckets }) {
    if (!dims || dims.length === 0) return null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-3">
            <div className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-[18px]">
                <div className="flex items-baseline gap-2 mb-2.5">
                    <span className="text-[11px] font-semibold text-n500 tracking-[0.1em] uppercase">
                        STAR kanıt yoğunluğu
                    </span>
                    {starPct != null && (
                        <span className="ml-auto text-[20px] font-semibold tracking-[-0.02em] text-brand">
                            %{starPct}
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {dims.map((d) => (
                        <div key={d.key} className="bg-n50 border border-n200 rounded-md px-[11px] py-2.5">
                            <div className="text-[11px] font-semibold text-n500 uppercase tracking-[0.06em]">
                                {STAR_LABELS[d.key] || d.key}
                            </div>
                            <div className="text-[16px] font-semibold mt-0.5">
                                {d.score}
                                <span className="text-[11px] text-n400 font-normal">/{d.max}</span>
                            </div>
                            <div className="h-1 bg-n100 rounded-full overflow-hidden mt-1.5">
                                <div
                                    className="h-full bg-brand rounded-full"
                                    style={{ width: `${Math.round((d.score / (d.max || 1)) * 100)}%` }}
                                />
                            </div>
                            <div className="text-[11px] text-n400 mt-1 leading-[1.4]">
                                {anchorLabel(d.score, d.max) || '—'}
                            </div>
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-n400 mt-2.5 leading-[1.5] m-0">
                    Kanıtın ne kadar iyi belgelendiğini ölçer, adayın ne kadar iyi olduğunu değil.
                </p>
            </div>

            {buckets && (
                <div className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-[18px]">
                    <div className="text-[11px] font-semibold text-n500 tracking-[0.1em] uppercase mb-2.5">
                        Kanıt kovaları
                    </div>
                    {buckets.map((b) => (
                        <div key={b.label} className="flex items-center gap-2.5 py-2 border-t border-n100">
                            <span
                                className="w-6 h-6 shrink-0 rounded flex items-center justify-center"
                                style={{ background: b.bg, color: b.fg }}
                            >
                                <b.icon className="w-3.5 h-3.5" />
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-semibold">{b.label}</div>
                                <div className="text-[11px] text-n400">{b.hint}</div>
                            </div>
                            <span className="text-[16px] font-semibold" style={{ color: b.fg }}>
                                {b.count}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ScoreFormula({ cvScore, indexScore, hasInterview, delta }) {
    return (
        <div className="bg-n0 border border-n200 rounded-[14px] shadow-sm p-[18px]">
            <div className="text-[11px] font-semibold text-n500 tracking-[0.1em] uppercase mb-3">
                Skor nasıl oluştu
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-3">
                <FormulaBox label="CV analizi" value={cvScore} hint="zorunlu + tercihen puanı" tone="brand" />

                {hasInterview ? (
                    <>
                        <span className="text-[14px] font-semibold text-n400">→</span>
                        <FormulaBox
                            label="Mülakat kanıtı"
                            value={delta > 0 ? `+${delta}` : String(delta)}
                            hint="odada kapanan maddeler"
                            tone="iv"
                        />
                        <span className="text-[14px] font-semibold text-n400">=</span>
                        <FormulaBox label="Endeks skoru" value={indexScore} hint="listelerde görünen sayı" />
                    </>
                ) : (
                    <p className="text-[12px] leading-[1.5] text-n500 bg-n50 border border-n200 rounded-md px-3 py-2 max-w-[280px] m-0">
                        Henüz mülakat yapılmadı — endeks skoru şu an yalnızca CV analizine eşit (%{indexScore}).
                    </p>
                )}

                <p className="ml-auto text-[11px] text-n400 max-w-[300px] leading-[1.5] text-right m-0">
                    CV analizi madde puanlarından geliyor: zorunlu kapsama %75, tercihen %25 ağırlıkla.
                    Mülakat kanıtı ayrı bir yarım ağırlık değil; hangi maddeyi kapattığına göre
                    madde damgalarını günceller.
                </p>
            </div>
        </div>
    );
}

export default function ScoreBreakdownPanel({ analysis, position, candidate = null }) {
    const [open, setOpen] = useState(false);

    if (!analysis) return null;
    const exp = explainHybridScore(analysis, requirementsOf(position));
    if (!exp.coverage && !exp.star) return null;

    const detail = coverageDetailState(analysis);
    const staleRequirements = isStaleFor(analysis, position);
    // Gereksinimler aynı ama damgalama kuralı değişmişse skor yanlış değil —
    // yalnızca bugünkü ölçüyle üretilmemiş. Kırılım geçerli, uyarı yeterli.
    const oldRubric = !staleRequirements && !usesCurrentRubric(analysis);
    // Bayat kayıtta explainHybridScore hâlâ madde numaralarını eşleştirir;
    // listede gösterilen sayı ise saklanan skor. İkisi ayrışmasın diye
    // başlıktaki sayı da listedekiyle aynı kaynaktan gelir.
    // Skor TEK kaynaktan: analysisScoreDetail. Panel kendi hesabını yapsaydı
    // listeyle ayrışırdı — bu modülün en başta çözmek için yazıldığı sorun.
    // Doğrulama kesintisi de buradan geliyor, o yüzden gerçek aday belgesi
    // geçilmek zorunda; yoksa panel kesintisiz sayıyı gösterir ve liste ile
    // panel yine ayrışır.
    const scoreSource = candidate || { positionAnalyses: { [position?.title]: analysis } };
    const scoreDetail = analysisScoreDetail(scoreSource, position);
    const effect = scoreDetail.verificationEffect;
    const deductions = [...(effect?.verification?.reasons || []), ...(effect?.sector?.reasons || [])];
    // Kırılımdaki madde puanlarının toplamı DOĞRULAMA ÖNCESİ skora eşit
    // kalmalı; kesinti ayrı bir satır olarak gösteriliyor. Aksi hâlde
    // "maddelerin toplamı skoru vermiyor" diye açıklanamayan bir fark çıkardı.
    const preVerification = staleRequirements ? scoreDetail.preVerificationScore : exp.score;
    const headlineScore = effect?.applied
        ? Math.round(preVerification * effect.multiplier)
        : preVerification;

    const pct = (n) => Math.round(n * 100);

    return (
        <div className="flex flex-col gap-3">
        {/* Prototipin üst kartı: skorun nasıl oluştuğu HER ZAMAN görünür.
            Eskiden bu bilgi katlanmış bir akordeonun içindeydi ve kullanıcı
            açmadıkça skorun dayanağını hiç görmüyordu. */}
        <ScoreFormula
            cvScore={scoreDetail.cvScore}
            indexScore={headlineScore}
            hasInterview={scoreDetail.interviewed}
            delta={headlineScore - scoreDetail.cvScore}
        />

        <StarDensity
            dims={normalizeStarAnalysis(analysis?.starAnalysis)}
            starPct={starPercent(analysis?.starAnalysis)}
            buckets={evidenceBuckets(analysis)}
        />

        <div className="rounded-md border border-n200 bg-n0 overflow-hidden">
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-n50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Calculator className="w-3.5 h-3.5 text-brand" />
                    <span className="text-[11px] font-semibold text-n700 uppercase tracking-[0.08em]">
                        Skor Nasıl Hesaplandı
                    </span>
                    <span className="text-[12px] font-semibold text-brand">{headlineScore}</span>
                </div>
                {open ? <ChevronDown className="w-4 h-4 text-n400" /> : <ChevronRight className="w-4 h-4 text-n400" />}
            </button>

            {open && (
                <div className="px-4 pb-4 space-y-4 border-t border-n200 pt-3">
                    {/* DOĞRULAMA KESİNTİSİ.
                        Skoru sessizce düşüren bir kural, açıklanamayan bir
                        skordur. Her kesintinin sebebi ve çarpanı burada
                        yazılı; kullanıcı hangi bulgunun kaç puan götürdüğünü
                        görebilmeli, yoksa sayıya güvenemez. */}
                    {/* DOĞRULAMA ETKİSİ.
                        Skoru sessizce değiştiren bir kural, açıklanamayan bir
                        skordur. Her etkinin sebebi ve çarpanı burada yazılı.
                        İKİ YÖNLÜ: sektör uyumu skoru yükseltebiliyor ve
                        yükselen bir skoru "kesinti" diye göstermek yanlış olurdu. */}
                    {effect?.applied && (() => {
                        const bonus = effect.multiplier > 1;
                        const box = bonus ? 'border-transparent bg-ok-bg' : 'border-rose-200 bg-rose-50';
                        const txt = bonus ? 'text-ok' : 'text-rose-700';
                        const Icon = bonus ? TrendingUp : ShieldAlert;
                        return (
                            <div className={`rounded-md border px-3 py-2.5 ${box}`}>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <Icon className={`w-3.5 h-3.5 shrink-0 ${txt}`} />
                                    <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${txt}`}>
                                        {bonus ? 'Doğrulama katkısı' : 'Doğrulama kesintisi'}
                                    </span>
                                    <span className={`text-[11px] font-semibold ml-auto ${txt}`}>
                                        {preVerification} → {headlineScore}
                                    </span>
                                </div>
                                <ul className="space-y-1">
                                    {deductions.map((d) => (
                                        <li key={d.code} className="flex items-start justify-between gap-2 text-[11px] text-n700">
                                            <span className="leading-relaxed">{d.label}</span>
                                            <span className={`font-semibold shrink-0 ${d.factor > 1 ? 'text-ok' : 'text-rose-600'}`}>
                                                ×{d.factor}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-[11px] text-n500 mt-1.5 leading-relaxed">
                                    Kaynak bulunamayan şirketler tek başına etki yaratmaz; ayrıntı için
                                    Doğrulama sekmesine bakın.
                                </p>
                            </div>
                        );
                    })()}

                    <ProvenanceBlock analysis={analysis} position={position} candidate={candidate} />

                    {/* GEREKSİNİM LİSTESİ DEĞİŞMİŞ.
                        Kayıtlı değerlendirmeler madde NUMARASINA bağlı; liste
                        değişince o numara başka bir maddeye denk gelir.
                        Canlıda ölçüldü: bayat değerlendirmeyle 77, taze
                        taramayla 65. Bu yüzden madde bazlı kırılım
                        gösterilmiyor ve skor "o günkü ilana göre" damgalı. */}
                    {staleRequirements && (
                        <div className="flex items-start gap-2 rounded-md border bg-warn-bg px-3 py-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
                            <p className="text-[11px] text-n700 leading-relaxed">
                                <strong>Bu skor eski gereksinim listesine göre hesaplandı.</strong> İlan o
                                günden beri değişti; kayıtlı değerlendirmeler madde numaralarına bağlı
                                olduğu için yeni listeye uygulanamaz. Güncel skoru görmek istiyorsanız
                                adayı <strong>yeniden tarayın</strong>.
                            </p>
                        </div>
                    )}

                    {oldRubric && (
                        <div className="flex items-start gap-2 rounded-md border border-n200 bg-n50 px-3 py-2">
                            <RotateCcw className="w-3 h-3 text-n400 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-n600 leading-relaxed">
                                Bu analiz, damgalama kuralı netleştirilmeden önce üretildi. Skor yanlış
                                değil ama <strong>bugünkü ölçüyle üretilmiş skorlarla kıyaslanamaz</strong> —
                                aynı listede iki farklı ölçü var demektir. Adayı yeniden tarayın.
                            </p>
                        </div>
                    )}

                    {/* Üst düzey bileşim.
                        STAR toplanan bir parça DEĞİL, çarpan: uyum skoruna
                        duyulan güveni ifade ediyor. Eskiden iki kutu yan yana
                        toplanıyordu ve alana kör bir ölçüm kötü uyumu telafi
                        edebiliyordu. */}
                    <div className="flex flex-wrap items-center gap-2">
                        {!staleRequirements && exp.coverage && (
                            <Chip label="Gereksinim Uyumu" value={`${exp.coverage.score}`} tone="cyan" />
                        )}
                        {!staleRequirements && exp.coverage && exp.star && (
                            <>
                                <span className="text-[13px] font-semibold text-n300">×</span>
                                <Chip
                                    label={`CV'deki Kanıt · STAR %${exp.star.score}`}
                                    value={exp.confidence.toFixed(2).replace('.', ',')}
                                    tone="violet"
                                />
                                <span className="text-[13px] font-semibold text-n300">=</span>
                                <Chip label="Skor" value={`${exp.score}`} tone="slate" />
                            </>
                        )}
                        {!exp.coverage && exp.star && (
                            <Chip label="CV'deki Kanıt (STAR)" value={`${exp.star.score}`} tone="violet" />
                        )}
                    </div>

                    {/* STAR HİÇ ÖLÇÜLMEMİŞSE bu skor çarpansız.
                        Sessiz kalırsak "tam güven" ile "ölçülmedi" ekranda
                        aynı görünür ve ölçülmemiş aday, STAR'ı düşük çıkan
                        adayın üstüne çıkar. Sayıyı düşürmüyoruz — ölçüm
                        yapılmamış olması adayın kusuru değil — ama farkın
                        görünmesi gerekiyor. */}
                    {!staleRequirements && exp.starMissing && (
                        <div className="flex items-start gap-2 rounded-md border border-n200 bg-n50 px-3 py-2">
                            <RotateCcw className="w-3 h-3 text-n400 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-n600 leading-relaxed">
                                Bu kayıtta <strong>CV kanıt yoğunluğu (STAR) ölçülmemiş</strong>. Skor
                                kanıt güveniyle çarpılmadı, yani mümkün olan en iyi katsayıyı aldı.
                                STAR'ı ölçülmüş adaylarla doğrudan kıyaslamayın; adayı{' '}
                                <strong>yeniden tarayın</strong>.
                            </p>
                        </div>
                    )}

                    {!staleRequirements && exp.star && exp.star.penalty > 0.5 && (
                        <p className="text-[11px] text-n500 leading-relaxed">
                            CV'de kanıt eksik olduğu için uyum skorundan{' '}
                            <strong>{Math.round(exp.star.penalty)} puan</strong> düşüldü. Bu bir
                            nitelik yargısı değil: adayın ne yaptığını CV'den yeterince
                            göremediğimiz anlamına geliyor.
                        </p>
                    )}

                    {/* "Henüz sorulmadı" ile "soruldu, bulunamadı" farklı şeyler.
                        Dayanak alanları sonradan eklendi; gereksinim metni
                        değişmediği için parmak izi bu analizleri bayat
                        göstermez. Ayrı damga olmasa boş kutu "bu adayın
                        dayanağı yok" izlenimi verirdi. */}
                    {detail.outdated && (
                        <div className="flex items-start gap-2 rounded-md border border-n200 bg-n50 px-3 py-2">
                            <RotateCcw className="w-3 h-3 text-n400 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-n600 leading-relaxed">
                                Bu analiz, madde bazlı dayanak alanları eklenmeden önce yapıldı.
                                Her maddenin CV'deki dayanağını ve ilanla farkını görmek için
                                adayı yeniden tarayın.
                            </p>
                        </div>
                    )}

                    {!staleRequirements && exp.coverage?.tiers?.length > 0 && (
                        <div className="space-y-3">
                            {exp.coverage.tiers.map((tier) => (
                                <div key={tier.key} className="space-y-1.5">
                                    <div className="flex items-baseline gap-2">
                                        <h5 className="text-[11px] font-semibold text-n500 uppercase tracking-[0.08em]">
                                            {tier.label}
                                        </h5>
                                        <span className="text-[11px] text-n400">
                                            kapsamanın %{tier.weight}'i · karşılanma %{pct(tier.ratio)}
                                        </span>
                                    </div>
                                    {tier.groups.map((group) => (
                                        <div key={group.kind} className="space-y-1">
                                            {tier.groups.length > 1 && (
                                                <p className="text-[11px] text-n400 pl-0.5">
                                                    {group.label} · bu kefenin %{pct(group.share)}'i
                                                </p>
                                            )}
                                            {group.items.map((item) => (
                                                <RequirementRow key={item.index} item={item} />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Madde bazlı değerlendirmesi olmayan eski kayıtlar */}
                    {exp.coverage && exp.coverage.tiers.length === 0 && (
                        <p className="text-[12px] text-n400 italic">
                            Bu analiz madde bazlı değerlendirme içermiyor (eski kayıt). Ayrıntılı
                            kırılım için adayı yeniden analiz edin.
                        </p>
                    )}

                    {exp.star && (
                        <div className="space-y-1.5">
                            <div className="flex items-baseline gap-2">
                                <Brain className="w-3 h-3 text-brand" />
                                <h5 className="text-[11px] font-semibold text-n500 uppercase tracking-[0.08em]">
                                    STAR Kırılımı
                                </h5>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                {/* ETİKET TÜRKÇE, ÖLÇEK PAYLAŞILAN SABİTTEN.
                                    İkisi de canlıda yanlıştı:
                                    · `{d.key}` + CSS uppercase, sayfa lang="tr"
                                      olduğu için 'Situation' → SİTUATİON
                                    · `/10` sabiti 0-10 döneminden kalmış; tam
                                      not alan boyut "3/10" görünüyordu */}
                                {exp.star.dimensions.map((d) => (
                                    <div key={d.key} className="rounded-md border border-n200 bg-n50 px-2 py-1.5">
                                        <p className="text-[11px] font-semibold text-n400 uppercase">
                                            {STAR_LABELS[d.key] || d.key}
                                        </p>
                                        <p className="text-[13px] font-semibold text-n700">{d.score}/{STAR_MAX}</p>
                                        <p className="text-[11px] text-n400">{anchorLabel(d.score, STAR_MAX)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Bayatken "madde puanları toplandığında bu skoru verir"
                        demek yanlış olur: o puanlar zaten gösterilmiyor ve
                        başlıktaki sayı saklanan skor. */}
                    <p className="text-[11px] text-n400 leading-relaxed border-t border-n200 pt-2">
                        {staleRequirements
                            ? 'Bu skor bir öneridir, karar değildir. Yukarıdaki sayı, ilanın ESKİ hâline göre ölçülmüş kayıtlı skordur; güncel gereksinimlere göre kırılım ancak yeniden taramadan sonra gösterilebilir.'
                            : 'Bu skor bir öneridir, karar değildir. Madde puanları toplandığında yukarıdaki skoru verir; ekran gerçek hesabı gösterir, yaklaşık bir açıklama değil.'}
                    </p>
                </div>
            )}
        </div>
        </div>
    );
}

function Chip({ label, value, tone }) {
    const tones = {
        cyan: 'border-brand-100 bg-brand-50 text-brand',
        violet: 'border-brand-100 bg-brand-50 text-brand-700',
        slate: 'border-n200 bg-n50 text-n700',
    };
    return (
        <div className={`rounded-md border px-3 py-2 ${tones[tone]}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">{label}</p>
            <p className="text-[13px] font-semibold">{value}</p>
        </div>
    );
}

const STATUS = {
    met:     { icon: Check, cls: 'text-ok bg-ok-bg border-transparent', label: 'Karşılıyor' },
    partial: { icon: Minus, cls: 'text-warn bg-warn-bg border-transparent',       label: 'Kısmen' },
    missing: { icon: X,     cls: 'text-bad bg-bad-bg border-transparent',             label: 'Karşılamıyor' },
};

function RequirementRow({ item }) {
    const cfg = STATUS[item.status] || { icon: Minus, cls: 'text-n400 bg-n50 border-n200', label: 'Değerlendirilmedi' };
    const Icon = cfg.icon;
    return (
        <div className="flex items-start gap-2 rounded-md border border-n200 px-2.5 py-1.5">
            <span className={`shrink-0 mt-0.5 w-4 h-4 rounded flex items-center justify-center border ${cfg.cls}`}>
                <Icon className="w-2.5 h-2.5" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-[12px] font-semibold text-n700">{item.text}</span>
                    {item.kind === 'arac' && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-n400 uppercase">
                            <Wrench className="w-2 h-2" /> araç
                        </span>
                    )}
                </div>
                {item.note && <p className="text-[11px] text-n500 leading-relaxed mt-0.5">{item.note}</p>}

                {/* NASIL KARŞILIYOR.
                    Damga tek başına yetmiyordu: iki aday aynı "karşılıyor"
                    damgasını alıp bambaşka insanlar olabilir. Dayanak CV'den
                    gelir; fark, adayın ilanla NEREDE ayrıştığıdır. */}
                {item.evidence && (
                    <p className="flex items-start gap-1 text-[11px] text-n600 leading-relaxed mt-1">
                        <Quote className="w-2.5 h-2.5 text-n300 shrink-0 mt-0.5" />
                        <span>{item.evidence}</span>
                    </p>
                )}
                {item.gap && (
                    <p className="flex items-start gap-1 text-[11px] text-warn leading-relaxed mt-0.5">
                        <GitCompareArrows className="w-2.5 h-2.5 text-warn shrink-0 mt-0.5" />
                        <span>
                            <span className="font-semibold uppercase text-[11px] text-warn">Fark: </span>
                            {item.gap}
                        </span>
                    </p>
                )}
            </div>
            <span className="shrink-0 text-[11px] font-semibold text-n600 tabular-nums">
                {item.earned.toFixed(1)}
                <span className="text-n300"> / {item.max.toFixed(1)}</span>
            </span>
        </div>
    );
}
