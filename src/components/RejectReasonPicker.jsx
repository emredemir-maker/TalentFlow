// RED NEDENİ SEÇİCİ — TEK BİLEŞEN.
//
// Neden listesi iki ekranda kullanılıyor (aday çekmecesi ve aday detay
// sayfası). Daha önce ikisi farklıydı: biri üç seçenekli sabit liste, diğeri
// serbest metin kutusu. Aynı alana iki farklı biçim yazıldığı için analitik
// tarafında red nedenleri sayılamıyordu. Liste ve gruplama artık tek yerde
// (utils/rejectionReasons), görünüm de tek yerde: burası.

import { REJECTION_CATEGORIES, REJECTION_REASONS } from '../utils/rejectionReasons';

/**
 * @param {object} props
 * @param {(reasonId: string) => void} props.onSelect
 * @param {string|null} [props.selectedId] — seçili nedenin kimliği
 * @param {boolean} [props.compact] — dar alanlarda (açılır menü) daha sıkı yerleşim
 */
export default function RejectReasonPicker({ onSelect, selectedId = null, compact = false }) {
    return (
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
            {REJECTION_CATEGORIES.map((cat) => {
                const reasons = REJECTION_REASONS.filter((r) => r.category === cat.id);
                if (reasons.length === 0) return null;
                return (
                    <div key={cat.id}>
                        <div
                            className="flex items-baseline gap-2 px-1 pb-1 text-[10px] font-bold uppercase tracking-[0.12em]"
                            style={{ color: cat.color }}
                        >
                            {cat.label}
                            {!compact && (
                                <span className="text-[10px] font-medium normal-case tracking-normal text-n400">
                                    {cat.desc}
                                </span>
                            )}
                        </div>
                        <div className={compact ? 'space-y-0.5' : 'grid grid-cols-1 sm:grid-cols-2 gap-1.5'}>
                            {reasons.map((reason) => {
                                const secili = reason.id === selectedId;
                                return (
                                    <button
                                        key={reason.id}
                                        type="button"
                                        onClick={() => onSelect(reason.id)}
                                        aria-pressed={secili}
                                        style={secili ? { background: cat.bg, color: cat.color, borderColor: cat.color } : undefined}
                                        className={`w-full text-left rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                                            secili
                                                ? 'border'
                                                : 'border-n200 text-n700 hover:border-n300 hover:bg-n50'
                                        }`}
                                    >
                                        {reason.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
