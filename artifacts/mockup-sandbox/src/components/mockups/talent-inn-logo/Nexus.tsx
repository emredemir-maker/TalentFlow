export function Nexus() {
  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col items-center justify-center gap-8 p-8 font-['Inter']">
      <div className="text-center">
        <p className="text-[10px] font-semibold tracking-[0.25em] text-slate-600 uppercase">Konsept B — Diagonal Kontrast</p>
      </div>

      {/* Hero showcase */}
      <div className="flex flex-col items-center gap-5">
        <DiagonalMark size={96} />

        {/* Full wordmark */}
        <div className="flex items-center gap-4 mt-2">
          <DiagonalMark size={44} />
          <div className="flex flex-col">
            <div className="flex items-baseline gap-[2px] leading-none">
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: 'white' }}>Talent</span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: '#38BDF8' }}>-Inn</span>
            </div>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', color: '#4B5563', textTransform: 'uppercase', marginTop: 3 }}>AI-Powered HR Platform</span>
          </div>
        </div>
      </div>

      {/* Light bg test */}
      <div className="bg-white rounded-2xl p-6 w-full max-w-xs flex flex-col items-center gap-4">
        <DiagonalMark size={56} />
        <div className="flex items-center gap-3">
          <DiagonalMark size={32} />
          <div className="flex items-baseline gap-[2px]">
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: '#0F172A' }}>Talent</span>
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: '#0EA5E9' }}>-Inn</span>
          </div>
        </div>
        <div className="flex gap-3 items-end mt-1">
          {[20, 28, 36, 48].map(s => <DiagonalMark key={s} size={s} />)}
        </div>
        <p className="text-[9px] text-slate-400 tracking-wider uppercase">Favicon → App Icon</p>
      </div>
    </div>
  );
}

function DiagonalMark({ size }: { size: number }) {
  const rx = size * 0.18;
  // The diagonal splits the badge: top-left = navy, bottom-right = cyan
  // Clip paths for each half
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="dg-navy" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F1F5C" />
          <stop offset="100%" stopColor="#1E3A8A" />
        </linearGradient>
        <linearGradient id="dg-cyan" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0EA5E9" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <clipPath id="dg-clip-top">
          <polygon points="0,0 100,0 100,100" />
        </clipPath>
        <clipPath id="dg-clip-bottom">
          <polygon points="0,0 0,100 100,100" />
        </clipPath>
        <clipPath id="dg-badge">
          <rect width="100" height="100" rx={rx} />
        </clipPath>
      </defs>

      <g clipPath="url(#dg-badge)">
        {/* Top-right triangle — navy */}
        <polygon points="0,0 100,0 100,100" fill="url(#dg-navy)" />
        {/* Bottom-left triangle — cyan */}
        <polygon points="0,0 0,100 100,100" fill="url(#dg-cyan)" />

        {/* Diagonal edge highlight */}
        <line x1="0" y1="0" x2="100" y2="100" stroke="white" strokeWidth="1.5" strokeOpacity="0.25" />

        {/* "T" glyph — upper right zone, white */}
        <text
          x="64" y="44"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="'Inter', system-ui, sans-serif"
          fontWeight="900"
          fontSize="36"
          fill="white"
          fillOpacity="0.95"
          letterSpacing="-2"
        >T</text>

        {/* "I" glyph — lower left zone, dark navy on cyan */}
        <text
          x="36" y="72"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="'Inter', system-ui, sans-serif"
          fontWeight="900"
          fontSize="36"
          fill="#0F1F5C"
          fillOpacity="0.9"
          letterSpacing="-2"
        >i</text>
      </g>

      {/* Badge border */}
      <rect width="100" height="100" rx={rx} fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.08" />
    </svg>
  );
}
