// Adayın orijinal CV dosyasına erişim (PR 6, docs/coklu-sirket-plani.md §1.2).
//
// Yeni kayıtlar Storage YOLUNU tutar (`cvPath`, tenants/{t}/cvs/…); jetonlu
// kalıcı indirme adresi (getDownloadURL) kullanılmaz — o adres kuralları ve
// üyeliği atlar, eline geçen herkese süresiz açıktır. Dosya her açılışta
// sunucudan istenir: GET /api/candidates/:id/cv üyeliği ve department_user
// görünürlüğünü denetler, erişimi deftere yazar, dosyayı önbelleğe aldırmaz.
// Tarayıcıda bellek içi bir adres (blob:) olarak gösterilir.
//
// Eski kayıtlar (yalnız `cvUrl`) olduğu gibi açılır.
import { useEffect, useState } from 'react';

import { getAuthHeaders } from './ai/config';

const API_BASE = import.meta.env?.VITE_SERVER_URL || '';

/** Bu aday sunucu üzerinden açılan bir CV dosyası mı taşıyor? */
export function hasStoredCv(candidate) {
    return Boolean(candidate?.id && typeof candidate?.cvPath === 'string' && candidate.cvPath);
}

/** CV dosyasını sunucudan alır → bellek içi adres. Çağıran revoke eder. */
export async function fetchCandidateCvObjectUrl(candidateId, { fetchImpl = fetch } = {}) {
    const res = await fetchImpl(`${API_BASE}/api/candidates/${encodeURIComponent(candidateId)}/cv`, {
        headers: await getAuthHeaders(),
    });
    if (!res.ok) throw new Error(res.status === 404 ? 'CV dosyası bulunamadı.' : 'CV dosyası açılamadı.');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
}

/**
 * Bileşenler için: gösterilecek CV adresi. Sunucudan gelen dosyada bellek içi
 * adres (bileşen kapanınca bırakılır), eski kayıtta `cvUrl`.
 * @returns {{ url: string|null, loading: boolean, error: string|null }}
 */
export function useCandidateCvUrl(candidate, { enabled = true } = {}) {
    const stored = hasStoredCv(candidate);
    const legacy = !stored && candidate?.cvUrl ? candidate.cvUrl : null;
    const [state, setState] = useState({ url: null, loading: false, error: null });

    useEffect(() => {
        if (!stored || !enabled) {
            setState({ url: null, loading: false, error: null });
            return undefined;
        }
        let cancelled = false;
        let objectUrl = null;
        setState({ url: null, loading: true, error: null });
        fetchCandidateCvObjectUrl(candidate.id)
            .then((u) => {
                objectUrl = u;
                if (cancelled) URL.revokeObjectURL(u);
                else setState({ url: u, loading: false, error: null });
            })
            .catch((err) => {
                if (!cancelled) setState({ url: null, loading: false, error: err.message });
            });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [stored, enabled, candidate?.id, candidate?.cvPath]);

    if (legacy) return { url: legacy, loading: false, error: null };
    return state;
}

/**
 * Tek tıkla yeni sekmede aç (çekmece düğmesi). Açılır pencere engelleyicisine
 * takılmamak için sekme tıklama anında açılır, adres dosya gelince verilir.
 */
export async function openCandidateCv(candidate) {
    if (!hasStoredCv(candidate)) {
        if (candidate?.cvUrl) window.open(candidate.cvUrl, '_blank', 'noopener,noreferrer');
        return;
    }
    const win = window.open('', '_blank');
    try {
        const url = await fetchCandidateCvObjectUrl(candidate.id);
        if (win) win.location.href = url;
        else window.location.assign(url);
        // Sekme yüklendikten sonra bellek bırakılır.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
        if (win) win.close();
        alert(err.message);
    }
}
