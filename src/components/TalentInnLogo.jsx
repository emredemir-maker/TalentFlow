/**
 * TalentInnLogo — Clyro Talent marka bileşeni (Clyro marka paketi).
 *
 * Bileşen adı, içe aktaran dosyalar değişmesin diye korunuyor; görünen marka Clyro Talent.
 *
 * Props:
 *  iconSize   : number  — ikon kare boyu, px (varsayılan 40)
 *  showText   : bool    — "clyr● talent" yazısını göster (varsayılan true)
 *  showSub    : bool    — alt yazıyı göster (varsayılan false)
 *  subtitle   : string  — alt yazı
 *  textSize   : string  — yazı boyu, ör. '18px'
 *  horizontal : bool    — ikon ve yazı yan yana (varsayılan true)
 *  onDark     : bool    — koyu zeminde yazıyı açık renge çevirir
 *  className  : string  — dış sarmalayıcı sınıfı
 *
 * Logo "clyr" + dolu O: disk Talent rengi (turkuaz), ürün adı daha ince ve gri.
 */
const TALENT = '#14B8A6';

export default function TalentInnLogo({
    iconSize = 40,
    showText = true,
    showSub = false,
    subtitle = 'AI Recruitment',
    textSize = '18px',
    horizontal = true,
    onDark = false,
    className = '',
}) {
    const ink = onDark ? '#F8FAFC' : '#111312';
    const muted = onDark ? 'rgba(248,250,252,0.72)' : '#4C524F';

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
                    <span
                        role="img"
                        aria-label="Clyro Talent"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'baseline',
                            fontFamily: "'Outfit', system-ui, sans-serif",
                            fontWeight: 600,
                            fontSize: textSize,
                            letterSpacing: '-0.038em',
                            lineHeight: 1.1,
                            color: ink,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        clyr
                        <span
                            aria-hidden="true"
                            style={{
                                display: 'inline-block',
                                width: '0.46em',
                                height: '0.46em',
                                borderRadius: '50%',
                                background: TALENT,
                                marginLeft: '0.005em',
                            }}
                        />
                        <span aria-hidden="true" style={{ marginLeft: '0.25em', fontWeight: 500, color: muted }}>talent</span>
                    </span>

                    {showSub && (
                        <span style={{
                            fontSize: '9px',
                            fontWeight: 600,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: onDark ? 'rgba(248,250,252,0.6)' : '#7A817D',
                            fontFamily: "'Outfit', system-ui, sans-serif",
                            marginTop: '3px',
                        }}>{subtitle}</span>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Ürün ikonu: turkuaz kare, sağ alt köşede beyaz nokta.
 * Nokta ortalanmaz; ortalı halka ve nokta Instagram ikonunu çağrıştırır.
 */
export function TIIconMark({ size = 40 }) {
    return (
        <span
            aria-hidden="true"
            style={{
                width: size,
                height: size,
                borderRadius: size * 0.22,
                padding: size * 0.12,
                background: TALENT,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'flex-end',
                boxSizing: 'border-box',
                flexShrink: 0,
            }}
        >
            <span style={{ display: 'block', width: size * 0.48, height: size * 0.48, borderRadius: '50%', background: '#FFFFFF' }} />
        </span>
    );
}
