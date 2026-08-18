// ADAY ROZETLERİ — listede tek bakışta görünen uyarılar.
//
// Sunum katmanı; hangi rozetin çıkacağına utils/candidateBadges.js karar
// veriyor. Ayrı durmasının sebebi o kararın ağ çağrısı olmadan test
// edilebilmesi: bir rozet listedeki adayın yanına basılan bir yargı ve işe
// alımcı çoğu zaman Doğrulama sekmesini açmadan ona bakarak eleyecek.
//
// ── RENK KEYFİ DEĞİL ────────────────────────────────────────────────────────
// Kırmızı YALNIZCA ölçülmüş çelişkiye ayrılmış. "Şirket teyitsiz" gri:
// kaynak bulunamaması adayın kusuru değil ve kırmızı basmak onu suçlama
// hâline getirirdi. Sektör/alan uyumsuzluğu turuncu — bir tercih sinyali,
// bir kusur değil.

import { buildCandidateBadges, TONE } from '../utils/candidateBadges';

const TONE_CLASS = {
    [TONE.RED]: 'bg-rose-50 text-rose-700 border-rose-200',
    [TONE.AMBER]: 'bg-amber-50 text-amber-700 border-amber-200',
    [TONE.SKY]: 'bg-sky-50 text-sky-700 border-sky-200',
    [TONE.VIOLET]: 'bg-violet-50 text-violet-700 border-violet-200',
    [TONE.SLATE]: 'bg-slate-100 text-slate-600 border-slate-200',
};

/**
 * @param {object} props
 *   badges     — önceden hesaplanmış liste (liste sayfaları memo içinde hesaplar)
 *   candidate  — badges verilmediyse buradan hesaplanır
 *   position, requiredYears — hesaplama bağlamı
 *   max        — en fazla kaç rozet
 *   size       — 'xs' liste satırı için, 'sm' detay ekranı için
 */
export default function CandidateBadges({
    badges = null,
    candidate = null,
    position = null,
    requiredYears = null,
    max = 0,
    size = 'xs',
    className = '',
}) {
    const list = badges ?? buildCandidateBadges(candidate, { position, requiredYears, max });
    if (!list?.length) return null;

    const pad = size === 'sm' ? 'text-[10px] px-2 py-1' : 'text-[9px] px-1.5 py-0.5';

    return (
        <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
            {list.map((b) => (
                <span
                    key={b.id}
                    title={b.title}
                    className={`font-black uppercase tracking-wide rounded-md border whitespace-nowrap ${pad} ${TONE_CLASS[b.tone] || TONE_CLASS[TONE.SLATE]}`}
                >
                    {b.label}
                </span>
            ))}
        </span>
    );
}
