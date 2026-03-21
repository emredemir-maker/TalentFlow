export function Nexus() {
  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col items-center justify-center gap-10 p-8 font-['Inter']">
      <div className="text-center">
        <h2 className="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">Konsept B</h2>
        <p className="text-[11px] text-slate-500 mt-1">Han Feneri · Girişteki ışık = topluluk & inovasyon</p>
      </div>

      <div className="flex flex-col items-center gap-6 bg-[#0F172A] rounded-2xl p-10 w-full max-w-sm">
        <LanternMark size={80} />
        <div className="text-center">
          <div className="flex items-baseline gap-1 justify-center">
            <span className="text-white text-2xl font-bold tracking-tight">Talent</span>
            <span className="text-[#06B6D4] text-2xl font-bold tracking-tight">-Inn</span>
          </div>
          <div className="text-slate-400 text-[10px] font-semibold tracking-[0.2em] uppercase mt-1">AI-Powered HR Platform</div>
        </div>
        <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
          <LanternMark size={36} />
          <div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-white text-sm font-bold">Talent</span>
              <span className="text-[#06B6D4] text-sm font-bold">-Inn</span>
            </div>
            <div className="text-slate-500 text-[8px] tracking-widest uppercase">Think-Inn Ailesi</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 bg-white rounded-2xl p-10 w-full max-w-sm border border-slate-100 shadow-sm">
        <LanternMark size={80} />
        <div className="text-center">
          <div className="flex items-baseline gap-1 justify-center">
            <span className="text-[#1E3A8A] text-2xl font-bold tracking-tight">Talent</span>
            <span className="text-[#06B6D4] text-2xl font-bold tracking-tight">-Inn</span>
          </div>
          <div className="text-slate-400 text-[10px] font-semibold tracking-[0.2em] uppercase mt-1">Think-Inn Ailesi</div>
        </div>
        <div className="flex gap-3 items-end">
          <LanternMark size={28} />
          <LanternMark size={40} />
          <LanternMark size={56} />
          <LanternMark size={72} />
        </div>
        <p className="text-[10px] text-slate-400">Ölçekleme testi — 28px → 72px</p>
      </div>
    </div>
  );
}

function LanternMark({ size }: { size: number }) {
  const rx = size * 0.16;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ln-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="100%" stopColor="#1E40AF" />
        </linearGradient>
        <radialGradient id="ln-flame" cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor="#67E8F9" stopOpacity="1" />
          <stop offset="50%" stopColor="#06B6D4" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#0E7490" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ln-body" x1="30" y1="30" x2="70" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.2" />
          <stop offset="100%" stopColor="white" stopOpacity="0.08" />
        </linearGradient>
      </defs>

      {/* Badge */}
      <rect width="100" height="100" rx={rx} fill="url(#ln-bg)" />

      {/* ── Lantern structure ── */}

      {/* Hanging chain / hook at top */}
      <line x1="50" y1="10" x2="50" y2="20" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.6" />
      <rect x="44" y="18" width="12" height="4" rx="2" fill="white" fillOpacity="0.4" />

      {/* Lantern top cap */}
      <path d="M33 28 Q33 22 50 22 Q67 22 67 28 L63 32 L37 32 Z" fill="white" fillOpacity="0.25" />

      {/* Lantern body — hexagonal / tapered */}
      <path d="M37 32 L30 70 Q30 76 50 76 Q70 76 70 70 L63 32 Z" fill="url(#ln-body)" stroke="white" strokeWidth="1.2" strokeOpacity="0.2" />

      {/* Inner glow — the "inn" light through the glass */}
      <ellipse cx="50" cy="58" rx="14" ry="16" fill="url(#ln-flame)" />

      {/* Lantern frame ribs */}
      <line x1="50" y1="32" x2="50" y2="76" stroke="white" strokeWidth="1" strokeOpacity="0.15" />
      <line x1="37" y1="32" x2="30" y2="70" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
      <line x1="63" y1="32" x2="70" y2="70" stroke="white" strokeWidth="1" strokeOpacity="0.1" />

      {/* Horizontal bands */}
      <path d="M32 48 Q50 44 68 48" stroke="white" strokeWidth="0.8" strokeOpacity="0.15" fill="none" />
      <path d="M31 62 Q50 58 69 62" stroke="white" strokeWidth="0.8" strokeOpacity="0.15" fill="none" />

      {/* Innovation spark / star at center */}
      <g transform="translate(50,55)">
        <line x1="0" y1="-7" x2="0" y2="7" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <line x1="-7" y1="0" x2="7" y2="0" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <line x1="-5" y1="-5" x2="5" y2="5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6" />
        <line x1="5" y1="-5" x2="-5" y2="5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6" />
        <circle cx="0" cy="0" r="2.5" fill="#67E8F9" />
      </g>

      {/* Lantern bottom tassel */}
      <rect x="46" y="76" width="8" height="4" rx="1.5" fill="white" fillOpacity="0.3" />
      <line x1="50" y1="80" x2="50" y2="87" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.2" />
    </svg>
  );
}
