// Şirket seçici — birden çok şirkette üye olan kişi için (tek şirkette görünmez).
// Seçim kaydedilir ve uygulama o şirketle baştan açılır (AuthContext.selectTenant).
import { useAuth } from '../context/AuthContext';

export default function TenantSwitcher({ className = '' }) {
    const { tenants, tenantId, selectTenant } = useAuth();
    if (!tenants || tenants.length < 2) return null;
    return (
        <label className={`block px-2 ${className}`}>
            <span className="sr-only">Şirket</span>
            <select
                aria-label="Şirket"
                value={tenantId || ''}
                onChange={(e) => selectTenant(e.target.value)}
                className="w-full h-9 rounded-md border border-n200 bg-n0 px-2 text-[13px] text-n900"
            >
                {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                        {t.name}
                    </option>
                ))}
            </select>
        </label>
    );
}
