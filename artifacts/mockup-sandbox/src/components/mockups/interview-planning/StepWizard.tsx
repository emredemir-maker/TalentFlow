import React, { useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  User,
  AlertCircle,
  Mail,
  Play,
  Sparkles,
  Settings,
  Package,
  X,
} from 'lucide-react';

export function StepWizard() {
  const [currentStep, setCurrentStep] = useState(2);
  const [selectedCandidate, setSelectedCandidate] = useState(0);
  const [selectedDate, setSelectedDate] = useState(23);
  const [selectedTime, setSelectedTime] = useState('14:00');
  const [interviewType, setInterviewType] = useState('technical');

  const candidates = [
    { name: 'Emre Demir', role: 'Senior Frontend Dev', score: 91, initials: 'ED' },
    { name: 'Ayşe Kara', role: 'Product Designer', score: 87, initials: 'AK' },
    { name: 'Murat Şahin', role: 'Backend Engineer', score: 79, initials: 'MŞ' },
    { name: 'Zeynep Arslan', role: 'UX Researcher', score: 84, initials: 'ZA' },
    { name: 'Can Özdemir', role: 'Full Stack Dev', score: 72, initials: 'CÖ' },
  ];

  const steps = [
    { num: 1, label: 'Aday Seçimi', completed: currentStep > 1 },
    { num: 2, label: 'Zaman Belirle', completed: currentStep > 2 },
    { num: 3, label: 'Onayla & Gönder', completed: false },
  ];

  const daysInMonth = 31;
  const startDayOfWeek = 6;
  const calendarDays: { day: number | null; isPast: boolean; hasConflict: boolean }[] = [];
  for (let i = 0; i < startDayOfWeek; i++) calendarDays.push({ day: null, isPast: true, hasConflict: false });
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push({ day: i, isPast: i < 21, hasConflict: i === 25 || i === 28 });

  const timeSlots = [
    { time: '09:00', status: 'available' },
    { time: '09:30', status: 'conflict' },
    { time: '10:00', status: 'available' },
    { time: '10:30', status: 'available' },
    { time: '11:00', status: 'conflict' },
    { time: '11:30', status: 'available' },
    { time: '13:00', status: 'available' },
    { time: '13:30', status: 'available' },
    { time: '14:00', status: 'available' },
    { time: '14:30', status: 'available' },
    { time: '15:00', status: 'conflict' },
    { time: '15:30', status: 'available' },
    { time: '16:00', status: 'available' },
    { time: '16:30', status: 'available' },
  ];

  const interviewTypes = [
    { id: 'technical', label: 'TEKNİK', Icon: Settings },
    { id: 'hr', label: 'İK FİLTRE', Icon: User },
    { id: 'product', label: 'PRODUCT', Icon: Package },
  ];

  const cand = candidates[selectedCandidate];

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-inter p-6 flex flex-col items-center justify-center">

      <div className="w-full max-w-4xl flex flex-col gap-4">

        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-[#0F172A] tracking-tighter italic">Yeni Mülakat Planla</h1>
            <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-widest mt-0.5 opacity-60">3 Adımda Tamamla</p>
          </div>
          <button className="w-9 h-9 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:bg-slate-50 transition-all shadow-sm">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard Card */}
        <div className="bg-white rounded-[24px] border border-[#E2E8F0] shadow-sm overflow-hidden flex flex-col" style={{ minHeight: 600 }}>

          {/* Progress Steps Header */}
          <div className="px-8 pt-7 pb-6 border-b border-[#F1F5F9] bg-slate-50/40">
            <div className="relative flex justify-between items-start">
              {/* Track line */}
              <div className="absolute left-5 right-5 top-5 h-0.5 bg-[#E2E8F0] z-0" />
              <div
                className="absolute left-5 top-5 h-0.5 bg-[#1E3A8A] z-0 transition-all duration-500"
                style={{ width: currentStep === 1 ? '0%' : currentStep === 2 ? '50%' : '100%' }}
              />

              {steps.map((step) => (
                <div key={step.num} className="relative z-10 flex flex-col items-center gap-2 cursor-pointer" onClick={() => step.num < currentStep && setCurrentStep(step.num)}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm transition-all border-2 ${
                    step.completed
                      ? 'bg-[#10B981] border-[#10B981] text-white'
                      : step.num === currentStep
                        ? 'bg-[#1E3A8A] border-[#1E3A8A] text-white shadow-lg shadow-blue-900/15'
                        : 'bg-white border-[#E2E8F0] text-[#94A3B8]'
                  }`}>
                    {step.completed ? <Check className="w-5 h-5" /> : step.num}
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${
                    step.num === currentStep ? 'text-[#1E3A8A]' : step.completed ? 'text-[#10B981]' : 'text-[#94A3B8]'
                  }`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Step 1: Aday Seçimi */}
          {currentStep === 1 && (
            <div className="flex-1 p-8 overflow-y-auto">
              <p className="text-[10px] font-black text-[#64748B] uppercase tracking-widest mb-4">Görüşeceğiniz adayı seçin</p>
              <div className="flex flex-col gap-2.5">
                {candidates.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedCandidate(i)}
                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                      selectedCandidate === i
                        ? 'border-[#1E3A8A] bg-blue-50/50 shadow-md shadow-blue-900/5'
                        : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${
                      selectedCandidate === i ? 'bg-[#1E3A8A] text-white' : 'bg-[#F1F5F9] text-[#475569]'
                    }`}>
                      {c.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-black ${selectedCandidate === i ? 'text-[#1E3A8A]' : 'text-[#0F172A]'}`}>{c.name}</p>
                      <p className="text-[11px] text-[#64748B] font-medium mt-0.5">{c.role}</p>
                    </div>
                    <div className={`px-3 py-1.5 rounded-xl text-[11px] font-black ${
                      selectedCandidate === i ? 'bg-[#1E3A8A] text-white' : 'bg-[#F1F5F9] text-[#475569]'
                    }`}>
                      %{c.score}
                    </div>
                    {selectedCandidate === i && (
                      <div className="w-5 h-5 rounded-full bg-[#10B981] flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Zaman Belirle */}
          {currentStep === 2 && (
            <div className="flex-1 flex overflow-hidden">

              {/* Left: Calendar */}
              <div className="w-1/2 p-7 border-r border-[#F1F5F9] overflow-y-auto">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-[11px] font-black text-[#64748B] uppercase tracking-widest flex items-center gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-[#1E3A8A]" /> Tarih Seçimi
                  </h2>
                  <div className="flex items-center gap-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-1">
                    <button className="w-6 h-6 hover:bg-white rounded-lg flex items-center justify-center text-[#64748B] transition-all">
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-black text-[#0F172A] px-2">Mart 2025</span>
                    <button className="w-6 h-6 hover:bg-white rounded-lg flex items-center justify-center text-[#64748B] transition-all">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-y-2 gap-x-1 mb-1 text-center">
                  {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(d => (
                    <div key={d} className="text-[9px] font-black text-[#94A3B8] uppercase tracking-widest py-1">{d}</div>
                  ))}
                  {calendarDays.map((d, i) => (
                    <div key={i} className="flex justify-center">
                      {d.day ? (
                        <button
                          disabled={d.isPast}
                          onClick={() => !d.isPast && setSelectedDate(d.day!)}
                          className={`relative w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold transition-all ${
                            d.isPast
                              ? 'text-[#CBD5E1] cursor-not-allowed'
                              : d.day === selectedDate
                                ? 'bg-[#1E3A8A] text-white shadow-md shadow-blue-900/20 font-black'
                                : 'text-[#334155] hover:bg-[#F1F5F9]'
                          }`}
                        >
                          {d.day}
                          {d.hasConflict && !d.isPast && (
                            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-rose-500" />
                          )}
                        </button>
                      ) : <div className="w-9 h-9" />}
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex gap-4 text-[10px] text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] p-3 rounded-xl">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#1E3A8A]" />
                    <span className="font-medium">Seçili</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-rose-500" />
                    <span className="font-medium">Çakışma Var</span>
                  </div>
                </div>

                {/* Mülakat Tipi */}
                <div className="mt-5">
                  <p className="text-[10px] font-black text-[#64748B] uppercase tracking-widest mb-2.5">Mülakat Tipi</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {interviewTypes.map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        onClick={() => setInterviewType(id)}
                        className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all border ${
                          interviewType === id
                            ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-md'
                            : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-3 h-3" /> {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Time Slots */}
              <div className="w-1/2 p-7 bg-[#F8FAFC]/50 overflow-y-auto">
                <h2 className="text-[11px] font-black text-[#64748B] uppercase tracking-widest flex items-center gap-1.5 mb-1">
                  <Clock className="w-3.5 h-3.5 text-[#1E3A8A]" /> {selectedDate} Mart 2025
                </h2>
                <p className="text-[10px] text-[#94A3B8] font-medium mb-5">GMT+3 — İstanbul</p>

                <div className="grid grid-cols-2 gap-2">
                  {timeSlots.map((slot, i) => {
                    const isSelected = selectedTime === slot.time;
                    const isConflict = slot.status === 'conflict';
                    return (
                      <button
                        key={i}
                        disabled={isConflict}
                        onClick={() => !isConflict && setSelectedTime(slot.time)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-[#1E3A8A] bg-blue-50 shadow-md shadow-blue-900/5 ring-1 ring-[#1E3A8A]/20'
                            : isConflict
                              ? 'border-[#F1F5F9] bg-white text-[#CBD5E1] cursor-not-allowed'
                              : 'border-[#E2E8F0] bg-white hover:border-[#1E3A8A]/30 hover:bg-blue-50/30 text-[#334155]'
                        }`}
                      >
                        <span className={`text-[13px] font-black tracking-tight ${isConflict ? 'text-[#CBD5E1]' : isSelected ? 'text-[#1E3A8A]' : 'text-[#0F172A]'}`}>
                          {slot.time}
                        </span>
                        {isSelected ? (
                          <span className="text-[8px] font-black px-2 py-1 bg-[#1E3A8A] text-white rounded-lg flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" /> SEÇİLİ
                          </span>
                        ) : isConflict ? (
                          <span className="text-[8px] font-black px-2 py-1 bg-rose-50 text-rose-400 rounded-lg flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" /> DOLU
                          </span>
                        ) : (
                          <span className="text-[8px] font-medium px-2 py-1 bg-[#F1F5F9] text-[#94A3B8] rounded-lg">
                            UYGUN
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Onayla & Gönder */}
          {currentStep === 3 && (
            <div className="flex-1 p-8 overflow-y-auto">
              <p className="text-[10px] font-black text-[#64748B] uppercase tracking-widest mb-6">Mülakat detaylarını kontrol edin</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] p-5 space-y-3">
                  <p className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Aday</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#1E3A8A] text-white flex items-center justify-center text-sm font-black">{cand.initials}</div>
                    <div>
                      <p className="text-[13px] font-black text-[#0F172A]">{cand.name}</p>
                      <p className="text-[11px] text-[#64748B]">{cand.role}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] p-5 space-y-3">
                  <p className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Zaman</p>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-[#1E3A8A]" />
                    <span className="text-[13px] font-black text-[#0F172A]">{selectedDate} Mart 2025 · {selectedTime}</span>
                  </div>
                  <div className="inline-flex px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100">
                    <span className="text-[10px] font-black text-[#1E3A8A] uppercase tracking-widest">
                      {interviewTypes.find(t => t.id === interviewType)?.label}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4 bg-[#F0FFF4] border border-[#C6F6D5] rounded-2xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black text-[#22543D] uppercase tracking-[0.2em] mb-0.5">Aday Katılım Linki</p>
                  <span className="text-[11px] font-mono text-[#2F855A] font-black italic">talent-inn.app/join/iv-ed91...</span>
                </div>
                <button className="px-3 py-2 bg-white border border-[#C6F6D5] rounded-xl text-[10px] font-black text-[#2F855A] hover:bg-green-50 transition-all">
                  Kopyala
                </button>
              </div>
              <div className="mt-4 flex gap-2">
                <button className="flex-1 bg-white border-2 border-blue-50 text-[#1E3A8A] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-50 transition-all">
                  <Mail className="w-3.5 h-3.5" /> E-POSTA GÖNDER
                </button>
                <button className="flex-1 bg-[#10B981] text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20">
                  <Play className="w-3.5 h-3.5 fill-current" /> MÜLAKATI PLANLA
                </button>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-7 py-4 border-t border-[#F1F5F9] bg-slate-50/40 flex items-center justify-between">
            <button
              onClick={() => currentStep > 1 && setCurrentStep(s => s - 1)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                currentStep > 1
                  ? 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] border border-[#E2E8F0]'
                  : 'text-[#CBD5E1] cursor-not-allowed'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              {steps[currentStep - 2]?.label || 'Geri'}
            </button>

            {/* Summary chip */}
            <div className="flex items-center gap-2.5 bg-white border border-[#E2E8F0] px-4 py-2 rounded-full shadow-sm">
              <div className="w-6 h-6 rounded-full bg-[#1E3A8A]/10 text-[#1E3A8A] flex items-center justify-center">
                <User className="w-3 h-3" />
              </div>
              <span className="text-[11px] font-black text-[#0F172A]">
                {cand.name}
              </span>
              {currentStep >= 2 && (
                <>
                  <span className="text-[#CBD5E1]">•</span>
                  <span className="text-[11px] font-bold text-[#1E3A8A]">{selectedDate} Mar · {selectedTime}</span>
                </>
              )}
            </div>

            <button
              onClick={() => currentStep < 3 && setCurrentStep(s => s + 1)}
              className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg ${
                currentStep < 3
                  ? 'bg-[#1E3A8A] hover:bg-blue-800 text-white shadow-blue-900/15 active:scale-95'
                  : 'bg-[#10B981] hover:bg-emerald-600 text-white shadow-emerald-500/20'
              }`}
            >
              {currentStep < 3 ? (
                <>{steps[currentStep]?.label} <ChevronRight className="w-3.5 h-3.5" /></>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /> Tamamla</>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
