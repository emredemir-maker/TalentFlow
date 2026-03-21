export function Gateway() {
  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col items-center justify-center gap-8 p-8 font-['Inter']">
      <div className="text-center">
        <p className="text-[10px] font-semibold tracking-[0.25em] text-slate-600 uppercase">Konsept A — Saf Kıvılcım İşareti</p>
      </div>

      {/* Hero showcase */}
      <div className="flex flex-col items-center gap-5">
        <SparkMark size={96} />

        {/* Full wordmark */}
        <div className="flex items-center gap-4 mt-2">
          <SparkMark size={44} />
          <div className="flex flex-col">
            <div className="flex items-baseline gap-[2px] leading-none">
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: 'white' }}>Talent</span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: '#06D6A0' }}>-Inn</span>
            </div>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', color: '#4B5563', textTransform: 'uppercase', marginTop: 3 }}>AI-Powered HR Platform</span>
          </div>
        </div>
      </div>

      {/* Light bg test */}
      <div className="bg-white rounded-2xl p-6 w-full max-w-xs flex flex-col items-center gap-4">
        <SparkMark size={56} />
        <div className="flex items-center gap-3">
          <SparkMark size={32} />
          <div className="flex items-baseline gap-[2px]">
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: '#0F172A' }}>Talent</span>
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: '#0D9488' }}>-Inn</span>
          </div>
        </div>
        {/* Scale strip */}
        <div className="flex gap-3 items-end mt-1">
          {[20, 28, 36, 48].map(s => <SparkMark key={s} size={s} />)}
        </div>
        <p className="text-[9px] text-slate-400 tracking-wider uppercase">Favicon → App Icon</p>
      </div>
    </div>
  );
}

function SparkMark({ size }: { size: number }) {
  const rx = size * 0.22;
  const cx = 50, cy = 50;
  // 8-pointed star: alternating R=34 and R=20 at 22.5° steps
  const outerR = 32, innerR = 14;
  const points = Array.from({ length: 16 }, (_, i) => {
    const angle = (i * 22.5 - 90) * Math.PI / 180;
    const r = i % 2 === 0 ? outerR : innerR;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sp-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F2460" />
          <stop offset="55%" stopColor="#0F3A7A" />
          <stop offset="100%" stopColor="#064E6E" />
        </linearGradient>
        <linearGradient id="sp-star" x1="20" y1="18" x2="80" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A7F3D0" />
          <stop offset="50%" stopColor="#06D6A0" />
          <stop offset="100%" stopColor="#0D9488" />
        </linearGradient>
        <filter id="sp-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <rect width="100" height="100" rx={rx} fill="url(#sp-bg)" />
      {/* subtle noise/grain overlay for depth */}
      <rect width="100" height="100" rx={rx} fill="white" fillOpacity="0.03" />
      {/* Outer glow */}
      <polygon points={points} fill="#06D6A0" fillOpacity="0.15" filter="url(#sp-glow)" />
      {/* Star */}
      <polygon points={points} fill="url(#sp-star)" />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r="5" fill="white" fillOpacity="0.9" />
    </svg>
  );
}
