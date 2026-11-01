// Detaylı analiz onay penceresi — adaylar tablosu ve aday ekranı ortak.
//
// Neden var: detaylı analizin kotası aday–pozisyon karşılaştırması başına
// sayılıyor. Kullanıcı başlatmadan önce (1) adayın yalnızca atandığı
// pozisyonla mı yoksa diğer uygun pozisyonlarla da mı karşılaştırılacağını
// seçebilmeli, (2) bunun kaç detaylı analiz kullanacağını görebilmeli.
// Eskiden `window.confirm` "aday başına 1-5 AI çağrısı" diyordu; ne seçim
// vardı ne de gerçek sayı.
import { useMemo, useState } from 'react';
import { Brain, X } from 'lucide-react';

import { countDetailedComparisons, detailedAnalysisUsageText } from '../services/scanService';

export default function DetailedAnalysisConfirm({
    isOpen,
    candidates,
    openPositions,
    // deepScanCandidate'e geçilen ayarın aynısı — sayım çalıştırılanla aynı olsun
    allowUnrelatedFallback = true,
    title = 'Detaylı analiz',
    notes = [],
    onCancel,
    onConfirm,
}) {
    const [includeOtherPositions, setIncludeOtherPositions] = useState(false);

    const count = useMemo(
        () => (isOpen
            ? countDetailedComparisons(candidates, openPositions, { includeOtherPositions, allowUnrelatedFallback })
            : 0),
        [isOpen, candidates, openPositions, includeOtherPositions, allowUnrelatedFallback]
    );

    if (!isOpen) return null;

    const skippedNoCv = (candidates || []).length > 0 && count === 0;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3">
            <div className="absolute inset-0 bg-n900/40 backdrop-blur-sm" onClick={onCancel} />
            <div role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-md bg-n0 rounded-[14px] border border-n100 shadow-sm p-3.5">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-md bg-brand flex items-center justify-center shrink-0">
                            <Brain className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h3 className="text-[13px] font-semibold text-n900">{title}</h3>
                            <p className="text-[10px] text-n500 font-semibold">
                                {(candidates || []).length} aday · yalnızca siz başlattığınızda çalışır
                            </p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-1.5 hover:bg-n100 rounded-lg text-n400 transition-colors" aria-label="Kapat">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-2.5">
                    <p className="text-[11px] text-n600 leading-relaxed">
                        Aday varsayılan olarak yalnızca atandığı pozisyonla karşılaştırılır
                        (atama yoksa ön analizin eşleştirdiği pozisyonla).
                    </p>

                    <label className="flex items-start gap-2 px-2.5 py-2 rounded-md border border-n200 hover:bg-n50 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includeOtherPositions}
                            onChange={(e) => setIncludeOtherPositions(e.target.checked)}
                            className="mt-0.5 accent-brand shrink-0"
                        />
                        <span className="min-w-0">
                            <span className="text-[11px] font-bold text-n700">Diğer uygun pozisyonlarla da karşılaştır</span>
                            <span className="block text-[10px] text-n400 leading-snug">
                                Alanına uyan diğer açık pozisyonlar da analiz edilir (en uygun 5). Her karşılaştırma ayrı bir detaylı analizdir.
                            </span>
                        </span>
                    </label>

                    {notes.filter(Boolean).map((note) => (
                        <p key={note} className="text-[10px] text-n500 leading-relaxed">{note}</p>
                    ))}

                    <div className="px-3 py-2.5 rounded-md bg-brand-50 border border-brand-100">
                        <p className="text-[12px] font-bold text-n900">{detailedAnalysisUsageText(count)}</p>
                        <p className="text-[10px] text-n500 mt-0.5 leading-relaxed">
                            {skippedNoCv
                                ? 'Seçilen adaylarda CV metni ya da analiz edilecek uygun pozisyon yok.'
                                : 'Her aday–pozisyon karşılaştırması 1 detaylı analiz sayılır. CV metni olmayan adaylar atlanır ve sayılmaz.'}
                        </p>
                    </div>
                </div>

                <div className="flex gap-2 mt-3.5">
                    <button onClick={onCancel} className="tf-btn tf-btn-secondary flex-1 justify-center">
                        İptal
                    </button>
                    <button
                        onClick={() => onConfirm({ includeOtherPositions })}
                        disabled={count === 0}
                        className="tf-btn tf-btn-primary flex-1 justify-center disabled:opacity-50"
                    >
                        Detaylı analizi başlat
                    </button>
                </div>
            </div>
        </div>
    );
}
