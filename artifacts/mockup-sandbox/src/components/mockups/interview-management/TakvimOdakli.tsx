import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  MoreVertical,
  Plus,
  Video,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';

export function TakvimOdakli() {
  const [selectedDate, setSelectedDate] = useState<number | null>(14);

  // Mock Data
  const stats = [
    { label: 'CANLI YAYIN', value: '2', color: 'text-emerald-500' },
    { label: 'BUGÜN', value: '5', color: 'text-[#0F172A]' },
    { label: 'BEKLEYEN', value: '12', color: 'text-amber-500' },
    { label: 'TOPLAM', value: '148', color: 'text-[#64748B]' },
  ];

  const interviews = [
    {
      id: 1,
      date: 14,
      time: '09:30',
      candidateName: 'Emre Demir',
      initials: 'ED',
      role: 'Senior Frontend Developer',
      score: 92,
      status: 'TAMAMLANDI',
      interviewer: 'Ayşe Kaya (İK)',
    },
    {
      id: 2,
      date: 14,
      time: '11:00',
      candidateName: 'Zeynep Yılmaz',
      initials: 'ZY',
      role: 'Product Designer',
      score: 88,
      status: 'CANLI',
      interviewer: 'Murat Şahin (Tasarım Lideri)',
    },
    {
      id: 3,
      date: 14,
      time: '14:30',
      candidateName: 'Can Özkan',
      initials: 'CÖ',
      role: 'Backend Engineer',
      score: 75,
      status: 'PLANLANDI',
      interviewer: 'Ali Yılmaz (Tech Lead)',
    },
    {
      id: 4,
      date: 15,
      time: '10:00',
      candidateName: 'Selin Yıldız',
      initials: 'SY',
      role: 'Marketing Manager',
      score: 85,
      status: 'PLANLANDI',
      interviewer: 'Ayşe Kaya (İK)',
    },
    {
      id: 5,
      date: 16,
      time: '13:00',
      candidateName: 'Burak Korkmaz',
      initials: 'BK',
      role: 'DevOps Engineer',
      score: 95,
      status: 'ERTELENDİ',
      interviewer: 'Ali Yılmaz (Tech Lead)',
    },
  ];

  const daysInMonth = 31;
  const startDayOfWeek = 4; // 0=Pzt, 1=Sal, 2=Çar, 3=Per (Thursday is 1st)
  
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'CANLI':
        return { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: <PlayCircle className="w-3.5 h-3.5" />, label: 'CANLI' };
      case 'PLANLANDI':
        return { bg: 'bg-blue-50', text: 'text-blue-600', icon: <Clock className="w-3.5 h-3.5" />, label: 'PLANLANDI' };
      case 'TAMAMLANDI':
        return { bg: 'bg-slate-100', text: 'text-slate-600', icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: 'TAMAMLANDI' };
      case 'ERTELENDİ':
        return { bg: 'bg-amber-50', text: 'text-amber-600', icon: <AlertCircle className="w-3.5 h-3.5" />, label: 'ERTELENDİ' };
      case 'İPTAL':
        return { bg: 'bg-red-50', text: 'text-red-600', icon: <XCircle className="w-3.5 h-3.5" />, label: 'İPTAL' };
      default:
        return { bg: 'bg-slate-100', text: 'text-slate-600', icon: null, label: status };
    }
  };

  const selectedDayInterviews = interviews.filter(i => i.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="min-h-screen bg-[#FAFAF8] font-inter text-[#0F172A] flex flex-col">
      {/* Top Bar */}
      <div className="px-10 py-8 flex items-end justify-between border-b border-[#E2E8F0]/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mülakat Yönetimi</h1>
          <p className="text-sm text-[#64748B] mt-1 font-medium">Aktif operasyonları ve geçmiş seansları yönetin.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Aday veya pozisyon ara..." 
              className="pl-9 pr-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] focus:border-transparent w-64 shadow-sm transition-all"
            />
          </div>
          <button className="flex items-center gap-2 bg-[#1E3A8A] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 transition-all shadow-md shadow-blue-900/10">
            <Plus className="w-4 h-4" /> Yeni Seans Planla
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Column - Calendar & Stats (~55%) */}
        <div className="w-[55%] border-r border-[#E2E8F0]/60 flex flex-col bg-white">
          
          {/* Stats Row */}
          <div className="px-10 py-8 grid grid-cols-4 gap-6 border-b border-[#E2E8F0]/40">
            {stats.map((stat, idx) => (
              <div key={idx} className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest">{stat.label}</span>
                <span className={`text-2xl font-semibold tracking-tight ${stat.color}`}>{stat.value}</span>
              </div>
            ))}
          </div>

          {/* Calendar Area */}
          <div className="flex-1 overflow-y-auto p-10">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-semibold tracking-tight">Ekim 2023</h2>
              <div className="flex items-center gap-2">
                <button className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-[#64748B] transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-[#64748B] transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-y-6 gap-x-2 text-center">
              {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(day => (
                <div key={day} className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider mb-2">{day}</div>
              ))}
              
              {Array.from({ length: startDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="h-14" />
              ))}
              
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isSelected = selectedDate === day;
                const isToday = day === 14;
                const hasInterviews = interviews.some(inv => inv.date === day);
                
                return (
                  <div key={day} className="flex flex-col items-center justify-start h-14">
                    <button
                      onClick={() => setSelectedDate(day)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all relative ${
                        isSelected 
                          ? 'bg-[#1E3A8A] text-white shadow-md shadow-blue-900/20' 
                          : isToday
                            ? 'text-[#1E3A8A] font-semibold bg-blue-50/50 hover:bg-blue-100/50'
                            : 'text-[#334155] hover:bg-slate-100'
                      }`}
                    >
                      {day}
                      {hasInterviews && !isSelected && (
                        <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-[#1E3A8A]" />
                      )}
                      {isToday && !isSelected && (
                        <span className="absolute bottom-0 w-4 h-[2px] rounded-full bg-[#1E3A8A]" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column - Day Details (~45%) */}
        <div className="w-[45%] flex flex-col bg-[#FAFAF8]">
          <div className="px-8 py-8 flex-1 overflow-y-auto">
            
            <div className="mb-8">
              <h3 className="text-sm font-bold text-[#94A3B8] uppercase tracking-wider mb-1">Seçili Gün</h3>
              <div className="text-2xl font-semibold tracking-tight text-[#0F172A] flex items-center gap-3">
                {selectedDate ? `${selectedDate} Ekim 2023` : 'Yaklaşan Mülakatlar'}
                {selectedDate === 14 && (
                  <span className="text-[10px] font-bold bg-blue-100 text-[#1E3A8A] px-2 py-0.5 rounded-full uppercase tracking-wider align-middle">Bugün</span>
                )}
              </div>
            </div>

            {selectedDayInterviews.length > 0 ? (
              <div className="space-y-6">
                {selectedDayInterviews.map(interview => {
                  const statusInfo = getStatusConfig(interview.status);
                  
                  return (
                    <div key={interview.id} className="flex group">
                      {/* Time Chip */}
                      <div className="w-16 pt-3 flex-shrink-0">
                        <span className="text-sm font-semibold text-[#64748B] group-hover:text-[#1E3A8A] transition-colors">{interview.time}</span>
                      </div>
                      
                      {/* Interview Card */}
                      <div className="flex-1 bg-white rounded-xl border border-[#E2E8F0] p-4 shadow-sm hover:shadow-md hover:border-[#CBD5E1] transition-all relative overflow-hidden">
                        {interview.status === 'CANLI' && (
                          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                        )}
                        
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                              interview.status === 'CANLI' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#F1F5F9] text-[#475569]'
                            }`}>
                              {interview.initials}
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-[#0F172A]">{interview.candidateName}</h4>
                              <p className="text-xs text-[#64748B]">{interview.role}</p>
                            </div>
                          </div>
                          
                          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide ${statusInfo.bg} ${statusInfo.text}`}>
                            {statusInfo.icon} {statusInfo.label}
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#F1F5F9]">
                          <div className="flex items-center gap-4 text-xs text-[#64748B]">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5" />
                              <span>{interview.interviewer}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-semibold text-slate-600">%{interview.score} UYUM</div>
                            </div>
                          </div>
                          
                          {interview.status === 'CANLI' ? (
                            <button className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors">
                              <Video className="w-3.5 h-3.5" /> Katıl
                            </button>
                          ) : (
                            <button className="w-6 h-6 flex items-center justify-center text-[#94A3B8] hover:bg-slate-100 hover:text-[#0F172A] rounded-md transition-colors">
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E2E8F0] border-dashed p-10 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <CalendarIcon className="w-5 h-5 text-[#94A3B8]" />
                </div>
                <h4 className="text-sm font-semibold text-[#0F172A] mb-1">Bu gün için planlanmış mülakat yok</h4>
                <p className="text-xs text-[#64748B] max-w-[200px] mb-6">Yeni bir mülakat planlayarak süreci başlatabilirsiniz.</p>
                <button className="text-sm font-semibold text-[#1E3A8A] hover:underline flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Yeni Planla
                </button>
              </div>
            )}
          </div>

          {/* Quick Plan Mini Form - Fixed at bottom of right column */}
          <div className="bg-white border-t border-[#E2E8F0] p-6 m-4 mt-0 rounded-2xl shadow-sm">
            <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-4 flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-[#1E3A8A]" /> Hızlı Planlama
            </h4>
            <div className="flex flex-col gap-3">
              <input 
                type="text" 
                placeholder="Aday adı veya e-posta" 
                className="w-full px-3 py-2 bg-slate-50 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
              />
              <div className="flex gap-2">
                <input 
                  type="time" 
                  defaultValue="10:00"
                  className="px-3 py-2 bg-slate-50 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#1E3A8A] w-28"
                />
                <select className="flex-1 px-3 py-2 bg-slate-50 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#1E3A8A] text-[#475569]">
                  <option>Teknik Mülakat</option>
                  <option>İK Görüşmesi</option>
                  <option>Final Görüşmesi</option>
                </select>
              </div>
              <button className="w-full bg-[#1E3A8A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 transition-colors mt-1">
                Planla
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
