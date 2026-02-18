// src/pages/PositionsPage.jsx
// CRUD Interface for Job Positions

import { useState } from 'react';
import Header from '../components/Header';
import { usePositions } from '../context/PositionsContext';
import {
    Briefcase,
    Plus,
    MoreVertical,
    Trash2,
    Edit,
    CheckCircle2,
    XCircle,
    Users,
    Clock,
    Search
} from 'lucide-react';

import PotentialCandidatesTab from '../components/PotentialCandidatesTab';
import { useCandidates } from '../context/CandidatesContext';

export default function PositionsPage() {
    const { positions, loading, addPosition, deletePosition, togglePositionStatus } = usePositions();
    const { filteredCandidates: candidates } = useCandidates();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedPosition, setExpandedPosition] = useState(null);

    // Form State
    const [formData, setFormData] = useState({
        title: '',
        department: '',
        minExperience: '',
        requirements: '',
    });

    const handleAddPosition = async (e) => {
        e.preventDefault();
        if (!formData.title || !formData.department) return;

        const newPosition = {
            title: formData.title,
            department: formData.department,
            minExperience: parseInt(formData.minExperience) || 0,
            requirements: formData.requirements.split(',').map(r => r.trim()).filter(r => r),
        };

        await addPosition(newPosition);
        setIsModalOpen(false);
        setFormData({ title: '', department: '', minExperience: '', requirements: '' });
    };

    const filteredPositions = positions.filter(p =>
        p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.department.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen pb-20">
            <Header title="Pozisyon Bankası" />

            <div className="max-w-6xl mx-auto px-6 lg:px-8 py-8 space-y-6">

                {/* Actions Bar */}
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
                        <input
                            type="text"
                            placeholder="Pozisyon ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white placeholder:text-navy-500 focus:outline-none focus:border-electric/40 focus:bg-white/[0.05] transition-all"
                        />
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-electric hover:bg-electric-light text-white font-semibold text-sm shadow-[0_4px_16px_rgba(59,130,246,0.3)] hover:shadow-[0_6px_24px_rgba(59,130,246,0.4)] transition-all flex items-center justify-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Yeni Pozisyon
                    </button>
                </div>

                {/* Positions Grid */}
                {loading ? (
                    <div className="text-center py-20 text-navy-400">Yükleniyor...</div>
                ) : filteredPositions.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
                            <Briefcase className="w-6 h-6 text-navy-500" />
                        </div>
                        <h3 className="text-white font-bold mb-1">Pozisyon Bulunamadı</h3>
                        <p className="text-sm text-navy-400">Yeni bir pozisyon ekleyerek başlayın.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPositions.map((pos) => (
                            <div key={pos.id} className="group glass rounded-2xl p-5 border border-white/[0.06] hover:border-electric/30 transition-all relative">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-white mb-1 group-hover:text-electric-light transition-colors">{pos.title}</h3>
                                        <span className="text-xs text-navy-400 flex items-center gap-1.5">
                                            <Briefcase className="w-3 h-3" />
                                            {pos.department}
                                        </span>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${pos.status === 'open'
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                        : 'bg-navy-500/10 text-navy-400 border-navy-500/20'
                                        }`}>
                                        {pos.status === 'open' ? 'Açık' : 'Kapalı'}
                                    </span>
                                </div>

                                <div className="space-y-3 mb-5">
                                    <div className="flex items-center gap-2 text-xs text-navy-300">
                                        <Users className="w-3.5 h-3.5 text-navy-500" />
                                        <span>Eşleşen Aday: <strong className="text-white">{pos.matchedCandidates?.length || 0}</strong></span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-navy-300">
                                        <Clock className="w-3.5 h-3.5 text-navy-500" />
                                        <span>Min. Deneyim: {pos.minExperience || 0} Yıl</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 pt-4 border-t border-white/[0.06]">
                                    <button
                                        onClick={() => setExpandedPosition(expandedPosition === pos.id ? null : pos.id)}
                                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${expandedPosition === pos.id
                                            ? 'border-electric text-electric bg-electric/10'
                                            : 'border-white/[0.1] text-navy-300 hover:text-white hover:bg-white/[0.05]'
                                            }`}
                                    >
                                        {expandedPosition === pos.id ? 'Adayları Gizle' : 'Potansiyel Adayları Gör'}
                                    </button>
                                    <button
                                        onClick={() => togglePositionStatus(pos.id, pos.status)}
                                        className={`p-2 rounded-lg border transition-all ${pos.status === 'open'
                                            ? 'border-white/[0.1] text-navy-400 hover:text-white hover:bg-white/[0.05]'
                                            : 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'
                                            }`}
                                        title={pos.status === 'open' ? 'Kapat' : 'Yeniden Aç'}
                                    >
                                        {pos.status === 'open' ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                    </button>
                                    <button
                                        onClick={() => deletePosition(pos.id)}
                                        className="p-2 rounded-lg text-navy-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                        title="Sil"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Expanded Potential Candidates Tab */}
                                {expandedPosition === pos.id && (
                                    <div className="mt-4 pt-4 border-t border-white/[0.06]">
                                        <PotentialCandidatesTab position={pos} candidates={candidates} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add Position Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-navy-900 rounded-3xl border border-white/[0.1] p-6 shadow-2xl animate-fade-in-up">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold text-white">Yeni Pozisyon Ekle</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-navy-400 hover:text-white">
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleAddPosition} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-navy-300 mb-1.5">Pozisyon Adı</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white focus:border-electric/50 outline-none"
                                    placeholder="Örn: Senior Frontend Developer"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-navy-300 mb-1.5">Departman</label>
                                <input
                                    type="text"
                                    value={formData.department}
                                    onChange={e => setFormData({ ...formData, department: e.target.value })}
                                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white focus:border-electric/50 outline-none"
                                    placeholder="Örn: Engineering"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-navy-300 mb-1.5">Min. Deneyim (Yıl)</label>
                                <input
                                    type="number"
                                    value={formData.minExperience}
                                    onChange={e => setFormData({ ...formData, minExperience: e.target.value })}
                                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white focus:border-electric/50 outline-none"
                                    placeholder="5"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-navy-300 mb-1.5">Gereksinimler (Virgülle ayırın)</label>
                                <textarea
                                    value={formData.requirements}
                                    onChange={e => setFormData({ ...formData, requirements: e.target.value })}
                                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white focus:border-electric/50 outline-none resize-none"
                                    rows={3}
                                    placeholder="React, Node.js, AWS..."
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-3 rounded-xl bg-electric hover:bg-electric-light text-white font-bold text-sm shadow-lg shadow-electric/20 transition-all mt-2"
                            >
                                Pozisyon Oluştur
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
