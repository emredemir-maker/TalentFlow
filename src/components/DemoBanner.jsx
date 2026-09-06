// DEMO UYARI BANDI.
//
// ── NEDEN KAPATILAMIYOR ─────────────────────────────────────────────────────
// Kapatılabilir bir uyarı, kapatıldıktan sonra yoktur. Buradaki uyarı bir
// bildirim değil bir KURAL: havuz ortak ve kalıcı değil. Ziyaretçi bunu
// bilmeden gerçek bir adayın CV'sini yüklerse, o CV başka ziyaretçilerin de
// göreceği bir yere gitmiş olur — geri alınamayan tek hata bu.
//
// Yer kaplıyor ama üstteki çubuk yerine sayfa akışının içinde duruyor:
// sabitlenmiş bir bant, altındaki içeriğin bir kısmını kalıcı olarak örter.

import { IS_DEMO, DEMO_NOTICE } from '../utils/demoMode';

export default function DemoBanner() {
    if (!IS_DEMO) return null;

    return (
        <div className="bg-warn-bg border-b border-warn/25 px-4 py-2">
            <p className="text-[11px] leading-relaxed text-warn m-0 max-w-[70ch] mx-auto text-center">
                <strong className="font-semibold">Demo</strong> — {DEMO_NOTICE}
            </p>
        </div>
    );
}
