import React, { useState } from 'react';
import { Briefcase, Users, Clock, ArrowUpRight, Edit2, Unlock, XCircle, Search, Sparkles, Building2, BarChart2, Settings, Home, CheckCircle2 } from 'lucide-react';
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
    <div className="min-h-screen w-full flex bg-slate-50 font-sans overflow-hidden text-slate-800">

      {/* LEFT SIDEBAR */}
      <div className="w-[240px] bg-white border-r border-slate-200 flex flex-col py-6 px-4 shrink-0 shadow-sm">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-teal-400 to-cyan-600 shadow-md shadow-cyan-500/20">
            <span className="font-black text-white text-sm tracking-tighter">TI</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-800 leading-tight">Talent-Inn</span>
            <span className="text-[10px] text-slate-400 font-medium">HR Platform</span>
          </div>
        </div>

        <div className="border-b border-slate-100 my-4" />

        {/* Status Filters */}
        <div className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-3 px-1">FİLTRELER</div>
        <div className="flex flex-col gap-0.5 mb-4">
          <FilterItem active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label="Tümü" count={counts.all} />
          <FilterItem active={statusFilter === 'open'} onClick={() => setStatusFilter('open')} label="Aktif" count={counts.open} badgeColor="text-cyan-600 bg-cyan-50" />
          <FilterItem active={statusFilter === 'pending_approval'} onClick={() => setStatusFilter('pending_approval')} label="Bekleyen" count={counts.pending} badgeColor="text-amber-600 bg-amber-50" />
          <FilterItem active={statusFilter === 'closed'} onClick={() => setStatusFilter('closed')} label="Kapalı" count={counts.closed} badgeColor="text-slate-400 bg-slate-100" />
        </div>

        <div className="border-b border-slate-100 my-2" />

        {/* Department Filters */}
        <div className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-3 px-1 mt-2">DEPARTMANLAR</div>
        <div className="flex flex-col gap-0.5 overflow-y-auto pr-1 pb-4 flex-1">
          <FilterItem active={deptFilter === 'all'} onClick={() => setDeptFilter('all')} label="Tüm Departmanlar" />
          {depts.map(dept => (
            <FilterItem key={dept} active={deptFilter === dept} onClick={() => setDeptFilter(dept)} label={dept} count={deptCounts[dept]} />
          ))}
        </div>

        {/* Bottom AI Card */}
        <div className="mt-auto pt-4">
          <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3 flex items-start gap-2">
            <Sparkles size={14} className="text-cyan-500 shrink-0 mt-0.5" />
            <span className="text-[11px] text-slate-500 leading-snug">87 aday AI analiz kuyruğunda</span>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* TOP BAR */}
        <div className="px-8 py-5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-black text-slate-900 tracking-tight">Pozisyon Portföyü</h1>
            <div className="rounded-full bg-slate-100 text-slate-400 text-[11px] px-2 py-0.5 font-medium">
              {filteredPositions.length}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-all"
              />
            </div>
            <button className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-sm shadow-cyan-200">
              + Yeni Pozisyon
            </button>
          </div>
        </div>

        {/* TABLE HEADER */}
        <div className="px-8 mt-6 shrink-0">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1.5fr_1fr] gap-4 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-3 px-4">
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
            <div key={pos.id} className="rounded-2xl bg-white border border-slate-200 px-6 py-4 grid grid-cols-[2fr_1fr_1fr_1fr_1.5fr_1fr] gap-4 items-center hover:border-cyan-200 hover:shadow-sm transition-all group">

              {/* Col 1: Position */}
              <div className="min-w-0 pr-4">
                <div className="text-sm font-bold text-slate-800 truncate mb-1">{pos.title}</div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 whitespace-nowrap font-medium">
                    {pos.dept}
                  </span>
                  <StatusPill status={pos.status} />
                </div>
              </div>

              {/* Col 2: Candidates */}
              <div>
                <div className="font-black text-slate-900 text-[18px] leading-none">{pos.candidates}</div>
                <div className="text-[10px] text-slate-400 mt-1">aday</div>
              </div>

              {/* Col 3: Experience */}
              <div>
                <div className="font-black text-slate-900 leading-none">{pos.experience} yıl+</div>
                <div className="text-[10px] text-slate-400 mt-1">min. deneyim</div>
              </div>

              {/* Col 4: Open days */}
              <div>
                {pos.status === 'open' && (
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} className="text-slate-400" />
                    <span className="text-sm text-slate-600">{pos.openDays} gün</span>
                  </div>
                )}
                {pos.status === 'closed' && (
                  <span className="text-sm text-slate-300">Kapalı</span>
                )}
                {pos.status === 'pending_approval' && (
                  <span className="text-xs font-semibold text-amber-500">Onay Bekleniyor</span>
                )}
              </div>

              {/* Col 5: AI Score */}
              <div className="pr-4">
                {pos.status === 'open' ? (
                  <>
                    <div className="font-black text-cyan-500 text-[18px] leading-none mb-1.5">{pos.matchScore}%</div>
                    <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-400 to-cyan-500 rounded-full" style={{ width: `${pos.matchScore}%` }} />
                    </div>
                  </>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </div>

              {/* Col 6: Actions */}
              <div className="flex items-center gap-1.5 opacity-50 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-cyan-50 hover:border-cyan-200 transition-colors" title="Adaylar">
                  <ArrowUpRight size={14} className="text-cyan-500" />
                </button>
                <button className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors" title="Düzenle">
                  <Edit2 size={14} className="text-slate-400" />
                </button>
                {pos.status === 'open' && (
                  <>
                    <button className="p-1.5 rounded-lg bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors" title="Departmana Aç">
                      <Unlock size={14} className="text-violet-500" />
                    </button>
                    <button className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-red-50 hover:border-red-200 transition-colors" title="Kapat">
                      <XCircle size={14} className="text-slate-300 hover:text-red-400 transition-colors" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          {filteredPositions.length === 0 && (
            <div className="py-16 text-center text-slate-400 text-sm">
              <Briefcase size={32} className="mx-auto mb-3 text-slate-300" />
              Sonuç bulunamadı.
            </div>
          )}
        </div>

        {/* BOTTOM BAR */}
        <div className="mt-auto px-8 py-4 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400 font-medium">
            {filteredPositions.length} pozisyon gösteriliyor
          </div>
          <div className="flex items-center gap-4">
            <button disabled className="text-sm font-medium text-slate-300 cursor-not-allowed">← Önceki</button>
            <button disabled className="text-sm font-medium text-slate-300 cursor-not-allowed">Sonraki →</button>
          </div>
        </div>

      </div>
    </div>
  );
}

function FilterItem({ active, onClick, label, count, badgeColor }: {
  active: boolean; onClick: () => void; label: string; count?: number; badgeColor?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl px-3 py-2 flex items-center justify-between cursor-pointer transition-colors border ${
        active
          ? 'bg-cyan-50 border-cyan-200'
          : 'bg-transparent border-transparent hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-2">
        {active && <div className="w-[6px] h-[6px] rounded-full bg-cyan-500 shrink-0" />}
        <span className={`text-sm font-medium ${active ? 'text-cyan-600' : 'text-slate-500'}`}>
          {label}
        </span>
      </div>
      {count !== undefined && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
          badgeColor ? badgeColor : (active ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-100 text-slate-400')
        }`}>
          {count}
        </span>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === 'open') return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />AKTİF
    </span>
  );
  if (status === 'pending_approval') return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />BEKLEYEN
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />PASİF
    </span>
  );
}
