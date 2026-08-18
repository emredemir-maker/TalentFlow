// KURUMUN SEKTÖR PROFİLİ — "biz hangi işi yapıyoruz".
//
// Sektör uyumu ölçümünün hedefi. Bu üç alan girilmeden sectorFit hiçbir şey
// söyleyemez ve ekranda "hedef sektör tanımlı değil" yazar — sıfır uyum
// DEĞİL, ölçüm yapılamadı.
//
// Kurumsal Kimlik (settings/branding) dokümanında duruyor: orası zaten
// "bu şirket kim" sorusunun cevabı ve strict-auth ile okunabiliyor, yani
// aday ekranları ek bir izin gerektirmeden hedefi görebiliyor.
//
// ── NEDEN POZİSYON BAZINDA DEĞİL (henüz) ────────────────────────────────────
// Bir ilan kurumun ana sektöründen farklı bir dikeye bakıyor olabilir
// (fintech ekibine alım gibi). Doğru çözüm ilan bazında geçersiz kılma ama
// önce kurum varsayılanı gerekiyor: ilanların çoğu kurumun kendi sektöründe.
// Geçersiz kılma, hedef profil okunan TEK yer burası olduğu için sonradan
// tek noktadan eklenebilir.

import { doc, getDoc, setDoc } from 'firebase/firestore';

import { db } from '../config/firebase';
import { getLogger } from './logger';
import { normalizeTarget } from '../utils/sectorFit';

const log = getLogger('orgProfile');

const BRANDING_PATH = 'artifacts/talent-flow/public/data/settings/branding';

/**
 * Kurumsal Kimlik dokümanındaki alan adı.
 *
 * Dışa açık: BrandingSettingsPage aynı dokümanı tek parça hâlinde kaydediyor
 * ve alan adını oradan da yazıyor. İki yerde elle yazılmış bir dize, sessizce
 * ayrışıp "kaydettim ama okumuyor" hatasını üretirdi.
 */
export const ORG_PROFILE_FIELD = 'sectorProfile';
const FIELD = ORG_PROFILE_FIELD;

/**
 * Kurumun hedef profilini okur.
 *
 * @returns {Promise<{sector: string, model: string, type: string}|null>}
 *   null: tanımlı değil. Çağıran bunu "eşleşme yok" saymamalı.
 */
export async function readOrgProfile() {
    try {
        const snap = await getDoc(doc(db, BRANDING_PATH));
        if (!snap.exists()) return null;
        return normalizeTarget(snap.data()?.[FIELD]);
    } catch (err) {
        log.warn(`kurum profili okunamadı: ${err?.message}`);
        return null;
    }
}

/**
 * Kurumun hedef profilini yazar.
 *
 * Boş eksenler null olarak saklanır, alan silinmez: "girilmemiş" ile
 * "bilinmiyor" aynı şey ve ikisi de UYDURULMAZ.
 */
export async function writeOrgProfile(profile) {
    const value = {
        sector: profile?.sector || null,
        model: profile?.model || null,
        type: profile?.type || null,
    };
    await setDoc(doc(db, BRANDING_PATH), { [FIELD]: value }, { merge: true });
    return normalizeTarget(value);
}
