import { describe, expect, it } from 'vitest';
import { mustHaveGate, gateRank, gateLabel } from './mustHaveGate.js';
import { requirementsFingerprint } from './positionRequirements.js';

const POSITION = {
    title: 'Growth Product Manager',
    requirementsMeta: [
        { text: 'Funnel sahipliği', must: true },
        { text: 'A/B test kurgulama', must: true },
        { text: 'GA4 hakimiyeti', must: false },
    ],
};

// Değerlendirmeler madde NUMARASINA bağlı; damga hangi listeye ait olduklarını
// söyler. Damgasız kayıtta kapı hüküm veremez.
const withStatuses = (statuses, fingerprint = requirementsFingerprint(POSITION)) => ({
    requirementsFingerprint: fingerprint,
    requirementCoverage: {
        assessments: statuses.map((status, i) => ({ index: i + 1, status, note: `not ${i + 1}` })),
    },
});

describe('mustHaveGate', () => {
    it('reports ok when every must-have is met', () => {
        const gate = mustHaveGate(withStatuses(['met', 'met', 'missing']), POSITION);
        expect(gate.status).toBe('ok');
        // Tercih edilenin eksikliği kapıyı ETKİLEMEZ — knockout yalnızca zorunlular
        expect(gate.missing).toEqual([]);
    });

    it('flags a missing must-have and names it', () => {
        const gate = mustHaveGate(withStatuses(['met', 'missing', 'met']), POSITION);
        expect(gate.status).toBe('missing');
        expect(gate.missing).toHaveLength(1);
        expect(gate.missing[0].text).toBe('A/B test kurgulama');
        expect(gate.missing[0].note).toBe('not 2');
    });

    it('separates partial from missing', () => {
        const gate = mustHaveGate(withStatuses(['partial', 'met', 'met']), POSITION);
        expect(gate.status).toBe('partial');
        expect(gate.partial).toHaveLength(1);
        expect(gate.missing).toEqual([]);
    });

    it('treats missing as worse than partial when both occur', () => {
        const gate = mustHaveGate(withStatuses(['partial', 'missing', 'met']), POSITION);
        expect(gate.status).toBe('missing');
    });

    it('reads assessments nested under scoreData too', () => {
        // Kayıtlar iki yerleşimle de saklanıyor; ikisini de okuyabilmeli
        const analysis = {
            requirementsFingerprint: requirementsFingerprint(POSITION),
            scoreData: { requirementCoverage: { assessments: [{ index: 1, status: 'missing' }] } },
        };
        expect(mustHaveGate(analysis, POSITION).status).toBe('missing');
    });

    it('stays unknown when the position marks nothing as required', () => {
        // İşaretlenmemiş eski ilanlarda herkesi aşağı itmek haksızlık olurdu
        const legacy = { title: 'X', requirements: ['bir şey', 'başka şey'] };
        expect(mustHaveGate(withStatuses(['met', 'met']), legacy).status).toBe('unknown');
    });

    it('stays unknown when there is no per-requirement analysis', () => {
        expect(mustHaveGate({ summary: 'metin' }, POSITION).status).toBe('unknown');
        expect(mustHaveGate(null, POSITION).status).toBe('unknown');
    });

    it('stays unknown when assessments exist but cover no must-have', () => {
        // Yalnızca tercih edilen madde değerlendirilmişse hüküm veremeyiz
        const analysis = { requirementCoverage: { assessments: [{ index: 3, status: 'met' }] } };
        const gate = mustHaveGate(analysis, POSITION);
        expect(gate.status).toBe('unknown');
        expect(gate.totalMust).toBe(2);
    });

    it('handles a missing position safely', () => {
        expect(mustHaveGate(withStatuses(['met']), null).status).toBe('unknown');
    });
});

describe('gateRank', () => {
    it('ranks a candidate missing a must-have below everyone else', () => {
        expect(gateRank('missing')).toBeLessThan(gateRank('partial'));
        expect(gateRank('missing')).toBeLessThan(gateRank('unknown'));
        expect(gateRank('missing')).toBeLessThan(gateRank('ok'));
    });

    it('does not punish unknown as if it were a gap', () => {
        // Bilgi yokluğu ≠ eksiklik
        expect(gateRank('unknown')).toBeGreaterThan(gateRank('partial'));
        expect(gateRank('unknown')).toBeLessThan(gateRank('ok'));
    });
});

describe('gateLabel', () => {
    it('pluralises the count', () => {
        expect(gateLabel({ status: 'missing', missing: [{}] }).text).toBe('1 zorunlu eksik');
        expect(gateLabel({ status: 'missing', missing: [{}, {}] }).text).toBe('2 zorunlu eksik');
    });

    it('returns nothing for unknown so the UI shows no badge', () => {
        expect(gateLabel({ status: 'unknown' })).toBeNull();
        expect(gateLabel(null)).toBeNull();
    });

    it('confirms a clean pass', () => {
        expect(gateLabel({ status: 'ok' }).tone).toBe('emerald');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// BAYAT ANALİZDE KAPI HESAPLANMAZ.
//
// Canlıda görüldü: gereksinim listesi taramadan sonra değişti ve şerit eski
// yargıyı YENİ maddenin adıyla raporladı —
//   "CX ürünü geliştirmiş olmak — Fiyatlandırma sahipliğine dair kanıt yok"
// Başlık bir maddeden, gerekçe başka bir maddeden. Skor kırılımı bayatken
// gizleniyordu ama bu şerit gözden kaçmıştı.
// ─────────────────────────────────────────────────────────────────────────────
describe('bayat analizde kapı', () => {
    it('refuses to judge when the requirement list changed after the scan', () => {
        const gate = mustHaveGate(withStatuses(['met', 'missing', 'met'], 'rESKI'), POSITION);
        expect(gate.status).toBe('unknown');
        expect(gate.missing).toEqual([]);
        expect(gate.partial).toEqual([]);
    });

    it('refuses to judge an unstamped analysis', () => {
        // Hangi listeye ait olduğunu bilmiyoruz; varsaymak aynı kaymayı üretir
        const gate = mustHaveGate({
            requirementCoverage: { assessments: [{ index: 1, status: 'missing' }] },
        }, POSITION);
        expect(gate.status).toBe('unknown');
    });

    it('still reports how many must-haves the ad has', () => {
        // "Hüküm veremiyorum" demek, ilanın kaç zorunlusu olduğunu da
        // gizlemek anlamına gelmemeli
        expect(mustHaveGate(withStatuses(['met', 'met', 'met'], 'rESKI'), POSITION).totalMust).toBe(2);
    });

    it('judges normally once the analysis matches the current list', () => {
        const gate = mustHaveGate(withStatuses(['met', 'missing', 'met']), POSITION);
        expect(gate.status).toBe('missing');
        expect(gate.missing[0].text).toBe('A/B test kurgulama');
        expect(gate.missing[0].note).toBe('not 2');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// MÜLAKAT KAPIYA GİRER.
//
// Aday odada bir zorunlu maddeyi kapattıysa kapı da bunu görmeli. Görmezse
// skor 78'e çıkarken şerit "1 zorunlu eksik" demeye devam eder ve sıralama
// adayı listenin dibinde tutar — iki ekran birbirine ters düşer.
//
// `candidate` verilmezse davranış BİREBİR eskisi gibi: eski çağıranlar
// bozulmamalı.
// ─────────────────────────────────────────────────────────────────────────────
describe('mülakat kapıya yansır', () => {
    const withVerdicts = (verdicts, fingerprint = requirementsFingerprint(POSITION)) => ({
        interviewCoverage: {
            [POSITION.title]: {
                sessionId: 'mi-1',
                verdicts,
                requirementsFingerprint: fingerprint,
            },
        },
    });

    it('opens the gate when the room closed the only missing must-have', () => {
        const analysis = withStatuses(['met', 'missing', 'met']);
        expect(mustHaveGate(analysis, POSITION).status).toBe('missing');

        const gate = mustHaveGate(
            analysis,
            POSITION,
            withVerdicts([{ requirementIndex: 2, verdict: 'met', quote: 'A/B testleri ben kurdum' }])
        );
        expect(gate.status).toBe('ok');
        expect(gate.missing).toEqual([]);
        expect(gate.fromInterview).toBe(1);
    });

    it('closes the gate when the room revealed a must-have was not real', () => {
        // Tek yönlü olsaydı sistem gerçeği değil iyimserliği ölçerdi
        const gate = mustHaveGate(
            withStatuses(['met', 'met', 'met']),
            POSITION,
            withVerdicts([{ requirementIndex: 1, verdict: 'missing', quote: 'O projede ben yoktum' }])
        );
        expect(gate.status).toBe('missing');
        expect(gate.missing[0].text).toBe('Funnel sahipliği');
    });

    it('shows the candidate own words as the reason, not the CV note', () => {
        // Odadan gelen gerekçe CV notundan daha güçlü bir dayanak
        const gate = mustHaveGate(
            withStatuses(['met', 'met', 'met']),
            POSITION,
            withVerdicts([{ requirementIndex: 2, verdict: 'partial', quote: 'Testleri kurgulamadım, sonuçlarını okudum' }])
        );
        expect(gate.partial[0].note).toBe('Testleri kurgulamadım, sonuçlarını okudum');
        expect(gate.partial[0].fromInterview).toBe(true);
    });

    it('leaves CV-only items marked as coming from the CV', () => {
        const gate = mustHaveGate(
            withStatuses(['missing', 'missing', 'met']),
            POSITION,
            withVerdicts([{ requirementIndex: 1, verdict: 'met' }])
        );
        expect(gate.missing).toHaveLength(1);
        expect(gate.missing[0].index).toBe(2);
        expect(gate.missing[0].note).toBe('not 2');
        expect(gate.missing[0].fromInterview).toBe(false);
        expect(gate.fromInterview).toBe(1);
    });

    it('ignores an inconclusive verdict entirely', () => {
        // Soru atlandı diye aday cezalandırılmaz — ama ödüllendirilmez de
        const gate = mustHaveGate(
            withStatuses(['met', 'missing', 'met']),
            POSITION,
            withVerdicts([{ requirementIndex: 2, verdict: 'inconclusive' }])
        );
        expect(gate.status).toBe('missing');
        expect(gate.fromInterview).toBe(0);
    });

    it('ignores verdicts stamped against an older requirement list', () => {
        const gate = mustHaveGate(
            withStatuses(['met', 'missing', 'met']),
            POSITION,
            withVerdicts([{ requirementIndex: 2, verdict: 'met' }], 'rESKI')
        );
        expect(gate.status).toBe('missing');
        expect(gate.fromInterview).toBe(0);
    });

    it('behaves exactly as before when no candidate is passed', () => {
        // Eski çağıranlar bozulmamalı
        const analysis = withStatuses(['met', 'missing', 'met']);
        const withoutCandidate = mustHaveGate(analysis, POSITION);
        const withNull = mustHaveGate(analysis, POSITION, null);
        expect(withoutCandidate).toEqual(withNull);
        expect(withoutCandidate.status).toBe('missing');
        expect(withoutCandidate.fromInterview).toBe(0);
    });
});

describe('gateLabel — mülakat işareti', () => {
    it('flags a verdict that came from the room', () => {
        // Aynı adayın rozeti dün kırmızıyken bugün yeşilse, sebebi görünmeli
        expect(gateLabel({ status: 'ok', fromInterview: 2 }).interview).toBe(true);
        expect(gateLabel({ status: 'ok', fromInterview: 0 }).interview).toBe(false);
        expect(gateLabel({ status: 'ok' }).interview).toBe(false);
    });

    it('keeps the existing text and tone untouched', () => {
        expect(gateLabel({ status: 'missing', missing: [1, 2], fromInterview: 1 }))
            .toMatchObject({ text: '2 zorunlu eksik', tone: 'red' });
    });
});
