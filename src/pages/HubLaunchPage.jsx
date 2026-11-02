// src/pages/HubLaunchPage.jsx
// Clyro Hub'dan tek tık geçiş (docs/coklu-sirket-plani.md §2.3, PR 4).
//
// Hub bu sayfaya adresin # kısmında tek kullanımlık, 60 saniyelik bir kod koyar. Kod okunur okunmaz adres
// çubuğundan silinir ve TALENT SUNUCUSUNA verilir (POST /api/hub/exchange). Kodu Hub'da değiştiren Talent
// sunucusudur (sunucudan sunucuya, paylaşılan gizli değerle); Hub şirketi, rolü ve deneme durumunu yalnız
// sunucuya söyler, sunucu şirket + üyelik belgelerini yazar. Tarayıcıya yalnız Firebase giriş jetonu ve
// şirket kimliği döner; jeton bellekte kalır. Yetki üyelik belgesinden gelir (jeton talebi yok).

import { useEffect, useRef, useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../config/firebase';
import { HUB_TENANT_KEY, HUB_INN_URL } from '../context/AuthContext';
import { isValidTenantId } from '../config/tenantPaths';

const API_BASE = import.meta.env.VITE_SERVER_URL || '';

async function exchangeCode(code, { fetchImpl = fetch, storage = sessionStorage } = {}) {
    const res = await fetchImpl(`${API_BASE}/api/hub/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    if (!res || !res.ok || !body?.token) throw new Error(body?.error || 'Giriş tamamlanamadı. Clyro Hub\'dan yeniden açın.');
    // Hub hangi şirketten açıldıysa o şirket seçilir (AuthContext tek seferlik okur).
    if (isValidTenantId(body.tenantId)) {
        try {
            storage.setItem(HUB_TENANT_KEY, body.tenantId);
        } catch {
            /* özel mod */
        }
    }
    return body.token;
}

export default function HubLaunchPage() {
    const [code] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('code'));
    const [error, setError] = useState(() => {
        if (!code) return 'Giriş bağlantısı eksik ya da kullanılmış.';
        return auth ? '' : 'Firebase yapılandırılmamış.';
    });
    const started = useRef(false);

    useEffect(() => {
        window.history.replaceState(null, '', window.location.pathname);
        if (!code || !auth || started.current) return;
        started.current = true;
        exchangeCode(code)
            .then((token) => signInWithCustomToken(auth, token))
            // Tam sayfa açılış: aynı kişi başka şirketteyken Hub'dan gelirse dinleyiciler ve önbellekler eski
            // şirketin yollarında kalmasın; AuthContext Hub'ın şirketini sıfırdan seçer.
            .then(() => window.location.replace('/'))
            .catch((err) => setError(err?.message || 'Giriş yapılamadı.'));
    }, [code]);

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
            <div className="max-w-sm text-center space-y-3">
                {error ? (
                    <>
                        <p className="text-slate-800">{error}</p>
                        <p className="text-sm text-slate-500">Clyro Hub'dan Talent'ı yeniden açın.</p>
                        <a href={HUB_INN_URL} className="text-sm text-indigo-600 underline">Clyro Hub'a git</a>
                    </>
                ) : (
                    <p className="text-slate-500">Hub-Inn hesabınızla giriş yapılıyor…</p>
                )}
            </div>
        </div>
    );
}
