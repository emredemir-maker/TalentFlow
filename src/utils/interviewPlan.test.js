// Mülakat planı — neyin sorulacağına tarama karar verir.
//
// Bu dosyanın asıl işi iki şeyi sabitlemek:
//   1. Plan DETERMİNİSTİK — aynı tarama her zaman aynı planı verir. Öncelik
//      ve süre AI'a bırakılsaydı iki çalıştırma iki farklı plan verirdi.
//   2. Bayat analizde plan ÜRETİLMEZ. Bugün aynı hata (madde numarası kayması)
//      skorda, kırılımda ve zorunlu kapısında üç kez çıktı. Dördüncüsü
//      mülakat odasında, adayın karşısında çıkardı.
import { describe, expect, it } from 'vitest';

import {
    buildInterviewPlan, planSummary, priorityLabel, planToText, savedPlanFor,
    CRITICAL, HIGH, MEDIUM, LOW, PLAN_SCHEMA, OPENING_MINUTES, CLOSING_MINUTES,
} from './interviewPlan';
import { requirementsFingerprint } from './positionRequirements';

const POSITION = {
    title: 'Growth Product Manager',
    requirementsMeta: [
        { text: 'Funnel sahipliği', must: true },
        { text: 'A/B test kurgulama', must: true },
        { text: 'CX ürünü geliştirmiş olmak', must: true },
        { text: 'GA4 hakimiyeti', must: false },
        { text: 'SQL bilgisi', must: false },
    ],
};

const FP = requirementsFingerprint(POSITION);

/** statuses[i] → i+1 numaralı maddenin durumu. */
const analysis = (assessments, extra = {}) => ({
    requirementsFingerprint: FP,
    requirementCoverage: { assessments },
    ...extra,
});

const at = (index, status, extra = {}) => ({ index, status, ...extra });

// Süre testleri DAKİKA DEĞERLERİNE değil KURALA bakmalı. Sabitler değişince
// (kullanıcı "30 dakikaya 3 soru az" dedi ve haklıydı) testler kırılmasın diye
// bütçe buradan türetiliyor.
const OVERHEAD = OPENING_MINUTES + CLOSING_MINUTES;
/** Soru vaktini tam olarak `probeMinutes` yapan toplam süre. */
const totalFor = (probeMinutes) => OVERHEAD + probeMinutes;

describe('buildInterviewPlan — kademe ataması', () => {
    it('puts an unmet MUST-HAVE at the top as critical', () => {
        // Kapı burada açılır ya da kapanır; mülakattan bunu bilmeden çıkılmaz
        const plan = buildInterviewPlan(analysis([at(3, 'missing')]), POSITION);
        expect(plan.probes).toHaveLength(1);
        expect(plan.probes[0]).toMatchObject({
            requirementIndex: 3,
            text: 'CX ürünü geliştirmiş olmak',
            must: true,
            priority: CRITICAL,
        });
    });

    it('treats a partially met must-have as high, not critical', () => {
        // Kısmen karşılanan madde bilinmeyen değil, belirsiz — biri kapıyı
        // kapatabilir, diğeri yalnızca derinlik ister
        const plan = buildInterviewPlan(analysis([at(1, 'partial')]), POSITION);
        expect(plan.probes[0].priority).toBe(HIGH);
    });

    it('asks about a met requirement only when the scan recorded a gap', () => {
        const withGap = buildInterviewPlan(
            analysis([at(1, 'met', { gap: 'Deneyimi B2C ölçekte; ilan B2B istiyor' })]),
            POSITION
        );
        expect(withGap.probes).toHaveLength(1);
        expect(withGap.probes[0].priority).toBe(MEDIUM);
        expect(withGap.probes[0].why).toContain('B2B');

        const clean = buildInterviewPlan(analysis([at(1, 'met', { gap: '' })]), POSITION);
        expect(clean.probes).toHaveLength(0);
    });

    it('ranks a missing NICE-TO-HAVE below a partial must-have', () => {
        const plan = buildInterviewPlan(
            analysis([at(4, 'missing'), at(1, 'partial')]),
            POSITION
        );
        expect(plan.probes.map((p) => p.requirementIndex)).toEqual([1, 4]);
        expect(plan.probes[1].priority).toBe(MEDIUM);
    });

    it('puts a partial nice-to-have last', () => {
        const plan = buildInterviewPlan(analysis([at(5, 'partial')]), POSITION);
        expect(plan.probes[0].priority).toBe(LOW);
    });

    it('does not treat unmarked requirements as must-haves', () => {
        // Geriye dönük nötrlük: işaretlenmemiş eski ilanda kullanıcı
        // "zorunlu" kararını hiç vermedi; onun adına vermeyiz
        const unmarked = { title: 'Eski İlan', requirements: ['Funnel sahipliği', 'SQL'] };
        const a = {
            requirementsFingerprint: requirementsFingerprint(unmarked),
            requirementCoverage: { assessments: [at(1, 'missing')] },
        };
        const plan = buildInterviewPlan(a, unmarked);
        expect(plan.probes[0].priority).toBe(MEDIUM);
        expect(plan.probes[0].must).toBe(false);
    });
});

describe('buildInterviewPlan — sıralama kararlılığı', () => {
    it('produces the same plan for the same scan, every time', () => {
        const a = analysis([
            at(5, 'partial'), at(1, 'missing'), at(4, 'missing'), at(2, 'partial'), at(3, 'missing'),
        ]);
        const first = buildInterviewPlan(a, POSITION);
        const second = buildInterviewPlan(a, POSITION);
        expect(first.probes).toEqual(second.probes);
    });

    it('orders by priority, then by requirement number', () => {
        const plan = buildInterviewPlan(
            analysis([at(5, 'partial'), at(3, 'missing'), at(1, 'missing'), at(2, 'partial')]),
            POSITION
        );
        // kritik: 1, 3 → yüksek: 2 → düşük: 5
        expect(plan.probes.map((p) => p.requirementIndex)).toEqual([1, 3, 2, 5]);
    });
});

describe('buildInterviewPlan — zaman bütçesi', () => {
    it('reserves opening and closing before allocating question time', () => {
        const plan = buildInterviewPlan(analysis([at(1, 'missing')]), POSITION, { minutes: 45 });
        expect(plan.minutes.opening).toBe(OPENING_MINUTES);
        expect(plan.minutes.closing).toBe(CLOSING_MINUTES);
        expect(plan.minutes.probes + plan.minutes.slack).toBe(45 - OPENING_MINUTES - CLOSING_MINUTES);
    });

    it('gives a critical probe more minutes than a low one', () => {
        const plan = buildInterviewPlan(analysis([at(1, 'missing'), at(5, 'partial')]), POSITION);
        const critical = plan.probes.find((p) => p.priority === CRITICAL);
        const low = plan.probes.find((p) => p.priority === LOW);
        expect(critical.minutes).toBeGreaterThan(low.minutes);
    });

    it('drops the LOWEST priority items when time runs out — never a critical one', () => {
        // Soru vakti tam bir kritik maddeye yetiyor, ikinciye yetmiyor
        const plan = buildInterviewPlan(
            analysis([at(1, 'missing'), at(3, 'missing'), at(5, 'partial')]),
            POSITION,
            { minutes: totalFor(6) }
        );
        expect(plan.probes).toHaveLength(1);
        expect(plan.probes[0].priority).toBe(CRITICAL);
        expect(plan.dropped.map((p) => p.requirementIndex)).toEqual([3, 5]);
    });

    it('reports what was dropped instead of silently truncating', () => {
        // Sessizce kırpılan bir plan "her şeyi kapsıyor" gibi görünür ve
        // zorunlu bir maddeyi atladığını kimse fark etmez
        const plan = buildInterviewPlan(
            analysis([at(1, 'missing'), at(2, 'missing'), at(3, 'missing')]),
            POSITION,
            { minutes: totalFor(6) }
        );
        expect(plan.dropped.length).toBeGreaterThan(0);
        expect(planSummary(plan)).toContain('süreye sığmadı');
    });

    it('never skips an expensive critical item to fit a cheap low one', () => {
        // İlk yazdığım hâli açgözlüydü: kritik madde (8 dk) 7 dakikalık
        // bütçeye sığmayınca atlanıyor, "GA4 hakimiyeti" (3 dk) sığdığı için
        // alınıyordu. Plan zorunluları atlayıp tercih edileni soruyordu.
        const plan = buildInterviewPlan(
            analysis([at(3, 'missing'), at(5, 'partial')]),
            POSITION,
            { minutes: totalFor(6) }
        );
        expect(plan.probes.map((p) => p.requirementIndex)).toEqual([3]);
        expect(plan.dropped.map((p) => p.requirementIndex)).toEqual([5]);
    });

    it('keeps the top probe even when it alone overruns the budget', () => {
        // Sıfır soruluk bir plan plan değildir. Dar görüşmede en yüksek
        // öncelikli madde korunur ve bütçe aşımı işaretlenir.
        // Soru vakti tek bir kritik maddeye bile yetmiyor
        const plan = buildInterviewPlan(analysis([at(1, 'missing')]), POSITION, { minutes: totalFor(4) });
        expect(plan.probes).toHaveLength(1);
        expect(plan.minutes.overBudget).toBe(true);
        expect(plan.minutes.slack).toBe(0); // negatif boşluk diye bir şey yok
    });

    it('does not flag overBudget for a comfortable interview', () => {
        const plan = buildInterviewPlan(analysis([at(1, 'missing')]), POSITION, { minutes: 60 });
        expect(plan.minutes.overBudget).toBe(false);
    });

    it('fits more probes into a longer interview', () => {
        const a = analysis([at(1, 'missing'), at(2, 'missing'), at(3, 'missing'), at(4, 'missing'), at(5, 'partial')]);
        const short = buildInterviewPlan(a, POSITION, { minutes: 30 });
        const long = buildInterviewPlan(a, POSITION, { minutes: 90 });
        expect(long.probes.length).toBeGreaterThan(short.probes.length);
        expect(long.dropped).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// BAYAT ANALİZDE PLAN ÜRETİLMEZ.
//
// Bugün aynı hata üç yerde çıktı: skorda (#118), kırılımda (#118) ve zorunlu
// kapısında (#125). Hepsinin kökü aynı — değerlendirmeler madde NUMARASINA
// bağlı ve liste değişince numara başka maddeye denk geliyor.
//
// Planda aynı hata en pahalısı olurdu: mülakatçı yanlış maddeyi sormaya
// odaya girer ve hata adayın karşısında ortaya çıkar.
// ─────────────────────────────────────────────────────────────────────────────
describe('bayat analizde plan', () => {
    it('refuses to plan when the requirement list changed after the scan', () => {
        const stale = {
            requirementsFingerprint: 'rESKI',
            requirementCoverage: { assessments: [at(1, 'missing'), at(2, 'partial')] },
        };
        const plan = buildInterviewPlan(stale, POSITION);
        expect(plan.stale).toBe(true);
        expect(plan.probes).toEqual([]);
        expect(plan.starGaps).toEqual([]);
    });

    it('refuses to plan from an unstamped analysis', () => {
        // Hangi listeye ait olduğunu bilmiyoruz; varsaymak aynı kaymayı üretir
        const plan = buildInterviewPlan(
            { requirementCoverage: { assessments: [at(1, 'missing')] } },
            POSITION
        );
        expect(plan.stale).toBe(true);
        expect(plan.probes).toEqual([]);
    });

    it('says the scan happened even though it cannot be used', () => {
        // "Tarama yok" ile "tarama var ama eski" farklı mesajlar — birincisi
        // tara der, ikincisi yeniden tara
        const plan = buildInterviewPlan(
            { requirementsFingerprint: 'rESKI', requirementCoverage: { assessments: [at(1, 'missing')] } },
            POSITION
        );
        expect(plan.scanned).toBe(true);
        expect(planSummary(plan)).toContain('yeniden tarayın');
    });

    it('plans normally once the analysis matches the current list', () => {
        const plan = buildInterviewPlan(analysis([at(1, 'missing')]), POSITION);
        expect(plan.stale).toBe(false);
        expect(plan.probes).toHaveLength(1);
        expect(plan.fingerprint).toBe(FP);
    });
});

describe('buildInterviewPlan — tarama yokken', () => {
    it('returns an empty plan rather than inventing questions', () => {
        const plan = buildInterviewPlan(null, POSITION);
        expect(plan.scanned).toBe(false);
        expect(plan.stale).toBe(false);
        expect(plan.probes).toEqual([]);
        expect(planSummary(plan)).toContain('tarama yapılmamış');
    });

    it('handles an analysis with an empty assessment list', () => {
        expect(buildInterviewPlan(analysis([]), POSITION).scanned).toBe(false);
    });

    it('ignores assessments whose index is not a number', () => {
        const plan = buildInterviewPlan(
            analysis([{ index: 'bir', status: 'missing' }, at(1, 'missing')]),
            POSITION
        );
        expect(plan.probes).toHaveLength(1);
        expect(plan.probes[0].requirementIndex).toBe(1);
    });

    it('ignores assessments pointing past the end of the requirement list', () => {
        const plan = buildInterviewPlan(analysis([at(99, 'missing')]), POSITION);
        expect(plan.probes).toEqual([]);
    });

    it('reads assessments from the nested location too', () => {
        const nested = {
            requirementsFingerprint: FP,
            scoreData: { requirementCoverage: { assessments: [at(1, 'missing')] } },
        };
        expect(buildInterviewPlan(nested, POSITION).probes).toHaveLength(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// STAR BOŞLUKLARI — soru değil, dinleme talimatı.
//
// Düşük STAR adayın niteliği değil, CV'nin suskunluğudur ve odada kapanabilir.
// Bu yüzden ayrı bir soru olarak zaman harcamıyorlar; mülakatçıya "hangi
// boyutta bastır" diyorlar.
// ─────────────────────────────────────────────────────────────────────────────
describe('STAR boşlukları', () => {
    it('flags the dimensions where the CV said almost nothing', () => {
        const a = analysis([at(1, 'missing')], {
            starAnalysis: {
                Situation: { score: 3 }, Task: { score: 2 },
                Action: { score: 1 }, Result: { score: 0 },
            },
        });
        const plan = buildInterviewPlan(a, POSITION);
        expect(plan.starGaps.map((g) => g.key)).toEqual(['Action', 'Result']);
        expect(plan.starGaps[1].why).toContain('ölçülmemiş');
    });

    it('leaves well-evidenced dimensions alone', () => {
        const a = analysis([at(1, 'missing')], {
            starAnalysis: { Situation: { score: 2 }, Task: { score: 3 }, Action: { score: 2 }, Result: { score: 3 } },
        });
        expect(buildInterviewPlan(a, POSITION).starGaps).toEqual([]);
    });

    it('accepts a plain number as well as {score}', () => {
        const a = analysis([at(1, 'missing')], { starAnalysis: { Result: 0 } });
        expect(buildInterviewPlan(a, POSITION).starGaps.map((g) => g.key)).toEqual(['Result']);
    });

    it('says nothing when the analysis has no STAR at all', () => {
        // Ölçülmemiş bir şeyi boşluk saymak, STAR analizi olmayan her adaya
        // olmayan bir kusur yazmak olurdu
        expect(buildInterviewPlan(analysis([at(1, 'missing')]), POSITION).starGaps).toEqual([]);
    });

    it('does not spend interview minutes on STAR gaps', () => {
        const withStar = analysis([at(1, 'missing')], {
            starAnalysis: { Situation: { score: 0 }, Task: { score: 0 }, Action: { score: 0 }, Result: { score: 0 } },
        });
        const withoutStar = analysis([at(1, 'missing')]);
        expect(buildInterviewPlan(withStar, POSITION).minutes.probes)
            .toBe(buildInterviewPlan(withoutStar, POSITION).minutes.probes);
    });
});

describe('planSummary', () => {
    it('leads with the critical count — that is what decides the hire', () => {
        const plan = buildInterviewPlan(
            analysis([at(1, 'missing'), at(3, 'missing'), at(5, 'partial')]),
            POSITION
        );
        expect(planSummary(plan)).toContain('2 kritik');
    });

    it('says so plainly when the scan left nothing open', () => {
        const plan = buildInterviewPlan(analysis([at(1, 'met'), at(2, 'met')]), POSITION);
        expect(plan.probes).toEqual([]);
        expect(planSummary(plan)).toContain('açık kalan madde yok');
    });

    it('survives a null plan', () => {
        expect(planSummary(null)).toContain('tarama yapılmamış');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ODAYA GÖTÜRÜLEBİLİR ÇIKTI.
//
// Mülakat ekran başında yapılmıyor; kullanıcı planı kopyalayıp yazdıracak.
// Metin, ekranda görünen her şeyi taşımalı — özellikle "neden soruyorum" ve
// "iyi cevap neye benzer" satırlarını. Onlar düşerse elde jenerik bir soru
// listesi kalır ve planın bütün anlamı gider.
// ─────────────────────────────────────────────────────────────────────────────
describe('planToText', () => {
    const plan = buildInterviewPlan(
        analysis([at(3, 'missing'), at(5, 'partial')], { starAnalysis: { Result: { score: 0 } } }),
        POSITION
    );
    const probes = plan.probes.map((p) => ({
        ...p,
        question: `${p.text} sorusu`,
        followUp: 'Sizin yaptığınız kısım neydi?',
        listenFor: 'Sahiplik, ödünleşim, ölçü',
    }));
    const text = planToText(plan, probes, { candidateName: 'Öykü', positionTitle: POSITION.title });

    it('carries the reason each question is being asked', () => {
        expect(text).toContain('Neden:');
        expect(text).toContain('Kapı burada');
    });

    it('carries what a good answer sounds like', () => {
        expect(text).toContain('İyi cevapta: Sahiplik, ödünleşim, ölçü');
        expect(text).toContain('Yüzeysel kalırsa:');
    });

    it('marks must-haves and shows the minute budget per question', () => {
        expect(text).toContain('(ZORUNLU)');
        expect(text).toMatch(/\[\d+ dk\] \[Kritik\]/);
    });

    it('does not mangle Turkish when labelling tiers', () => {
        // 'Kritik'.toUpperCase() → 'KRITIK' (noktasız I). JS'in Türkçesi yok;
        // metinde harf dönüşümü yapmıyoruz. Bugün beşinci kez.
        expect(text).not.toContain('KRITIK');
        expect(text).not.toContain('YUKSEK');
    });

    it('opens and closes with the fixed blocks', () => {
        expect(text).toContain('AÇILIŞ');
        expect(text).toContain('KAPANIŞ');
        expect(text).toContain(`Süre: ${plan.minutes.total} dakika`);
    });

    it('lists the STAR dimensions to press on', () => {
        expect(text).toContain('DİNLERKEN BASTIR');
        expect(text).toContain('Sonuç');
    });

    it('names what did not fit instead of hiding it', () => {
        const tight = buildInterviewPlan(
            analysis([at(1, 'missing'), at(2, 'missing'), at(3, 'missing')]),
            POSITION,
            { minutes: totalFor(6) }
        );
        const out = planToText(tight, tight.probes, {});
        expect(out).toContain('SÜREYE SIĞMADI');
        expect(out).toContain('ikinci görüşmeye');
    });

    it('produces nothing for a stale or unscanned plan', () => {
        expect(planToText(buildInterviewPlan(null, POSITION), [], {})).toBe('');
        const stale = buildInterviewPlan(
            { requirementsFingerprint: 'rESKI', requirementCoverage: { assessments: [at(1, 'missing')] } },
            POSITION
        );
        expect(planToText(stale, [], {})).toBe('');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// KAYITLI PLAN — saklanmış olması geçerli olduğu anlamına gelmez.
//
// Bugün aynı hatanın dört görünümünü düzelttik (skor, kırılım, kapı, plan
// üretimi). Kayıtlı plan beşincisi olurdu ve en sinsisi: ekranda "hazır plan"
// yazıp mülakatçıyı eski ilanın maddelerini sormaya gönderirdi.
// ─────────────────────────────────────────────────────────────────────────────
describe('savedPlanFor', () => {
    const probes = [{ requirementIndex: 1, text: 'Funnel sahipliği', question: 'Soru' }];

    it('returns the plan when it still matches the current requirement list', () => {
        const candidate = { interviewPlans: { [POSITION.title]: { fingerprint: FP, probes } } };
        expect(savedPlanFor(candidate, POSITION)?.probes).toHaveLength(1);
    });

    it('refuses a plan produced against an older requirement list', () => {
        const candidate = { interviewPlans: { [POSITION.title]: { fingerprint: 'rESKI', probes } } };
        expect(savedPlanFor(candidate, POSITION)).toBeNull();
    });

    it('keeps plans separate per position', () => {
        // Aday iki ilana bakılıyorsa açık maddeleri farklı; tek alan
        // ikincisini yazarken birincisini sessizce ezerdi
        const candidate = { interviewPlans: { 'Başka Pozisyon': { fingerprint: FP, probes } } };
        expect(savedPlanFor(candidate, POSITION)).toBeNull();
    });

    it('treats an empty or malformed plan as no plan', () => {
        expect(savedPlanFor({ interviewPlans: { [POSITION.title]: { fingerprint: FP, probes: [] } } }, POSITION)).toBeNull();
        expect(savedPlanFor({ interviewPlans: { [POSITION.title]: { fingerprint: FP } } }, POSITION)).toBeNull();
        expect(savedPlanFor({}, POSITION)).toBeNull();
        expect(savedPlanFor(null, POSITION)).toBeNull();
        expect(savedPlanFor({ interviewPlans: {} }, null)).toBeNull();
    });
});

describe('priorityLabel', () => {
    it('gives every tier a Turkish label and a tone', () => {
        for (const p of [CRITICAL, HIGH, MEDIUM, LOW]) {
            const label = priorityLabel(p);
            expect(label.text).toBeTruthy();
            expect(label.tone).toBeTruthy();
        }
    });

    it('falls back rather than throwing on an unknown tier', () => {
        expect(priorityLabel('hayalet').text).toBe('—');
    });
});

describe('plan şeması', () => {
    it('stamps every plan so a rule change can be detected later', () => {
        expect(buildInterviewPlan(analysis([at(1, 'missing')]), POSITION).schema).toBe(PLAN_SCHEMA);
        expect(buildInterviewPlan(null, POSITION).schema).toBe(PLAN_SCHEMA);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SORULAR YAZILMAMIŞKEN PLAN.
//
// Canlıda oldu: Gemini harcama tavanı doldu, hiçbir soru yazılamadı. Plan
// iskeleti AI'sız üretiliyor ve o hâliyle bile işe yarıyor — hangi maddeyi
// neden soracağını söylüyor. Ama kopyalanan metin `undefined` basarsa plan
// çöpe döner ve elde hiçbir şey kalmaz.
// ─────────────────────────────────────────────────────────────────────────────
describe('planToText — soru yazılmamışken', () => {
    const plan = buildInterviewPlan(analysis([at(3, 'missing'), at(1, 'partial')]), POSITION);

    it('never prints "undefined" where a question should be', () => {
        const text = planToText(plan, plan.probes, { candidateName: 'Öykü' });
        expect(text).not.toContain('undefined');
    });

    it('says plainly that the wording is missing', () => {
        const text = planToText(plan, plan.probes, {});
        expect(text).toContain('(yazılmadı — bu maddeyi kendi sözlerinizle sorun)');
    });

    it('still carries everything the interviewer actually needs', () => {
        // Soru cümlesi olmasa bile plan kullanılabilir olmalı: hangi madde,
        // neden, kaç dakika, hangi öncelik
        const text = planToText(plan, plan.probes, {});
        expect(text).toContain('CX ürünü geliştirmiş olmak');
        expect(text).toContain('Neden:');
        expect(text).toContain('[Kritik]');
        expect(text).toMatch(/\[\d+ dk\]/);
    });

    it('handles a half-written plan without breaking the rest', () => {
        const half = plan.probes.map((p, i) => (i === 0 ? { ...p, question: 'Yazılmış soru' } : p));
        const text = planToText(plan, half, {});
        expect(text).toContain('SORU: Yazılmış soru');
        expect(text).toContain('(yazılmadı');
        expect(text).not.toContain('undefined');
    });
});
