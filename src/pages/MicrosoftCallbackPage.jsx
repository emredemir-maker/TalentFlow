// src/pages/MicrosoftCallbackPage.jsx
// Handles Microsoft OAuth 2.0 callback redirect
// Opened as a popup — extracts code, calls server to exchange for tokens, then closes.

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function MicrosoftCallbackPage() {
    const { user } = useAuth();
    const [status, setStatus] = useState('loading'); // loading | success | error
    const [message, setMessage] = useState('');

    useEffect(() => {
        const run = async () => {
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            const state = params.get('state'); // contains userId
            const error = params.get('error');
            const errorDesc = params.get('error_description');

            if (error) {
                const msg = errorDesc || error || 'Microsoft oturum açma başarısız.';
                setStatus('error');
                setMessage(msg);
                window.opener?.postMessage({ type: 'MICROSOFT_OAUTH_CALLBACK', error: msg }, window.location.origin);
                setTimeout(() => window.close(), 2000);
                return;
            }

            if (!code) {
                const msg = 'OAuth kodu alınamadı.';
                setStatus('error');
                setMessage(msg);
                window.opener?.postMessage({ type: 'MICROSOFT_OAUTH_CALLBACK', error: msg }, window.location.origin);
                setTimeout(() => window.close(), 2000);
                return;
            }

            try {
                setMessage('Microsoft hesabınız bağlanıyor...');
                const idToken = await user?.getIdToken();
                const redirectUri = `${window.location.origin}/auth/microsoft/callback`;

                const res = await fetch('/api/auth/microsoft/exchange', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
                    },
                    body: JSON.stringify({ code, state, redirectUri })
                });

                const data = await res.json();

                if (!res.ok || !data.success) {
                    throw new Error(data.error || 'Token değişimi başarısız.');
                }

                setStatus('success');
                setMessage(`Bağlantı başarılı: ${data.email}`);
                window.opener?.postMessage({
                    type: 'MICROSOFT_OAUTH_CALLBACK',
                    email: data.email,
                    success: true
                }, window.location.origin);
                setTimeout(() => window.close(), 1500);
            } catch (err) {
                console.error('[MicrosoftCallback] Error:', err);
                setStatus('error');
                setMessage(err.message);
                window.opener?.postMessage({
                    type: 'MICROSOFT_OAUTH_CALLBACK',
                    error: err.message
                }, window.location.origin);
                setTimeout(() => window.close(), 3000);
            }
        };

        run();
    }, [user]);

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 max-w-sm w-full text-center">
                <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: status === 'error' ? '#fef2f2' : status === 'success' ? '#f0fdf4' : '#f1f5f9' }}>
                    {status === 'loading' && (
                        <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    )}
                    {status === 'success' && (
                        <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                    {status === 'error' && (
                        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    )}
                </div>

                {/* Microsoft Logo */}
                <div className="flex justify-center mb-3">
                    <svg width="20" height="20" viewBox="0 0 23 23">
                        <path fill="#f25022" d="M0 0h11v11H0z" />
                        <path fill="#00a4ef" d="M12 0h11v11H12z" />
                        <path fill="#7fba00" d="M0 12h11v11H0z" />
                        <path fill="#ffb900" d="M12 12h11v11H12z" />
                    </svg>
                </div>

                <h2 className={`text-base font-bold mb-2 ${status === 'error' ? 'text-red-700' : status === 'success' ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {status === 'loading' && 'Bağlanıyor...'}
                    {status === 'success' && 'Bağlantı Başarılı'}
                    {status === 'error' && 'Bağlantı Başarısız'}
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                    {message || (status === 'loading' ? 'Microsoft hesabınız doğrulanıyor...' : '')}
                </p>
                {status !== 'loading' && (
                    <p className="text-[10px] text-slate-400 mt-3">Bu pencere otomatik kapanacak...</p>
                )}
            </div>
        </div>
    );
}
