// HATA SINIRI — BEYAZ EKRANIN KALICI ÇÖZÜMÜ.
//
// ── NEDEN VAR ───────────────────────────────────────────────────────────────
// Uygulamada hiçbir hata sınırı YOKTU. React'te render sırasında bir hata
// fırlatıldığında ve onu yakalayan bir sınır bulunmadığında React tüm ağacı
// SÖKER: ekranda bomboş beyaz bir sayfa kalır, konsola bakılmadıkça ne
// olduğu hakkında tek bir ipucu bile olmaz.
//
// Canlıda tam olarak bu yaşandı: bir adayın detayına girildiğinde ekran
// beyaz kaldı. Sebebi bulmak için tek tek tahmin yürütmek gerekti, çünkü
// uygulama olan biteni SÖYLEMİYORDU. Bir alanın tipi beklenenden farklı
// olduğunda (dizi yerine metin, metin yerine nesne) ortaya çıkan bu hata
// sınıfı, verinin biçimi kontrolümüz dışında geliştiği sürece tekrar
// edecektir — üstelik her seferinde başka bir alanda.
//
// Bu bileşen o zinciri kırar: hata artık ekranı silmez, ekranda ne olduğunu
// YAZAR. Kullanıcı "beyaz ekran" yerine sebebi görür ve tek tuşla kopyalayıp
// iletebilir; hatanın hangi alandan geldiği ilk bakışta bellidir.
//
// ── NE YAPMAZ ───────────────────────────────────────────────────────────────
// Hesaplama veya süreç mantığına dokunmaz. Yalnızca çöken render'ın yerine
// okunur bir mesaj koyar. Olay işleyicilerindeki (onClick vb.) ve async
// kodlardaki hatalar React'in tasarımı gereği buraya düşmez.

import React from 'react';

/** Hatayı tek parça, yapıştırılabilir bir metne çevirir. */
function errorReport(error, info, scope) {
    return [
        `Ekran: ${scope || 'bilinmiyor'}`,
        `Adres: ${typeof window !== 'undefined' ? window.location.href : '-'}`,
        `Hata: ${error?.name || 'Error'}: ${error?.message || String(error)}`,
        '',
        'Yığın:',
        String(error?.stack || '-'),
        '',
        'Bileşen zinciri:',
        String(info?.componentStack || '-'),
    ].join('\n');
}

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null, info: null, copied: false };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        this.setState({ info });
        // Konsola da bırakılıyor: kullanıcı ekrandaki metni iletmese bile
        // tarayıcı konsolunda tam yığın kalsın.
        console.error(`[HATA SINIRI] ${this.props.scope || ''}`, error, info?.componentStack);
    }

    componentDidUpdate(prevProps) {
        // Başka bir ekrana geçildiğinde sınır kendini sıfırlar; yoksa bir
        // kere çöken sınır, kullanıcı menüden başka sayfaya gitse bile hata
        // mesajını göstermeye devam ederdi.
        if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null, info: null, copied: false });
        }
    }

    handleCopy = () => {
        const text = errorReport(this.state.error, this.state.info, this.props.scope);
        const done = () => {
            this.setState({ copied: true });
            setTimeout(() => this.setState({ copied: false }), 2000);
        };
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(done, done);
        } else {
            done();
        }
    };

    render() {
        const { error, info, copied } = this.state;
        if (!error) return this.props.children;

        const scope = this.props.scope;

        return (
            <div className="infoset min-h-[60vh] flex items-start justify-center p-6">
                <div className="w-full max-w-2xl bg-n0 border border-n200 rounded-[14px] shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-n200 bg-bad-bg">
                        <h2 className="text-[15px] font-semibold text-bad m-0">Bu ekran açılamadı</h2>
                        <p className="text-[12px] text-n600 mt-1 mb-0">
                            Uygulamanın geri kalanı çalışmaya devam ediyor — sol menüden başka bir
                            ekrana geçebilirsiniz. Kaydedilmemiş bir işlem kaybolmadı.
                        </p>
                    </div>

                    <div className="px-5 py-4 space-y-3">
                        {scope && (
                            <div className="text-[11px] font-semibold text-n400 uppercase tracking-[0.08em]">
                                {scope}
                            </div>
                        )}
                        <p className="text-[13px] font-medium text-n900 m-0 break-words">
                            {error?.name || 'Error'}: {error?.message || String(error)}
                        </p>

                        <details className="rounded-md border border-n200 bg-n50">
                            <summary className="cursor-pointer select-none px-3 py-2 text-[12px] font-semibold text-n600">
                                Teknik ayrıntı
                            </summary>
                            <pre className="px-3 pb-3 pt-0 m-0 text-[11px] leading-relaxed text-n600 whitespace-pre-wrap break-words max-h-64 overflow-auto">
                                {String(error?.stack || '')}
                                {info?.componentStack ? `\n\nBileşen zinciri:${info.componentStack}` : ''}
                            </pre>
                        </details>

                        <div className="flex flex-wrap gap-2 pt-1">
                            <button
                                onClick={this.handleCopy}
                                className="h-8 px-3 rounded-md text-[12px] font-semibold text-n0 bg-brand hover:opacity-90"
                            >
                                {copied ? 'Kopyalandı' : 'Hata raporunu kopyala'}
                            </button>
                            <button
                                onClick={() => this.setState({ error: null, info: null })}
                                className="h-8 px-3 rounded-md text-[12px] font-semibold text-n600 bg-n0 border border-n200 hover:bg-n50"
                            >
                                Tekrar dene
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="h-8 px-3 rounded-md text-[12px] font-semibold text-n600 bg-n0 border border-n200 hover:bg-n50"
                            >
                                Sayfayı yenile
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
