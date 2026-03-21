export function Nexus() {
  return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col items-center justify-center gap-10 p-8">
      <p className="text-[10px] font-semibold tracking-[0.25em] text-slate-400 uppercase">Konsept B — Merdiven / Büyüme</p>

      {/* ── Dark showcase ── */}
      <div className="bg-[#0D1424] rounded-3xl p-10 w-full max-w-sm flex flex-col items-center gap-8">

        {/* Primary lockup */}
        <div className="flex items-center gap-5">
          <StairMark size={72} />
          <div className="flex flex-col leading-none select-none">
            <div className="flex items-baseline gap-[2px]">
              <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 800, fontSize: 24, color: 'white', letterSpacing: '-0.03em' }}>Talent</span>
              <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 800, fontSize: 24, color: '#06B6D4', letterSpacing: '-0.03em' }}>-Inn</span>
            </div>
            <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 500, fontSize: 9, color: '#475569', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>AI-Powered HR Platform</span>
          </div>
        </div>

        {/* Icon-only strip */}
        <div className="flex gap-4 items-end">
          {[28, 38, 50, 64].map(s => <StairMark key={s} size={s} />)}
        </div>
      </div>

      {/* ── Light showcase ── */}
      <div className="bg-white rounded-3xl p-10 w-full max-w-sm flex flex-col items-center gap-8 border border-slate-100 shadow-sm">

        {/* Primary lockup — light */}
        <div className="flex items-center gap-5">
          <StairMark size={72} />
          <div className="flex flex-col leading-none select-none">
            <div className="flex items-baseline gap-[2px]">
              <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 800, fontSize: 24, color: '#0F172A', letterSpacing: '-0.03em' }}>Talent</span>
              <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 800, fontSize: 24, color: '#06B6D4', letterSpacing: '-0.03em' }}>-Inn</span>
            </div>
            <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 500, fontSize: 9, color: '#94A3B8', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>Think-Inn Ailesi</span>
          </div>
        </div>

        {/* Stacked vertical wordmark */}
        <div className="flex flex-col items-center gap-1">
          <StairMark size={56} />
          <div className="flex items-baseline gap-[2px] mt-2">
            <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 800, fontSize: 18, color: '#0F172A', letterSpacing: '-0.02em' }}>Talent</span>
            <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 800, fontSize: 18, color: '#06B6D4', letterSpacing: '-0.02em' }}>-Inn</span>
          </div>
        </div>

        {/* Scale test */}
        <div className="flex gap-3 items-end">
          {[20, 28, 36, 48].map(s => <StairMark key={s} size={s} />)}
        </div>
        <p className="text-[9px] text-slate-400 tracking-wider uppercase">Ölçekleme — 20px → 48px</p>
      </div>
    </div>
  );
}

function StairMark({ size }: { size: number }) {
  const rx = size * 0.18;
  // 3 ascending steps — each a rounded rect
  // Total canvas 100x100
  // Step widths: 60, 42, 26 centered
  // Step heights: 18px each, stacked bottom-to-top
  const steps = [
    { x: 20, y: 64, w: 60, h: 16 }, // bottom — wide
    { x: 29, y: 46, w: 42, h: 16 }, // middle
    { x: 37, y: 28, w: 26, h: 16 }, // top — narrow
  ];
  const colors = ['#1E40AF', '#0284C7', '#06B6D4'];

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="st-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#172040" />
        </linearGradient>
      </defs>

      {/* Badge background */}
      <rect width="100" height="100" rx={rx} fill="url(#st-bg)" />

      {/* Steps — ascending from bottom-left to top-right, centered */}
      {steps.map((step, i) => (
        <rect
          key={i}
          x={step.x}
          y={step.y}
          width={step.w}
          height={step.h}
          rx="4"
          fill={colors[i]}
        />
      ))}

      {/* Riser connectors (thin lines between steps) */}
      <line x1="29" y1="62" x2="29" y2="46" stroke="#0284C7" strokeWidth="1.5" strokeOpacity="0.5" />
      <line x1="37" y1="44" x2="37" y2="28" stroke="#06B6D4" strokeWidth="1.5" strokeOpacity="0.5" />

      {/* Sparkle at top step */}
      <circle cx="63" cy="28" r="3" fill="#67E8F9" fillOpacity="0.9" />
    </svg>
  );
}
