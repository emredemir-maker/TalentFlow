import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

const candidates = [
  { id: "001", name: "AYŞE KAYA", position: "FRONTEND DEV", score: 92, active: true },
  { id: "002", name: "MEHMET DEMİR", position: "BACKEND ENG", score: 78, active: false },
  { id: "003", name: "ZEYNEP ARSLAN", position: "UX DESIGNER", score: 85, active: false },
  { id: "004", name: "CAN YILDIZ", position: "DEVOPS LEAD", score: 61, active: false },
];

const starItems = [
  { k: "S", label: "DURUM", text: "Büyük ölçekli SaaS ürününde kritik performans sorunu. Kullanıcı kaybı %18.", pos: "Erken teşhis", neg: "Kapsam küçümsendi" },
  { k: "T", label: "GÖREV", text: "Frontend yeniden yapılandırma. TTI hedefi: 4.5s → 1.2s.", pos: "Net hedef", neg: "Kaynak tahmini hatalı" },
  { k: "A", label: "EYLEM", text: "React.lazy + Intersection Observer + Redis. Dokümantasyon oluşturuldu.", pos: "Sistematik yaklaşım", neg: "İletişim eksikliği" },
  { k: "R", label: "SONUÇ", text: "TTI −73%. NPS +6. Churn durdu.", pos: "Kanıtlanabilir etki", neg: "Bakım planı eksik" },
];

export function Clinic() {
  const [activeTab, setActiveTab] = useState('star');
  const [activeCandidateId, setActiveCandidateId] = useState("001");

  const activeCandidate = candidates.find(c => c.id === activeCandidateId) || candidates[0];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#FFFFFF', color: '#111827', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Sol Panel */}
      <div style={{ width: '320px', backgroundColor: '#FAFAFA', borderRight: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 16px', borderBottom: '1px solid #E5E7EB' }}>
          <h1 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 600, margin: 0 }}>ADAYLAR</h1>
          <p style={{ fontFamily: '"Courier New", monospace', fontSize: '11px', color: '#6B7280', margin: '4px 0 0 0' }}>TOPLAM: {candidates.length}</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {candidates.map((c) => {
            const isActive = c.id === activeCandidateId;
            return (
              <div
                key={c.id}
                onClick={() => setActiveCandidateId(c.id)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #E5E7EB',
                  backgroundColor: isActive ? '#F9FAFB' : 'transparent',
                  borderLeft: isActive ? '2px solid #111827' : '2px solid transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'opacity 0.2s ease'
                }}
              >
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                    <span style={{ fontFamily: '"Courier New", monospace', fontSize: '12px', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {c.name}
                    </span>
                    <span style={{ flex: 1, borderBottom: '1px dotted #9CA3AF', margin: '0 8px', position: 'relative', top: '-4px' }}></span>
                    <span style={{ fontFamily: '"Courier New", monospace', fontSize: '14px', fontWeight: 600 }}>
                      {c.score.toString().padStart(3, '0')}
                    </span>
                  </div>
                  <span style={{ fontFamily: '"Courier New", monospace', fontSize: '10px', color: '#6B7280', marginTop: '4px' }}>
                    {c.position}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sağ Panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#FFFFFF' }}>
        {/* Header */}
        <div style={{ padding: '32px 48px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ fontSize: '24px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, margin: 0 }}>
                {activeCandidate.name}
              </h2>
              <span style={{ fontFamily: '"Courier New", monospace', fontSize: '12px', color: '#6B7280', backgroundColor: '#FAFAFA', padding: '2px 6px', border: '1px solid #E5E7EB' }}>
                ID_{activeCandidate.id}
              </span>
            </div>
            <p style={{ fontFamily: '"Courier New", monospace', fontSize: '12px', color: '#6B7280', margin: '8px 0 0 0', textTransform: 'uppercase' }}>
              {activeCandidate.position}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontFamily: '"Courier New", monospace', fontSize: '10px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>SKOR</span>
            <div style={{ fontFamily: '"Courier New", monospace', fontSize: '28px', fontWeight: 600, color: '#10B981', lineHeight: 1 }}>
              {activeCandidate.score.toString().padStart(3, '0')}
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', padding: '0 48px', borderBottom: '1px solid #E5E7EB' }}>
          {['star', 'cv_match', 'history'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                fontFamily: '"Courier New", monospace',
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: '3px',
                padding: '16px 24px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #111827' : '2px solid transparent',
                opacity: activeTab === tab ? 1 : 0.3,
                cursor: 'pointer',
                color: '#111827',
                fontWeight: 600,
                transition: 'opacity 0.2s ease'
              }}
            >
              {tab === 'star' ? 'STAR ANALİZİ' : tab === 'cv_match' ? 'CV & UYUM' : 'GEÇMİŞ'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '48px', overflowY: 'auto' }}>
          {activeTab === 'star' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
                <span style={{ fontFamily: '"Courier New", monospace', fontSize: '11px', color: '#6B7280' }}>DEĞERLENDİRME MATRİSİ</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={{ 
                    border: '1px solid #E5E7EB', 
                    background: '#FFFFFF', 
                    color: '#111827', 
                    padding: '8px 16px', 
                    fontFamily: '"Courier New", monospace', 
                    fontSize: '11px', 
                    fontWeight: 600, 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderRadius: 0
                  }}>
                    <X size={14} color="#EF4444" /> REDDET
                  </button>
                  <button style={{ 
                    border: '1px solid #111827', 
                    background: '#111827', 
                    color: '#FFFFFF', 
                    padding: '8px 16px', 
                    fontFamily: '"Courier New", monospace', 
                    fontSize: '11px', 
                    fontWeight: 600, 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderRadius: 0
                  }}>
                    ONAYLA <Check size={14} color="#10B981" />
                  </button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #111827' }}>
                {starItems.map((item, index) => (
                  <div key={item.k} style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', padding: '16px 0' }}>
                    <div style={{ width: '48px', fontFamily: '"Courier New", monospace', fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                      {item.k}
                    </div>
                    <div style={{ flex: 2, paddingRight: '24px' }}>
                      <div style={{ fontFamily: '"Courier New", monospace', fontSize: '10px', color: '#6B7280', marginBottom: '8px' }}>{item.label}</div>
                      <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#111827' }}>{item.text}</div>
                    </div>
                    <div style={{ flex: 1, borderLeft: '1px solid #E5E7EB', paddingLeft: '24px' }}>
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontFamily: '"Courier New", monospace', fontSize: '10px', color: '#10B981', marginBottom: '4px' }}>[+] POZİTİF</div>
                        <div style={{ fontSize: '12px', color: '#111827' }}>{item.pos}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: '"Courier New", monospace', fontSize: '10px', color: '#EF4444', marginBottom: '4px' }}>[-] NEGATİF</div>
                        <div style={{ fontSize: '12px', color: '#111827' }}>{item.neg}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab !== 'star' && (
             <div style={{ fontFamily: '"Courier New", monospace', fontSize: '12px', color: '#9CA3AF' }}>
               VERİ BEKLENİYOR...
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
