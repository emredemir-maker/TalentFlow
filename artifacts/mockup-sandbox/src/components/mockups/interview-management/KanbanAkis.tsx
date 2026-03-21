import React, { useState } from 'react';
import { 
  Plus, 
  MoreHorizontal, 
  Calendar, 
  Clock, 
  User, 
  Video, 
  CheckCircle2, 
  AlertCircle,
  History,
  Star,
  Play,
  PlayCircle
} from 'lucide-react';

export function KanbanAkis() {
  const [columns] = useState([
    {
      id: 'live',
      title: 'CANLI',
      color: 'rose',
      bgClass: 'bg-rose-50',
      textClass: 'text-rose-700',
      borderClass: 'border-rose-200',
      accentClass: 'bg-rose-500',
      count: 2,
      cards: [
        {
          id: 1,
          candidate: 'Ali Yılmaz',
          initials: 'AY',
          role: 'Senior Frontend Dev',
          score: 94,
          date: 'Bugün',
          time: '14:00 - 15:00',
          interviewer: 'Ayşe K.',
          status: 'CANLI',
        },
        {
          id: 2,
          candidate: 'Zeynep Kaya',
          initials: 'ZK',
          role: 'Product Manager',
          score: 88,
          date: 'Bugün',
          time: '14:30 - 15:30',
          interviewer: 'Mehmet S.',
          status: 'CANLI',
        }
      ]
    },
    {
      id: 'today',
      title: 'BUGÜN',
      color: 'blue',
      bgClass: 'bg-blue-50',
      textClass: 'text-blue-700',
      borderClass: 'border-blue-200',
      accentClass: 'bg-blue-500',
      count: 3,
      cards: [
        {
          id: 3,
          candidate: 'Can Özdemir',
          initials: 'CÖ',
          role: 'Backend Engineer',
          score: 91,
          date: 'Bugün',
          time: '16:00 - 17:00',
          interviewer: 'Ayşe K.',
          status: 'PLANLANDI',
        },
        {
          id: 4,
          candidate: 'Deniz Şahin',
          initials: 'DŞ',
          role: 'UX Designer',
          score: 85,
          date: 'Bugün',
          time: '17:30 - 18:30',
          interviewer: 'Fatma Y.',
          status: 'PLANLANDI',
        },
        {
          id: 5,
          candidate: 'Emre Çelik',
          initials: 'EÇ',
          role: 'DevOps Engineer',
          score: 95,
          date: 'Bugün',
          time: '18:45 - 19:30',
          interviewer: 'Mehmet S.',
          status: 'PLANLANDI',
        }
      ]
    },
    {
      id: 'pending',
      title: 'BEKLEYEN',
      color: 'amber',
      bgClass: 'bg-amber-50',
      textClass: 'text-amber-700',
      borderClass: 'border-amber-200',
      accentClass: 'bg-amber-500',
      count: 4,
      cards: [
        {
          id: 6,
          candidate: 'Burak Demir',
          initials: 'BD',
          role: 'Data Scientist',
          score: 89,
          date: '12 Eki',
          time: '10:00 - 11:00',
          interviewer: 'Ali V.',
          status: 'PLANLANDI',
        },
        {
          id: 7,
          candidate: 'Selin Aydın',
          initials: 'SA',
          role: 'Mobile Dev (iOS)',
          score: 92,
          date: '13 Eki',
          time: '13:00 - 14:00',
          interviewer: 'Ayşe K.',
          status: 'PLANLANDI',
        },
        {
          id: 8,
          candidate: 'Gökhan Yıldız',
          initials: 'GY',
          role: 'Full Stack Dev',
          score: 81,
          date: '14 Eki',
          time: '09:30 - 10:30',
          interviewer: 'Mehmet S.',
          status: 'PLANLANDI',
        },
        {
          id: 9,
          candidate: 'Büşra Arslan',
          initials: 'BA',
          role: 'QA Engineer',
          score: 87,
          date: '14 Eki',
          time: '11:00 - 12:00',
          interviewer: 'Fatma Y.',
          status: 'PLANLANDI',
        }
      ]
    },
    {
      id: 'completed',
      title: 'TAMAMLANDI',
      color: 'emerald',
      bgClass: 'bg-emerald-50',
      textClass: 'text-emerald-700',
      borderClass: 'border-emerald-200',
      accentClass: 'bg-emerald-500',
      count: 2,
      cards: [
        {
          id: 10,
          candidate: 'Ozan Koç',
          initials: 'OK',
          role: 'Frontend Dev',
          score: 96,
          date: 'Dün',
          time: '11:00 - 12:00',
          interviewer: 'Ayşe K.',
          status: 'TAMAMLANDI',
        },
        {
          id: 11,
          candidate: 'Merve Tekin',
          initials: 'MT',
          role: 'HR Specialist',
          score: 83,
          date: 'Dün',
          time: '15:00 - 16:00',
          interviewer: 'Ali V.',
          status: 'TAMAMLANDI',
        }
      ]
    }
  ]);

  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] font-sans">
      
      {/* Top Header Area */}
      <div className="flex-none px-6 py-4 bg-white border-b border-[#E2E8F0] flex items-center justify-between shadow-sm z-10">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">Mülakat Yönetimi</h1>
          <p className="text-sm font-medium text-[#64748B] mt-0.5">Operasyonel Akış Tablosu</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm font-bold text-[#475569] hover:bg-slate-50 hover:text-[#0F172A] transition-colors flex items-center gap-2 shadow-sm">
            <History className="w-4 h-4" /> Geçmiş
          </button>
          <button className="px-4 py-2 bg-[#1E3A8A] border border-[#1E3A8A] rounded-lg text-sm font-bold text-white hover:bg-blue-800 transition-colors flex items-center gap-2 shadow-sm shadow-blue-900/20">
            <Plus className="w-4 h-4" /> Yeni Seans Başlat / Planla
          </button>
        </div>
      </div>

      {/* Kanban Board Area */}
      <div className="flex-1 overflow-x-auto p-6 flex gap-6 items-start">
        {columns.map((col) => (
          <div key={col.id} className="w-[320px] min-w-[320px] flex flex-col max-h-full">
            
            {/* Column Header */}
            <div className={`px-4 py-3 rounded-t-xl border border-b-0 ${col.borderClass} ${col.bgClass} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${col.accentClass}`} />
                <h2 className={`text-[13px] font-black uppercase tracking-wider ${col.textClass}`}>
                  {col.title}
                </h2>
              </div>
              <div className={`px-2 py-0.5 rounded-full text-xs font-black bg-white ${col.textClass} border ${col.borderClass} shadow-sm`}>
                {col.count}
              </div>
            </div>

            {/* Column Cards Container */}
            <div className={`flex-1 overflow-y-auto p-3 space-y-3 bg-[#F1F5F9]/50 border ${col.borderClass} rounded-b-xl backdrop-blur-sm shadow-inner`}>
              {col.cards.map((card) => (
                <div 
                  key={card.id} 
                  className={`bg-white rounded-xl p-4 shadow-sm border border-[#E2E8F0] border-l-4 hover:shadow-md transition-all cursor-pointer group`}
                  style={{ borderLeftColor: `var(--${col.color}-500, ${col.id === 'live' ? '#F43F5E' : col.id === 'today' ? '#3B82F6' : col.id === 'pending' ? '#F59E0B' : '#10B981'})` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black ${
                        col.id === 'live' ? 'bg-rose-100 text-rose-700' : 
                        col.id === 'today' ? 'bg-blue-100 text-blue-700' : 
                        col.id === 'pending' ? 'bg-amber-100 text-amber-700' : 
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {card.initials}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#0F172A] leading-tight group-hover:text-[#1E3A8A] transition-colors">{card.candidate}</h3>
                        <p className="text-xs font-medium text-[#64748B] mt-0.5">{card.role}</p>
                      </div>
                    </div>
                    <button className="text-[#CBD5E1] hover:text-[#64748B] p-1 rounded-md hover:bg-slate-50 transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[#475569] bg-slate-50 px-2 py-1.5 rounded-md">
                      <Calendar className="w-3.5 h-3.5 text-[#94A3B8]" />
                      {card.date}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[#475569] bg-slate-50 px-2 py-1.5 rounded-md">
                      <Clock className="w-3.5 h-3.5 text-[#94A3B8]" />
                      {card.time}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-[#F1F5F9]">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-[#1E3A8A] text-white flex items-center justify-center text-[9px] font-bold shadow-sm">
                        {card.interviewer.charAt(0)}
                      </div>
                      <span className="text-[11px] font-medium text-[#64748B]">{card.interviewer}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-[#F8FAFC] px-2 py-1 rounded-full border border-[#E2E8F0]">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      <span className="text-[11px] font-black text-[#0F172A]">%{card.score}</span>
                    </div>
                  </div>
                  
                  {col.id === 'live' && (
                    <div className="mt-3">
                      <button className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-rose-200">
                        <Video className="w-3.5 h-3.5" /> Katıl
                      </button>
                    </div>
                  )}
                  {col.id === 'today' && (
                    <div className="mt-3">
                      <button className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-blue-200">
                        <PlayCircle className="w-3.5 h-3.5" /> Şimdi Başlat
                      </button>
                    </div>
                  )}
                </div>
              ))}
              
              {col.cards.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-[#E2E8F0] rounded-xl bg-white/50">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                    <CheckCircle2 className="w-5 h-5 text-[#94A3B8]" />
                  </div>
                  <p className="text-xs font-bold text-[#64748B]">Bu alanda işlem yok</p>
                </div>
              )}
            </div>
            
          </div>
        ))}
        
        {/* Empty column area to ensure nice scrolling */}
        <div className="w-6 shrink-0" />
      </div>

    </div>
  );
}
