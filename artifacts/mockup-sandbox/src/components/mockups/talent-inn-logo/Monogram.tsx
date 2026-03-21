export function Monogram() {
  return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col items-center justify-center gap-10 p-8">
      <p className="text-[10px] font-semibold tracking-[0.25em] text-slate-400 uppercase">Konsept C — Ağ Merkezi / Hub</p>

      {/* ── Dark showcase ── */}
      <div className="bg-[#0D1424] rounded-3xl p-10 w-full max-w-sm flex flex-col items-center gap-8">

        <div className="flex items-center gap-5">
          <HubMark size={72} />
          <div className="flex flex-col leading-none select-none">
            <div className="flex items-baseline gap-[2px]">
              <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 800, fontSize: 24, color: 'white', letterSpacing: '-0.03em' }}>Talent</span>
              <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 800, fontSize: 24, color: '#06B6D4', letterSpacing: '-0.03em' }}>-Inn</span>
            </div>
            <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 500, fontSize: 9, color: '#475569', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>AI-Powered HR Platform</span>
          </div>
        </div>

        <div className="flex gap-4 items-end">
          {[28, 38, 50, 64].map(s => <HubMark key={s} size={s} />)}
        </div>
      </div>

      {/* ── Light showcase ── */}
      <div className="bg-white rounded-3xl p-10 w-full max-w-sm flex flex-col items-center gap-8 border border-slate-100 shadow-sm">

        <div className="flex items-center gap-5">
          <HubMark size={72} />
          <div className="flex flex-col leading-none select-none">
            <div className="flex items-baseline gap-[2px]">
              <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 800, fontSize: 24, color: '#0F172A', letterSpacing: '-0.03em' }}>Talent</span>
              <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 800, fontSize: 24, color: '#06B6D4', letterSpacing: '-0.03em' }}>-Inn</span>
            </div>
            <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 500, fontSize: 9, color: '#94A3B8', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>Think-Inn Ailesi</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1 mt-2">
          <HubMark size={56} />
          <div className="flex items-baseline gap-[2px] mt-2">
            <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 800, fontSize: 18, color: '#0F172A', letterSpacing: '-0.02em' }}>Talent</span>
            <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 800, fontSize: 18, color: '#06B6D4', letterSpacing: '-0.02em' }}>-Inn</span>
          </div>
        </div>

        <div className="flex gap-3 items-end">
          {[20, 28, 36, 48].map(s => <HubMark key={s} size={s} />)}
        </div>
        <p className="text-[9px] text-slate-400 tracking-wider uppercase">Ölçekleme — 20px → 48px</p>
      </div>
    </div>
  );
}

function HubMark({ size }: { size: number }) {
  const rx = size * 0.18;

  // Center node + 6 satellites at 60° intervals, plus 3 outer micro-nodes
  const cx = 50, cy = 50;
  const orbitR = 28;
  const satellites = Array.from({ length: 6 }, (_, i) => {
    const angle = (i * 60 - 90) * Math.PI / 180;
    return { x: cx + orbitR * Math.cos(angle), y: cy + orbitR * Math.sin(angle) };
  });

  // Outer micro nodes between some satellites
  const outerR = 40;
  const outerNodes = [30, 150, 270].map(deg => {
    const angle = (deg - 90) * Math.PI / 180;
    return { x: cx + outerR * Math.cos(angle), y: cy + outerR * Math.sin(angle) };
  });

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hb-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#0C1F40" />
        </linearGradient>
        <radialGradient id="hb-center-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hb-center" x1="35" y1="35" x2="65" y2="65" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="100" height="100" rx={rx} fill="url(#hb-bg)" />

      {/* Center glow */}
      <circle cx={cx} cy={cy} r="22" fill="url(#hb-center-glow)" />

      {/* Spoke lines — center to each satellite */}
      {satellites.map((s, i) => (
        <line
          key={`spoke-${i}`}
          x1={cx} y1={cy}
          x2={s.x} y2={s.y}
          stroke="#0EA5E9"
          strokeWidth="1.2"
          strokeOpacity="0.45"
          strokeLinecap="round"
        />
      ))}

      {/* Satellite-to-satellite ring */}
      {satellites.map((s, i) => {
        const next = satellites[(i + 1) % 6];
        return (
          <line
            key={`ring-${i}`}
            x1={s.x} y1={s.y}
            x2={next.x} y2={next.y}
            stroke="#0EA5E9"
            strokeWidth="0.8"
            strokeOpacity="0.2"
          />
        );
      })}

      {/* Outer micro nodes with spokes */}
      {outerNodes.map((n, i) => {
        const nearestSat = satellites[i * 2];
        return (
          <g key={`outer-${i}`}>
            <line
              x1={nearestSat.x} y1={nearestSat.y}
              x2={n.x} y2={n.y}
              stroke="#06B6D4"
              strokeWidth="0.8"
              strokeOpacity="0.25"
              strokeDasharray="2 2"
            />
            <circle cx={n.x} cy={n.y} r="2.2" fill="#0EA5E9" fillOpacity="0.5" />
          </g>
        );
      })}

      {/* Satellite nodes */}
      {satellites.map((s, i) => (
        <circle
          key={`sat-${i}`}
          cx={s.x} cy={s.y} r="4.5"
          fill={i % 2 === 0 ? '#0EA5E9' : '#0369A1'}
          fillOpacity="0.9"
        />
      ))}

      {/* Central hub — the Inn */}
      <circle cx={cx} cy={cy} r="10" fill="url(#hb-center)" />
      {/* Hub inner white glow */}
      <circle cx={cx} cy={cy} r="5" fill="white" fillOpacity="0.9" />
    </svg>
  );
}
