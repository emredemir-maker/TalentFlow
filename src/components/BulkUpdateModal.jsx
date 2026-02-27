// src/components/BulkUpdateModal.jsx
// Premium modal for bulk updating candidates (stage or source)

import { useState, useEffect } from 'react';
import { X, Save, Layers, Share2, Loader2, CheckCircle, AlertCircle, ChevronRight, Globe, Users, Zap, Link2 } from 'lucide-react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';

const STAGE_OPTIONS = [
    { value: 'ai_analysis', label: 'AI Analiz', color: 'text-violet-400', bg: 'bg-violet-500/10' },
    { value: 'review', label: 'İnceleme', color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { value: 'interview', label: 'Mülakat', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { value: 'offer', label: 'Teklif', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { value: 'hired', label: 'İşe Alındı', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { value: 'rejected', label: 'Red', color: 'text-red-400', bg: 'bg-red-500/10' },
];

const ICONS = {
    Globe: Globe,
    Layers: Layers,
    Link2: Link2,
    Share2: Share2,
    Users: Users,
    Zap: Zap,
};

export default function BulkUpdateModal({ isOpen, onClose, selectedIds, type, onUpdate }) {
    const [loading, setLoading] = useState(false);
    const [availableSources, setAvailableSources] = useState([]);
    const [selectedMainSource, setSelectedMainSource] = useState('');
    const [selectedSubSource, setSelectedSubSource] = useState('');
    const [selectedStage, setSelectedStage] = useState('');
    const [fetchLoading, setFetchLoading] = useState(false);

    useEffect(() => {
        if (isOpen && type === 'source') {
            fetchSources();
        }
    }, [isOpen, type]);

    const fetchSources = async () => {
        setFetchLoading(true);
        try {
            const q = query(collection(db, 'artifacts/talent-flow/public/data/sources'), orderBy('name', 'asc'));
            const snap = await getDocs(q);
            setAvailableSources(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
            console.error('Error fetching sources:', err);
        } finally {
            setFetchLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const updates = {};
            if (type === 'stage') {
                if (!selectedStage) return;
                updates.status = selectedStage;
            } else {
                if (!selectedMainSource) return;
                updates.source = selectedMainSource;
                if (selectedSubSource) {
                    updates.sourceDetail = selectedSubSource;
                }
            }
            await onUpdate(updates);
            onClose();
        } catch (err) {
            console.error('Bulk update failed:', err);
            alert('Güncelleme sırasında bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const currentMainSource = availableSources.find(s => s.name === selectedMainSource);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-xl animate-fade-in" onClick={onClose} />

            <div className="relative w-full max-w-lg glass rounded-[2.5rem] border border-white/10 p-8 shadow-2xl animate-scale-in overflow-hidden">
                {/* Background Decorations */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600/10 rounded-full blur-[100px] -z-10" />

                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                            {type === 'stage' ? <Layers className="w-6 h-6 text-indigo-400" /> : <Share2 className="w-6 h-6 text-indigo-400" />}
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-text-primary tracking-tight">
                                {type === 'stage' ? 'Toplu Aşama Güncelleme' : 'Toplu Kaynak Güncelleme'}
                            </h3>
                            <p className="text-[10px] text-navy-500 font-bold uppercase tracking-widest mt-0.5">
                                {selectedIds.size} Aday Seçildi
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-navy-500 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {type === 'stage' ? (
                        <div className="grid grid-cols-2 gap-3">
                            {STAGE_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setSelectedStage(opt.value)}
                                    className={`flex items-center gap-3 p-4 rounded-2xl border transition-all text-left ${selectedStage === opt.value
                                            ? 'bg-indigo-500/20 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                                            : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                                        }`}
                                >
                                    <div className={`w-3 h-3 rounded-full ${opt.bg.replace('10', '40')} ${opt.color}`} />
                                    <span className={`text-sm font-bold ${selectedStage === opt.value ? 'text-text-primary' : 'text-navy-300'}`}>
                                        {opt.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Ana Kaynak Seçin</label>
                                {fetchLoading ? (
                                    <div className="flex items-center gap-2 text-navy-500 text-xs italic p-4">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Kaynaklar yükleniyor...
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                        {availableSources.map(s => {
                                            const IconComp = ICONS[s.icon] || Globe;
                                            return (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedMainSource(s.name);
                                                        setSelectedSubSource('');
                                                    }}
                                                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${selectedMainSource === s.name
                                                            ? 'bg-indigo-500/10 border-indigo-500/30'
                                                            : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-xl flex items-center justify-center border border-white/5" style={{ backgroundColor: s.color + '20' }}>
                                                            <IconComp className="w-4 h-4" style={{ color: s.color }} />
                                                        </div>
                                                        <span className={`text-sm font-bold ${selectedMainSource === s.name ? 'text-text-primary' : 'text-navy-200'}`}>{s.name}</span>
                                                    </div>
                                                    {selectedMainSource === s.name && <CheckCircle className="w-4 h-4 text-indigo-400" />}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {currentMainSource && currentMainSource.subSources?.length > 0 && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <label className="text-[10px] text-navy-500 uppercase font-black tracking-widest ml-1">Alt Detay / Mecra (Opsiyonel)</label>
                                    <div className="flex flex-wrap gap-2">
                                        {currentMainSource.subSources.map(sub => (
                                            <button
                                                key={sub}
                                                type="button"
                                                onClick={() => setSelectedSubSource(selectedSubSource === sub ? '' : sub)}
                                                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${selectedSubSource === sub
                                                        ? 'bg-indigo-500 text-text-primary border-indigo-500'
                                                        : 'bg-white/5 border-white/10 text-navy-400 hover:text-text-primary hover:border-white/20'
                                                    }`}
                                            >
                                                {sub}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="pt-4 border-t border-white/5 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-4 px-6 rounded-2xl bg-white/5 border border-white/10 text-navy-300 font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                        >
                            İptal
                        </button>
                        <button
                            type="submit"
                            disabled={loading || (type === 'stage' ? !selectedStage : !selectedMainSource)}
                            className="flex-[2] py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-text-primary font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Değişiklikleri Uygula
                        </button>
                    </div>
                </form>

                <div className="mt-6 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-500/80 leading-relaxed">
                        Bu işlem seçili <strong>{selectedIds.size}</strong> adayın verilerini toplu olarak güncelleyecektir. Bu işlem geri alınamaz.
                    </p>
                </div>
            </div>
        </div>
    );
}
