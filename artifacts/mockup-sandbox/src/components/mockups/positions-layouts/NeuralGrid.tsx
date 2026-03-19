import React, { useState, useMemo } from 'react';
import { 
  Home, Briefcase, Users, BarChart2, Settings, 
  Search, Zap, Building2, Unlock, Edit2, XCircle, ChevronRight
} from 'lucide-react';
import './_group.css';

const MOCK_POSITIONS = [
  { id: 1, title: "Senior Frontend Engineer", dept: "Mühendislik", status: "open", candidates: 12, experience: 5, matchScore: 87, openDays: 14, requirements: ["React", "TypeScript", "GraphQL"] },
  { id: 2, title: "Product Manager", dept: "Ürün", status: "open", candidates: 8, experience: 4, matchScore: 72, openDays: 7, requirements: ["Agile", "Roadmap", "Jira"] },
  { id: 3, title: "UX Designer", dept: "Tasarım", status: "open", candidates: 15, experience: 3, matchScore: 91, openDays: 21, requirements: ["Figma", "User Research", "Prototyping"] },
  { id: 4, title: "Data Scientist", dept: "Veri", status: "pending_approval", candidates: 0, experience: 3, matchScore: 0, openDays: 2, requirements: ["Python", "ML", "SQL"] },
  { id: 5, title: "DevOps Engineer", dept: "Altyapı", status: "open", candidates: 6, experience: 4, matchScore: 65, openDays: 30, requirements: ["Kubernetes", "AWS", "CI/CD"] },
  { id: 6, title: "Backend Engineer", dept: "Mühendislik", status: "closed", candidates: 22, experience: 5, matchScore: 78, openDays: 0, requirements: ["Node.js", "PostgreSQL", "Redis"] }
];

export default function NeuralGrid() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPositions = useMemo(() => {
    return MOCK_POSITIONS.filter(pos => {
      const matchesSearch = pos.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            pos.dept.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || pos.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [searchTerm, statusFilter]);

  const stats = useMemo(() => {
    const active = MOCK_POSITIONS.filter(p => p.status === 'open').length;
    const pending = MOCK_POSITIONS.filter(p => p.status === 'pending_approval').length;
    const closed = MOCK_POSITIONS.filter(p => p.status === 'closed').length;
    const candidates = MOCK_POSITIONS.reduce((acc, p) => acc + p.candidates, 0);
    return { active, pending, closed, candidates };
  }, []);

  return (
    <div className="min-h-screen w-full flex font-sans text-white overflow-hidden bg-[#080D1A]">
      {/* SIDEBAR */}
      <div className="w-[64px] h-screen bg-[#060B17] flex flex-col items-center py-6 border-r border-white/[0.05] shrink-0 z-10">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-black text-white shadow-lg shadow-cyan-500/20 mb-8">
          TI
        </div>
        
        <nav className="flex flex-col gap-4 w-full px-2">
          <NavItem icon={<Home size={20} />} />
          <NavItem icon={<Briefcase size={20} />} active />
          <NavItem icon={<Users size={20} />} />
          <NavItem icon={<BarChart2 size={20} />} />
        </nav>

        <div className="mt-auto pb-4">
          <NavItem icon={<Settings size={20} />} />
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 h-screen overflow-y-auto relative">
        {/* Background ambient glow */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[300px] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="max-w-[1376px] mx-auto pb-20 relative z-10">
          
          {/* HEADER SECTION */}
          <div className="px-10 pt-10">
            <div className="flex items-center text-xs font-medium text-white/40 mb-4">
              <span className="hover:text-white transition-colors cursor-pointer">Ana Sayfa</span>
              <ChevronRight size={14} className="mx-2 opacity-50" />
              <span className="text-cyan-400">Pozisyon Bankası</span>
            </div>
            
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-[28px] font-black tracking-tight text-white mb-1">
                  Pozisyon Portföyü
                </h1>
                <p className="text-xs font-medium text-white/40">
                  Aktif iş ilanlarınızı yönetin ve aday eşleşmelerini takip edin.
                </p>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.05] backdrop-blur-md">
                    <Zap size={14} className="text-cyan-400" />
                    <span className="text-xs font-bold text-cyan-400">{stats.active} Aktif</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.05] backdrop-blur-md">
                    <Users size={14} className="text-violet-400" />
                    <span className="text-xs font-bold text-violet-400">{stats.candidates} Aday</span>
                  </div>
                </div>
                
                <button className="px-5 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-bold hover:bg-cyan-500/20 transition-all active:scale-[0.98]">
                  + Yeni Pozisyon
                </button>
              </div>
            </div>
          </div>

          {/* SEARCH + FILTER BAR */}
          <div className="mx-10 mt-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3 flex items-center gap-3 backdrop-blur-sm">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search size={16} className="text-white/30" />
              </div>
              <input
                type="text"
                placeholder="Pozisyon adı veya departman ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#030712]/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all border border-transparent focus:border-cyan-500/30"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <FilterPill 
                label="Tümü" 
                active={statusFilter === 'all'} 
                onClick={() => setStatusFilter('all')} 
              />
              <FilterPill 
                label={`Aktif (${stats.active})`} 
                active={statusFilter === 'open'} 
                onClick={() => setStatusFilter('open')} 
              />
              <FilterPill 
                label={`Bekleyen (${stats.pending})`} 
                active={statusFilter === 'pending_approval'} 
                onClick={() => setStatusFilter('pending_approval')} 
              />
              <FilterPill 
                label={`Kapalı (${stats.closed})`} 
                active={statusFilter === 'closed'} 
                onClick={() => setStatusFilter('closed')} 
              />
            </div>
          </div>

          {/* POSITIONS GRID */}
          <div className="mx-10 mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPositions.map((pos) => (
              <div key={pos.id} className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-6 flex flex-col hover:border-cyan-500/20 hover:bg-white/[0.04] transition-all duration-300 group">
                
                {/* TOP ROW */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                      <Building2 size={14} className="text-cyan-400" />
                    </div>
                    <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">
                      {pos.dept}
                    </span>
                  </div>
                  <StatusPill status={pos.status} />
                </div>
                
                {/* TITLE */}
                <h3 className="text-lg font-black text-white uppercase tracking-tight truncate">
                  {pos.title}
                </h3>
                
                {/* AI SCORE BAR */}
                {pos.status === 'open' && (
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[10px] font-medium text-white/30">AI Eşleşme Skoru</span>
                      <span className="text-[10px] font-black text-cyan-400">{pos.matchScore}%</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-1000"
                        style={{ width: `${pos.matchScore}%` }}
                      ></div>
                    </div>
                  </div>
                )}
                
                {/* REQUIREMENTS */}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {pos.requirements.map((req, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.05] text-[10px] font-medium text-white/30">
                      {req}
                    </span>
                  ))}
                </div>
                
                {/* STATS ROW */}
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 flex flex-col">
                    <span className="text-[9px] font-bold text-white/30 mb-1 tracking-wider">ADAYLAR</span>
                    <span className="text-lg font-black text-white leading-none">{pos.candidates}</span>
                  </div>
                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 flex flex-col">
                    <span className="text-[9px] font-bold text-white/30 mb-1 tracking-wider">TECRÜBE MİN</span>
                    <span className="text-lg font-black text-white leading-none">{pos.experience}yıl</span>
                  </div>
                </div>
                
                {/* ACTIONS */}
                <div className="mt-auto pt-5 border-t border-white/[0.05]">
                  {pos.status === 'open' && (
                    <div className="flex items-center gap-2">
                      <button className="flex-1 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-[11px] font-bold hover:bg-white/[0.06] transition-colors">
                        Potansiyel Adaylar
                      </button>
                      <button className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-colors">
                        <Unlock size={16} />
                      </button>
                      <button className="p-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/40 hover:text-white transition-colors">
                        <Edit2 size={16} />
                      </button>
                      <button className="p-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/40 hover:text-rose-400 transition-colors">
                        <XCircle size={16} />
                      </button>
                    </div>
                  )}
                  
                  {pos.status === 'pending_approval' && (
                    <div className="flex items-center gap-2">
                      <button className="flex-1 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold hover:bg-emerald-500/20 transition-colors">
                        Onayla
                      </button>
                      <button className="flex-1 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-bold hover:bg-rose-500/20 transition-colors">
                        Reddet
                      </button>
                    </div>
                  )}
                  
                  {pos.status === 'closed' && (
                    <button className="w-full py-2.5 rounded-xl border border-white/10 text-white/40 text-[11px] font-bold hover:bg-white/[0.03] hover:text-white transition-colors">
                      Yeniden Aç
                    </button>
                  )}
                </div>
                
              </div>
            ))}
          </div>

          {/* BOTTOM AREA */}
          <div className="mx-10 mt-6 flex items-center gap-2 text-[11px] font-medium text-white/30 px-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            AI destekli eşleştirme aktif &bull; Son güncelleme: 2 dk önce
          </div>

        </div>
      </div>
    </div>
  );
}

function NavItem({ icon, active = false }: { icon: React.ReactNode, active?: boolean }) {
  return (
    <button className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
      active 
        ? 'bg-cyan-500 text-[#060B17] shadow-lg shadow-cyan-500/20' 
        : 'text-white/30 hover:bg-white/5 hover:text-white'
    }`}>
      {icon}
    </button>
  );
}

function FilterPill({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
        active 
          ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400' 
          : 'bg-transparent border border-white/[0.06] text-white/40 hover:bg-white/[0.02] hover:text-white/80'
      }`}
    >
      {label}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === 'open') {
    return (
      <div className="px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black text-emerald-400 tracking-wider">
        AKTİF
      </div>
    );
  }
  if (status === 'pending_approval') {
    return (
      <div className="px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-[9px] font-black text-amber-400 tracking-wider">
        ONAY BEKLİYOR
      </div>
    );
  }
  return (
    <div className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[9px] font-black text-white/30 tracking-wider">
      PASİF
    </div>
  );
}
