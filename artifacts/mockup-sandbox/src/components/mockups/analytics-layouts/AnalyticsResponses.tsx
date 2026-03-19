import React, { useState } from 'react';
import { Activity, Globe, MessageSquare, Search, CheckCircle, Send, Clock, RefreshCw, MailOpen, Reply, Mail, Filter } from 'lucide-react';
import './_group.css';

export default function AnalyticsResponses() {
  const [innerTab, setInnerTab] = useState('responses');
  const ACTIVE_TAB = 'responses';

  const stats = [
    {
      icon: <Send size={20} />,
      iconClass: "bg-blue-50 text-blue-500",
      value: "47",
      label: "Gönderilen",
      trend: "▲ 8 bu hafta",
      trendClass: "text-emerald-500"
    },
    {
      icon: <CheckCircle size={20} />,
      iconClass: "bg-emerald-50 text-emerald-500",
      value: "19",
      label: "Yanıtlanan",
      trend: "40% yanıt oranı",
      trendClass: "text-slate-500"
    },
    {
      icon: <Clock size={20} />,
      iconClass: "bg-amber-50 text-amber-500",
      value: "28",
      label: "Yanıt Bekleyen",
      trend: "Ortalama 3.2 gün",
      trendClass: "text-slate-500"
    }
  ];

  const rows = [
    { id: "C-1042", name: "Ayşe Kaya", initials: "AK", color: "from-blue-500 to-indigo-500", role: "Sr. Frontend Eng.", date: "18 Mar", status: "email_opened" },
    { id: "C-1043", name: "Mehmet Demir", initials: "MD", color: "from-emerald-500 to-teal-500", role: "Ürün Yöneticisi", date: "17 Mar", status: "replied" },
    { id: "C-1044", name: "Zeynep Arslan", initials: "ZA", color: "from-purple-500 to-pink-500", role: "Backend Dev.", date: "16 Mar", status: "sent" },
    { id: "C-1045", name: "Can Öztürk", initials: "CÖ", color: "from-amber-500 to-orange-500", role: "UX Designer", date: "15 Mar", status: "email_opened" },
    { id: "C-1046", name: "Elif Şahin", initials: "EŞ", color: "from-rose-500 to-red-500", role: "Data Analyst", date: "14 Mar", status: "replied" },
    { id: "C-1047", name: "Burak Yıldız", initials: "BY", color: "from-cyan-500 to-blue-500", role: "DevOps Eng.", date: "13 Mar", status: "sent" },
    { id: "C-1048", name: "Selin Çelik", initials: "SÇ", color: "from-indigo-500 to-purple-500", role: "Frontend Dev.", date: "12 Mar", status: "email_opened" },
  ];

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'email_opened':
        return <span className="bg-blue-50 text-blue-600 border-blue-200 text-[10px] font-bold px-2.5 py-1 rounded-full border inline-flex items-center gap-1"><MailOpen size={12} /> Açıldı</span>;
      case 'replied':
        return <span className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[10px] font-bold px-2.5 py-1 rounded-full border inline-flex items-center gap-1"><Reply size={12} /> Yanıtladı</span>;
      case 'sent':
        return <span className="bg-slate-100 text-slate-500 border-slate-200 text-[10px] font-bold px-2.5 py-1 rounded-full border inline-flex items-center gap-1"><Mail size={12} /> Gönderildi</span>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Header */}
      <div className="h-12 bg-slate-900 flex items-center px-6 gap-3 shrink-0">
        <div className="w-6 h-6 rounded-md bg-cyan-500 flex items-center justify-center text-white text-[10px] font-black">TI</div>
        <span className="text-white font-bold text-sm">Talent-Inn</span>
      </div>
      
      {/* Sub-header with tabs */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Activity size={16} className="text-cyan-500" />
          <span className="font-black text-slate-900 text-sm tracking-tight">Stratejik Analitik</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-slate-400">Sistem Aktif</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Tabs pill */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {[
              ['overview','Genel Bakış','Activity'],
              ['acquisition','Edinme & Kaynak','Globe'],
              ['responses','Yanıt Takibi','MessageSquare']
            ].map(([id, label]) => (
              <span key={id} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${id === ACTIVE_TAB ? 'bg-white text-cyan-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                {label}
              </span>
            ))}
          </div>
          {/* Time range */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {['7G','30G'].map(r => (
              <span key={r} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${r === '7G' ? 'bg-white text-cyan-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-5 overflow-y-auto">
        <div className="flex flex-col gap-4 max-w-6xl mx-auto h-full">
          
          {/* TOP SUMMARY STATS ROW */}
          <div className="grid grid-cols-3 gap-4 shrink-0">
            {stats.map((stat, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                <div className={`${stat.iconClass} p-2.5 rounded-xl`}>
                  {stat.icon}
                </div>
                <div className="flex flex-col">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-900">{stat.value}</span>
                    <span className="text-[11px] text-slate-400 font-medium">{stat.label}</span>
                  </div>
                  <span className={`text-[10px] font-medium ${stat.trendClass}`}>{stat.trend}</span>
                </div>
              </div>
            ))}
          </div>

          {/* MAIN TABLE PANEL */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1 min-h-[400px]">
            {/* TABLE HEADER */}
            <div className="px-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex gap-0">
                <button 
                  onClick={() => setInnerTab('responses')}
                  className={`px-5 py-4 text-[11px] font-bold border-b-2 transition-all ${innerTab === 'responses' ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  Yanıt Takibi (19)
                </button>
                <button 
                  onClick={() => setInnerTab('drafts')}
                  className={`px-5 py-4 text-[11px] font-bold border-b-2 transition-all ${innerTab === 'drafts' ? 'border-amber-400 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  Taslaklar (28)
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input 
                    type="text" 
                    placeholder="Ara..." 
                    className="bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                  />
                </div>
                <button className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-500 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors">
                  <Filter size={14} />
                  <span>Filtre</span>
                </button>
              </div>
            </div>

            {/* TABLE */}
            <div className="w-full overflow-auto flex-1">
              <div className="min-w-[800px]">
                {/* THEAD */}
                <div className="bg-slate-50 sticky top-0 z-10">
                  <div className="grid grid-cols-[1.5fr_1.2fr_0.8fr_0.8fr_auto] gap-3 px-5 py-2.5 border-b border-slate-100">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ADAY</div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">POZİSYON</div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">TARİH</div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">DURUM</div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">AKSİYON</div>
                  </div>
                </div>

                {/* TBODY */}
                <div className="divide-y divide-slate-100">
                  {rows.map((row, i) => (
                    <div key={i} className="grid grid-cols-[1.5fr_1.2fr_0.8fr_0.8fr_auto] gap-3 px-5 py-3.5 items-center hover:bg-slate-50 transition-colors">
                      {/* Col 1 */}
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${row.color} flex items-center justify-center text-white text-[11px] font-black shrink-0 shadow-sm`}>
                          {row.initials}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-bold text-slate-800 truncate">{row.name}</span>
                          <span className="text-[10px] text-slate-400 truncate">{row.id}</span>
                        </div>
                      </div>

                      {/* Col 2 */}
                      <div className="text-[12px] font-medium text-slate-600 truncate pr-4">
                        {row.role}
                      </div>

                      {/* Col 3 */}
                      <div className="text-[11px] text-slate-400">
                        {row.date}
                      </div>

                      {/* Col 4 */}
                      <div>
                        {getStatusBadge(row.status)}
                      </div>

                      {/* Col 5 */}
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 hover:text-cyan-500 hover:border-cyan-200 transition-colors" title="Gmail Tara">
                          <Search size={14} />
                        </button>
                        <button className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-bold hover:bg-cyan-500 transition-colors shadow-sm">
                          İşle
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* TABLE FOOTER */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-400 font-medium">19 yanıt gösteriliyor</span>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
                <button className="hover:text-slate-800 transition-colors disabled:opacity-50" disabled>← Önceki</button>
                <button className="w-6 h-6 rounded-lg bg-white border border-slate-200 text-slate-800 flex items-center justify-center shadow-sm font-bold">1</button>
                <button className="hover:text-slate-800 transition-colors">Sonraki →</button>
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
