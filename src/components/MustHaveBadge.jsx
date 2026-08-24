import { AlertTriangle, CheckCircle2, AlertCircle, Mic } from 'lucide-react';

// ── RENK YALNIZCA ZEMİNDE VE BAŞLIKTA ───────────────────────────────────────
//
// Kutu eskiden metnini de ton rengiyle yazıyordu (`text-warn` vb.) ve madde
// listesi okunmuyordu. Ölçüm — WCAG kontrast oranı, gövde metni için gereken
// alt sınır 4.5:1:
//
//     warn  #E8A13B / warn-bg  #FDF4E4  →  2.01:1   ✗
//     bad   #E5484D / bad-bg   #FCEAEB  →  3.37:1   ✗
//     ok    #16A26C / ok-bg    #E6F7EF  →  2.95:1   ✗
//
// Üçü de gövde metni için yetersiz. Ton rengi ZEMİNDE ve BAŞLIKTA kalıyor
// (uyarının rengi oradan zaten okunuyor), madde metni ise koyu nötre
// alınıyor: n700 #323849 / warn-bg → 10.70:1.
//
// Renk bilgi taşımaya devam ediyor; okunaklılığı taşıyan şey artık kontrast.
const TONES = {
    red: { wrap: 'bg-bad-bg border-transparent', head: 'text-bad', icon: AlertTriangle },
    amber: { wrap: 'bg-warn-bg border-transparent', head: 'text-warn', icon: AlertCircle },
    emerald: { wrap: 'bg-ok-bg border-transparent', head: 'text-ok', icon: CheckCircle2 },
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
        <div className={`rounded-md border px-3 py-2.5 ${tone.wrap}`}>
            <div className={`flex items-center gap-2 ${tone.head}`}>
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">{label.text}</span>
                {gate.totalMust > 0 && (
                    <span className="text-[11px] opacity-70">/ {gate.totalMust} zorunlu madde</span>
                )}
                {/* Rozet dün kırmızıyken bugün yeşilse sebebi görünmeli.
                    Sessizce değişen bir yargı, açıklanamayan bir yargıdır. */}
                {label.interview && (
                    <span
                        title={`${gate.fromInterview} zorunlu maddenin damgası mülakattan geldi`}
                        className="ml-auto flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70"
                    >
                        <Mic className="w-2.5 h-2.5" /> mülakat
                    </span>
                )}
            </div>

            {items?.length > 0 && (
                // GEREKSİNİM VE GEREKÇE AYRI SATIRDA.
                //
                // İkisi tek satırda, aralarında bir tire ile yazılıyordu; ekran
                // genişledikçe satır uzuyor ve nerede maddenin bittiği, nerede
                // AI'ın gerekçesinin başladığı seçilemiyordu. Uzun satır zaten
                // göz için en zor okuma biçimi — bu yüzden genişlik de
                // sınırlandı (~90 karakter).
                <ul className="mt-2 space-y-2 pl-5 max-w-[78ch]">
                    {items.map((it) => (
                        <li key={it.index} className="text-[12px] leading-[1.55]">
                            <span className="font-semibold text-n900">
                                {it.text}
                                {it.fromInterview && (
                                    /* Odadan gelen gerekçe adayın kendi cümlesi;
                                       CV notundan ayırt edilebilmeli. */
                                    <Mic className="inline w-2.5 h-2.5 ml-1 opacity-60" />
                                )}
                            </span>
                            {it.note && <span className="block text-n700 mt-0.5">{it.note}</span>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
