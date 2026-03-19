import React, { useState } from 'react';
import { Briefcase, Users, Clock, ArrowUpRight, Edit2, Unlock, XCircle, Search, Sparkles, Building2, ChevronDown, BarChart2, Settings, Home } from 'lucide-react';
import './_group.css';

const MOCK_POSITIONS = [
  { id: 1, title: "Senior Frontend Engineer", dept: "Mühendislik", status: "open", candidates: 12, experience: 5, matchScore: 87, openDays: 14 },
  { id: 2, title: "Product Manager", dept: "Ürün", status: "open", candidates: 8, experience: 4, matchScore: 72, openDays: 7 },
  { id: 3, title: "UX Designer", dept: "Tasarım", status: "open", candidates: 15, experience: 3, matchScore: 91, openDays: 21 },
  { id: 4, title: "Data Scientist", dept: "Veri", status: "pending_approval", candidates: 0, experience: 3, matchScore: 0, openDays: 2 },
  { id: 5, title: "DevOps Engineer", dept: "Altyapı", status: "open", candidates: 6, experience: 4, matchScore: 65, openDays: 30 },
  { id: 6, title: "Backend Engineer", dept: "Mühendislik", status: "closed", candidates: 22, experience: 5, matchScore: 78, openDays: 0 }
];

export default function CommandTable() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPositions = MOCK_POSITIONS.filter(pos => {
    const matchStatus = statusFilter === 'all' || pos.status === statusFilter;
    const matchDept = deptFilter === 'all' || pos.dept === deptFilter;
    const matchSearch = pos.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchDept && matchSearch;
  });

  const counts = {
    all: MOCK_POSITIONS.length,
    open: MOCK_POSITIONS.filter(p => p.status === 'open').length,
    pending: MOCK_POSITIONS.filter(p => p.status === 'pending_approval').length,
    closed: MOCK_POSITIONS.filter(p => p.status === 'closed').length
  };

  const depts = Array.from(new Set(MOCK_POSITIONS.map(p => p.dept)));
  const deptCounts = depts.reduce((acc, dept) => {
    acc[dept] = MOCK_POSITIONS.filter(p => p.dept === dept).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen w-full flex bg-[#080D1A] font-sans overflow-hidden text-white">
      
      {/* LEFT SIDEBAR */}
      <div className="w-[240px] bg-[#050A12] border-r border-white/[0.06] flex flex-col py-6 px-4 shrink-0">
        
        {/* TOP: TI logo */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-teal-400 to-cyan-600 shadow-lg shadow-cyan-500/20">
            <span className="font-black text-white text-sm tracking-tighter">TI</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white leading-tight">Talent-Inn</span>
            <span className="text-[10px] text-white/30 font-medium">HR Platform</span>
          </div>
        </div>

        <div className="border-b border-white/[0.06] my-4"></div>

        {/* STATUS FILTERS */}
        <div className="text-[9px] font-black text-white/20 tracking-widest uppercase mb-3 px-1">FİLTRELER</div>
        <div className="flex flex-col gap-1 mb-4">
          <FilterItem 
            active={statusFilter === 'all'} 
            onClick={() => setStatusFilter('all')}
            label="Tümü" 
            count={counts.all} 
          />
          <FilterItem 
            active={statusFilter === 'open'} 
            onClick={() => setStatusFilter('open')}
            label="Aktif" 
            count={counts.open} 
            badgeColor="text-cyan-400 bg-cyan-400/10"
          />
          <FilterItem 
            active={statusFilter === 'pending_approval'} 
            onClick={() => setStatusFilter('pending_approval')}
            label="Bekleyen" 
            count={counts.pending} 
            badgeColor="text-amber-400 bg-amber-400/10"
          />
          <FilterItem 
            active={statusFilter === 'closed'} 
            onClick={() => setStatusFilter('closed')}
            label="Kapalı" 
            count={counts.closed} 
            badgeColor="text-white/40 bg-white/5"
          />
        </div>

        <div className="border-b border-white/[0.06] my-4"></div>

        {/* DEPARTMANLAR */}
        <div className="text-[9px] font-black text-white/20 tracking-widest uppercase mb-3 px-1">DEPARTMANLAR</div>
        <div className="flex flex-col gap-1 overflow-y-auto pr-1 pb-4 flex-1">
          <FilterItem 
            active={deptFilter === 'all'} 
            onClick={() => setDeptFilter('all')}
            label="Tüm Departmanlar" 
          />
          {depts.map(dept => (
            <FilterItem 
              key={dept}
              active={deptFilter === dept} 
              onClick={() => setDeptFilter(dept)}
              label={dept} 
              count={deptCounts[dept]} 
            />
          ))}
        </div>

        {/* Bottom AI Card */}
        <div className="mt-auto pt-4">
          <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/10 p-3 flex items-start gap-2">
            <Sparkles size={14} className="text-cyan-400 shrink-0 mt-0.5" />
            <span className="text-[11px] text-white/40 leading-snug">
              87 aday AI analiz kuyruğunda
            </span>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* TOP BAR */}
        <div className="px-8 py-5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-black text-white tracking-tight">Pozisyon Portföyü</h1>
            <div className="rounded-full bg-white/[0.05] text-white/40 text-[11px] px-2 py-0.5 font-medium">
              {filteredPositions.length}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input 
                type="text" 
                placeholder="Ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 bg-white/[0.04] border border-white/[0.06] rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/20 transition-colors"
              />
            </div>
            <button className="bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 font-bold text-xs px-4 py-2.5 rounded-xl transition-colors">
              + Yeni Pozisyon
            </button>
          </div>
        </div>

        {/* TABLE HEADER */}
        <div className="px-8 mt-6 shrink-0">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1.5fr_1fr] gap-4 text-[9px] font-black text-white/20 uppercase tracking-widest border-b border-white/[0.05] pb-3 px-6">
            <div>POZİSYON / DEPARTMAN</div>
            <div>ADAYLAR</div>
            <div>TECRÜBE MİN</div>
            <div>AÇIK SÜRESİ</div>
            <div>AI UYUM SKORU</div>
            <div>İŞLEMLER</div>
          </div>
        </div>

        {/* TABLE ROWS */}
        <div className="px-8 mt-2 space-y-2 overflow-y-auto pb-6">
          {filteredPositions.map(pos => (
            <div key={pos.id} className="rounded-2xl bg-white/[0.02] border border-white/[0.05] px-6 py-4 grid grid-cols-[2fr_1fr_1fr_1fr_1.5fr_1fr] gap-4 items-center hover:bg-white/[0.04] hover:border-white/[0.08] transition-all group">
              
              {/* Col 1: Position */}
              <div className="min-w-0 pr-4">
                <div className="text-sm font-bold text-white truncate mb-1">{pos.title}</div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/[0.04] text-white/30 text-[10px] px-2 py-0.5 whitespace-nowrap">
                    {pos.dept}
                  </span>
                  <StatusPill status={pos.status} />
                </div>
              </div>

              {/* Col 2: Candidates */}
              <div>
                <div className="font-black text-white text-[18px] leading-none">{pos.candidates}</div>
                <div className="text-[10px] text-white/30 mt-1">aday</div>
              </div>

              {/* Col 3: Experience */}
              <div>
                <div className="font-black text-white leading-none">{pos.experience} yıl+</div>
                <div className="text-[10px] text-white/30 mt-1">min. deneyim</div>
              </div>

              {/* Col 4: Open days */}
              <div>
                {pos.status === 'open' && (
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} className="text-white/40" />
                    <span className="text-sm text-white/60">{pos.openDays} gün</span>
                  </div>
                )}
                {pos.status === 'closed' && (
                  <span className="text-sm text-white/20">Kapalı</span>
                )}
                {pos.status === 'pending_approval' && (
                  <span className="text-xs font-medium text-amber-400">Onay Bekleniyor</span>
                )}
              </div>

              {/* Col 5: AI Score */}
              <div className="pr-4">
                {pos.status === 'open' ? (
                  <>
                    <div className="font-black text-cyan-400 text-[18px] leading-none mb-1.5">{pos.matchScore}%</div>
                    <div className="h-0.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${pos.matchScore}%` }}></div>
                    </div>
                  </>
                ) : (
                  <span className="text-white/20">—</span>
                )}
              </div>

              {/* Col 6: Actions */}
              <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] transition-colors group/btn" title="Adaylar">
                  <ArrowUpRight size={14} className="text-cyan-400" />
                </button>
                <button className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] transition-colors" title="Düzenle">
                  <Edit2 size={14} className="text-white/40" />
                </button>
                {pos.status === 'open' && (
                  <>
                    <button className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] transition-colors" title="İlanı Kapat">
                      <Unlock size={14} className="text-violet-400" />
                    </button>
                    <button className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] transition-colors hover:border-red-500/30" title="İptal">
                      <XCircle size={14} className="text-red-400/40 hover:text-red-400 transition-colors" />
                    </button>
                  </>
                )}
              </div>

            </div>
          ))}
          
          {filteredPositions.length === 0 && (
            <div className="py-12 text-center text-white/30 text-sm">
              Sonuç bulunamadı.
            </div>
          )}
        </div>

        {/* BOTTOM BAR */}
        <div className="mt-auto px-8 py-4 border-t border-white/[0.06] flex items-center justify-between shrink-0 bg-[#080D1A]">
          <div className="text-xs text-white/20 font-medium">
            {filteredPositions.length} pozisyon gösteriliyor
          </div>
          <div className="flex items-center gap-4">
            <button disabled className="text-sm font-medium text-white/20 cursor-not-allowed">← Önceki</button>
            <button disabled className="text-sm font-medium text-white/20 cursor-not-allowed">Sonraki →</button>
          </div>
        </div>

      </div>

    </div>
  );
}

function FilterItem({ active, onClick, label, count, badgeColor }: { active: boolean, onClick: () => void, label: string, count?: number, badgeColor?: string }) {
  return (
    <div 
      onClick={onClick}
      className={`rounded-xl px-3 py-2 flex items-center justify-between cursor-pointer transition-colors border ${
        active 
          ? 'bg-cyan-500/10 border-cyan-500/20' 
          : 'bg-transparent border-transparent hover:bg-white/[0.03]'
      }`}
    >
      <div className="flex items-center gap-2">
        {active && <div className="w-[6px] h-[6px] rounded-full bg-cyan-400 shrink-0"></div>}
        <span className={`text-sm font-medium ${active ? 'text-cyan-400' : 'text-white/60'}`}>
          {label}
        </span>
      </div>
      {count !== undefined && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
          badgeColor ? badgeColor : (active ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-white/40')
        }`}>
          {count}
        </span>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === 'open') return <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"></span>;
  if (status === 'pending_approval') return <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]"></span>;
  return <span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>;
}
