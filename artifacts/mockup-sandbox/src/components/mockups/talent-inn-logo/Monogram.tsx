export function Monogram() {
  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col items-center justify-center gap-10 p-8 font-['Inter']">
      <div className="text-center">
        <h2 className="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">Konsept C</h2>
        <p className="text-[11px] text-slate-500 mt-1">Kemer Kapı + Kıvılcım · Kapı = Inn, Işık = Innovation</p>
      </div>

      <div className="flex flex-col items-center gap-6 bg-[#0F172A] rounded-2xl p-10 w-full max-w-sm">
        <ArchMark size={80} />
        <div className="text-center">
          <div className="flex items-baseline gap-1 justify-center">
            <span className="text-white text-2xl font-bold tracking-tight">Talent</span>
            <span className="text-[#06B6D4] text-2xl font-bold tracking-tight">-Inn</span>
          </div>
          <div className="text-slate-400 text-[10px] font-semibold tracking-[0.2em] uppercase mt-1">AI-Powered HR Platform</div>
        </div>
        <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
          <ArchMark size={36} />
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
        <ArchMark size={80} />
        <div className="text-center">
          <div className="flex items-baseline gap-1 justify-center">
            <span className="text-[#1E3A8A] text-2xl font-bold tracking-tight">Talent</span>
            <span className="text-[#06B6D4] text-2xl font-bold tracking-tight">-Inn</span>
          </div>
          <div className="text-slate-400 text-[10px] font-semibold tracking-[0.2em] uppercase mt-1">Think-Inn Ailesi</div>
        </div>
        <div className="flex gap-3 items-end">
          <ArchMark size={28} />
          <ArchMark size={40} />
          <ArchMark size={56} />
          <ArchMark size={72} />
        </div>
        <p className="text-[10px] text-slate-400">Ölçekleme testi — 28px → 72px</p>
      </div>
    </div>
  );
}

function ArchMark({ size }: { size: number }) {
  const rx = size * 0.16;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ar-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="100%" stopColor="#1E40AF" />
        </linearGradient>
        <radialGradient id="ar-spark" cx="50%" cy="45%" r="45%">
          <stop offset="0%" stopColor="#67E8F9" stopOpacity="1" />
          <stop offset="70%" stopColor="#06B6D4" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ar-arch-stroke" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
      </defs>

      {/* Badge background */}
      <rect width="100" height="100" rx={rx} fill="url(#ar-bg)" />

      {/* ── Roman/Inn archway ── */}

      {/* Left pillar */}
      <rect x="18" y="50" width="12" height="36" rx="2" fill="white" fillOpacity="0.2" />
      {/* Right pillar */}
      <rect x="70" y="50" width="12" height="36" rx="2" fill="white" fillOpacity="0.2" />

      {/* Arch body (filled area under arch) */}
      <path d="M18 52 Q18 16 50 16 Q82 16 82 52 L70 52 Q70 28 50 28 Q30 28 30 52 Z" fill="white" fillOpacity="0.08" />

      {/* Arch outer stroke — bold, elegant */}
      <path d="M18 52 Q18 12 50 12 Q82 12 82 52"
        stroke="url(#ar-arch-stroke)" strokeWidth="5" fill="none"
        strokeLinecap="round" strokeLinejoin="round" />

      {/* Arch inner echo (subtle depth) */}
      <path d="M28 52 Q28 22 50 22 Q72 22 72 52"
        stroke="white" strokeWidth="1.5" fill="none" strokeOpacity="0.2"
        strokeLinecap="round" />

      {/* Keystone at arch crown */}
      <path d="M44 13 L50 8 L56 13 L53 18 L47 18 Z" fill="url(#ar-arch-stroke)" fillOpacity="0.9" />

      {/* Glow behind the keystone — the "Inn light" */}
      <circle cx="50" cy="38" r="16" fill="url(#ar-spark)" />

      {/* Innovation spark / star in the archway */}
      <g transform="translate(50,38)">
        {/* 4-point star */}
        <path d="M0 -9 C1 -3 3 -1 9 0 C3 1 1 3 0 9 C-1 3 -3 1 -9 0 C-3 -1 -1 -3 0 -9Z"
          fill="white" fillOpacity="0.95" />
        {/* Small diagonal sparkles */}
        <path d="M5.5 -5.5 C6 -3 7 -2 9.5 -2 C7 -1 6 0 5.5 2 C5 0 4 -1 1.5 -2 C4 -3 5 -4 5.5 -5.5Z"
          fill="#67E8F9" fillOpacity="0.85" transform="scale(0.55) translate(-2,2)" />
        <circle cx="0" cy="0" r="2.5" fill="#67E8F9" />
      </g>

      {/* Ground step under arch */}
      <rect x="12" y="86" width="76" height="5" rx="2" fill="white" fillOpacity="0.12" />
    </svg>
  );
}
