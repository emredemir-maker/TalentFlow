// Şirket kapısı ekranları (docs/coklu-sirket-plani.md §2.2, K3, K5).
//
//   • Hiç şirketi yok → "Hub'dan açın" (Talent'ın kendi kaydı/daveti yok, K3).
//   • Birden çok şirket, seçim yok → şirket seçici.
//   • Üyelik yok/kaldırılmış/süresi dolmuş → erişim yok.
//   • Şirket askıda ya da deneme + 14 gün dolmuş → kapalı (K5).
// ReadOnlyBanner: salt okunur bantta (deneme bitti, 14 gün) ya da destek
// üyeliğinde (K11) her ekranın üstünde.
import { useAuth, HUB_INN_URL } from '../context/AuthContext';

function Shell({ title, children }) {
    return (
        <div className="min-h-dvh flex items-center justify-center p-6 bg-frame">
            <div className="max-w-md w-full bg-n0 rounded-2xl border border-n200 p-8 space-y-4 text-center">
                <h1 className="text-lg font-semibold text-n900">{title}</h1>
                {children}
            </div>
        </div>
    );
}

function Actions() {
    const { logout, tenants, tenantId, selectTenant } = useAuth();
    // Engel ekranı uygulamanın yerini aldığı için kenar menüdeki seçiciye
    // ulaşılamaz: başka şirketi varsa buradan geçebilsin (seçim kaydedilir,
    // engellenen şirket bir daha kendiliğinden açılmaz).
    const others = (tenants || []).filter((t) => t.id !== tenantId);
    return (
        <div className="flex flex-col gap-2 pt-2">
            {others.length > 0 && (
                <div className="space-y-2 text-left">
                    <p className="text-[12px] text-n500">Başka bir şirketle devam edin:</p>
                    {others.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => selectTenant(t.id)}
                            className="w-full tf-btn tf-btn-secondary justify-between"
                        >
                            <span>{t.name}</span>
                        </button>
                    ))}
                </div>
            )}
            <a href={HUB_INN_URL} className="tf-btn tf-btn-primary justify-center">
                Clyro Hub'a git
            </a>
            <button type="button" onClick={() => logout()} className="tf-btn tf-btn-secondary justify-center">
                Çıkış yap
            </button>
        </div>
    );
}

export function TenantSelector() {
    const { tenants, selectTenant } = useAuth();
    return (
        <Shell title="Şirket seçin">
            <p className="text-sm text-n600">Birden çok şirkette üyesiniz. Hangisiyle devam etmek istiyorsunuz?</p>
            <ul className="space-y-2 text-left">
                {tenants.map((t) => (
                    <li key={t.id}>
                        <button
                            type="button"
                            onClick={() => selectTenant(t.id)}
                            className="w-full tf-btn tf-btn-secondary justify-between"
                        >
                            <span>{t.name}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </Shell>
    );
}

/** Şirket kapısı: içerik açılamıyorsa ilgili ekranı döner, açılabiliyorsa null. */
export function tenantGateScreen(ctx) {
    const { tenants, tenantId, userProfile, tenant, tenantReadable, tenantSuspended } = ctx;
    if (tenants.length === 0) {
        return (
            <Shell title="Bu hesapla açık bir şirket yok">
                <p className="text-sm text-n600">
                    Clyro Talent'a Clyro Hub üzerinden girilir. Şirketinizin yöneticisinden Hub'a davet isteyin ya da
                    Hub'da Talent'ı açın.
                </p>
                <Actions />
            </Shell>
        );
    }
    if (!tenantId) return <TenantSelector />;
    if (tenantSuspended) {
        return (
            <Shell title="Şirket hesabı askıya alınmış">
                <p className="text-sm text-n600">Ayrıntı için Clyro destek ile iletişime geçin.</p>
                <Actions />
            </Shell>
        );
    }
    if (!userProfile) {
        return (
            <Shell title="Bu şirkette erişiminiz yok">
                <p className="text-sm text-n600">Üyeliğiniz kaldırılmış ya da süresi dolmuş olabilir.</p>
                <Actions />
            </Shell>
        );
    }
    if (!tenant || !tenantReadable) {
        return (
            <Shell title="Şirketin deneme süresi sona erdi">
                <p className="text-sm text-n600">Erişim kapandı. Plan seçmek için Clyro Hub'ı açın.</p>
                <Actions />
            </Shell>
        );
    }
    return null;
}

export function ReadOnlyBanner() {
    const { tenantWritable, isSupport, tenant } = useAuth();
    if (tenantWritable || !tenant) return null;
    const text = isSupport
        ? 'Destek erişimi: bu şirketin verisini yalnız görüntüleyebilirsiniz.'
        : 'Deneme süresi sona erdi: alan salt okunur. Değişiklik için Clyro Hub\'dan plan seçin.';
    return (
        <div role="status" className="px-4 py-2 text-[13px] bg-amber-50 text-amber-900 border-b border-amber-200">
            {text}
        </div>
    );
}
