import { useState } from 'react';
import { Plus, Trash2, Wand2, Loader2 } from 'lucide-react';
import RequirementNormalizeModal from './RequirementNormalizeModal';
import { normalizeRequirements } from '../services/ai/requirementNormalizer';
import { parseRequirementsInput } from '../utils/positionRequirements';

/**
 * Gereksinimler — TEK LİSTE.
 *
 * Önceden iki metin kutusu vardı: "olmazsa olmaz" ve "olursa iyi olur".
 * Ayrım yapaydı; kullanıcı bir maddeyi diğer kefeye almak için metni kesip
 * öbür kutuya yapıştırmak zorundaydı ve iki kutu arasında sıra kayboluyordu.
 * Veri modeli zaten tek liste (`requirementsMeta`: [{text, must}]); form da
 * öyle olmalı.
 *
 * Akış: ilan metnini yapıştır → "Maddelere ayır" → önizlemede kefeleri
 * düzelt → liste. Sonrasında satırlar elle de düzenlenebilir.
 */
export default function RequirementListEditor({ items, onChange, title }) {
    const [raw, setRaw] = useState('');
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [proposal, setProposal] = useState(null);

    const list = Array.isArray(items) ? items : [];
    // Ayrıştırılacak metin: yapıştırılan ham metin + listedeki mevcut maddeler.
    // İkisini birlikte vermek şart: kullanıcı hem yeni metin ekleyip hem de
    // eldeki bileşik maddelerin bölünmesini bekliyor.
    const pending = raw.trim();
    const canSplit = Boolean(pending) || list.length > 0;

    const runSplit = async () => {
        setOpen(true);
        setLoading(true);
        setError(null);
        setProposal(null);
        try {
            const mustText = [
                ...list.filter((r) => r.must).map((r) => r.text),
                ...parseRequirementsInput(pending),
            ].join('\n');
            const niceText = list.filter((r) => !r.must).map((r) => r.text).join('\n');
            setProposal(await normalizeRequirements({ mustText, niceText, title }));
        } catch (err) {
            setError(err?.message || 'Maddeler ayrıştırılamadı.');
        } finally {
            setLoading(false);
        }
    };

    const update = (i, patch) => onChange(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const remove = (i) => onChange(list.filter((_, j) => j !== i));
    const add = () => onChange([...list, { text: '', must: true }]);

    const mustCount = list.filter((r) => r.must).length;

    return (
        <div className="space-y-2">
            <div className="flex items-start gap-2">
                <textarea
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder={'İlandaki gereksinimleri buraya yapıştırın; "Maddelere ayır" tek tek puanlanabilir hâle getirir.'}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-cyan-400 transition-colors h-20 resize-y font-mono leading-relaxed"
                />
                <button
                    type="button"
                    onClick={runSplit}
                    disabled={!canSplit || loading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white text-[10px] font-black uppercase tracking-wider transition-colors disabled:opacity-40 shrink-0"
                >
                    {loading
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Ayrıştırılıyor…</>
                        : <><Wand2 className="w-3 h-3" /> Maddelere ayır</>}
                </button>
            </div>

            {list.length === 0 ? (
                <p className="text-[10px] text-slate-400 leading-relaxed">
                    Henüz madde yok. Metni yapıştırıp ayırın ya da elle ekleyin.
                </p>
            ) : (
                <>
                    <p className="text-[10px] text-slate-400">
                        <strong>{list.length}</strong> madde · {mustCount} zorunlu, {list.length - mustCount} tercihen.
                        Zorunlu maddeler karşılanmazsa <strong>skoru düşürür</strong>; tercihen olanlar ceza üretmez.
                    </p>
                    <div className="space-y-1.5">
                        {list.map((r, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <input
                                    value={r.text}
                                    onChange={(e) => update(i, { text: e.target.value })}
                                    placeholder="Gereksinim"
                                    className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-cyan-400 transition-colors"
                                />
                                <span className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0">
                                    {[[true, 'Zorunlu'], [false, 'Tercihen']].map(([value, label]) => (
                                        <button
                                            key={label}
                                            type="button"
                                            onClick={() => update(i, { must: value })}
                                            className={`px-2 py-1 text-[9px] font-black uppercase tracking-wider transition-colors ${
                                                r.must === value ? 'bg-cyan-500 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => remove(i)}
                                    title="Maddeyi kaldır"
                                    className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <button
                type="button"
                onClick={add}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[9px] font-black text-slate-500 uppercase tracking-wider transition-colors"
            >
                <Plus className="w-2.5 h-2.5" /> Madde ekle
            </button>

            {/* Öneri geldiğinde yeniden mount edilir; modal kendi düzenlenebilir
                kopyasını o anda kurar. Effect ile eşitlemekten yalın. */}
            <RequirementNormalizeModal
                key={proposal ? 'ready' : 'loading'}
                isOpen={open}
                loading={loading}
                error={error}
                original={`${pending}\n${list.map((r) => r.text).join('\n')}`}
                proposal={proposal}
                onCancel={() => setOpen(false)}
                onApply={(applied) => {
                    onChange(applied.map((r) => ({ text: r.text, must: Boolean(r.must) })));
                    setRaw('');
                    setOpen(false);
                }}
            />
        </div>
    );
}
