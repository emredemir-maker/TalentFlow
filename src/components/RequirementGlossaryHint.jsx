import { useState } from 'react';
import { BookOpen, ChevronDown, Ban, Search, Target } from 'lucide-react';
import { hasContent } from '../utils/requirementGlossary';

/**
 * "Bu madde bu işte neyi ölçüyor?"
 *
 * Madde metni ne ölçtüğünü söylemez; herkes kafasında farklı bir şey anlar ve
 * "karşılıyor" damgası olduğundan fazlasını ifade etmeye başlar. Bu kutu
 * maddenin altındaki gerçek ihtiyacı, aranan sinyali ve — en önemlisi —
 * maddenin ölçMEDİĞİ şeyi gösterir.
 *
 * Kapalı gelir: her satırda üç cümle açık dursa liste okunmaz hâle gelir.
 */
export default function RequirementGlossaryHint({ entry, stale = false }) {
    const [open, setOpen] = useState(false);
    if (!hasContent(entry)) return null;

    return (
        <div className="mt-1">
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-slate-400 hover:text-cyan-600 transition-colors"
            >
                <BookOpen className="w-2.5 h-2.5" />
                Ne ölçüyor?
                <ChevronDown className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="mt-1 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 space-y-1.5">
                    {entry.olcut && (
                        <Line icon={<Target className="w-2.5 h-2.5 text-cyan-500" />} label="Ölçtüğü" text={entry.olcut} />
                    )}
                    {entry.sinyaller && (
                        <Line icon={<Search className="w-2.5 h-2.5 text-slate-400" />} label="CV'de aranan" text={entry.sinyaller} />
                    )}
                    {/* En kıymetli alan: madde şişmesin diye sınırını yazıyoruz */}
                    {entry.olcmez && (
                        <Line icon={<Ban className="w-2.5 h-2.5 text-amber-500" />} label="Ölçmediği" text={entry.olcmez} />
                    )}
                    {stale && (
                        <p className="text-[9px] text-amber-700 leading-relaxed pt-0.5">
                            Bu tanım gereksinimlerin ESKİ hâline göre üretildi; madde metni o
                            günden beri değişti.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function Line({ icon, label, text }) {
    return (
        <p className="flex items-start gap-1.5 text-[10px] text-slate-600 leading-relaxed">
            <span className="shrink-0 mt-0.5">{icon}</span>
            <span>
                <span className="font-black uppercase text-[9px] text-slate-400">{label}: </span>
                {text}
            </span>
        </p>
    );
}
