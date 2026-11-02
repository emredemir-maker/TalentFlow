// Aday sayfalarının bağlantı kapısı (docs/coklu-sirket-plani.md §2.5).
//
// `/apply/:linkId`, `/join/:linkId`, `/respond/:linkId` rotaları bu kapının
// içinde çizilir. Kapı bağlantıyı sunucuda çözer (GET /api/public/resolve),
// türü beklenenle karşılaştırır, ETKİN ŞİRKETİ bağlantının şirketine ayarlar
// ve sayfaya hedef kaydı verir. Sayfa ancak çözüm bittikten sonra çizilir:
// Firestore okumaları (kurallarla sınırlı tekil get) doğru şirketin yolunu
// kullansın diye.
import { createContext, useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';

import { setLinkTenantId } from '../config/tenantPaths';
import { requestPublicLink, resolvePublicLink } from '../services/publicLinks';

const PublicLinkContext = createContext(null);

/** Aday sayfasında çözülmüş bağlantı: { linkId, kind, targetId, tenantId } ya da null. */
export function usePublicLink() {
    return useContext(PublicLinkContext);
}

export function PublicLinkGate({ kinds, children }) {
    const { linkId } = useParams();
    const [state, setState] = useState({ status: 'loading' });

    useEffect(() => {
        let cancelled = false;
        setState({ status: 'loading' });
        resolvePublicLink(linkId)
            .then((r) => {
                if (cancelled) return;
                if (!kinds.includes(r.kind)) throw new Error('Bağlantı geçersiz.');
                setLinkTenantId(r.tenantId);
                setState({ status: 'ok', link: { linkId, kind: r.kind, targetId: r.targetId, tenantId: r.tenantId } });
            })
            .catch((err) => {
                if (!cancelled) setState({ status: 'error', message: err.message || 'Bağlantı geçersiz.' });
            });
        return () => {
            cancelled = true;
        };
        // kinds her çizimde yeni dizi olabilir; içerik sabit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [linkId]);

    if (state.status === 'loading') {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center" data-testid="public-link-loading">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }
    if (state.status === 'error') {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-10 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-5">
                        <AlertCircle className="w-7 h-7 text-red-400" />
                    </div>
                    <h1 className="text-lg font-black text-slate-800 mb-2">Bağlantı açılamadı</h1>
                    <p className="text-slate-500 text-sm" data-testid="public-link-error">{state.message}</p>
                </div>
            </div>
        );
    }
    return <PublicLinkContext.Provider value={state.link}>{children}</PublicLinkContext.Provider>;
}

/**
 * İç kullanıcı ekranları: bir ilan ya da mülakat için aday bağlantısının tam
 * adresi (sunucudan istenir; aynı kayıt için hep aynı bağlantı). Hazır olana
 * kadar ya da `targetId` yoksa null.
 */
export function usePublicLinkUrl(kind, targetId, { candidateId } = {}) {
    const [url, setUrl] = useState(null);
    useEffect(() => {
        let cancelled = false;
        setUrl(null);
        if (!targetId || (kind === 'interview' && !candidateId)) return undefined;
        requestPublicLink(kind, targetId, { candidateId })
            .then((r) => {
                if (!cancelled) setUrl(r.url);
            })
            .catch((err) => console.warn('[publicLink] bağlantı alınamadı:', err.message));
        return () => {
            cancelled = true;
        };
    }, [kind, targetId, candidateId]);
    return url;
}
