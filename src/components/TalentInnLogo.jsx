/**
 * TalentInnLogo — Shared brand component
 *
 * Props:
 *  iconSize   : number  — icon square size in px (default 40)
 *  showText   : bool    — show "Talent-Inn" wordmark (default true)
 *  showSub    : bool    — show subtitle text (default false)
 *  subtitle   : string  — subtitle text
 *  textSize   : string  — CSS font-size for wordmark, e.g. '18px'
 *  horizontal : bool    — icon + text side by side (default true)
 *  className  : string  — wrapper class
 */
export default function TalentInnLogo({
    iconSize = 40,
    showText = true,
    showSub = false,
    subtitle = 'AI-Powered HR Platform',
    textSize = '18px',
    horizontal = true,
    className = '',
}) {
    return (
        <div
            className={className}
            style={{
                display: 'flex',
                flexDirection: horizontal ? 'row' : 'column',
                alignItems: 'center',
                gap: horizontal ? '10px' : '8px',
            }}
        >
            <TIIconMark size={iconSize} />

            {showText && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {/* Metallic wordmark — CSS gradient text */}
                    <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1, gap: 0 }}>
                        <span style={{
                            fontFamily: "'Inter', system-ui, sans-serif",
                            fontWeight: 800,
                            fontSize: textSize,
                            letterSpacing: '-0.03em',
                            background: 'linear-gradient(180deg, #C8E8F8 0%, #5BB8E0 40%, #2B7BAA 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            lineHeight: 1.1,
                        }}>Talent-</span>
                        <span style={{
                            fontFamily: "'Inter', system-ui, sans-serif",
                            fontWeight: 800,
                            fontSize: textSize,
                            letterSpacing: '-0.03em',
                            background: 'linear-gradient(180deg, #F9E0A0 0%, #D4982A 40%, #8A5E10 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            lineHeight: 1.1,
                        }}>Inn</span>
                    </div>

                    {showSub && (
                        <span style={{
                            fontSize: '9px',
                            fontWeight: 600,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: '#64748B',
                            fontFamily: "'Inter', system-ui, sans-serif",
                            marginTop: '2px',
                        }}>{subtitle}</span>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Standalone icon mark — circular network hub with 4 glowing nodes + interlocking swirl + 3 stars
 */
export function TIIconMark({ size = 40 }) {
    const rx = Math.round(size * 0.18);

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <linearGradient id="ti-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                    <stop offset="0%"   stopColor="#061633" />
                    <stop offset="100%" stopColor="#0A1F4E" />
                </linearGradient>
                <filter id="ti-glow" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="ti-glow-soft" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <clipPath id="ti-clip">
                    <rect width="100" height="100" rx={rx} />
                </clipPath>
            </defs>

            {/* Badge */}
            <rect width="100" height="100" rx={rx} fill="url(#ti-bg)" />

            <g clipPath="url(#ti-clip)">
                {/* Soft overall glow centre */}
                <circle cx="50" cy="45" r="30" fill="#06B6D4" fillOpacity="0.07" />

                {/* ── Outer ring arcs (connecting adjacent nodes) ── */}
                <path d="M 26,26 C 50,9  50,9  74,26" stroke="#38BDF8" strokeWidth="2"   strokeLinecap="round" fill="none" strokeOpacity="0.65" />
                <path d="M 74,26 C 90,45 90,45 74,64" stroke="#38BDF8" strokeWidth="2"   strokeLinecap="round" fill="none" strokeOpacity="0.65" />
                <path d="M 74,64 C 50,80 50,80 26,64" stroke="#38BDF8" strokeWidth="2"   strokeLinecap="round" fill="none" strokeOpacity="0.65" />
                <path d="M 26,64 C 10,45 10,45 26,26" stroke="#38BDF8" strokeWidth="2"   strokeLinecap="round" fill="none" strokeOpacity="0.65" />

                {/* ── Inner swirl — S-curve A (NW→SE), back portion ── */}
                <path d="M 26,26 C 62,26 38,45 50,45"   stroke="#67E8F9" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                {/* Knockout where B crosses A */}
                <path d="M 74,26 C 38,26 62,45 50,45"   stroke="#061633" strokeWidth="5.5" strokeLinecap="round" fill="none" />
                {/* S-curve B (NE→SW), full, on top */}
                <path d="M 74,26 C 38,26 62,64 26,64"   stroke="#67E8F9" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                {/* S-curve A, front portion */}
                <path d="M 50,45 C 62,45 38,64 74,64"   stroke="#67E8F9" strokeWidth="2.2" strokeLinecap="round" fill="none" />

                {/* ── Node glow halos ── */}
                <g filter="url(#ti-glow)">
                    <circle cx="26" cy="26" r="5" fill="#06B6D4" fillOpacity="0.6" />
                    <circle cx="74" cy="26" r="5" fill="#06B6D4" fillOpacity="0.6" />
                    <circle cx="74" cy="64" r="5" fill="#06B6D4" fillOpacity="0.6" />
                    <circle cx="26" cy="64" r="5" fill="#06B6D4" fillOpacity="0.6" />
                </g>

                {/* ── Node circles ── */}
                <circle cx="26" cy="26" r="5.5" fill="#061633" stroke="#67E8F9" strokeWidth="2.2" />
                <circle cx="26" cy="26" r="2.2" fill="#A5F3FC" />
                <circle cx="74" cy="26" r="5.5" fill="#061633" stroke="#67E8F9" strokeWidth="2.2" />
                <circle cx="74" cy="26" r="2.2" fill="#A5F3FC" />
                <circle cx="74" cy="64" r="5.5" fill="#061633" stroke="#67E8F9" strokeWidth="2.2" />
                <circle cx="74" cy="64" r="2.2" fill="#A5F3FC" />
                <circle cx="26" cy="64" r="5.5" fill="#061633" stroke="#67E8F9" strokeWidth="2.2" />
                <circle cx="26" cy="64" r="2.2" fill="#A5F3FC" />

                {/* ── 3 stars below ── */}
                <polygon points="37,77 38,80 41,80 39,82 40,85 37,83 34,85 35,82 33,80 36,80" fill="#38BDF8" fillOpacity="0.7" />
                <polygon points="50,77 51,80 54,80 52,82 53,85 50,83 47,85 48,82 46,80 49,80" fill="#38BDF8" fillOpacity="0.7" />
                <polygon points="63,77 64,80 67,80 65,82 66,85 63,83 60,85 61,82 59,80 62,80" fill="#38BDF8" fillOpacity="0.7" />
            </g>
        </svg>
    );
}
