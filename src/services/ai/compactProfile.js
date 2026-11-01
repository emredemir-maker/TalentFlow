// CANLI MÜLAKAT İÇİN KOMPAKT ADAY PROFİLİ (~800 token).
//
// Eskiden her canlı çağrıya `stripPII(candidateData)` gidiyordu: `cvData`
// (tüm CV dökümü), aiAnalysis, eşleşme ayrıntıları... Aday başına birkaç bin
// token, ve bu yük saatte onlarca çağrıda TEKRAR TEKRAR faturalanıyordu.
// Canlı analiz için gereken çok daha az: özet, beceriler, son roller ve
// pozisyonun gereksinimleri.
//
// PII temizliği DEĞİŞMEDİ: önce stripPiiForAI çalışır, kompakt profil onun
// çıktısından seçilir. Seçilen serbest metinler de yeniden temizlenir —
// `experiences[].desc` gibi alanlar stripPiiForAI'nin metin listesinde yok.

import { stripPiiForAI, redactPiiFromText } from '../../utils/pii.js';

/** Hedef: ~800 token. Türkçe metinde ~4 karakter/token kaba ama tutarlı bir ölçü. */
export const COMPACT_PROFILE_MAX_CHARS = 3200;
export const COMPACT_MAX_ROLES = 5;
const MAX_SKILLS = 25;
const MAX_REQUIREMENTS = 12;

/** Kaba token tahmini — testler ve PR'daki maliyet hesabı aynı ölçüyü kullanıyor. */
export function estimateTokens(text) {
    return Math.ceil(String(text || '').length / 4);
}

const clip = (v, n) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const clean = (v, n) => clip(redactPiiFromText(typeof v === 'string' ? v : ''), n);

/**
 * @param {object} candidate — ham aday kaydı (PII içerebilir)
 * @param {{title?: string, requirements?: string[]|string}} [position]
 * @returns {object} JSON'a çevrildiğinde COMPACT_PROFILE_MAX_CHARS'ı aşmayan profil
 */
export function buildCompactProfile(candidate, position = {}) {
    const safe = stripPiiForAI(candidate);

    const skills = (Array.isArray(safe.skills) ? safe.skills : [])
        .filter((s) => typeof s === 'string' && s.trim())
        .slice(0, MAX_SKILLS)
        .map((s) => clip(s, 40));

    const roles = (Array.isArray(safe.experiences) ? safe.experiences : [])
        .slice(0, COMPACT_MAX_ROLES)
        .map((e) => ({
            role: clean(e?.role || e?.title, 60),
            company: clean(e?.company, 60),
            duration: clip(e?.duration, 40),
            desc: clean(e?.desc || e?.description, 200),
        }))
        .filter((e) => e.role || e.company);

    const reqList = Array.isArray(position?.requirements)
        ? position.requirements
        : typeof position?.requirements === 'string'
            ? position.requirements.split(/,\s*/)
            : [];

    const profile = {
        position: clean(safe.position || safe.title, 80),
        experienceYears: Number.isFinite(Number(safe.experience)) ? Number(safe.experience) : null,
        summary: clean(safe.aiAnalysis?.summary || safe.summary, 600),
        skills,
        roles,
        targetPosition: {
            title: clean(position?.title || safe.matchedPositionTitle || safe.bestTitle, 80),
            requirements: reqList
                .filter((r) => typeof r === 'string' && r.trim())
                .slice(0, MAX_REQUIREMENTS)
                .map((r) => clean(r, 120)),
        },
    };

    // Üst sınır SERT: alanlar ayrı ayrı kırpılmış olsa da toplam taşarsa en
    // az değerli olandan başlayarak kısalt.
    const size = () => JSON.stringify(profile).length;
    while (size() > COMPACT_PROFILE_MAX_CHARS && profile.roles.length > 1) profile.roles.pop();
    while (size() > COMPACT_PROFILE_MAX_CHARS && profile.skills.length > 5) profile.skills.pop();
    while (size() > COMPACT_PROFILE_MAX_CHARS && profile.targetPosition.requirements.length > 3) {
        profile.targetPosition.requirements.pop();
    }
    if (size() > COMPACT_PROFILE_MAX_CHARS) profile.summary = clip(profile.summary, 200);
    return profile;
}
