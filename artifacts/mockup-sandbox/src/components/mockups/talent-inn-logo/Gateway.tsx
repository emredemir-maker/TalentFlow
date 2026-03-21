export function Gateway() {
  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col items-center justify-center gap-10 p-8 font-['Inter']">

      <h2 className="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">
        Konsept A — Kapı / Gateway
      </h2>

      {/* Dark background version */}
      <div className="flex flex-col items-center gap-6 bg-[#0F172A] rounded-2xl p-10 w-full max-w-sm">
        <GatewayMark size={80} />
        <div className="text-center">
          <div className="text-white text-2xl font-bold tracking-tight">Talent-Inn</div>
          <div className="text-[#06B6D4] text-[10px] font-semibold tracking-[0.25em] uppercase mt-1">AI-Powered HR Platform</div>
        </div>

        {/* Horizontal compact version */}
        <div className="flex items-center gap-3 mt-2">
          <GatewayMark size={40} />
          <div>
            <div className="text-white text-base font-bold leading-tight tracking-tight">Talent-Inn</div>
            <div className="text-[#06B6D4] text-[9px] font-medium tracking-widest uppercase">HR Platform</div>
          </div>
        </div>
      </div>

      {/* Light background version */}
      <div className="flex flex-col items-center gap-6 bg-white rounded-2xl p-10 w-full max-w-sm border border-slate-100 shadow-sm">
        <GatewayMark size={80} />
        <div className="text-center">
          <div className="text-[#1E3A8A] text-2xl font-bold tracking-tight">Talent-Inn</div>
          <div className="text-[#06B6D4] text-[10px] font-semibold tracking-[0.25em] uppercase mt-1">AI-Powered HR Platform</div>
        </div>

        {/* Icon only */}
        <div className="flex gap-4 mt-2">
          <GatewayMark size={32} />
          <GatewayMark size={48} />
          <GatewayMark size={64} />
        </div>
        <p className="text-xs text-slate-400 text-center">Ölçekleme testi</p>
      </div>
    </div>
  );
}

function GatewayMark({ size }: { size: number }) {
  const s = size;
  const r = s * 0.14;
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gw-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="100%" stopColor="#1E40AF" />
        </linearGradient>
        <linearGradient id="gw-arch" x1="50" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#0891B2" />
        </linearGradient>
      </defs>

      {/* Background rounded square */}
      <rect width="100" height="100" rx={r * 1.2} fill="url(#gw-bg)" />

      {/* Archway shape — two pillars + arch top */}
      {/* Left pillar */}
      <rect x="18" y="42" width="12" height="44" rx="2" fill="white" fillOpacity="0.15" />
      {/* Right pillar */}
      <rect x="70" y="42" width="12" height="44" rx="2" fill="white" fillOpacity="0.15" />
      {/* Arch top (semicircle) */}
      <path d="M18 44 Q18 12 50 12 Q82 12 82 44 L70 44 Q70 26 50 26 Q30 26 30 44 Z" fill="white" fillOpacity="0.15" />

      {/* Inner arch glow line */}
      <path d="M30 44 Q30 22 50 22 Q70 22 70 44" stroke="url(#gw-arch)" strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {/* Person silhouette */}
      {/* Head */}
      <circle cx="50" cy="50" r="6" fill="url(#gw-arch)" />
      {/* Body */}
      <path d="M44 57 Q44 68 47 72 L53 72 Q56 68 56 57 Q53 55 50 55 Q47 55 44 57Z" fill="url(#gw-arch)" />

      {/* AI spark dots — 4 particles radiating */}
      <circle cx="39" cy="46" r="1.8" fill="#06B6D4" fillOpacity="0.8" />
      <circle cx="62" cy="44" r="1.4" fill="#06B6D4" fillOpacity="0.6" />
      <circle cx="36" cy="60" r="1.2" fill="#06B6D4" fillOpacity="0.5" />
      <circle cx="65" cy="58" r="1.5" fill="#06B6D4" fillOpacity="0.7" />
      <circle cx="50" cy="38" r="1" fill="#38BDF8" fillOpacity="0.7" />
    </svg>
  );
}
