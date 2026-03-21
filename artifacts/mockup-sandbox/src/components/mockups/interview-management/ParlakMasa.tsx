import React, { useState } from 'react';
import {
  Video,
  Calendar,
  Clock,
  MoreVertical,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Plus,
  Filter,
  Users
} from 'lucide-react';

// --- MOCK DATA ---
const KPI_DATA = [
  { id: 'live', label: 'CANLI YAYIN', value: '2', color: 'text-rose-500', bg: 'bg-rose-50' },
  { id: 'today', label: 'BUGÜN', value: '14', color: 'text-blue-600', bg: 'bg-blue-50' },
  { id: 'pending', label: 'BEKLEYEN', value: '8', color: 'text-amber-500', bg: 'bg-amber-50' },
  { id: 'total', label: 'TOPLAM OPERASYON', value: '246', color: 'text-slate-700', bg: 'bg-slate-100' },
];

type SessionStatus = 'CANLI' | 'PLANLANDI' | 'TAMAMLANDI' | 'ERTELENDİ' | 'İPTAL';

interface Session {
  id: string;
  candidateName: string;
  initials: string;
  role: string;
  score: number;
  date: string;
  time: string;
  status: SessionStatus;
  interviewer: string;
}

const MOCK_SESSIONS: Session[] = [
  {
    id: '1',
    candidateName: 'Emre Demir',
    initials: 'ED',
    role: 'Senior Frontend Developer',
    score: 91,
    date: 'Bugün',
    time: '14:00 - 15:00',
    status: 'CANLI',
    interviewer: 'Ayşe Kaya (İK)',
  },
  {
    id: '2',
    candidateName: 'Zeynep Arslan',
    initials: 'ZA',
    role: 'Product Designer',
    score: 84,
    date: 'Bugün',
    time: '15:30 - 16:30',
    status: 'PLANLANDI',
    interviewer: 'Mehmet Yılmaz (Tasarım)',
  },
  {
    id: '3',
    candidateName: 'Can Özdemir',
    initials: 'CÖ',
    role: 'Full Stack Engineer',
    score: 72,
    date: 'Yarın',
    time: '10:00 - 11:00',
    status: 'PLANLANDI',
    interviewer: 'Ayşe Kaya (İK)',
  },
  {
    id: '4',
    candidateName: 'Murat Şahin',
    initials: 'MŞ',
    role: 'Backend Engineer',
    score: 88,
    date: 'Dün',
    time: '11:00 - 12:00',
    status: 'TAMAMLANDI',
    interviewer: 'Ali Veli (Mühendislik)',
  },
  {
    id: '5',
    candidateName: 'Elif Çelik',
    initials: 'EÇ',
    role: 'UX Researcher',
    score: 79,
    date: 'Dün',
    time: '16:00 - 17:00',
    status: 'İPTAL',
    interviewer: 'Mehmet Yılmaz (Tasarım)',
  },
  {
    id: '6',
    candidateName: 'Burak Yücel',
    initials: 'BY',
    role: 'DevOps Engineer',
    score: 85,
    date: '12 Mart',
    time: '09:00 - 10:00',
    status: 'ERTELENDİ',
    interviewer: 'Ali Veli (Mühendislik)',
  }
];

const STATUS_CONFIG = {
  'CANLI': { icon: Video, color: 'text-rose-600', bg: 'bg-rose-100', dot: 'bg-rose-500 animate-pulse' },
  'PLANLANDI': { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100', dot: 'bg-amber-500' },
  'TAMAMLANDI': { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100', dot: 'bg-emerald-500' },
  'ERTELENDİ': { icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-100', dot: 'bg-orange-500' },
  'İPTAL': { icon: XCircle, color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-500' },
};

export function ParlakMasa() {
  const [activeTab, setActiveTab] = useState<'AKTİF' | 'GEÇMİŞ'>('AKTİF');

  const filteredSessions = MOCK_SESSIONS.filter(session => {
    if (activeTab === 'AKTİF') {
      return ['CANLI', 'PLANLANDI', 'ERTELENDİ'].includes(session.status);
    }
    return ['TAMAMLANDI', 'İPTAL'].includes(session.status);
  });

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-inter text-[#0F172A]">
      {/* Header Area */}
      <div className="bg-white border-b border-[#E2E8F0] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-8 h-20 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#1E3A8A]">Mülakat Yönetimi</h1>
            <p className="text-[13px] font-medium text-[#64748B] mt-0.5">Tüm operasyonlarınızı tek bir yerden yönetin.</p>
          </div>
          <button className="flex items-center gap-2 bg-[#1E3A8A] text-white px-5 py-2.5 rounded-full font-bold text-[13px] hover:bg-[#1e3a8a]/90 transition-colors shadow-sm shadow-[#1E3A8A]/20 active:scale-95">
            <Plus className="w-4 h-4" />
            <span>Yeni Seans Başlat/Planla</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 flex flex-col gap-10">
        {/* KPI Strip */}
        <div className="flex gap-6">
          {KPI_DATA.map((kpi) => (
            <div key={kpi.id} className="flex-1 bg-white rounded-[24px] p-6 flex flex-col items-center justify-center border border-[#E2E8F0]/60 shadow-sm shadow-slate-200/50">
              <div className={`w-16 h-16 rounded-full ${kpi.bg} flex items-center justify-center mb-3`}>
                <span className={`text-3xl font-black tracking-tighter ${kpi.color}`}>
                  {kpi.value}
                </span>
              </div>
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-widest text-center">
                {kpi.label}
              </span>
            </div>
          ))}
        </div>

        {/* List Header / Controls */}
        <div className="flex items-center justify-between">
          {/* Tabs */}
          <div className="bg-[#E2E8F0]/50 p-1 rounded-full flex items-center inline-flex">
            <button
              onClick={() => setActiveTab('AKTİF')}
              className={`px-6 py-2 rounded-full text-[12px] font-bold tracking-wide transition-all ${
                activeTab === 'AKTİF'
                  ? 'bg-white text-[#1E3A8A] shadow-sm'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              AKTİF SEANSLAR
            </button>
            <button
              onClick={() => setActiveTab('GEÇMİŞ')}
              className={`px-6 py-2 rounded-full text-[12px] font-bold tracking-wide transition-all ${
                activeTab === 'GEÇMİŞ'
                  ? 'bg-white text-[#1E3A8A] shadow-sm'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              GEÇMİŞ SEANSLAR
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Aday veya pozisyon ara..."
                className="pl-9 pr-4 py-2.5 rounded-full border border-[#E2E8F0] bg-white text-[13px] font-medium text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/20 focus:border-[#1E3A8A] w-64 shadow-sm"
              />
            </div>
            <button className="w-10 h-10 bg-white border border-[#E2E8F0] rounded-full flex items-center justify-center text-[#64748B] hover:bg-slate-50 transition-colors shadow-sm">
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex flex-col gap-3 pb-20">
          {filteredSessions.map((session) => {
            const statusConf = STATUS_CONFIG[session.status];
            const StatusIcon = statusConf.icon;

            return (
              <div 
                key={session.id} 
                className="bg-white rounded-[20px] p-4 flex items-center gap-6 border border-[#E2E8F0]/80 shadow-sm hover:shadow-md transition-shadow group"
              >
                {/* Candidate Info */}
                <div className="flex items-center gap-4 w-[280px] shrink-0">
                  <div className="w-12 h-12 rounded-full bg-[#1E3A8A] text-white flex items-center justify-center font-black text-sm shadow-sm">
                    {session.initials}
                  </div>
                  <div>
                    <h3 className="text-[14px] font-bold text-[#0F172A] group-hover:text-[#1E3A8A] transition-colors">{session.candidateName}</h3>
                    <p className="text-[12px] font-medium text-[#64748B] truncate max-w-[180px]">{session.role}</p>
                  </div>
                </div>

                {/* Score */}
                <div className="flex flex-col items-center justify-center px-4 w-[80px] shrink-0 border-l border-[#F1F5F9]">
                  <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest mb-1">SKOR</span>
                  <div className="bg-[#F8FAFC] px-2 py-1 rounded-md text-[13px] font-black text-[#1E3A8A]">
                    %{session.score}
                  </div>
                </div>

                {/* Date & Time */}
                <div className="flex flex-col justify-center px-4 w-[160px] shrink-0 border-l border-[#F1F5F9]">
                  <div className="flex items-center gap-1.5 text-[#0F172A] mb-1">
                    <Calendar className="w-3.5 h-3.5 text-[#94A3B8]" />
                    <span className="text-[13px] font-bold">{session.date}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#64748B]">
                    <Clock className="w-3.5 h-3.5 text-[#94A3B8]" />
                    <span className="text-[12px] font-medium">{session.time}</span>
                  </div>
                </div>

                {/* Interviewer */}
                <div className="flex flex-col justify-center px-4 flex-1 border-l border-[#F1F5F9]">
                  <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest mb-1">MÜLAKATÇI</span>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#64748B]" />
                    <span className="text-[13px] font-medium text-[#334155] truncate">{session.interviewer}</span>
                  </div>
                </div>

                {/* Status */}
                <div className="w-[140px] shrink-0 flex justify-end">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${statusConf.bg} border border-white/50 shadow-sm`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${statusConf.color}`}>
                      {session.status}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pl-4 border-l border-[#F1F5F9] shrink-0">
                  {session.status === 'CANLI' && (
                    <button className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100 transition-colors shadow-sm">
                      <Play className="w-4 h-4 fill-current" />
                    </button>
                  )}
                  {session.status === 'PLANLANDI' && (
                    <button className="px-4 h-10 rounded-full bg-[#F8FAFC] text-[#1E3A8A] font-bold text-[12px] hover:bg-[#F1F5F9] transition-colors border border-[#E2E8F0]">
                      Yönet
                    </button>
                  )}
                  {['TAMAMLANDI', 'İPTAL', 'ERTELENDİ'].includes(session.status) && (
                    <button className="px-4 h-10 rounded-full bg-[#F8FAFC] text-[#64748B] font-bold text-[12px] hover:bg-[#F1F5F9] transition-colors border border-[#E2E8F0]">
                      Detaylar
                    </button>
                  )}
                  
                  <button className="w-10 h-10 rounded-full text-[#94A3B8] flex items-center justify-center hover:bg-slate-50 transition-colors">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
          
          {filteredSessions.length === 0 && (
             <div className="py-20 flex flex-col items-center justify-center text-center bg-white rounded-[24px] border border-dashed border-[#CBD5E1]">
              <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                <Search className="w-6 h-6 text-[#94A3B8]" />
              </div>
              <h3 className="text-[#0F172A] font-bold mb-1">Sonuç Bulunamadı</h3>
              <p className="text-[#64748B] text-[13px]">Bu kriterlere uygun mülakat kaydı bulunmuyor.</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ParlakMasa;
