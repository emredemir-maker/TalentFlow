import React, { useState } from 'react';
import {
  Search,
  User,
  Plus,
  Link2,
  Zap,
  Target,
  Mail,
  Brain,
  FileText,
  Video,
  BarChart2,
  ShieldCheck,
  AlertCircle,
  MessageSquare,
  XCircle,
  ArrowRight
} from 'lucide-react';

const mockCandidates = [
  { id: 1, name: "AYŞE KAYA", position: "Senior Frontend Dev", score: 92, source: "LinkedIn", active: true, email: "ayse.kaya@example.com" },
  { id: 2, name: "MEHMET DEMİR", position: "Backend Engineer", score: 78, source: "Indeed", active: false, email: "mehmet.d@example.com" },
  { id: 3, name: "ZEYNEP ARSLAN", position: "UX Designer", score: 85, source: "Referral", active: false, email: "z.arslan@example.com" },
  { id: 4, name: "CAN YILDIZ", position: "DevOps Lead", score: 61, source: "PDF", active: false, email: "can.yildiz@example.com" },
];

const starItems = [
  { k: "S", label: "DURUM", color: "#06B6D4", text: "Büyük ölçekli SaaS ürününde kritik performans sorunu. Kullanıcı kaybı %18'e ulaşmıştı.", pos: "Problemi erken tespit etti", neg: "Başlangıçta kapsamı küçümsedi" },
  { k: "T", label: "GÖREV", color: "#8B5CF6", text: "Frontend mimarisini yeniden yapılandırmak ve TTI'ı 4.5s'dan 1.2s'a indirmek.", pos: "Hedefleri net tanımladı", neg: "Kaynak kısıtlarını göz ardı etti" },
  { k: "A", label: "EYLEM", color: "#10B981", text: "React.lazy, Intersection Observer ve Redis önbellekleme ile çözüm geliştirdi.", pos: "Proaktif teknik liderlik", neg: "Ekip içi iletişim yetersizdi" },
  { k: "R", label: "SONUÇ", color: "#F59E0B", text: "TTI %73 azaldı. NPS 6 puan arttı, kullanıcı kaybı durdu.", pos: "Ölçülebilir başarı sağladı", neg: "Uzun vadeli bakım planı eksik" },
];

const TABS = [
  { id: 'star', label: 'STAR Analizi', icon: <Brain className="w-3.5 h-3.5" /> },
  { id: 'cv_match', label: 'CV & Uyum', icon: <FileText className="w-3.5 h-3.5" /> },
  { id: 'sessions', label: 'Mülakatlar', icon: <Video className="w-3.5 h-3.5" /> },
  { id: 'history', label: 'Süreç Geçmişi', icon: <BarChart2 className="w-3.5 h-3.5" /> },
];

export function ObsidianIntelligence() {
  const [activeTab, setActiveTab] = useState('star');
  const [activeCandidateId, setActiveCandidateId] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  const candidates = mockCandidates;
  const candidate = candidates.find(c => c.id === activeCandidateId) || candidates[0];

  const filteredCandidates = candidates.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.position.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col font-sans overflow-hidden" style={{ backgroundColor: '#0A0F1E', color: '#F1F5F9' }}>
      
      {/* ── HEADER ───────────────────────────────────────────────────────────── */}
      <header className="h-14 flex items-center justify-between px-6 shrink-0 border-b" style={{ backgroundColor: '#0D1526', borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded border flex items-center justify-center" style={{ backgroundColor: '#0F2340', borderColor: 'rgba(6,182,212,0.3)' }}>
            <Zap className="w-4 h-4" style={{ color: '#06B6D4' }} />
          </div>
          <div>
            <h1 className="text-[14px] font-bold tracking-tight text-white">TALENT-INN INTEL</h1>
            <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: '#64748B', fontFamily: "'Courier New', monospace" }}>{candidates.length} ADAY • AKTİF SÜREÇ</p>
          </div>
        </div>
        <button className="h-8 px-4 text-white rounded text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all" style={{ backgroundColor: '#06B6D4', boxShadow: '0 0 12px rgba(6,182,212,0.4)' }}>
          <Plus className="w-3.5 h-3.5" /> Yeni Aday
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT PANEL ──────────────────────────────────────────────────────── */}
        <aside className="w-[280px] shrink-0 flex flex-col border-r relative" style={{ backgroundColor: '#0D1526', borderColor: 'rgba(255,255,255,0.07)' }}>
          {/* Subtle grid texture */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

          {/* Search */}
          <div className="p-4 border-b relative z-10" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#64748B' }} />
              <input
                type="text"
                placeholder="Aday veya rol ara..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full rounded-md py-2.5 pl-9 pr-3 text-[12px] font-medium outline-none transition-all"
                style={{ backgroundColor: '#111827', color: '#F1F5F9', border: '1px solid rgba(255,255,255,0.1)', fontFamily: "'Courier New', monospace" }}
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 relative z-10 custom-scrollbar">
            {filteredCandidates.map(c => {
              const isActive = c.id === activeCandidateId;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCandidateId(c.id)}
                  className="w-full text-left rounded-md border p-3 flex items-center gap-3 transition-all"
                  style={{
                    backgroundColor: isActive ? '#0F2340' : '#111827',
                    borderColor: isActive ? '#06B6D4' : 'rgba(255,255,255,0.07)',
                    borderLeftWidth: isActive ? '2px' : '1px'
                  }}
                >
                  <div className="w-9 h-9 rounded overflow-hidden shrink-0 border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${c.name}&backgroundColor=0D1526`} className="w-full h-full object-cover" alt="" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-white truncate leading-tight">{c.name}</p>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded mt-1 inline-flex items-center gap-1 uppercase"
                      style={{ color: '#64748B', backgroundColor: 'rgba(255,255,255,0.05)', fontFamily: "'Courier New', monospace" }}
                    >
                      <Link2 className="w-2.5 h-2.5" /> {c.source}
                    </span>
                  </div>
                  <div className="shrink-0 text-right flex flex-col items-end">
                    <span className="text-[12px] font-black" style={{ color: isActive ? '#06B6D4' : '#F1F5F9', textShadow: isActive ? '0 0 8px rgba(6,182,212,0.5)' : 'none' }}>%{c.score}</span>
                    <Zap className="w-3 h-3 mt-1" style={{ color: c.score >= 80 ? '#10B981' : '#F59E0B' }} />
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── RIGHT PANEL ─────────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col relative" style={{ backgroundColor: '#0D1526' }}>
          
          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col m-5 rounded-lg border" style={{ backgroundColor: '#111827', borderColor: 'rgba(255,255,255,0.07)' }}>
            
            {/* Candidate Header */}
            <div className="px-6 py-6 border-b flex items-start justify-between relative overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'linear-gradient(to right, #0F172A, #0D1526)' }}>
              
              <div className="flex items-center gap-5 relative z-10">
                <div className="w-16 h-16 rounded-md border-2 overflow-hidden shrink-0" style={{ borderColor: 'rgba(6,182,212,0.5)', boxShadow: '0 0 15px rgba(6,182,212,0.2)' }}>
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${candidate.name}&backgroundColor=0D1526`} className="w-full h-full object-cover" alt="" />
                </div>
                <div>
                  <h2 className="text-[20px] font-black text-white tracking-tight leading-none uppercase">{candidate.name}</h2>
                  <p className="text-[12px] font-bold mt-1.5 uppercase tracking-widest" style={{ color: '#64748B', fontFamily: "'Courier New', monospace" }}>{candidate.position}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded flex items-center gap-1.5 uppercase" style={{ color: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      <Target className="w-3 h-3" /> İlk %2
                    </span>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded flex items-center gap-1.5 uppercase" style={{ color: '#06B6D4', backgroundColor: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', boxShadow: '0 0 10px rgba(6,182,212,0.2)' }}>
                      <Zap className="w-3 h-3" /> %{candidate.score} Uyum
                    </span>
                    <span className="text-[10px] font-medium flex items-center gap-1.5" style={{ color: '#64748B' }}>
                      <Mail className="w-3 h-3" /> {candidate.email}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stat pills */}
              <div className="flex items-center gap-3 relative z-10">
                <div className="flex flex-col items-center rounded-md px-5 py-3 border" style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }}>
                  <span className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: '#64748B', fontFamily: "'Courier New', monospace" }}>STAR Güveni</span>
                  <span className="text-[20px] font-black leading-none text-white">{Math.round(candidate.score * 0.98)}%</span>
                </div>
                <div className="flex flex-col items-center rounded-md px-5 py-3 border" style={{ backgroundColor: '#0F2340', borderColor: '#06B6D4', boxShadow: '0 0 15px rgba(6,182,212,0.3)' }}>
                  <span className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: '#06B6D4', fontFamily: "'Courier New', monospace" }}>Uyum Skoru</span>
                  <span className="text-[20px] font-black leading-none text-white">{candidate.score > 80 ? 'GÜÇLÜ' : 'ORTA'}</span>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b px-6" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-2 py-4 px-2 mr-6 text-[11px] font-bold uppercase tracking-widest relative transition-colors"
                  style={{ color: activeTab === tab.id ? '#06B6D4' : '#64748B' }}
                >
                  {tab.icon} {tab.label}
                  {activeTab === tab.id && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full" style={{ backgroundColor: '#06B6D4', boxShadow: '0 -2px 10px rgba(6,182,212,0.8)' }} />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              
              {activeTab === 'star' && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1.5 h-5 rounded-full" style={{ backgroundColor: '#06B6D4', boxShadow: '0 0 8px rgba(6,182,212,0.5)' }} />
                    <h3 className="text-[12px] font-bold uppercase tracking-widest text-white" style={{ fontFamily: "'Courier New', monospace" }}>Sistem Analizi // STAR Metodolojisi</h3>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {starItems.map((step, idx) => (
                      <div key={idx} className="rounded-md border p-5 relative overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)', borderLeftWidth: '4px', borderLeftColor: step.color }}>
                        <div className="absolute top-0 right-0 p-4 opacity-10 font-black text-6xl pointer-events-none" style={{ color: step.color }}>{step.k}</div>
                        
                        <div className="flex items-center gap-3 mb-3 relative z-10">
                          <div className="w-8 h-8 rounded border flex items-center justify-center text-[14px] font-black shadow-sm" style={{ backgroundColor: `${step.color}15`, borderColor: `${step.color}30`, color: step.color }}>{step.k}</div>
                          <h4 className="text-[12px] font-bold uppercase tracking-widest" style={{ color: step.color, fontFamily: "'Courier New', monospace" }}>{step.label}</h4>
                        </div>
                        
                        <p className="text-[13px] leading-relaxed mb-4 relative z-10" style={{ color: '#F1F5F9' }}>{step.text}</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                          <div className="p-3 rounded border" style={{ backgroundColor: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.1)' }}>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase mb-2" style={{ color: '#10B981', fontFamily: "'Courier New', monospace" }}>
                              <ShieldCheck className="w-3.5 h-3.5" /> Pozitif Sinyal
                            </div>
                            <p className="text-[12px]" style={{ color: '#94A3B8' }}>{step.pos}</p>
                          </div>
                          
                          <div className="p-3 rounded border" style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.1)' }}>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase mb-2" style={{ color: '#EF4444', fontFamily: "'Courier New', monospace" }}>
                              <AlertCircle className="w-3.5 h-3.5" /> Gelişim Alanı
                            </div>
                            <p className="text-[12px]" style={{ color: '#94A3B8' }}>{step.neg}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab !== 'star' && (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <Brain className="w-12 h-12 mb-4 opacity-20" style={{ color: '#06B6D4' }} />
                  <p className="text-[14px] font-bold uppercase tracking-widest text-white mb-2">Veri Bekleniyor</p>
                  <p className="text-[12px]" style={{ color: '#64748B', fontFamily: "'Courier New', monospace" }}>[SİSTEM_UYARISI]: Bu modül henüz analiz edilmedi.</p>
                </div>
              )}

            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t flex items-center justify-between" style={{ backgroundColor: '#0D1526', borderColor: 'rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 px-4 py-2 rounded text-[11px] font-bold uppercase tracking-wider transition-colors border" style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color: '#F1F5F9' }}>
                  <MessageSquare className="w-3.5 h-3.5" /> Yorum Ekle
                </button>
                <button className="flex items-center gap-2 px-4 py-2 rounded text-[11px] font-bold uppercase tracking-wider transition-colors border" style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)', color: '#EF4444' }}>
                  <XCircle className="w-3.5 h-3.5" /> Süreci Sonlandır
                </button>
              </div>
              <button className="flex items-center gap-2 px-6 py-2 rounded text-[11px] font-black uppercase tracking-wider transition-all" style={{ backgroundColor: '#06B6D4', color: '#000000', boxShadow: '0 0 15px rgba(6,182,212,0.4)' }}>
                Final Turuna Taşı <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
