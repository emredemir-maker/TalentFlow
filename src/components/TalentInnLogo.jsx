/**
 * TalentInnLogo — Shared brand component
 *
 * Props:
 *  iconSize   : number  — icon square size in px (default 40)
 *  showText   : bool    — show "Talent-inn" wordmark (default true)
 *  showSub    : bool    — show subtitle text (default false)
 *  subtitle   : string  — subtitle text
 *  textSize   : string  — CSS font-size for wordmark, e.g. '18px'
 *  horizontal : bool    — icon + text side by side (default true)
 *  onDark     : bool    — invert outline/text to light for dark backgrounds
 *  className  : string  — wrapper class
 *
 * The brand mark is navy + cyan→teal (designed for light surfaces). On dark
 * surfaces (login hero, sidebar) pass `onDark` so the navy outline and "Talent-"
 * wordmark flip to light; the cyan→teal accents stay the same on both.
 */
export default function TalentInnLogo({
    iconSize = 40,
    showText = true,
    showSub = false,
    subtitle = 'AI-Powered HR Platform',
    textSize = '18px',
    horizontal = true,
    onDark = false,
    className = '',
}) {
    const wordmarkColor = onDark ? '#F8FAFC' : '#13294E';

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
            <TIIconMark size={iconSize} onDark={onDark} />

            {showText && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {/* Wordmark — navy/light "Talent-" + cyan→teal "inn" (brand) */}
                    <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1, gap: 0 }}>
                        <span style={{
                            fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
                            fontWeight: 700,
                            fontSize: textSize,
                            letterSpacing: '-0.02em',
                            color: wordmarkColor,
                            lineHeight: 1.1,
                        }}>Talent-</span>
                        <span style={{
                            fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
                            fontWeight: 700,
                            fontSize: textSize,
                            letterSpacing: '-0.02em',
                            background: 'linear-gradient(100deg, #29A9E0 0%, #13C2BE 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            lineHeight: 1.1,
                        }}>inn</span>
                    </div>

                    {showSub && (
                        <span style={{
                            fontSize: '9px',
                            fontWeight: 600,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: onDark ? '#94A3B8' : '#64748B',
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
 * Standalone icon mark — AI-screened CV: document with verified candidate,
 * list, magnifier, and circuit traces. Navy outline + cyan→teal accents
 * (light outline when `onDark`).
 */
export function TIIconMark({ size = 40, onDark = false }) {
    const ink = onDark ? '#EAF1F8' : '#13294E';   // document / person / magnifier outline
    const paper = onDark ? 'none' : '#FFFFFF';     // page fill (transparent on dark)

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <linearGradient id="ti-accent" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#29A9E0" />
                    <stop offset="100%" stopColor="#13C2BE" />
                </linearGradient>
            </defs>

            {/* Circuit traces (left) */}
            <g stroke="#29A9E0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
                <path d="M14 42 H24 L30 48" />
                <path d="M9 56 H22" />
                <path d="M14 70 H24 L30 64" />
            </g>
            <g fill={onDark ? '#0A1629' : '#FFFFFF'} stroke="#29A9E0" strokeWidth="3">
                <circle cx="11" cy="42" r="3.2" />
                <circle cx="6" cy="56" r="3.2" />
                <circle cx="11" cy="70" r="3.2" />
            </g>

            {/* Document with folded corner */}
            <path
                d="M38 18 H66 L82 34 V82 A4 4 0 0 1 78 86 H38 A4 4 0 0 1 34 82 V22 A4 4 0 0 1 38 18 Z"
                fill={paper} stroke={ink} strokeWidth="5" strokeLinejoin="round"
            />
            <path d="M66 18 V30 A4 4 0 0 0 70 34 H82" fill="none" stroke={ink} strokeWidth="5" strokeLinejoin="round" />

            {/* Person avatar */}
            <circle cx="51" cy="42" r="13.5" fill="none" stroke={ink} strokeWidth="4" />
            <circle cx="51" cy="38" r="5.2" fill={ink} />
            <path d="M42 51 A9 9 0 0 1 60 51" fill={ink} />
            {/* Teal verified check */}
            <circle cx="62" cy="50" r="6.5" fill="url(#ti-accent)" />
            <path d="M59 50 l2 2 l4 -4" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {/* List rows */}
            <circle cx="44" cy="62" r="2.4" fill="#29A9E0" />
            <line x1="50" y1="62" x2="68" y2="62" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />
            <circle cx="44" cy="70" r="2.4" fill="#29A9E0" />
            <line x1="50" y1="70" x2="64" y2="70" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />
            <circle cx="44" cy="78" r="2.4" fill="#29A9E0" />
            <line x1="50" y1="78" x2="60" y2="78" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />

            {/* Magnifier (bottom-right, overlapping) */}
            <circle cx="69" cy="71" r="12" fill={onDark ? '#0A1629' : '#FFFFFF'} stroke={ink} strokeWidth="5" />
            <line x1="78" y1="80" x2="86" y2="88" stroke={ink} strokeWidth="6" strokeLinecap="round" />
            <line x1="63" y1="69" x2="75" y2="69" stroke="#29A9E0" strokeWidth="2.6" strokeLinecap="round" />
            <line x1="63" y1="74" x2="75" y2="74" stroke="#13C2BE" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
    );
}
