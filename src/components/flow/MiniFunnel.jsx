import { FLOW_STAGES, FLOW_TONE } from '../../utils/candidateFlow';

/**
 * İLANIN KENDİ HUNİSİ — bir ilanın adaylarının akış adımlarına dağılımı.
 *
 * Her sütun bir adım (Ön İnceleme → İşe Alındı); yüksekliği o adımdaki aday
 * sayısı, altında sayı. Ret ayrı ve gri: akışın parçası değil, dışına
 * çıkış. Böylece "bu ilan tıkalı mı, nerede tıkalı" sorusu satırdan okunur.
 *
 * @param {Record<string, number>} counts — aşama anahtarı → aday sayısı
 */
export default function MiniFunnel({ counts = {}, rejected = 0 }) {
    const max = Math.max(1, ...FLOW_STAGES.map((s) => counts[s.key] || 0));
    const label = FLOW_STAGES.map((s) => `${s.label} ${counts[s.key] || 0}`).join(', ') + `, Reddedildi ${rejected}`;
    return (
        <span role="img" aria-label={`Aday dağılımı: ${label}`} title={label} className="inline-flex items-end gap-[3px]">
            {FLOW_STAGES.map((s) => {
                const n = counts[s.key] || 0;
                const h = n === 0 ? 2 : Math.max(6, Math.round((n / max) * 24));
                return (
                    <span key={s.key} className="w-[22px] flex flex-col items-center gap-1">
                        <span className="w-full rounded-[3px]" style={{ height: h, background: n === 0 ? '#E3E7E5' : FLOW_TONE[s.key] }} />
                        <span className={`text-[11px] leading-none tabular-nums ${n === 0 ? 'text-n400' : 'text-n700'}`}>{n}</span>
                    </span>
                );
            })}
            <span className="w-[22px] ml-1.5 flex flex-col items-center gap-1">
                <span className="w-full rounded-[3px]" style={{ height: rejected === 0 ? 2 : Math.max(6, Math.round((rejected / max) * 24)), background: '#CDD3D0' }} />
                <span className="text-[11px] leading-none tabular-nums text-n400">{rejected}</span>
            </span>
        </span>
    );
}
