// src/pages/HubLaunchPage.jsx
// Hub-Inn'den tek tık geçiş. Hub-Inn bu sayfaya adresin # kısmında tek kullanımlık, 60 saniyelik bir kod koyar
// (Hub-Inn apps/api/src/routes/apps.ts). Kod okunur okunmaz adres çubuğundan silinir ve Hub-Inn'de bir kez Firebase
// özel giriş jetonuyla değiştirilir; jeton yalnız bellekte kalır. Girişten sonra yetki TalentFlow rolünden gelir.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../config/firebase';

// Alan adı değişince VITE_HUB_INN_URL ile.
const HUB_INN_URL = import.meta.env.VITE_HUB_INN_URL || 'https://agentinn-nyqpx.web.app';

async function exchangeCode(code) {
    const res = await fetch(`${HUB_INN_URL}/api/apps/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: 'talent', code }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.token) throw new Error(body?.error || "Hub-Inn'e ulaşılamadı.");
    return body.token;
}

export default function HubLaunchPage() {
    const navigate = useNavigate();
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
            .then(() => navigate('/', { replace: true }))
            .catch((err) => setError(err?.message || 'Giriş yapılamadı.'));
    }, [code, navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
            <div className="max-w-sm text-center space-y-3">
                {error ? (
                    <>
                        <p className="text-slate-800">{error}</p>
                        <p className="text-sm text-slate-500">Hub-Inn'den yeniden açabilir ya da buradan giriş yapabilirsiniz.</p>
                        <a href="/" className="text-sm text-indigo-600 underline">Giriş ekranına git</a>
                    </>
                ) : (
                    <p className="text-slate-500">Hub-Inn hesabınızla giriş yapılıyor…</p>
                )}
            </div>
        </div>
    );
}
