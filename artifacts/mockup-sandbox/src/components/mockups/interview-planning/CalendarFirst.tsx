import React, { useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Video,
  UserPlus,
  Mail,
  MoreVertical,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

// Types
type Candidate = {
  id: string;
  name: string;
  role: string;
  score: number;
  avatar: string;
};

type InterviewType = "TEKNİK" | "İK FİLTRE" | "PRODUCT";

// Data
const CANDIDATES: Candidate[] = [
  { id: "1", name: "Emre Demir", role: "Senior Frontend Dev", score: 91, avatar: "ED" },
  { id: "2", name: "Ayşe Kara", role: "Product Designer", score: 87, avatar: "AK" },
  { id: "3", name: "Zeynep Arslan", role: "UX Researcher", score: 84, avatar: "ZA" },
  { id: "4", name: "Murat Şahin", role: "Backend Engineer", score: 79, avatar: "MŞ" },
  { id: "5", name: "Can Özdemir", role: "Full Stack Dev", score: 72, avatar: "CÖ" },
];

const WEEK_DAYS = [
  { day: "Pzt", date: "21 Mart" },
  { day: "Sal", date: "22 Mart" },
  { day: "Çar", date: "23 Mart" },
  { day: "Per", date: "24 Mart" },
  { day: "Cum", date: "25 Mart" },
];

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 08:00 - 18:00

// Main Component
export function CalendarFirst() {
  const [selectedCandidate, setSelectedCandidate] = useState<string>("4"); // Murat Şahin default
  const [selectedType, setSelectedType] = useState<InterviewType>("TEKNİK");

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      {/* Main Content - Calendar Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
        {/* Header */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50">
          <div>
            <h1 className="text-xl font-semibold text-white">Mülakat Yönetimi</h1>
            <p className="text-sm text-slate-400">Takvim Odaklı Planlama</p>
          </div>
          
          <div className="flex items-center gap-4 bg-slate-800/50 rounded-lg p-1">
            <button className="p-2 hover:bg-slate-700 rounded-md transition-colors text-slate-300">
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-medium px-2">21 - 25 Mart 2024</span>
            <button className="p-2 hover:bg-slate-700 rounded-md transition-colors text-slate-300">
              <ChevronRight size={18} />
            </button>
          </div>
        </header>

        {/* Calendar Grid */}
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-xl flex flex-col h-full">
            {/* Calendar Header Row */}
            <div className="flex border-b border-slate-800">
              <div className="w-16 border-r border-slate-800 bg-slate-900/50"></div>
              {WEEK_DAYS.map((d, i) => (
                <div key={i} className="flex-1 py-3 text-center border-r border-slate-800 last:border-0">
                  <div className={`text-sm font-medium ${d.date === "23 Mart" ? "text-blue-400" : "text-slate-300"}`}>
                    {d.day}
                  </div>
                  <div className={`text-xs mt-1 ${d.date === "23 Mart" ? "text-blue-500 font-bold" : "text-slate-500"}`}>
                    {d.date}
                  </div>
                </div>
              ))}
            </div>

            {/* Calendar Body */}
            <div className="flex-1 overflow-y-auto relative">
              <div className="flex">
                {/* Time Column */}
                <div className="w-16 flex-shrink-0 border-r border-slate-800 bg-slate-900/50">
                  {HOURS.map((hour) => (
                    <div key={hour} className="h-20 border-b border-slate-800/50 relative">
                      <span className="absolute -top-3 left-0 w-full text-center text-xs text-slate-500 font-medium bg-slate-900/50">
                        {`${hour.toString().padStart(2, "0")}:00`}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Days Columns */}
                {WEEK_DAYS.map((day, dayIdx) => (
                  <div key={dayIdx} className="flex-1 border-r border-slate-800 last:border-0 relative">
                    {HOURS.map((hour, hourIdx) => (
                      <div key={hourIdx} className="h-20 border-b border-slate-800/30 relative group">
                        {/* Empty slot hover effect */}
                        <div className="absolute inset-1 rounded-md transition-colors opacity-0 group-hover:opacity-100 group-hover:bg-emerald-500/10 border border-transparent group-hover:border-emerald-500/30 cursor-pointer flex items-center justify-center">
                          <span className="text-emerald-500/0 group-hover:text-emerald-500/70 text-xs font-medium">+ Seç</span>
                        </div>
                      </div>
                    ))}

                    {/* Example Existing Event */}
                    {day.date === "22 Mart" && (
                      <div className="absolute top-[80px] left-1 right-1 h-[120px] bg-indigo-900/40 border border-indigo-500/30 rounded-md p-2 hover:bg-indigo-900/60 transition-colors cursor-pointer group">
                        <div className="flex justify-between items-start">
                          <span className="text-xs font-semibold text-indigo-300">09:00 - 10:30</span>
                          <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                        </div>
                        <div className="text-sm font-medium text-white mt-1">Selin Yılmaz</div>
                        <div className="text-xs text-indigo-200/70">Frontend Dev • Teknik</div>
                      </div>
                    )}

                    {/* Selected Slot (Wed 15:00 - 15:45) */}
                    {day.date === "23 Mart" && (
                      <div className="absolute top-[560px] left-1 right-1 h-[60px] bg-blue-600/20 border-2 border-blue-500 rounded-md p-2 shadow-[0_0_15px_rgba(59,130,246,0.3)] z-10 flex flex-col justify-center">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-blue-300 flex items-center gap-1">
                            <Clock size={12} />
                            15:00 - 15:45
                          </span>
                          <span className="text-[10px] font-bold uppercase bg-blue-500 text-white px-1.5 py-0.5 rounded animate-pulse">
                            Atanacak
                          </span>
                        </div>
                        {selectedCandidate && (
                          <div className="text-sm font-medium text-white mt-0.5 flex items-center gap-1.5">
                            <div className="w-4 h-4 rounded-full bg-blue-800 flex items-center justify-center text-[8px] font-bold">
                              {CANDIDATES.find(c => c.id === selectedCandidate)?.avatar}
                            </div>
                            {CANDIDATES.find(c => c.id === selectedCandidate)?.name}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Candidate Selection */}
      <div className="w-[320px] bg-slate-900 border-l border-slate-800 flex flex-col flex-shrink-0 z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.2)]">
        <div className="p-5 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <UserPlus size={18} className="text-blue-400" />
            Aday Seçimi
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Seçili slot: <strong className="text-slate-200">23 Mart, 15:00</strong>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {CANDIDATES.map((candidate) => {
            const isSelected = selectedCandidate === candidate.id;
            
            return (
              <div
                key={candidate.id}
                onClick={() => setSelectedCandidate(candidate.id)}
                className={`
                  p-3 rounded-lg border transition-all cursor-pointer relative overflow-hidden
                  ${isSelected 
                    ? "bg-blue-900/20 border-blue-500 shadow-[0_0_15px_rgba(30,58,138,0.5)]" 
                    : "bg-slate-800/40 border-slate-700 hover:border-slate-500 hover:bg-slate-800/80"}
                `}
              >
                {isSelected && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                )}
                
                <div className="flex gap-3 items-center">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0
                    ${isSelected ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300"}
                  `}>
                    {candidate.avatar}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h3 className={`font-medium truncate ${isSelected ? "text-white" : "text-slate-200"}`}>
                        {candidate.name}
                      </h3>
                      <div className={`
                        text-xs font-bold px-1.5 py-0.5 rounded flex items-center gap-1
                        ${candidate.score >= 90 ? "bg-emerald-900/50 text-emerald-400" : 
                          candidate.score >= 80 ? "bg-blue-900/50 text-blue-400" : 
                          "bg-amber-900/50 text-amber-400"}
                      `}>
                        %{candidate.score}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{candidate.role}</p>
                  </div>
                </div>
                
                {isSelected && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <div className="flex items-center gap-2 text-xs text-blue-300 bg-blue-950/30 p-1.5 rounded">
                      <CheckCircle2 size={12} />
                      <span>AI Eşleşmesi Yüksek</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Area */}
        <div className="p-5 border-t border-slate-800 bg-slate-900/80 backdrop-blur">
          <div className="mb-4">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
              Mülakat Tipi
            </label>
            <div className="grid grid-cols-1 gap-2">
              {(["TEKNİK", "İK FİLTRE", "PRODUCT"] as InterviewType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`
                    py-2 px-3 text-sm rounded-md border text-left transition-colors flex justify-between items-center
                    ${selectedType === type 
                      ? "bg-slate-800 border-blue-500/50 text-blue-400 font-medium" 
                      : "bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800/50"}
                  `}
                >
                  {type}
                  {selectedType === type && <CheckCircle2 size={14} />}
                </button>
              ))}
            </div>
          </div>

          <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg shadow-[0_4px_14px_rgba(37,99,235,0.39)] transition-all flex items-center justify-center gap-2">
            <CalendarIcon size={18} />
            Mülakatı Planla
          </button>
          
          <div className="mt-3 flex gap-2">
            <button className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium py-2 rounded-md transition-colors border border-slate-700 flex items-center justify-center gap-1.5">
              <Mail size={14} />
              Davet At
            </button>
            <button className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium py-2 rounded-md transition-colors border border-slate-700 flex items-center justify-center gap-1.5">
              <Video size={14} />
              Link Kopyala
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
