import { Menu } from 'lucide-react';

/**
 * Telefonda menüyü açan düğme.
 *
 * Ortak Header'ı kullanmayan ekranlarda (Aday süreci, Adaylar tablosu)
 * telefonda menüye ulaşmanın hiçbir yolu yoktu: kenar menü <lg'de çekmeceye
 * dönüşüyor ve onu yalnız Header'daki düğme açıyordu. Aynı olayı
 * (`openMobileSidebar`) gönderiyor; masaüstünde görünmüyor.
 */
export default function MobileMenuButton({ className = '' }) {
    return (
        <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('openMobileSidebar'))}
            className={`w-9 h-9 -ml-1.5 rounded-full flex items-center justify-center hover:bg-n100 text-n700 transition-colors lg:hidden flex-none ${className}`}
            aria-label="Menüyü aç"
        >
            <Menu className="w-5 h-5" />
        </button>
    );
}
