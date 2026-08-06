// "Bu ilan için adayları yeniden tara" diyaloğu.
//
// Neden var: bir ilanın gereksinimleri değiştiğinde adayların KAYITLI
// analizleri artık eski metne aittir, ama arayüz eski skorları güncelmiş gibi
// gösterir. Kullanıcı hem bunu fark edebilmeli hem de "şu skorun üstündekileri
// yeniden tara" diyebilmeli — tüm havuzu taramak hem yavaş hem pahalı.
//
// Eşik, adayın O POZİSYON için mevcut skoruna uygulanır (kayıtlı analiz ile
// ücretsiz anahtar-kelime skorunun büyüğü — scoreForPosition).
import { useMemo, useState } from 'react';
import { Target, Loader2, X, AlertCircle } from 'lucide-react';

import { scoreForPosition } from '../utils/candidateTable';
import { calculateMatchScore } from '../services/matchService';

export default function RescanPositionModal({
    position,
    candidates,
    isOpen,
    running,
    progress,
    onClose,
    onStart,
    reason,
}) {
    const [minScore, setMinScore] = useState('0');

    // Adayın bu pozisyondaki güncel skoru — eşik buna uygulanır.
    const scored = useMemo(() => {
        if (!position) return [];
        return (candidates || []).map((c) => ({
            candidate: c,
            score: Math.round(scoreForPosition(c, position, calculateMatchScore)),
        }));
    }, [candidates, position]);

    const threshold = Number(minScore) || 0;
    const selected = scored.filter((s) => s.score >= threshold);

    if (!isOpen || !position) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={running ? undefined : onClose} />
            <div className="relative w-full max-w-md bg-white rounded-2xl border border-slate-100 shadow-2xl p-5">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#13294E] flex items-center justify-center shrink-0">
                            <Target className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h3 className="text-[14px] font-black text-slate-900">Adayları Yeniden Tara</h3>
                            <p className="text-[11px] text-slate-500 font-semibold truncate max-w-[220px]">{position.title}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={running}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors disabled:opacity-40"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {reason && (
                    <div className="flex gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 mb-4">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-700 leading-relaxed">{reason}</p>
                    </div>
                )}

                <div className="space-y-3">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                            Minimum uyum skoru
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={minScore}
                                onChange={(e) => setMinScore(e.target.value)}
                                disabled={running}
                                className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:opacity-50"
                            />
                            <p className="text-[11px] text-slate-500 leading-snug">
                                Bu pozisyondaki güncel skoru <strong>%{threshold}</strong> ve üzerinde olan
                                <strong> {selected.length}</strong> aday taranacak.
                            </p>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1.5">
                            0 bırakırsanız bu pozisyonla ilgili tüm adaylar ({scored.length}) taranır.
                        </p>
                    </div>

                    <div className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                            Her aday için <strong>1 AI çağrısı</strong> yapılır ve bu pozisyona ait analizi
                            yeni gereksinimlere göre yeniden üretilir. Diğer pozisyonların analizlerine
                            dokunulmaz.
                        </p>
                    </div>

                    {running && progress && (
                        <div className="px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
                            <p className="text-[11px] font-semibold text-blue-700">
                                Taranıyor — {progress.done} / {progress.total}
                            </p>
                        </div>
                    )}
                </div>

                <div className="mt-5 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={running}
                        className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition-colors disabled:opacity-50"
                    >
                        {running ? 'Kapat' : 'Şimdi Değil'}
                    </button>
                    <button
                        onClick={() => onStart(selected.map((s) => s.candidate))}
                        disabled={running || selected.length === 0}
                        className="flex-[2] py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-black text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {running
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Taranıyor…</>
                            : <>{selected.length} Adayı Tara</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
