export function Gateway() {
  return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col items-center justify-center gap-10 p-8">
      <p className="text-[10px] font-semibold tracking-[0.25em] text-slate-400 uppercase">Konsept A — Tipografik Wordmark</p>

      {/* ── Dark showcase ── */}
      <div className="bg-[#0D1424] rounded-3xl p-10 w-full max-w-sm flex flex-col items-center gap-8">

        {/* Primary: stacked wordmark */}
        <div className="flex flex-col items-start leading-none select-none">
          <span
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontWeight: 300,
              fontSize: 13,
              letterSpacing: '0.35em',
              color: '#64748B',
              textTransform: 'uppercase',
            }}
          >Talent</span>
          <div className="relative flex items-baseline leading-none -mt-1">
            <span
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 62,
                letterSpacing: '-0.04em',
                color: 'white',
                lineHeight: 1,
              }}
            >Inn</span>
            {/* cyan accent spark on the dot of the i */}
            <span
              style={{
                position: 'absolute',
                top: 6,
                left: 4,
                width: 10,
                height: 10,
                background: 'radial-gradient(circle, #06D6A0 0%, #0D9488 100%)',
                borderRadius: '50%',
                boxShadow: '0 0 10px 3px rgba(6,214,160,0.45)',
              }}
            />
          </div>
          {/* accent bar */}
          <div style={{ width: 48, height: 3, background: 'linear-gradient(90deg, #06D6A0, #0D9488)', borderRadius: 2, marginTop: 8 }} />
        </div>

        {/* Horizontal compact */}
        <div className="flex items-center gap-2 bg-white/5 rounded-xl px-5 py-3">
          <div className="flex items-baseline gap-[3px] leading-none select-none">
            <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 300, fontSize: 14, color: '#94A3B8', letterSpacing: '0.08em' }}>Talent</span>
            <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 900, fontSize: 18, color: 'white', letterSpacing: '-0.03em' }}>Inn</span>
          </div>
        </div>
      </div>

      {/* ── Light showcase ── */}
      <div className="bg-white rounded-3xl p-10 w-full max-w-sm flex flex-col items-center gap-8 border border-slate-100 shadow-sm">

        {/* Primary stacked — light */}
        <div className="flex flex-col items-start leading-none select-none">
          <span
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontWeight: 300,
              fontSize: 13,
              letterSpacing: '0.35em',
              color: '#94A3B8',
              textTransform: 'uppercase',
            }}
          >Talent</span>
          <div className="relative flex items-baseline leading-none -mt-1">
            <span
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 62,
                letterSpacing: '-0.04em',
                color: '#0F172A',
                lineHeight: 1,
              }}
            >Inn</span>
            <span
              style={{
                position: 'absolute',
                top: 6,
                left: 4,
                width: 10,
                height: 10,
                background: 'radial-gradient(circle, #06D6A0 0%, #0D9488 100%)',
                borderRadius: '50%',
                boxShadow: '0 0 8px 2px rgba(6,214,160,0.4)',
              }}
            />
          </div>
          <div style={{ width: 48, height: 3, background: 'linear-gradient(90deg, #06D6A0, #0D9488)', borderRadius: 2, marginTop: 8 }} />
        </div>

        {/* Horizontal compact — light */}
        <div className="flex items-baseline gap-[3px] leading-none select-none">
          <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 300, fontSize: 16, color: '#94A3B8', letterSpacing: '0.1em' }}>Talent</span>
          <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 900, fontSize: 20, color: '#0F172A', letterSpacing: '-0.03em' }}>Inn</span>
        </div>

        {/* App icon / favicon version */}
        <div className="flex gap-3 items-center">
          {[40, 52, 64].map(s => <IconBadge key={s} size={s} />)}
        </div>
        <p className="text-[9px] text-slate-400 tracking-wider uppercase">App icon versiyonu</p>
      </div>
    </div>
  );
}

function IconBadge({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 300, fontSize: size * 0.14, color: '#64748B', letterSpacing: '0.2em', lineHeight: 1 }}>T</span>
      <span style={{ fontFamily: "'Inter', system-ui", fontWeight: 900, fontSize: size * 0.32, color: 'white', letterSpacing: '-0.04em', lineHeight: 1, marginTop: -size * 0.02 }}>In</span>
      <div style={{ position: 'absolute', bottom: size * 0.12, width: size * 0.35, height: 2, background: '#06D6A0', borderRadius: 1 }} />
    </div>
  );
}
