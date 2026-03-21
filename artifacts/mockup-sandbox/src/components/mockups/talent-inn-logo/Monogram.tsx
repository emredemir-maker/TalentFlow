export function Monogram() {
  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col items-center justify-center gap-8 p-8 font-['Inter']">
      <div className="text-center">
        <p className="text-[10px] font-semibold tracking-[0.25em] text-slate-600 uppercase">Konsept C — Noktalı-i Mark</p>
      </div>

      {/* Hero showcase */}
      <div className="flex flex-col items-center gap-5">
        <DotIMark size={96} />

        {/* Full wordmark */}
        <div className="flex items-center gap-4 mt-2">
          <DotIMark size={44} />
          <div className="flex flex-col">
            <div className="flex items-baseline gap-[2px] leading-none">
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: 'white' }}>Talent</span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: '#A78BFA' }}>-Inn</span>
            </div>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', color: '#4B5563', textTransform: 'uppercase', marginTop: 3 }}>AI-Powered HR Platform</span>
          </div>
        </div>
      </div>

      {/* Light bg test */}
      <div className="bg-white rounded-2xl p-6 w-full max-w-xs flex flex-col items-center gap-4">
        <DotIMark size={56} />
        <div className="flex items-center gap-3">
          <DotIMark size={32} />
          <div className="flex items-baseline gap-[2px]">
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: '#0F172A' }}>Talent</span>
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: '#7C3AED' }}>-Inn</span>
          </div>
        </div>
        <div className="flex gap-3 items-end mt-1">
          {[20, 28, 36, 48].map(s => <DotIMark key={s} size={s} />)}
        </div>
        <p className="text-[9px] text-slate-400 tracking-wider uppercase">Favicon → App Icon</p>
      </div>
    </div>
  );
}

function DotIMark({ size }: { size: number }) {
  const rx = size * 0.22;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="di-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#13004D" />
          <stop offset="50%" stopColor="#1E0B6E" />
          <stop offset="100%" stopColor="#2D1B69" />
        </linearGradient>
        <linearGradient id="di-spark" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#C4B5FD" />
          <stop offset="50%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <filter id="di-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Background */}
      <rect width="100" height="100" rx={rx} fill="url(#di-bg)" />

      {/*
        The "i" letterform:
        - Stem: a rounded vertical bar, centered, lower portion
        - Tittle (dot): replaced by a 4-point diamond spark in vibrant violet/lavender
      */}

      {/* "i" stem */}
      <rect x="42" y="48" width="16" height="34" rx="5" fill="white" fillOpacity="0.92" />

      {/* Spark/diamond tittle — 4-point star replacing the dot */}
      {/* Glow halo first */}
      <path
        d="M50 17 L55 28 L66 33 L55 38 L50 49 L45 38 L34 33 L45 28 Z"
        fill="#A78BFA"
        fillOpacity="0.4"
        filter="url(#di-glow)"
      />
      {/* Sharp 4-point diamond star */}
      <path
        d="M50 17 L55 28 L66 33 L55 38 L50 49 L45 38 L34 33 L45 28 Z"
        fill="url(#di-spark)"
      />
      {/* Bright center */}
      <circle cx="50" cy="33" r="4" fill="white" fillOpacity="0.85" />

      {/* Badge border */}
      <rect width="100" height="100" rx={rx} fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.07" />
    </svg>
  );
}
