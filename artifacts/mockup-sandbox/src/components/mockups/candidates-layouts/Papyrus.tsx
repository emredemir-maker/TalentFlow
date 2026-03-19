import React, { useState } from 'react';
import { Search, Brain, FileText, Video, BarChart2, Star, ShieldCheck, AlertCircle, Briefcase, Mail, MessageSquare, XCircle, ArrowRight } from 'lucide-react';

const candidates = [
  { id:1, name:"Ayşe Kaya", position:"Senior Frontend Dev", score:92, source:"LinkedIn", active:true },
  { id:2, name:"Mehmet Demir", position:"Backend Engineer", score:78, source:"Indeed", active:false },
  { id:3, name:"Zeynep Arslan", position:"UX Designer", score:85, source:"Referral", active:false },
  { id:4, name:"Can Yıldız", position:"DevOps Lead", score:61, source:"Manuel / PDF", active:false },
];

const starItems = [
  { k:"S", label:"DURUM (SITUATION)", bg:"#FEF9EC", border:"#FDE68A", text:"Büyük ölçekli SaaS ürününde kritik performans sorunu. Kullanıcı kaybı %18'e ulaşmıştı.", pos:"Problemi erken tespit etti", neg:"Başlangıçta kapsamı küçümsedi" },
  { k:"T", label:"GÖREV (TASK)", bg:"#FFF5EC", border:"#FED7AA", text:"Frontend mimarisini yeniden yapılandırmak ve TTI'ı 4.5s'dan 1.2s'a indirmek.", pos:"Hedefleri net tanımladı", neg:"Kaynak kısıtlarını göz ardı etti" },
  { k:"A", label:"EYLEM (ACTION)", bg:"#F9F3FF", border:"#E9D5FF", text:"React.lazy ve Redis önbellekleme kombinasyonu ile çözüm geliştirdi.", pos:"Proaktif teknik liderlik sergiledi", neg:"Ekip içi iletişim zayıf kaldı" },
  { k:"R", label:"SONUÇ (RESULT)", bg:"#F0FAF4", border:"#A7F3D0", text:"TTI %73 azaldı. NPS 6 puan arttı.", pos:"Ölçülebilir, somut başarı", neg:"Uzun vadeli bakım planı eksik" },
];

export function Papyrus() {
  const [activeTab, setActiveTab] = useState('star');
  const [activeCandidateId, setActiveCandidateId] = useState(1);

  const activeCandidate = candidates.find(c => c.id === activeCandidateId) || candidates[0];

  const TABS = [
    { id: 'star', label: 'STAR Analizi', icon: <Brain size={16} /> },
    { id: 'cv', label: 'CV & Uyum', icon: <FileText size={16} /> },
    { id: 'interviews', label: 'Mülakatlar', icon: <Video size={16} /> },
    { id: 'history', label: 'Süreç Geçmişi', icon: <BarChart2 size={16} /> },
  ];

  return (
    <div style={{ backgroundColor: '#FAF7F0', minHeight: '100vh', display: 'flex', fontFamily: 'Georgia, serif' }}>
      {/* LEFT PANEL */}
      <div style={{ width: '280px', backgroundColor: '#FDF9F2', borderRight: '1px solid #E8DDD0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 20px', borderBottom: '1px solid #E8DDD0' }}>
          <h1 style={{ fontStyle: 'italic', fontWeight: 'bold', fontSize: '24px', color: '#1C1309', margin: '0 0 16px 0' }}>Talent-Inn</h1>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#A8A29E' }} />
            <input 
              type="text" 
              placeholder="Aday Ara..." 
              style={{
                width: '100%',
                padding: '10px 10px 10px 36px',
                borderRadius: '6px',
                border: '1px solid #E8DDD0',
                backgroundColor: '#FFFFFF',
                fontFamily: 'Inter, sans-serif',
                fontSize: '13px',
                color: '#1C1309',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {candidates.map(candidate => {
            const isActive = candidate.id === activeCandidateId;
            return (
              <button
                key={candidate.id}
                onClick={() => setActiveCandidateId(candidate.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  backgroundColor: isActive ? '#FFF8EC' : '#FFFFFF',
                  border: '1px solid',
                  borderColor: isActive ? '#D97706' : '#E8DDD0',
                  borderLeftWidth: isActive ? '3px' : '1px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  boxShadow: isActive ? '0 2px 4px rgba(217,119,6,0.05)' : 'none'
                }}
                onMouseOver={(e) => {
                  if (!isActive) e.currentTarget.style.borderColor = '#B45309';
                }}
                onMouseOut={(e) => {
                  if (!isActive) e.currentTarget.style.borderColor = '#E8DDD0';
                }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', backgroundColor: '#E8DDD0', flexShrink: 0 }}>
                   <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${candidate.name}`} alt={candidate.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontWeight: 'bold', fontStyle: 'italic', fontSize: '15px', color: '#1C1309', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{candidate.name}</div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: '#78716C', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{candidate.position}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#FFFFFF' }}>
        <div style={{ padding: '32px 40px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8DDD0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', border: '1px solid #E8DDD0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${activeCandidate.name}`} alt={activeCandidate.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '32px', fontStyle: 'italic', fontWeight: 'bold', color: '#1C1309' }}>{activeCandidate.name}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#78716C', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Briefcase size={14} /> {activeCandidate.position}
                  </span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#78716C', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mail size={14} /> {activeCandidate.name.split(' ')[0].toLowerCase()}@example.com
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', backgroundColor: '#FEF9EC', color: '#D97706', padding: '4px 10px', borderRadius: '4px', border: '1px solid #FDE68A', fontWeight: '600' }}>
                    <Star size={10} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-top' }} /> {activeCandidate.source}
                  </span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', backgroundColor: '#F0FAF4', color: '#059669', padding: '4px 10px', borderRadius: '4px', border: '1px solid #A7F3D0', fontWeight: '600' }}>
                    <ShieldCheck size={10} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-top' }} /> Yetenek Havuzu
                  </span>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ textAlign: 'center', backgroundColor: '#FDF9F2', border: '1px solid #E8DDD0', padding: '16px 24px', borderRadius: '8px' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', color: '#78716C', marginBottom: '8px' }}>Uyum Skoru</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#D97706', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                  {activeCandidate.score} <span style={{ fontSize: '16px', color: '#A8A29E' }}>/ 100</span>
                </div>
              </div>
              <div style={{ textAlign: 'center', backgroundColor: '#FDF9F2', border: '1px solid #E8DDD0', padding: '16px 24px', borderRadius: '8px' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', color: '#78716C', marginBottom: '8px' }}>Aşama</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1C1309', fontStyle: 'italic', paddingTop: '4px' }}>
                  Teknik
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '32px', marginTop: '32px', borderBottom: '1px solid #E8DDD0', marginBottom: '-33px' }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '0 0 16px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontFamily: 'Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: '15px',
                    color: isActive ? '#D97706' : '#78716C',
                    background: 'none',
                    border: 'none',
                    borderBottom: isActive ? '3px solid #D97706' : '3px solid transparent',
                    cursor: 'pointer',
                    transition: 'color 0.2s ease',
                  }}
                  onMouseOver={(e) => { if (!isActive) e.currentTarget.style.color = '#B45309'; }}
                  onMouseOut={(e) => { if (!isActive) e.currentTarget.style.color = '#78716C'; }}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>
          {activeTab === 'star' && (
            <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {starItems.map((item, idx) => (
                <div key={idx} style={{ backgroundColor: item.bg, border: `1px solid ${item.border}`, borderRadius: '12px', padding: '24px', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ width: '40px', height: '40px', backgroundColor: '#FFFFFF', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${item.border}`, fontSize: '20px', fontWeight: 'bold', color: '#1C1309' }}>
                      {item.k}
                    </div>
                    <h3 style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '2px', color: '#1C1309', fontWeight: 'bold' }}>
                      {item.label}
                    </h3>
                  </div>
                  
                  <p style={{ margin: '0 0 20px 0', fontSize: '16px', lineHeight: '1.6', color: '#1C1309', fontStyle: 'italic' }}>
                    "{item.text}"
                  </p>
                  
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1, backgroundColor: '#FFFFFF', border: '1px solid #A7F3D0', borderRadius: '8px', padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'Inter, sans-serif', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#059669', marginBottom: '8px', fontWeight: 'bold' }}>
                        <ShieldCheck size={14} /> Pozitif Gösterge
                      </div>
                      <div style={{ fontSize: '14px', color: '#1C1309' }}>{item.pos}</div>
                    </div>
                    <div style={{ flex: 1, backgroundColor: '#FFFFFF', border: '1px solid #FECACA', borderRadius: '8px', padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'Inter, sans-serif', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#DC2626', marginBottom: '8px', fontWeight: 'bold' }}>
                        <AlertCircle size={14} /> Gelişim Alanı
                      </div>
                      <div style={{ fontSize: '14px', color: '#1C1309' }}>{item.neg}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab !== 'star' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#A8A29E', fontStyle: 'italic', fontSize: '18px' }}>
              Bu bölüm şu an geliştirme aşamasındadır.
            </div>
          )}
        </div>

        <div style={{ padding: '20px 40px', backgroundColor: '#FDF5E6', borderTop: '1px solid #E8DDD0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#FFFFFF', border: '1px solid #E8DDD0', borderRadius: '6px', fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 'bold', color: '#1C1309', cursor: 'pointer', transition: 'all 0.2s' }}>
              <MessageSquare size={16} /> Yorum Ekle
            </button>
            <button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#FFFFFF', border: '1px solid #FECACA', borderRadius: '6px', fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 'bold', color: '#DC2626', cursor: 'pointer', transition: 'all 0.2s' }}>
              <XCircle size={16} /> Reddet
            </button>
          </div>
          
          <button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', backgroundColor: '#D97706', border: 'none', borderRadius: '6px', fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 'bold', color: '#FFFFFF', cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#B45309'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#D97706'}>
            Final Turuna Taşı <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
