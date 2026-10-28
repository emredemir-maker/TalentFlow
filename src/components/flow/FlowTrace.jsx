import { FLOW_STAGES, flowIndex } from '../../utils/candidateFlow';
import { getStage } from '../../utils/pipelineStages';

/**
 * AKIŞ İZİ — adayın ilandan işe alıma uzanan altı adımdaki yeri.
 *
 * Ürünün imzası: aynı küçük iz Kontrol Paneli'nde, panoda, tabloda ve aday
 * detayında tekrar ediyor, böylece "aday nerede" sorusu her ekranda aynı
 * biçimde okunuyor. Geçilen adımlar açık teal, bulunulan adım koyu teal,
 * gelecek adımlar gri. Reddedilen adayın izi tümüyle gri: süreç akıştan
 * çıkmış, "kaçıncı adımdaydı" bilgisi kayıtta yok.
 *
 * Görsel bir özet; ekran okuyucuya aşama adını ve sırasını söyler.
 */
export default function FlowTrace({ stageKey, className = '', segment = 'w-[10px]' }) {
    const idx = flowIndex(stageKey);
    const total = FLOW_STAGES.length;
    const label = idx < 0
        ? `Akış: ${getStage(stageKey).label}`
        : `Akış: ${idx + 1}/${total}, ${getStage(stageKey).label}`;
    return (
        <span role="img" aria-label={label} title={label} className={`inline-flex items-center gap-[2px] flex-none ${className}`}>
            {FLOW_STAGES.map((s, i) => {
                const tone = idx < 0
                    ? 'bg-n200'
                    : i < idx ? 'bg-brand-200' : i === idx ? 'bg-brand' : 'bg-n200';
                return <span key={s.key} className={`${segment} h-[4px] rounded-full ${tone}`} />;
            })}
        </span>
    );
}
