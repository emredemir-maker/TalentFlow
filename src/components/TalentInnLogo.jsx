/**
 * TalentInnLogo — Shared brand component
 *
 * Props:
 *  iconSize   : number  — icon square size in px (default 40)
 *  showText   : bool    — show "Talent-Inn" wordmark (default true)
 *  showSub    : bool    — show subtitle text (default false)
 *  subtitle   : string  — subtitle text (default 'AI-Powered HR Platform')
 *  textSize   : string  — CSS font-size for wordmark (default '18px')
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1 }}>
                        <span style={{
                            fontWeight: 900,
                            fontSize: textSize,
                            letterSpacing: '-0.03em',
                            color: '#38BDF8',
                            fontFamily: "'Inter', system-ui, sans-serif",
                        }}>Talent-</span>
                        <span style={{
                            fontWeight: 900,
                            fontSize: textSize,
                            letterSpacing: '-0.03em',
                            color: '#F59E0B',
                            fontFamily: "'Inter', system-ui, sans-serif",
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
                        }}>{subtitle}</span>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Standalone icon mark — the triangular "inn tent" with person + spark
 */
export function TIIconMark({ size = 40 }) {
    const rx = size * 0.2;
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
                    <stop offset="0%" stopColor="#061633" />
                    <stop offset="100%" stopColor="#0A1F4E" />
                </linearGradient>
                <linearGradient id="ti-cyan" x1="20" y1="10" x2="80" y2="90" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#67E8F9" />
                    <stop offset="100%" stopColor="#0EA5E9" />
                </linearGradient>
                <filter id="ti-glow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="ti-glow-strong" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>

            {/* Badge background */}
            <rect width="100" height="100" rx={rx} fill="url(#ti-bg)" />

            {/* ── Triangular inn-tent outline ── */}
            {/* Outer glow path */}
            <path
                d="M50 12 L82 76 L18 76 Z"
                stroke="#06B6D4"
                strokeWidth="3.5"
                strokeLinejoin="round"
                fill="none"
                strokeOpacity="0.3"
                filter="url(#ti-glow-strong)"
            />
            {/* Main triangle */}
            <path
                d="M50 12 L82 76 L18 76 Z"
                stroke="url(#ti-cyan)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                fill="none"
            />

            {/* Inner vertical spine of the triangle (the "i" / pillar) */}
            <line
                x1="50" y1="28"
                x2="50" y2="76"
                stroke="#38BDF8"
                strokeWidth="1.5"
                strokeOpacity="0.5"
                strokeLinecap="round"
            />

            {/* ── Person silhouette (upward / ascending figure) ── */}
            {/* Head */}
            <circle cx="50" cy="42" r="5" fill="url(#ti-cyan)" />
            {/* Body with upward arrow shape */}
            <path
                d="M46 48 L46 60 L54 60 L54 48"
                fill="url(#ti-cyan)"
                fillOpacity="0.85"
            />
            {/* Arms spread (star person pose) */}
            <line x1="38" y1="53" x2="62" y2="53" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8" />

            {/* ── 4-point star / spark inside the triangle ── */}
            {/* Glow */}
            <path
                d="M50 31 L52 37 L58 39 L52 41 L50 47 L48 41 L42 39 L48 37 Z"
                fill="#06B6D4"
                fillOpacity="0.3"
                filter="url(#ti-glow-strong)"
            />
            {/* Star */}
            <path
                d="M50 31 L52 36 L57 38 L52 40 L50 45 L48 40 L43 38 L48 36 Z"
                fill="url(#ti-cyan)"
            />
            <circle cx="50" cy="38" r="2" fill="white" fillOpacity="0.9" />

            {/* ── 2×2 dot grid (upper right of triangle) ── */}
            {[0, 1].map(r =>
                [0, 1].map(c => (
                    <circle
                        key={`dot-${r}-${c}`}
                        cx={68 + c * 6}
                        cy={24 + r * 6}
                        r="1.8"
                        fill="#38BDF8"
                        fillOpacity={0.5 + r * 0.2 + c * 0.1}
                    />
                ))
            )}

            {/* ── Small sparkles ── */}
            <path d="M22 30 L23 33 L26 34 L23 35 L22 38 L21 35 L18 34 L21 33 Z" fill="#38BDF8" fillOpacity="0.6" transform="scale(0.7) translate(9, 5)" />
            <circle cx="26" cy="82" r="1.5" fill="#67E8F9" fillOpacity="0.5" />
            <circle cx="74" cy="82" r="1.2" fill="#67E8F9" fillOpacity="0.4" />
            <circle cx="85" cy="50" r="1" fill="#38BDF8" fillOpacity="0.35" />

            {/* ── Base line under triangle ── */}
            <line
                x1="18" y1="76"
                x2="82" y2="76"
                stroke="url(#ti-cyan)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeOpacity="0.5"
            />
        </svg>
    );
}
