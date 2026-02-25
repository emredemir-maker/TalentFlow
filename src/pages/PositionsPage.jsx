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
    Search,
    Sparkles,
    Loader2,
    Target,
    Zap,
    Cpu,
    Filter,
    ArrowUpRight,
    MapPin,
    Calendar,
    ChevronDown,
    Building2,
    FileText
} from 'lucide-react';

import PotentialCandidatesTab from '../components/PotentialCandidatesTab';
import CandidateDrawer from '../components/CandidateDrawer';
import { useCandidates } from '../context/CandidatesContext';
import { extractPositionFromJD } from '../services/geminiService';
import { calculateMatchScore } from '../services/matchService';

export default function PositionsPage() {
    const { positions, loading, addPosition, deletePosition, togglePositionStatus } = usePositions();
    const { candidates } = useCandidates();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedPosition, setExpandedPosition] = useState(null);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [activePosition, setActivePosition] = useState(null); // Track which position context is active

    // Form State
    const [formData, setFormData] = useState({
        title: '',
        department: '',
        minExperience: '',
        requirements: '',
    });
    const [jdText, setJdText] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);

    const handleExtractFromJD = async () => {
        if (!jdText || jdText.length < 50) return;

        setIsExtracting(true);
        try {
            const result = await extractPositionFromJD(jdText);
            setFormData({
                title: result.title || formData.title,
                department: result.department || formData.department,
                minExperience: result.minExperience?.toString() || formData.minExperience,
                requirements: result.requirements?.join(', ') || formData.requirements,
            });
            // Show success or just update
        } catch (error) {
            console.error('Extraction error:', error);
            alert('Ayrıştırma sırasında bir hata oluştu: ' + error.message);
        } finally {
            setIsExtracting(false);
        }
    };

    const handleAddPosition = async (e) => {
        e.preventDefault();
        if (!formData.title || !formData.department) return;

        const positionRequirements = formData.requirements.split(',').map(r => r.trim()).filter(r => r);

        // Automatic matching against existing candidates
        const matchedCandidates = candidates
            .map(c => ({ ...c, match: calculateMatchScore(c, { ...formData, requirements: positionRequirements }) }))
            .filter(c => c.match.score >= 50)
            .sort((a, b) => b.match.score - a.match.score)
            .slice(0, 10)
            .map(c => ({
                id: c.id,
                name: c.name,
                score: c.match.score,
                reason: c.match.score >= 70 ? 'Yüksek Uyumluluk' : 'Potansiyel Eşleşme'
            }));

        const newPosition = {
            title: formData.title,
            department: formData.department,
            minExperience: parseInt(formData.minExperience) || 0,
            requirements: positionRequirements,
            matchedCandidates: matchedCandidates
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

            <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10 space-y-10">

                {/* Dashboard Stats / Hero Section */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                            <Target className="w-8 h-8 text-electric" /> Pozisyon Portföyü
                        </h2>
                        <p className="text-navy-400 text-sm font-medium mt-1">Aktif iş ilanlarınızı yönetin ve aday eşleşmelerini takip edin.</p>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="px-5 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-electric/10 flex items-center justify-center">
                                <Zap className="w-5 h-5 text-electric" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-navy-500 uppercase tracking-widest">Aktif Kanal</p>
                                <p className="text-sm font-black text-white">{positions.filter(p => p.status === 'open').length} Pozisyon</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex-1 md:flex-none px-6 py-4 rounded-2xl bg-electric hover:bg-electric-light text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-electric/20 hover:shadow-electric/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Yeni Pozisyon
                        </button>
                    </div>
                </div>

                {/* Search & Filters */}
                <div className="glass rounded-[2rem] p-4 border border-white/[0.08] flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1 group w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500 group-focus-within:text-electric transition-colors" />
                        <input
                            type="text"
                            placeholder="Pozisyon adı, departman veya anahtar kelime ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 rounded-[1.25rem] bg-navy-950/50 border border-white/5 text-sm text-white placeholder:text-navy-500 focus:outline-none focus:border-electric/30 focus:bg-navy-950 transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <button className="flex-1 md:flex-none px-5 py-3.5 rounded-[1.25rem] bg-white/[0.03] border border-white/[0.06] text-navy-400 hover:text-white transition-all flex items-center justify-center gap-2 text-xs font-bold whitespace-nowrap">
                            <Filter className="w-4 h-4" /> Tüm Departmanlar
                        </button>
                        <button className="flex-1 md:flex-none px-5 py-3.5 rounded-[1.25rem] bg-white/[0.03] border border-white/[0.06] text-navy-400 hover:text-white transition-all flex items-center justify-center gap-2 text-xs font-bold whitespace-nowrap">
                            <Calendar className="w-4 h-4" /> En Son Eklenen
                        </button>
                    </div>
                </div>

                {/* Positions Grid */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 space-y-4">
                        <div className="w-12 h-12 border-4 border-navy-800 border-t-electric rounded-full animate-spin" />
                        <p className="text-xs font-black text-navy-500 uppercase tracking-widest">Veritabanı taranıyor...</p>
                    </div>
                ) : filteredPositions.length === 0 ? (
                    <div className="text-center py-32 glass rounded-[3rem] border border-white/[0.06] bg-white/[0.01]">
                        <div className="w-20 h-20 rounded-[2rem] bg-white/[0.03] flex items-center justify-center mx-auto mb-6 border border-white/5">
                            <Briefcase className="w-8 h-8 text-navy-600" />
                        </div>
                        <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tight">Portföyünüz Boş</h3>
                        <p className="text-sm text-navy-500 max-w-sm mx-auto font-medium">Yeni bir pozisyon ekleyerek yapay zeka tabanlı aday eşleştirme sistemini aktive edebilirsiniz.</p>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="mt-8 px-8 py-3.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/10 font-black text-[10px] uppercase tracking-widest transition-all"
                        >
                            İlk Pozisyonu Oluştur
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                        {filteredPositions.map((pos) => (
                            <div key={pos.id} className="group glass rounded-[2.5rem] p-8 border border-white/[0.06] hover:border-electric/30 hover:bg-white/[0.02] transition-all duration-500 relative flex flex-col h-full animate-fade-in-up">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-electric/5 rounded-full blur-3xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity" />

                                <div className="flex justify-between items-start mb-6">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-8 h-8 rounded-lg bg-electric/10 flex items-center justify-center">
                                                <Building2 className="w-4 h-4 text-electric" />
                                            </div>
                                            <span className="text-[10px] font-black text-navy-500 uppercase tracking-widest leading-none">{pos.department}</span>
                                        </div>
                                        <h3 className="text-xl font-black text-white truncate group-hover:text-electric transition-colors tracking-tight uppercase">{pos.title}</h3>
                                    </div>
                                    <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border transition-colors ${pos.status === 'open'
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                        : 'bg-navy-900 text-navy-500 border-white/5'
                                        }`}>
                                        {pos.status === 'open' ? 'Aktif' : 'Pasif'}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-8">
                                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Users className="w-3.5 h-3.5 text-navy-500" />
                                            <span className="text-[9px] font-black text-navy-500 uppercase tracking-widest">Adaylar</span>
                                        </div>
                                        <p className="text-lg font-black text-white">{pos.matchedCandidates?.length || 0}</p>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Clock className="w-3.5 h-3.5 text-navy-500" />
                                            <span className="text-[9px] font-black text-navy-500 uppercase tracking-widest">Tecrübe</span>
                                        </div>
                                        <p className="text-lg font-black text-white">{pos.minExperience || 0}Yl</p>
                                    </div>
                                </div>

                                <div className="mt-auto space-y-4">
                                    <div className="flex items-center justify-between text-[10px] font-bold">
                                        <span className="text-navy-500 uppercase tracking-widest flex items-center gap-2">
                                            <Cpu className="w-3.5 h-3.5 text-cyan-400" /> AI Değerlendirmesi
                                        </span>
                                        <span className="text-cyan-400">AKTİF</span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setExpandedPosition(expandedPosition === pos.id ? null : pos.id)}
                                            className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-2 ${expandedPosition === pos.id
                                                ? 'bg-electric text-white border-electric'
                                                : 'bg-white/[0.03] border-white/10 text-white hover:bg-white/[0.06]'
                                                }`}
                                        >
                                            {expandedPosition === pos.id ? (
                                                <>Kapat <ChevronDown className="w-3.5 h-3.5 rotate-180 transition-transform" /></>
                                            ) : (
                                                <>Potansiyel Adaylar <ArrowUpRight className="w-3.5 h-3.5" /></>
                                            )}
                                        </button>

                                        <button
                                            onClick={() => togglePositionStatus(pos.id, pos.status)}
                                            className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 text-navy-400 hover:text-white transition-all group/btn"
                                            title={pos.status === 'open' ? 'Pozisyonu Kapat' : 'Pozisyonu Aç'}
                                        >
                                            {pos.status === 'open' ? <XCircle className="w-5 h-5 group-hover/btn:text-red-400 transition-colors" /> : <CheckCircle2 className="w-5 h-5 group-hover/btn:text-emerald-400 transition-colors" />}
                                        </button>
                                        <button
                                            onClick={() => deletePosition(pos.id)}
                                            className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 text-navy-400 hover:text-red-500 transition-all"
                                            title="Sil"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Potential Candidates Tab */}
                                {expandedPosition === pos.id && (
                                    <div className="mt-8 pt-8 border-t border-white/[0.08] animate-fade-in">
                                        <PotentialCandidatesTab
                                            position={pos}
                                            candidates={candidates}
                                            onCandidateClick={(c) => {
                                                setSelectedCandidate(c);
                                                setActivePosition(pos);
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ===== DRAWER ===== */}
            {selectedCandidate && (
                <CandidateDrawer
                    candidate={selectedCandidate}
                    positionContext={activePosition}
                    onClose={() => {
                        setSelectedCandidate(null);
                        setActivePosition(null);
                    }}
                />
            )}

            {/* Add Position Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-xl animate-fade-in" onClick={() => setIsModalOpen(false)} />
                    <div className="relative w-full max-w-2xl glass rounded-[3rem] p-8 md:p-12 border border-white/10 shadow-3xl animate-scale-in">

                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h2 className="text-2xl font-black text-white tracking-tight">POZİSYON OLUŞTUR</h2>
                                <p className="text-xs text-navy-500 font-bold uppercase tracking-widest mt-1">Stratejik İşe Alım Planlaması</p>
                            </div>
                            <button onClick={() => {
                                setIsModalOpen(false);
                                setJdText('');
                            }} className="p-3 hover:bg-white/5 rounded-2xl text-navy-400 transition-colors">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                            {/* Smart Extraction Section */}
                            <div className="space-y-6">
                                <div className="p-6 rounded-[2rem] bg-electric/5 border border-electric/20 relative group/ai overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-electric/10 rounded-full blur-2xl -z-10" />
                                    <label className="block text-[10px] font-black text-electric-light mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Sparkles className="w-4 h-4" /> AI Sihirbazı
                                    </label>
                                    <p className="text-xs text-navy-300 mb-4 leading-relaxed font-medium">İş tanımını buraya yapıştırın, AI başlığı, gereksinimleri ve departmanı otomatik doldursun.</p>
                                    <textarea
                                        value={jdText}
                                        onChange={e => setJdText(e.target.value)}
                                        className="w-full h-48 px-4 py-4 rounded-2xl bg-navy-950 border border-white/5 text-sm text-white placeholder:text-navy-700 focus:border-electric/50 outline-none resize-none mb-4 transition-all"
                                        placeholder="Sorumluluklar, teknik beceriler ve deneyim kriterleri..."
                                    />
                                    <button
                                        type="button"
                                        onClick={handleExtractFromJD}
                                        disabled={isExtracting || jdText.length < 50}
                                        className="w-full py-4 rounded-xl bg-electric text-white font-black text-[10px] uppercase tracking-widest hover:bg-electric-light transition-all disabled:opacity-30 flex items-center justify-center gap-2 shadow-xl shadow-electric/20"
                                    >
                                        {isExtracting ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <><Zap className="w-4 h-4" /> Metni Analiz Et</>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Manual Form Section */}
                            <form onSubmit={handleAddPosition} className="space-y-4">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-navy-500 uppercase tracking-widest mb-2 ml-1">Pozisyon Başlığı</label>
                                        <div className="relative">
                                            <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-600" />
                                            <input
                                                type="text"
                                                value={formData.title}
                                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                                className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-white/[0.03] border border-white/5 text-sm text-white focus:border-electric/40 outline-none transition-all"
                                                placeholder="Örn: Senior Product Manager"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-navy-500 uppercase tracking-widest mb-2 ml-1">Departman</label>
                                        <div className="relative">
                                            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-600" />
                                            <input
                                                type="text"
                                                value={formData.department}
                                                onChange={e => setFormData({ ...formData, department: e.target.value })}
                                                className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-white/[0.03] border border-white/5 text-sm text-white focus:border-electric/40 outline-none transition-all"
                                                placeholder="Örn: Product & Design"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-navy-500 uppercase tracking-widest mb-2 ml-1">Tecrübe (Yıl)</label>
                                            <input
                                                type="number"
                                                value={formData.minExperience}
                                                onChange={e => setFormData({ ...formData, minExperience: e.target.value })}
                                                className="w-full px-4 py-3.5 rounded-2xl bg-white/[0.03] border border-white/5 text-sm text-white focus:border-electric/40 outline-none transition-all"
                                                placeholder="5"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-navy-500 uppercase tracking-widest mb-2 ml-1">AI Modu</label>
                                            <div className="w-full px-4 py-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-400 flex items-center justify-center gap-2">
                                                <Target className="w-3.5 h-3.5" /> OTOMATİK
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-navy-500 uppercase tracking-widest mb-2 ml-1">Teknik Kriterler</label>
                                        <div className="relative">
                                            <FileText className="absolute left-4 top-4 w-4 h-4 text-navy-600" />
                                            <textarea
                                                value={formData.requirements}
                                                onChange={e => setFormData({ ...formData, requirements: e.target.value })}
                                                className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/[0.03] border border-white/5 text-sm text-white focus:border-electric/40 outline-none resize-none h-24 transition-all"
                                                placeholder="Gereksinimleri virgülle ayırarak yazın..."
                                            />
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="w-full py-4.5 rounded-2xl bg-electric hover:bg-electric-light text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-electric/30 transition-all mt-4"
                                >
                                    Pozisyonu Yayına Al
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
