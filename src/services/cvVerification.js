// DOĞRULAMA RAPORU — üç ölçümü tek çıktıda birleştirir.
//
//   Katman 1  CV'nin kendi içindeki çelişkiler  (utils/cvConsistency.js)
//   Katman 2  Şirketlerin dış kaynaklarla doğrulanması (utils/companyClaims.js)
//   Sektör    Kariyerin ne kadarı hedef sektörde geçmiş (utils/sectorFit.js)
//
// Üçü tek şirket çözümlemesini paylaşıyor: bir kez arayıp hem "bu şirket var
// mı" hem "ne iş yapıyor" sorusunu cevaplıyoruz. İkinci arama saf israf olurdu.
//
// ── RAPORUN ASIL ÇIKTISI PUAN DEĞİL, SORU ───────────────────────────────────
// Bu modül hiçbir skoru değiştirmez ve bir "güvenilirlik notu" üretmez.
// Ürettiği şey MÜLAKAT ÖNCESİ SORULACAKLAR listesi. Bir bayrağın değeri,
// insanı elemesinde değil, doğru soruyu sordurmasında.
//
// ── SESSİZ KISITLAMA YOK ────────────────────────────────────────────────────
// Arama tavanına takılan şirketler rapora "taranmadı" olarak YAZILIR. Bir
// kapsam sınırını söylememek, raporu "her şeye baktım" diye okutur — ölçmediği
// şeyi ölçmüş gibi gösteren bir araç, hiç ölçmeyenden daha tehlikeli.

import {
    buildConsistencyReport,
    measureExperiences,
    requiredYearsOf,
    SEVERITY,
} from '../utils/cvConsistency';
import { verifyCompanyClaim, summarizeCompanyVerification } from '../utils/companyClaims';
import { buildSectorEntries, measureSectorFit } from '../utils/sectorFit';
import { currentYearMonth } from '../utils/cvDates';
import { uniqueCompanies } from './ai/companyIntel';
import { resolveCompanies } from './companyIntelStore';

const SEVERITY_RANK = { celiski: 0, dikkat: 1, bilgi: 2 };

/**
 * Raporu aday belgesine yazılacak KÜÇÜK bir özete indirger.
 *
 * Raporun tamamı saklanmıyor: bayrak metinleri, kaynak listeleri ve şirket
 * kanıtları kilobaytlarca yer tutar ve hepsi yeniden üretilebilir (şirket
 * verisi zaten companyIntel önbelleğinde). Aday belgesinde yalnızca LİSTENİN
 * ve SKORUN ihtiyaç duyduğu sayılar duruyor.
 *
 * Firestore `undefined` kabul etmiyor — her alan açıkça null'a düşürülüyor.
 *
 * @param {object} report verifyCandidate() çıktısı
 * @returns {object} candidate.verification alanına yazılacak özet
 */
export function buildVerificationSummary(report) {
    const c = report?.companySummary?.counts || {};
    const fit = report?.sectorFit || null;
    const skipped = report?.lookup?.skipped?.length || 0;
    const failed = report?.lookup?.failed?.length || 0;

    return {
        at: report?.verifiedAt || new Date().toISOString(),
        counts: {
            celiski: report?.counts?.celiski || 0,
            dikkat: report?.counts?.dikkat || 0,
            bilgi: report?.counts?.bilgi || 0,
        },
        flagIds: (report?.flags || []).map((f) => f.id),
        companies: {
            total: report?.companySummary?.total || 0,
            dogrulandi: c.dogrulandi || 0,
            dogrulanamadi: c.dogrulanamadi || 0,
            celiski: c.celiski || 0,
        },
        // TARAMA EKSİK KALDIYSA SKOR CEZASI UYGULANMAZ. Atlanan şirket bizim
        // tavanımızın sonucu; adayın skorundan düşmek kendi kısıtımızın
        // faturasını ona kesmek olurdu (bkz. utils/verificationScore.js).
        lookupComplete: skipped === 0 && failed === 0,
        sector: fit
            ? {
                verdict: fit.verdict,
                exactMonths: fit.exactMonths || 0,
                nearMonths: fit.nearMonths || 0,
                recentExactMonths: fit.recentExactMonths || 0,
                share: fit.share === null || fit.share === undefined ? null : fit.share,
                stale: Boolean(fit.stale),
                target: fit.target?.sector || null,
            }
            : null,
    };
}

// requiredYearsOf artık utils/cvConsistency.js'te yaşıyor: liste rozetleri de
// aynı eşiğe ihtiyaç duyuyor ve o tarafın bu tek satır için tüm doğrulama
// zincirini — dolayısıyla Firestore'u — import etmesi saçma olurdu. Mevcut
// çağıranlar ve testler için buradan yeniden dışa aktarılıyor.
export { requiredYearsOf };

/**
 * Arama sorgusunu daraltan bağlam.
 *
 * Aynı adı taşıyan farklı şirketleri ayırmak için: "Delta Yazılım" bağlamsız
 * aratıldığında Türkiye'deki üç ayrı Delta'dan hangisi olduğu belli olmaz ve
 * yanlış şirketin verisi adayın CV'sine yapıştırılır.
 */
function hintFor(candidate) {
    return [candidate?.location, candidate?.position].filter(Boolean).join(', ');
}

/**
 * Bir aday için doğrulama raporu üretir.
 *
 * @param {object} candidate Firestore aday dokümanı
 * @param {object} options
 *   today         — testler zamanı sabitlesin diye
 *   targetProfile — {sector, model, type} kurum hedefi; yoksa sektör ölçümü atlanır
 *   position      — ilan; yıl eşiği bundan çıkarılır
 *   force         — önbelleği yok say
 *   maxLookups    — canlı arama tavanı
 *   resolveAll    — testler için enjekte edilebilir çözümleyici
 *   onProgress    — (done, total)
 * @returns {Promise<object>}
 */
export async function verifyCandidate(candidate, {
    today = currentYearMonth(),
    targetProfile = null,
    position = null,
    force = false,
    maxLookups,
    resolveAll = resolveCompanies,
    onProgress = null,
} = {}) {
    const experiences = Array.isArray(candidate?.experiences) ? candidate.experiences : [];

    // ── Katman 1 ────────────────────────────────────────────────────────────
    const requiredYears = requiredYearsOf(position);
    const consistency = buildConsistencyReport(candidate, { today, requiredYears });
    const measured = measureExperiences(experiences, today);

    // ── Şirket çözümlemesi (Katman 2 ve sektör ölçümü bunu paylaşır) ────────
    const companies = uniqueCompanies(experiences);
    const lookup = await resolveAll(companies, {
        hint: hintFor(candidate),
        force,
        ...(maxLookups === undefined ? {} : { maxLookups }),
        onProgress,
    });
    const intel = lookup?.intel instanceof Map ? lookup.intel : new Map();

    // ── Katman 2: her görev için iddia ↔ kanıt ──────────────────────────────
    // Aynı şirkette birden fazla görev varsa şirket bir kez doğrulanır ama
    // en ERKEN başlangıç tarihi kullanılır: kuruluş çelişkisi ancak en eski
    // iddiaya karşı anlamlı.
    const claimByCompany = new Map();
    for (const rowItem of measured.rows) {
        if (!rowItem.company) continue;
        const startYear = rowItem.range?.start?.year ?? null;
        const prev = claimByCompany.get(rowItem.company);
        if (!prev) {
            claimByCompany.set(rowItem.company, {
                company: rowItem.company,
                role: rowItem.role,
                duration: rowItem.duration,
                startYear,
            });
            continue;
        }
        if (startYear !== null && (prev.startYear === null || startYear < prev.startYear)) {
            prev.startYear = startYear;
            prev.duration = rowItem.duration;
        }
    }

    const companyResults = [...claimByCompany.values()].map((claim) => {
        const evidence = intel.get(claim.company) || null;
        const result = verifyCompanyClaim({ claim, evidence, candidateName: candidate?.name });
        return { ...result, evidence, claim };
    });
    const companySummary = summarizeCompanyVerification(companyResults);

    // ── Sektör uyumu ────────────────────────────────────────────────────────
    const sectorFit = measureSectorFit(buildSectorEntries(measured.rows, intel), targetProfile, { today });

    // ── Kapsam dürüstlüğü: taranmayanı söyle ────────────────────────────────
    const coverageFlags = [];
    if (lookup?.skipped?.length) {
        coverageFlags.push({
            id: 'tarama-tavani',
            severity: SEVERITY.INFO,
            title: 'Bazı şirketler taranmadı',
            detail: `Arama tavanı nedeniyle ${lookup.skipped.length} şirket bu turda taranmadı: ${lookup.skipped.join(', ')}. Rapor bu şirketleri kapsamıyor.`,
            question: '',
        });
    }
    if (lookup?.failed?.length) {
        coverageFlags.push({
            id: 'tarama-hatasi',
            severity: SEVERITY.INFO,
            title: 'Bazı şirketler çözümlenemedi',
            detail: `${lookup.failed.map((f) => f.name).join(', ')} için arama başarısız oldu.`,
            question: '',
        });
    }

    const flags = [...consistency.flags, ...companySummary.flags, ...coverageFlags]
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

    const counts = { celiski: 0, dikkat: 0, bilgi: 0 };
    for (const f of flags) counts[f.severity] += 1;

    return {
        consistency,
        measured,
        companies: companyResults,
        companySummary,
        sectorFit,
        flags,
        // Aynı soru iki bayraktan da doğabilir; mülakatçıya iki kez sormak
        // için verilmez.
        questions: [...new Set(flags.map((f) => f.question).filter(Boolean))],
        counts,
        lookup: {
            fromCache: lookup?.fromCache || 0,
            looked: lookup?.looked || 0,
            skipped: lookup?.skipped || [],
            failed: lookup?.failed || [],
            total: companies.length,
        },
        requiredYears,
        verifiedAt: new Date().toISOString(),
    };
}
