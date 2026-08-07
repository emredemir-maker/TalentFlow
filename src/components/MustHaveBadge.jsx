import { AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';

const TONES = {
    red:     { wrap: 'bg-red-50 border-red-100 text-red-700',           icon: AlertTriangle },
    amber:   { wrap: 'bg-amber-50 border-amber-100 text-amber-700',     icon: AlertCircle },
    emerald: { wrap: 'bg-emerald-50 border-emerald-100 text-emerald-700', icon: CheckCircle2 },
};

/**
 * Zorunlu gereksinim kapısının görünür hâli.
 *
 * Skorun yanında değil, ÜSTÜNDE durur: 85 puan alan bir aday zorunlu bir
 * maddeyi karşılamıyorsa bu bilgi puandan daha belirleyicidir ve puanın
 * içinde erimemelidir.
 *
 * Eleme yapmaz — hangi maddenin eksik olduğunu ve AI'ın gerekçesini söyler,
 * kararı kullanıcıya bırakır.
 */
export default function MustHaveBadge({ gate, label }) {
    if (!label) return null;
    const tone = TONES[label.tone] || TONES.amber;
    const Icon = tone.icon;
    const items = gate.status === 'missing' ? gate.missing : gate.partial;

    return (
        <div className={`rounded-xl border px-3 py-2.5 ${tone.wrap}`}>
            <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest">{label.text}</span>
                {gate.totalMust > 0 && (
                    <span className="text-[9px] opacity-70">/ {gate.totalMust} zorunlu madde</span>
                )}
            </div>

            {items?.length > 0 && (
                <ul className="mt-1.5 space-y-1 pl-5">
                    {items.map((it) => (
                        <li key={it.index} className="text-[11px] leading-relaxed">
                            <span className="font-bold">{it.text}</span>
                            {it.note && <span className="opacity-80"> — {it.note}</span>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
