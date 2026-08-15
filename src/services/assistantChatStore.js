// Asistan sohbetinin kalıcı hâli.
//
// Sohbet kullanıcının kendi alt koleksiyonunda duruyor:
//   artifacts/talent-flow/public/data/users/{uid}/assistantChats/current
//
// Bu yol firestore.rules'ta ZATEN kapalı — `users/{userId}/{allChildren=**}`
// yalnızca o kullanıcıya (ve super_admin'e) okuma/yazma veriyor. Yeni kural
// gerekmedi; sohbetin başka bir kullanıcıya görünme ihtimali de yok.
//
// Tek belge, tek sohbet. "Yeni konu" arşivlemez, temizler — arşiv ayrı bir
// özellik ve şimdilik istenmedi. Sessizce arşivliyormuş gibi davranmaktansa
// temizlediğini açıkça yapmak yeğ.

import { doc, getDoc, setDoc } from 'firebase/firestore';

import { db } from '../config/firebase';
import { serializeTurns } from '../utils/assistantContext';

const CHAT_ID = 'current';

function chatRef(uid) {
    if (!db) throw new Error('Firestore yapılandırılmamış.');
    if (!uid) throw new Error('Oturum bilgisi çözümlenemedi.');
    return doc(db, `artifacts/talent-flow/public/data/users/${uid}/assistantChats/${CHAT_ID}`);
}

/**
 * Kayıtlı sohbeti okur.
 * @returns {Promise<Array>} tur dizisi (yoksa boş)
 */
export async function loadChat(uid) {
    const snap = await getDoc(chatRef(uid));
    if (!snap.exists()) return [];
    const turns = snap.data()?.turns;
    return Array.isArray(turns) ? turns : [];
}

/** Sohbeti yazar (tur listesi depolanabilir hâle indirgenir). */
export async function saveChat(uid, turns) {
    await setDoc(chatRef(uid), {
        turns: serializeTurns(turns),
        updatedAt: new Date().toISOString(),
    });
}

/** Sohbeti temizler — "yeni konu". */
export async function clearChat(uid) {
    await setDoc(chatRef(uid), { turns: [], updatedAt: new Date().toISOString() });
}
