import { useMemo } from 'react';
import { Tag } from 'lucide-react';
import { detectSkillTags } from '../utils/skillGraph';
import { parseRequirementsInput } from '../utils/positionRequirements';

/**
 * Yazılan gereksinimlerden sistemin ANLADIĞI kanonik etiketleri gösterir.
 *
 * Amaç: aynı gereksinimin ilandan ilana farklı yazılmasını engellemek.
 * "GA4 hakimiyeti", "Google Analytics bilgisi" ve "GA4 deneyimi" üçü de tek
 * bir `ga4` etiketine düşer; kullanıcı bunu yazarken görür ve iki ilan
 * arasındaki tutarsızlığı anında fark eder.
 *
 * Etiket, metnin YERİNE geçmez. "3-5 yıl B2B SaaS ürün yönetimi" bileşik bir
 * maddedir (süre + sektör + fonksiyon); tek etikete sığmaz ve zorlanırsa
 * anlam kaybeder. Bu yüzden burada yalnızca BİLGİ olarak gösterilir.
 */
export default function RequirementTagHint({ text }) {
    const { tags, untagged } = useMemo(() => {
        const lines = parseRequirementsInput(text);
        const all = new Set();
        let untaggedCount = 0;
        for (const line of lines) {
            const found = detectSkillTags(line);
            if (found.length === 0) untaggedCount += 1;
            found.forEach((t) => all.add(t));
        }
        return { tags: [...all].sort((a, b) => a.localeCompare(b, 'tr')), untagged: untaggedCount };
    }, [text]);

    if (tags.length === 0 && untagged === 0) return null;

    return (
        <div className="mt-1.5 flex items-start gap-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-[9px] font-black text-slate-400 uppercase tracking-wider shrink-0 mt-0.5">
                <Tag className="w-2.5 h-2.5" /> Algılanan
            </span>
            {tags.map((t) => (
                <span
                    key={t}
                    className="px-1.5 py-0.5 rounded bg-cyan-50 border border-cyan-100 text-[10px] font-bold text-cyan-700"
                >
                    {t}
                </span>
            ))}
            {tags.length === 0 && (
                <span className="text-[10px] text-slate-400 italic">
                    tanınan yetkinlik yok — madde serbest metin olarak değerlendirilecek
                </span>
            )}
            {untagged > 0 && tags.length > 0 && (
                <span className="text-[10px] text-slate-400 italic">
                    · {untagged} madde etiketsiz
                </span>
            )}
        </div>
    );
}
