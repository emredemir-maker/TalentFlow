export function Gateway() {
  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col items-center justify-center gap-10 p-8 font-['Inter']">
      <div className="text-center">
        <h2 className="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">Konsept A</h2>
        <p className="text-[11px] text-slate-500 mt-1">Inn Binası · İçindeki ışık = İnovasyon kıvılcımı</p>
      </div>

      <div className="flex flex-col items-center gap-6 bg-[#0F172A] rounded-2xl p-10 w-full max-w-sm">
        <BuildingMark size={80} />
        <div className="text-center">
          <div className="flex items-baseline gap-1 justify-center">
            <span className="text-white text-2xl font-bold tracking-tight">Talent</span>
            <span className="text-[#06B6D4] text-2xl font-bold tracking-tight">-Inn</span>
          </div>
          <div className="text-slate-400 text-[10px] font-semibold tracking-[0.2em] uppercase mt-1">AI-Powered HR Platform</div>
        </div>
        <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
          <BuildingMark size={36} />
          <div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-white text-sm font-bold">Talent</span>
              <span className="text-[#06B6D4] text-sm font-bold">-Inn</span>
            </div>
            <div className="text-slate-500 text-[8px] tracking-widest uppercase">HR Platform</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 bg-white rounded-2xl p-10 w-full max-w-sm border border-slate-100 shadow-sm">
        <BuildingMark size={80} />
        <div className="text-center">
          <div className="flex items-baseline gap-1 justify-center">
            <span className="text-[#1E3A8A] text-2xl font-bold tracking-tight">Talent</span>
            <span className="text-[#06B6D4] text-2xl font-bold tracking-tight">-Inn</span>
          </div>
          <div className="text-slate-400 text-[10px] font-semibold tracking-[0.2em] uppercase mt-1">Think-Inn Ailesi</div>
        </div>
        <div className="flex gap-3 items-end">
          <BuildingMark size={28} />
          <BuildingMark size={40} />
          <BuildingMark size={56} />
          <BuildingMark size={72} />
        </div>
        <p className="text-[10px] text-slate-400">Ölçekleme testi — 28px → 72px</p>
      </div>
    </div>
  );
}

function BuildingMark({ size }: { size: number }) {
  const rx = size * 0.16;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bl-bg" x1="0" y1="0" x2="80" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="100%" stopColor="#1E40AF" />
        </linearGradient>
        <linearGradient id="bl-glow" x1="50" y1="40" x2="50" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="bl-window" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#67E8F9" />
          <stop offset="60%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#0891B2" />
        </radialGradient>
      </defs>

      {/* Badge background */}
      <rect width="100" height="100" rx={rx} fill="url(#bl-bg)" />

      {/* ── Inn building silhouette ── */}

      {/* Gabled rooftop — forms an inverted V above the building body */}
      <path d="M20 46 L50 18 L80 46" stroke="white" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" fill="none"/>

      {/* Roof ridge line (subtle) */}
      <line x1="50" y1="18" x2="50" y2="30" stroke="white" strokeWidth="2" strokeOpacity="0.4" />

      {/* Building body */}
      <rect x="22" y="46" width="56" height="36" rx="2" fill="white" fillOpacity="0.12" />

      {/* Door (centered) */}
      <rect x="43" y="62" width="14" height="20" rx="3" fill="white" fillOpacity="0.18" />

      {/* Glowing window — inovasyon kıvılcımı */}
      <rect x="36" y="50" width="11" height="9" rx="2" fill="url(#bl-window)" />
      <rect x="53" y="50" width="11" height="9" rx="2" fill="url(#bl-window)" fillOpacity="0.75" />

      {/* Window glow halo */}
      <rect x="33" y="47" width="17" height="15" rx="3" fill="url(#bl-glow)" />

      {/* Inn lantern above door */}
      <rect x="48" y="55" width="4" height="6" rx="1" fill="#38BDF8" fillOpacity="0.9" />

      {/* Tiny spark dots — innovation sparks rising from roof */}
      <circle cx="50" cy="10" r="2" fill="#38BDF8" fillOpacity="0.7" />
      <circle cx="44" cy="13" r="1.3" fill="#06B6D4" fillOpacity="0.5" />
      <circle cx="56" cy="13" r="1.3" fill="#06B6D4" fillOpacity="0.5" />
    </svg>
  );
}
