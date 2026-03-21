import React, { useState } from 'react';
import { 
  Check, 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  User,
  AlertCircle
} from 'lucide-react';

export function StepWizard() {
  const [currentStep, setCurrentStep] = useState(2);
  const [selectedDate, setSelectedDate] = useState(23);
  const [selectedTime, setSelectedTime] = useState("14:00");

  const steps = [
    { num: 1, label: "Aday Seçimi", completed: true },
    { num: 2, label: "Zaman Belirle", completed: false },
    { num: 3, label: "Onayla & Gönder", completed: false }
  ];

  // Calendar generation for March 2025
  const daysInMonth = 31;
  const startDayOfWeek = 6; // March 1, 2025 is Saturday (0=Sun, 6=Sat)
  
  const calendarDays = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    calendarDays.push({ day: null, isPast: true });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push({ 
      day: i, 
      isPast: i < 20, 
      hasConflict: i === 25 || i === 28 
    });
  }

  const timeSlots = [
    { time: "09:00", status: "available" },
    { time: "09:30", status: "conflict" },
    { time: "10:00", status: "available" },
    { time: "10:30", status: "available" },
    { time: "11:00", status: "conflict" },
    { time: "11:30", status: "available" },
    { time: "13:00", status: "available" },
    { time: "13:30", status: "available" },
    { time: "14:00", status: "available" }, // Selected
    { time: "14:30", status: "available" },
    { time: "15:00", status: "conflict" },
    { time: "15:30", status: "available" },
    { time: "16:00", status: "available" },
    { time: "16:30", status: "available" },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-6 flex flex-col items-center justify-center">
      
      {/* Wizard Container */}
      <div className="w-full max-w-4xl bg-slate-800/50 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[700px]">
        
        {/* Header Area */}
        <div className="p-8 border-b border-slate-700 bg-slate-800/80">
          <h1 className="text-2xl font-bold text-white mb-8">Yeni Mülakat Planla</h1>
          
          {/* Progress Bar */}
          <div className="relative flex justify-between items-center">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-700 rounded-full z-0"></div>
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-blue-600 rounded-full z-0 transition-all duration-300"
              style={{ width: '50%' }}
            ></div>
            
            {steps.map((step) => (
              <div key={step.num} className="relative z-10 flex flex-col items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
                  step.completed 
                    ? 'bg-emerald-500 text-white' 
                    : step.num === currentStep 
                      ? 'bg-blue-600 text-white ring-4 ring-blue-900/50' 
                      : 'bg-slate-700 text-slate-400'
                }`}>
                  {step.completed ? <Check size={20} /> : step.num}
                </div>
                <span className={`text-sm font-medium ${
                  step.num === currentStep ? 'text-blue-400' : 'text-slate-400'
                }`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Content Area - Step 2 */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left: Calendar */}
          <div className="w-1/2 p-8 border-r border-slate-700/50 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <CalendarIcon size={20} className="text-blue-400" />
                Tarih Seçimi
              </h2>
              <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1 border border-slate-700">
                <button className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium px-2">Mart 2025</span>
                <button className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-y-4 gap-x-1 mb-2 text-center">
              {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(day => (
                <div key={day} className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{day}</div>
              ))}
              
              {calendarDays.map((d, i) => (
                <div key={i} className="flex justify-center">
                  {d.day ? (
                    <button
                      disabled={d.isPast}
                      onClick={() => !d.isPast && setSelectedDate(d.day)}
                      className={`relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                        d.isPast 
                          ? 'text-slate-600 cursor-not-allowed' 
                          : d.day === selectedDate
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                            : 'hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {d.day}
                      {d.hasConflict && !d.isPast && (
                        <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-red-500"></span>
                      )}
                    </button>
                  ) : (
                    <div className="w-10 h-10"></div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-8 flex gap-4 text-xs text-slate-400 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                <span>Seçili</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span>Çakışma Var</span>
              </div>
            </div>
          </div>

          {/* Right: Time Slots */}
          <div className="w-1/2 p-8 bg-slate-800/20 overflow-y-auto">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-2">
              <Clock size={20} className="text-blue-400" />
              {selectedDate} Mart 2025
            </h2>
            <p className="text-sm text-slate-400 mb-6">Adayın saat diliminde (GMT+3) uygun saatler</p>
            
            <div className="grid grid-cols-2 gap-3">
              {timeSlots.map((slot, i) => {
                const isSelected = selectedTime === slot.time;
                const isConflict = slot.status === "conflict";
                
                return (
                  <button
                    key={i}
                    disabled={isConflict}
                    onClick={() => !isConflict && setSelectedTime(slot.time)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-600/10 text-blue-100 ring-1 ring-blue-500'
                        : isConflict
                          ? 'border-slate-800 bg-slate-800/50 text-slate-600 cursor-not-allowed'
                          : 'border-slate-700 bg-slate-800 hover:border-slate-500 hover:bg-slate-700/50 text-slate-300'
                    }`}
                  >
                    <span className="font-medium text-lg tracking-tight">{slot.time}</span>
                    {isSelected ? (
                      <span className="text-xs font-semibold px-2 py-1 bg-blue-600 text-white rounded-md flex items-center gap-1">
                        <Check size={12} /> Seçili
                      </span>
                    ) : isConflict ? (
                      <span className="text-xs font-medium px-2 py-1 bg-slate-900 text-red-400 rounded-md flex items-center gap-1">
                        <AlertCircle size={12} /> Dolu
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-1 bg-slate-900/50 text-slate-400 rounded-md flex items-center gap-1">
                        <Check size={12} /> Uygun
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer Bar */}
        <div className="p-6 border-t border-slate-700 bg-slate-800/80 flex items-center justify-between">
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <ChevronLeft size={16} />
            Aday Seçimi
          </button>
          
          {/* Summary Chip */}
          <div className="flex items-center gap-3 bg-slate-900 px-4 py-2 rounded-full border border-slate-700 shadow-inner">
            <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <User size={12} />
            </div>
            <span className="text-sm font-medium text-slate-200">
              Emre Demir
              <span className="text-slate-500 mx-2">•</span>
              <span className="text-blue-400">{selectedDate} Mar {selectedTime}</span>
            </span>
          </div>

          <button className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-blue-900/20 transition-all">
            Onayla & Gönder
            <ChevronRight size={16} />
          </button>
        </div>

      </div>
    </div>
  );
}
