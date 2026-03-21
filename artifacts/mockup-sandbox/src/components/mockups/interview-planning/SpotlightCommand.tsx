import React, { useState } from 'react';
import { 
  Search, 
  Calendar, 
  Clock, 
  User, 
  CheckCircle2, 
  XCircle, 
  ChevronRight, 
  Mail, 
  Play, 
  Copy,
  Command,
  MonitorPlay,
  Briefcase,
  Users,
  Sparkles
} from 'lucide-react';

// --- Mock Data ---

const CANDIDATES = [
  { id: '1', name: 'Emre Demir', role: 'Senior Frontend Dev', score: 91, avatar: 'ED' },
  { id: '2', name: 'Ayşe Kara', role: 'Product Designer', score: 87, avatar: 'AK' },
  { id: '3', name: 'Murat Şahin', role: 'Backend Engineer', score: 79, avatar: 'MŞ' },
  { id: '4', name: 'Zeynep Arslan', role: 'UX Researcher', score: 84, avatar: 'ZA' },
  { id: '5', name: 'Can Özdemir', role: 'Full Stack Dev', score: 72, avatar: 'CÖ' },
];

const DAYS = [
  { id: 'mon', date: '20 Mart Pzt' },
  { id: 'tue', date: '21 Mart Sal' },
  { id: 'wed', date: '22 Mart Çar' },
  { id: 'thu', date: '23 Mart Per' },
  { id: 'fri', date: '24 Mart Cum' },
];

const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', 
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
];

// Mock availability (0: unavailable, 1: available)
const AVAILABILITY: Record<string, Record<string, number>> = {
  '14:00': { mon: 1, tue: 0, wed: 1, thu: 1, fri: 0 },
  '14:30': { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1 },
  // ... we'll just generate this dynamically for the visual
};

const getAvailability = (time: string, day: string) => {
  if (time === '14:00' && day === 'thu') return 1; // Explicitly available for selected
  if (time === '10:00' && day === 'tue') return 0; // Some conflicts
  if (time === '15:30' && day === 'wed') return 0;
  if (time === '09:30' && day === 'fri') return 0;
  if (time === '13:00' && day === 'thu') return 0;
  
  // Randomize a bit based on string hash for deterministic visual
  const hash = time.charCodeAt(0) + day.charCodeAt(0);
  return hash % 5 === 0 ? 0 : 1;
};

// --- Components ---

function Badge({ children, variant = 'default', className = '' }: { children: React.ReactNode, variant?: 'default' | 'success' | 'warning' | 'danger', className?: string }) {
  const variants = {
    default: 'bg-slate-800 text-slate-300 border border-slate-700',
    success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    danger: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}

function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'outline' }) {
  const base = "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-900/20",
    secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700",
    ghost: "text-slate-300 hover:bg-slate-800/50 hover:text-slate-100",
    outline: "border border-slate-700 bg-transparent hover:bg-slate-800 text-slate-300",
  };
  return (
    <button className={`${base} ${variants[variant]} px-4 py-2 ${className}`} {...props}>
      {children}
    </button>
  );
}

export function SpotlightCommand() {
  const [searchQuery, setSearchQuery] = useState('Emre');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>('1'); // Emre Demir
  const [selectedDay, setSelectedDay] = useState<string | null>('thu'); // 23 Mart Perşembe
  const [selectedTime, setSelectedTime] = useState<string | null>('14:00');
  const [interviewType, setInterviewType] = useState<'TEKNIK' | 'IK' | 'PRODUCT'>('TEKNIK');
  const [isCopied, setIsCopied] = useState(false);

  const selectedCandidate = CANDIDATES.find(c => c.id === selectedCandidateId);
  const selectedDayObj = DAYS.find(d => d.id === selectedDay);

  const handleCopyLink = () => {
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-slate-200 font-sans flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden selection:bg-blue-500/30">
      {/* Background Effects */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
      
      {/* Spotlight Command Palette */}
      <div className="w-full max-w-4xl bg-[#0F172A]/80 backdrop-blur-xl border border-slate-800/60 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[90vh] ring-1 ring-white/5">
        
        {/* Header / Search */}
        <div className="p-4 border-b border-slate-800/60 flex items-center gap-3 bg-slate-900/40">
          <Search className="w-5 h-5 text-slate-400" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Aday ara veya komut yaz..." 
            className="flex-1 bg-transparent border-none outline-none text-lg text-slate-100 placeholder:text-slate-500 font-medium"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/80 border border-slate-700/50 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              <Command className="w-3 h-3" /> K
            </kbd>
          </div>
        </div>

        {/* Selected Context Chip */}
        {(selectedCandidate || (selectedDay && selectedTime)) && (
          <div className="px-4 py-2 bg-[#1E293B]/50 border-b border-slate-800/60 flex items-center justify-between text-sm backdrop-blur-md">
            <div className="flex items-center gap-4">
              {selectedCandidate && (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold border border-blue-500/30">
                    {selectedCandidate.avatar}
                  </div>
                  <span className="font-medium text-slate-200">{selectedCandidate.name}</span>
                  <Badge variant="success" className="scale-90 origin-left flex gap-1 items-center">
                    <Sparkles className="w-3 h-3" />
                    %{selectedCandidate.score}
                  </Badge>
                </div>
              )}
              
              {selectedCandidate && selectedDay && <div className="w-px h-4 bg-slate-700" />}

              {selectedDay && selectedTime && (
                <div className="flex items-center gap-2 text-blue-400 font-medium bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                  <Calendar className="w-3.5 h-3.5" />
                  {selectedDayObj?.date} • {selectedTime}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={() => {}} className="text-slate-500 hover:text-slate-300 transition-colors">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar flex flex-col gap-8">
          
          {/* Candidate Results (Compact) - if we were actively searching */}
          {/* Since we have one selected, we might show it prominently or just focus on the calendar. We'll show the selected candidate card. */}
          
          {selectedCandidate && (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              
              {/* Grid Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Zaman Slotu Seçimi
                  </h3>
                  
                  {/* Conflict Warning Example */}
                  {selectedTime === '14:00' && selectedDay === 'thu' && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                      Çakışma: İK Toplantısı (14:00 - 15:00)
                    </div>
                  )}
                </div>

                <div className="bg-[#111827]/80 rounded-xl border border-slate-800/80 overflow-hidden">
                  <div className="grid grid-cols-6 border-b border-slate-800/60 bg-slate-900/50">
                    <div className="p-3 text-xs font-medium text-slate-500 flex items-center justify-center border-r border-slate-800/60">
                      Saat
                    </div>
                    {DAYS.map(day => (
                      <div key={day.id} className={`p-3 text-center text-xs font-medium border-r border-slate-800/60 last:border-0 ${selectedDay === day.id ? 'bg-blue-900/20 text-blue-400' : 'text-slate-400'}`}>
                        {day.date.split(' ')[0]} <br/>
                        <span className="text-[10px] opacity-70">{day.date.split(' ')[1]} {day.date.split(' ')[2]}</span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="max-h-[300px] overflow-y-auto custom-scrollbar relative">
                    {TIME_SLOTS.map((time, rowIdx) => (
                      <div key={time} className="grid grid-cols-6 border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20 transition-colors">
                        <div className="p-2 text-xs text-slate-500 flex items-center justify-center border-r border-slate-800/60 bg-slate-900/20">
                          {time}
                        </div>
                        {DAYS.map(day => {
                          const isAvailable = getAvailability(time, day.id);
                          const isSelected = selectedDay === day.id && selectedTime === time;
                          
                          return (
                            <div 
                              key={`${day.id}-${time}`} 
                              onClick={() => { setSelectedDay(day.id); setSelectedTime(time); }}
                              className={`
                                p-1 border-r border-slate-800/40 last:border-0 relative cursor-pointer group
                                ${isSelected ? 'bg-blue-600/10' : ''}
                              `}
                            >
                              <div className={`
                                w-full h-8 rounded flex items-center justify-center text-xs transition-all
                                ${isSelected 
                                  ? 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)] text-white border border-blue-400 ring-1 ring-blue-500 glow' 
                                  : isAvailable 
                                    ? 'bg-emerald-500/10 text-emerald-500/70 group-hover:bg-emerald-500/20 border border-transparent' 
                                    : 'bg-slate-800/30 text-slate-700 pointer-events-none'
                                }
                              `}>
                                {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer Area */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-lg">
          
          {/* Interview Type Selection */}
          <div className="flex items-center gap-1 bg-[#0F172A] p-1 rounded-lg border border-slate-800">
            {[
              { id: 'TEKNIK', label: 'Teknik', icon: MonitorPlay },
              { id: 'IK', label: 'İK Filtre', icon: Users },
              { id: 'PRODUCT', label: 'Product', icon: Briefcase }
            ].map(type => (
              <button
                key={type.id}
                onClick={() => setInterviewType(type.id as any)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                  ${interviewType === type.id 
                    ? 'bg-slate-800 text-blue-400 shadow-sm border border-slate-700/50' 
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                  }
                `}
              >
                <type.icon className="w-3.5 h-3.5" />
                {type.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            
            <div className="flex items-center gap-2 mr-2">
              <button 
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors bg-slate-800/50 hover:bg-slate-800 px-2.5 py-1.5 rounded-md border border-slate-700/50"
                title="Aday katılım linkini kopyala"
              >
                {isCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isCopied ? 'Kopyalandı' : 'Link'}</span>
              </button>
            </div>

            <Button variant="secondary" className="gap-2 text-xs sm:text-sm flex-1 sm:flex-none">
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">E-posta</span> Gönder
            </Button>
            
            <Button variant="outline" className="gap-2 text-xs sm:text-sm border-blue-900/50 hover:bg-blue-900/20 hover:text-blue-300 text-blue-400 flex-1 sm:flex-none">
              <Play className="w-4 h-4" />
              Şimdi Başlat
            </Button>
            
            <Button variant="primary" className="gap-2 text-xs sm:text-sm bg-blue-600 hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)] flex-1 sm:flex-none">
              Planla
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
      `}} />
    </div>
  );
}
