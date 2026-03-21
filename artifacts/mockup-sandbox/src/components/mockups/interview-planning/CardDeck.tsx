import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Calendar as CalendarIcon, 
  Clock, 
  Mail, 
  Play, 
  CalendarPlus, 
  Copy, 
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  User,
  Activity,
  Award
} from 'lucide-react';

// --- Mock Data ---

type Candidate = {
  id: string;
  name: string;
  role: string;
  score: number;
  status: string;
  interviews: number;
  email: string;
  lastActivity: string;
  pastScore: string;
  conflict?: boolean;
};

const CANDIDATES: Candidate[] = [
  {
    id: '1',
    name: 'Emre Demir',
    role: 'Senior Frontend Dev',
    score: 91,
    status: 'Mülakat Bekliyor',
    interviews: 1,
    email: 'emre.demir@example.com',
    lastActivity: '2 saat önce aktifti',
    pastScore: 'Teknik: 88/100',
    conflict: false,
  },
  {
    id: '2',
    name: 'Ayşe Kara',
    role: 'Product Designer',
    score: 87,
    status: 'Yeni',
    interviews: 0,
    email: 'ayse.kara@example.com',
    lastActivity: 'Dün aktifti',
    pastScore: '-',
    conflict: false,
  },
  {
    id: '3',
    name: 'Murat Şahin',
    role: 'Backend Engineer',
    score: 79,
    status: 'Mülakat Bekliyor',
    interviews: 2,
    email: 'murat.sahin@example.com',
    lastActivity: '3 saat önce aktifti',
    pastScore: 'IK: Başarılı',
    conflict: true,
  },
  {
    id: '4',
    name: 'Zeynep Arslan',
    role: 'UX Researcher',
    score: 84,
    status: 'Yeni',
    interviews: 0,
    email: 'zeynep.arslan@example.com',
    lastActivity: 'Bugün 09:15',
    pastScore: '-',
    conflict: false,
  },
  {
    id: '5',
    name: 'Can Özdemir',
    role: 'Full Stack Dev',
    score: 72,
    status: 'Mülakat Bekliyor',
    interviews: 1,
    email: 'can.ozdemir@example.com',
    lastActivity: '4 gün önce aktifti',
    pastScore: 'Teknik: 70/100',
    conflict: false,
  },
];

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'
];

const INTERVIEW_TYPES = ['TEKNİK', 'İK FİLTRE', 'PRODUCT'];

// --- Components ---

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const initials = name.split(' ').map(n => n[0]).join('');
  
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-xl',
    xl: 'w-20 h-20 text-2xl',
  };

  return (
    <div className={`rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center font-semibold text-slate-200 shadow-inner ${sizeClasses[size]}`}>
      {initials}
    </div>
  );
}

export function CardDeck() {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('1'); // Emre Demir selected
  const [selectedDate, setSelectedDate] = useState<string>('24 Mart 2024'); // 24 Mart selected
  const [selectedTime, setSelectedTime] = useState<string>('10:00'); // 10:00 selected
  const [selectedType, setSelectedType] = useState<string>('TEKNİK');
  const [linkCopied, setLinkCopied] = useState(false);

  const selectedCandidate = CANDIDATES.find(c => c.id === selectedCandidateId);

  const handleCopyLink = () => {
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 font-sans selection:bg-blue-500/30 overflow-hidden flex flex-col">
      
      {/* Header */}
      <div className="pt-8 px-8 pb-4 flex items-center justify-between z-10">
        <div>
          <h1 className="text-3xl font-light text-white tracking-tight flex items-center gap-3">
            Hazır Adaylar
            <span className="bg-blue-600/20 text-blue-400 text-sm font-medium px-3 py-1 rounded-full border border-blue-500/20">
              {CANDIDATES.length} Aday
            </span>
          </h1>
          <p className="text-slate-400 mt-2 text-sm">Planlama yapmak için bir aday kartı seçin.</p>
        </div>
      </div>

      {/* Card Deck Area */}
      <div className="relative w-full pt-4 pb-12 z-10">
        {/* Fading edges */}
        <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#0F172A] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#0F172A] to-transparent z-10 pointer-events-none" />
        
        <div className="flex overflow-x-auto gap-6 px-8 pb-8 pt-4 snap-x snap-mandatory scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {CANDIDATES.map((candidate) => {
            const isSelected = candidate.id === selectedCandidateId;
            return (
              <button
                key={candidate.id}
                onClick={() => setSelectedCandidateId(candidate.id)}
                className={`
                  relative flex-none snap-center transition-all duration-300 ease-out text-left group
                  ${isSelected ? 'scale-105 -translate-y-4 z-20' : 'hover:-translate-y-2 hover:shadow-xl opacity-70 hover:opacity-100 z-10'}
                `}
                style={{ width: '220px', height: '280px' }}
              >
                {/* Card Body */}
                <div className={`
                  w-full h-full rounded-2xl flex flex-col overflow-hidden relative
                  bg-gradient-to-br from-[#1e293b] to-[#0f172a]
                  border-2 transition-colors duration-300
                  ${isSelected ? 'border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)]' : 'border-slate-700 shadow-lg'}
                `}>
                  
                  {/* Selected Indicator */}
                  {isSelected && (
                    <div className="absolute top-3 right-3 bg-blue-500 rounded-full p-0.5 shadow-lg z-10">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                  )}

                  {/* Top Half (Avatar & Score) */}
                  <div className="flex-1 p-5 flex flex-col items-center justify-center relative">
                    <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    <Avatar name={candidate.name} size="xl" />
                    
                    <div className="mt-4 flex flex-col items-center">
                      <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">AI Eşleşme</span>
                      <span className={`text-3xl font-bold tracking-tight ${
                        candidate.score >= 90 ? 'text-emerald-400' : 
                        candidate.score >= 80 ? 'text-blue-400' : 'text-amber-400'
                      }`}>
                        %{candidate.score}
                      </span>
                    </div>
                  </div>

                  {/* Middle (Name & Role) */}
                  <div className="px-5 py-3 bg-slate-800/50 border-t border-slate-700/50 text-center">
                    <h3 className="font-semibold text-white truncate text-base">{candidate.name}</h3>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{candidate.role}</p>
                  </div>

                  {/* Bottom Strip */}
                  <div className="px-4 py-3 bg-slate-900/80 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider">
                    <span className={`px-2 py-1 rounded-full ${candidate.interviews > 0 ? 'bg-slate-800 text-slate-300' : 'bg-blue-900/30 text-blue-400'}`}>
                      {candidate.interviews > 0 ? `${candidate.interviews} Mülakat` : 'Yeni'}
                    </span>
                    <span className="text-slate-500">{candidate.status}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Inline Planning Form (Slides up when candidate is selected) */}
      <div className={`
        flex-1 bg-[#1e293b] border-t border-slate-700/50 rounded-t-[2.5rem] 
        transition-all duration-500 ease-in-out transform
        ${selectedCandidate ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}
      `}>
        {selectedCandidate && (
          <div className="h-full flex flex-col max-w-7xl mx-auto w-full p-8 md:p-10">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 h-full">
              
              {/* Left Column: Candidate Summary */}
              <div className="lg:col-span-4 flex flex-col space-y-8">
                <div>
                  <h2 className="text-2xl font-semibold text-white mb-1 flex items-center gap-3">
                    {selectedCandidate.name}
                    <span className="text-sm font-normal text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
                      {selectedCandidate.role}
                    </span>
                  </h2>
                  <p className="text-slate-400 text-sm flex items-center gap-2">
                    <Mail className="w-4 h-4" /> {selectedCandidate.email}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
                    <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-4">Aday Özeti</h3>
                    
                    <div className="space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="bg-slate-700/50 p-2 rounded-lg text-slate-300">
                          <Activity className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-400">Son Aktivite</p>
                          <p className="text-slate-200 font-medium">{selectedCandidate.lastActivity}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4">
                        <div className="bg-slate-700/50 p-2 rounded-lg text-slate-300">
                          <Award className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-400">Geçmiş Değerlendirme</p>
                          <p className="text-slate-200 font-medium">{selectedCandidate.pastScore}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="bg-slate-700/50 p-2 rounded-lg text-slate-300">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-400">Mülakat Durumu</p>
                          <p className="text-slate-200 font-medium">{selectedCandidate.status}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Join Link */}
                  <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
                    <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Katılım Linki</h3>
                    <div className="flex items-center gap-2">
                      <div className="bg-slate-900 px-4 py-2.5 rounded-xl text-sm text-slate-400 font-mono truncate flex-1 border border-slate-700">
                        meet.talent-inn.com/x/9a8b7c
                      </div>
                      <button 
                        onClick={handleCopyLink}
                        className="bg-slate-700 hover:bg-slate-600 text-white p-2.5 rounded-xl transition-colors shrink-0"
                        title="Linki Kopyala"
                      >
                        {linkCopied ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Planning Form */}
              <div className="lg:col-span-8 flex flex-col h-full">
                <div className="bg-slate-800/40 rounded-3xl border border-slate-700/50 p-8 flex-1 flex flex-col">
                  
                  {/* Header & Conflict Alert */}
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-medium text-white flex items-center gap-2">
                      <CalendarPlus className="w-6 h-6 text-blue-400" />
                      Mülakat Ayarla
                    </h3>
                    
                    {selectedTime === '10:00' && selectedCandidate.id === '3' && (
                      <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 animate-pulse">
                        <AlertTriangle className="w-4 h-4" />
                        Çakışma tespit edildi
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1">
                    {/* Date Selection */}
                    <div className="space-y-4">
                      <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4" />
                        Tarih
                      </label>
                      <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
                          <button className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                            <ChevronLeft className="w-5 h-5" />
                          </button>
                          <span className="font-medium text-slate-200">Mart 2024</span>
                          <button className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        </div>
                        {/* Fake Mini Calendar */}
                        <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
                          <span className="text-slate-500 font-medium">Pt</span>
                          <span className="text-slate-500 font-medium">Sa</span>
                          <span className="text-slate-500 font-medium">Ça</span>
                          <span className="text-slate-500 font-medium">Pe</span>
                          <span className="text-slate-500 font-medium">Cu</span>
                          <span className="text-slate-500 font-medium">Ct</span>
                          <span className="text-slate-500 font-medium">Pz</span>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {Array.from({length: 31}).map((_, i) => {
                            const date = i + 1;
                            const isSelected = selectedDate === `${date} Mart 2024`;
                            const isPast = date < 24;
                            return (
                              <button
                                key={date}
                                onClick={() => !isPast && setSelectedDate(`${date} Mart 2024`)}
                                disabled={isPast}
                                className={`
                                  aspect-square rounded-full flex items-center justify-center text-sm transition-all
                                  ${isSelected 
                                    ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/30' 
                                    : isPast 
                                      ? 'text-slate-600 cursor-not-allowed' 
                                      : 'text-slate-300 hover:bg-slate-800'}
                                `}
                              >
                                {date}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Interview Type */}
                      <div className="pt-4">
                        <label className="text-sm font-medium text-slate-400 block mb-3">Mülakat Tipi</label>
                        <div className="flex flex-wrap gap-2">
                          {INTERVIEW_TYPES.map(type => (
                            <button
                              key={type}
                              onClick={() => setSelectedType(type)}
                              className={`
                                px-4 py-2 rounded-xl text-sm font-medium transition-all
                                ${selectedType === type 
                                  ? 'bg-[#1E3A8A] text-white border border-blue-500/50' 
                                  : 'bg-slate-900/50 text-slate-400 border border-slate-700 hover:bg-slate-800'}
                              `}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Time Slots */}
                    <div className="space-y-4 flex flex-col h-full">
                      <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Saat ({selectedDate})
                      </label>
                      <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-4 flex-1 overflow-y-auto max-h-[320px] custom-scrollbar">
                        <div className="grid grid-cols-3 gap-3">
                          {TIME_SLOTS.map(time => {
                            const isSelected = selectedTime === time;
                            // Randomly disable some slots for realism, but keep 10:00 active
                            const isDisabled = time !== '10:00' && (parseInt(time) % 3 === 0); 
                            
                            return (
                              <button
                                key={time}
                                onClick={() => !isDisabled && setSelectedTime(time)}
                                disabled={isDisabled}
                                className={`
                                  py-3 px-2 rounded-xl text-sm font-medium transition-all text-center
                                  ${isSelected 
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 border-transparent' 
                                    : isDisabled
                                      ? 'bg-slate-800/30 text-slate-600 border border-slate-800 cursor-not-allowed'
                                      : 'bg-slate-800 text-slate-300 border border-slate-700 hover:border-slate-500 hover:bg-slate-700'}
                                `}
                              >
                                {time}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-8 pt-8 border-t border-slate-700/50 flex flex-wrap items-center justify-end gap-4">
                    <button className="px-6 py-3 rounded-xl font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      E-posta Gönder
                    </button>
                    
                    <button className="px-6 py-3 rounded-xl font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-2">
                      <Play className="w-4 h-4 fill-current" />
                      Şimdi Başlat
                    </button>
                    
                    <button className="px-8 py-3 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2 transform active:scale-95">
                      <CalendarPlus className="w-5 h-5" />
                      Mülakatı Planla
                    </button>
                  </div>

                </div>
              </div>
              
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(51, 65, 85, 0.5);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(71, 85, 105, 0.8);
        }
      `}} />
    </div>
  );
}
