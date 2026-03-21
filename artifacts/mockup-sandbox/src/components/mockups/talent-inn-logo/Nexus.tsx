export function Nexus() {
  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col items-center justify-center gap-10 p-8 font-['Inter']">

      <h2 className="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">
        Konsept B — Yetenek Ağı / Nexus
      </h2>

      {/* Dark background version */}
      <div className="flex flex-col items-center gap-6 bg-[#0F172A] rounded-2xl p-10 w-full max-w-sm">
        <NexusMark size={80} />
        <div className="text-center">
          <div className="text-white text-2xl font-bold tracking-tight">Talent-Inn</div>
          <div className="text-[#06B6D4] text-[10px] font-semibold tracking-[0.25em] uppercase mt-1">AI-Powered HR Platform</div>
        </div>

        {/* Horizontal compact */}
        <div className="flex items-center gap-3 mt-2">
          <NexusMark size={40} />
          <div>
            <div className="text-white text-base font-bold leading-tight">Talent-Inn</div>
            <div className="text-[#06B6D4] text-[9px] font-medium tracking-widest uppercase">HR Platform</div>
          </div>
        </div>
      </div>

      {/* Light background version */}
      <div className="flex flex-col items-center gap-6 bg-white rounded-2xl p-10 w-full max-w-sm border border-slate-100 shadow-sm">
        <NexusMark size={80} />
        <div className="text-center">
          <div className="text-[#1E3A8A] text-2xl font-bold tracking-tight">Talent-Inn</div>
          <div className="text-[#06B6D4] text-[10px] font-semibold tracking-[0.25em] uppercase mt-1">AI-Powered HR Platform</div>
        </div>

        <div className="flex gap-4 mt-2">
          <NexusMark size={32} />
          <NexusMark size={48} />
          <NexusMark size={64} />
        </div>
        <p className="text-xs text-slate-400 text-center">Ölçekleme testi</p>
      </div>
    </div>
  );
}

function NexusMark({ size }: { size: number }) {
  const r = size * 0.14;
  // Hexagon points for background shape
  // 6 satellite nodes around center
  const satellites = [
    { x: 50, y: 18, r: 4.5 },   // top
    { x: 76, y: 33, r: 3.5 },   // top-right
    { x: 76, y: 65, r: 4 },     // bottom-right
    { x: 50, y: 80, r: 5 },     // bottom (talent star)
    { x: 24, y: 65, r: 3.5 },   // bottom-left
    { x: 24, y: 33, r: 4 },     // top-left
  ];

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="nx-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="60%" stopColor="#1E40AF" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id="nx-center" x1="35" y1="35" x2="65" y2="65" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <radialGradient id="nx-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Hexagonal background */}
      <path d="M50 4 L90 26 L90 74 L50 96 L10 74 L10 26 Z" fill="url(#nx-bg)" />

      {/* Subtle inner glow */}
      <circle cx="50" cy="50" r="28" fill="url(#nx-glow)" />

      {/* Connection lines from center to satellites */}
      {satellites.map((s, i) => (
        <line
          key={i}
          x1="50" y1="50"
          x2={s.x} y2={s.y}
          stroke="#06B6D4"
          strokeWidth="1.2"
          strokeOpacity="0.5"
          strokeLinecap="round"
        />
      ))}

      {/* Satellite-to-satellite connections (ring) */}
      {satellites.map((s, i) => {
        const next = satellites[(i + 1) % satellites.length];
        return (
          <line
            key={`ring-${i}`}
            x1={s.x} y1={s.y}
            x2={next.x} y2={next.y}
            stroke="#38BDF8"
            strokeWidth="0.8"
            strokeOpacity="0.25"
          />
        );
      })}

      {/* Satellite nodes */}
      {satellites.map((s, i) => (
        <circle
          key={`node-${i}`}
          cx={s.x} cy={s.y} r={s.r}
          fill="#06B6D4"
          fillOpacity={i === 3 ? 1 : 0.8}
        />
      ))}

      {/* Central node — the "talent star" */}
      <circle cx="50" cy="50" r="9" fill="url(#nx-center)" />
      {/* Person icon in center */}
      <circle cx="50" cy="47" r="3" fill="white" />
      <path d="M44 55 Q44 58 47 60 L53 60 Q56 58 56 55 Q53 53 50 53 Q47 53 44 55Z" fill="white" />
    </svg>
  );
}
