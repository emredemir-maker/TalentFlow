export function Monogram() {
  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col items-center justify-center gap-10 p-8 font-['Inter']">

      <h2 className="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">
        Konsept C — TI Monogram
      </h2>

      {/* Dark background version */}
      <div className="flex flex-col items-center gap-6 bg-[#0F172A] rounded-2xl p-10 w-full max-w-sm">
        <MonogramMark size={80} />
        <div className="text-center">
          <div className="text-white text-2xl font-bold tracking-tight">Talent-Inn</div>
          <div className="text-[#06B6D4] text-[10px] font-semibold tracking-[0.25em] uppercase mt-1">AI-Powered HR Platform</div>
        </div>

        <div className="flex items-center gap-3 mt-2">
          <MonogramMark size={40} />
          <div>
            <div className="text-white text-base font-bold leading-tight">Talent-Inn</div>
            <div className="text-[#06B6D4] text-[9px] font-medium tracking-widest uppercase">HR Platform</div>
          </div>
        </div>
      </div>

      {/* Light background version */}
      <div className="flex flex-col items-center gap-6 bg-white rounded-2xl p-10 w-full max-w-sm border border-slate-100 shadow-sm">
        <MonogramMark size={80} />
        <div className="text-center">
          <div className="text-[#1E3A8A] text-2xl font-bold tracking-tight">Talent-Inn</div>
          <div className="text-[#06B6D4] text-[10px] font-semibold tracking-[0.25em] uppercase mt-1">AI-Powered HR Platform</div>
        </div>

        <div className="flex gap-4 mt-2 items-end">
          <MonogramMark size={32} />
          <MonogramMark size={48} />
          <MonogramMark size={64} />
        </div>
        <p className="text-xs text-slate-400 text-center">Ölçekleme testi</p>
      </div>
    </div>
  );
}

function MonogramMark({ size }: { size: number }) {
  const rx = size * 0.18;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mg-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="100%" stopColor="#1E40AF" />
        </linearGradient>
        <linearGradient id="mg-accent" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <linearGradient id="mg-t" x1="20" y1="22" x2="80" y2="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="100" height="100" rx={rx} fill="url(#mg-bg)" />

      {/* Subtle grid overlay */}
      <rect width="100" height="100" rx={rx} fill="url(#mg-t)" fillOpacity="0.04" />

      {/*
        TI Monogram design:
        - Bold "T" on the left-center
        - Clean "I" on the right
        - The T crossbar doubles as a shared top element
        - A thin cyan "spark" stroke connects them diagonally
      */}

      {/* T — crossbar (shared top bar spanning full width) */}
      <rect x="17" y="26" width="66" height="11" rx="3" fill="url(#mg-t)" />

      {/* T — vertical stem (left of center) */}
      <rect x="31" y="37" width="13" height="37" rx="2.5" fill="url(#mg-t)" />

      {/* I — vertical stroke (right side) */}
      <rect x="56" y="37" width="10" height="37" rx="2.5" fill="url(#mg-t)" fillOpacity="0.9" />

      {/* I — bottom serif bar */}
      <rect x="50" y="71" width="22" height="7" rx="2.5" fill="url(#mg-t)" fillOpacity="0.9" />

      {/* Cyan accent — diagonal spark connecting T stem bottom to I */}
      <path
        d="M44 64 Q50 68 56 64"
        stroke="url(#mg-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Cyan dot accent — top right corner spark */}
      <circle cx="79" cy="21" r="4.5" fill="url(#mg-accent)" />
      <circle cx="79" cy="21" r="2" fill="white" fillOpacity="0.6" />
    </svg>
  );
}
