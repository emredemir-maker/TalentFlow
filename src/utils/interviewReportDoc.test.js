// PDF BELGESİNİN İÇERİĞİ.
//
// Testler pdfmake'i HİÇ yüklemiyor: belge tanımı düz bir nesne ve asıl soru
// "ekranda duran her şey belgeye girdi mi". Kütüphaneyi çağırmak bu soruyu
// cevaplamaz, yalnızca testi yavaşlatırdı.
import { describe, it, expect } from 'vitest';
import { buildInterviewReportDoc, dosyaAdi, tarihMetni } from './interviewReportDoc';

/** Belge içindeki tüm metni tek dizeye indirger — "şu cümle geçti mi" için. */
function tumMetin(node) {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(tumMetin).join('\n');
    if (typeof node === 'object') {
        return [node.text, node.stack, node.ul, node.columns, node.table?.body, node.content]
            .map(tumMetin)
            .join('\n');
    }
    return '';
}

const SESSION = {
    id: 's1',
    date: '2026-08-20T10:00:00.000Z',
    duration: '45 dk',
    language: 'Türkçe',
    positionTitle: 'Frontend Developer',
    finalScore: 82,
    interviewScore: 78,
    starScores: { S: 70, T: 65, A: 80, R: 75, technical: 90, communication: 60, problemSolving: 70, cultureFit: 80, adaptability: 50 },
    keywords: ['react', 'testing'],
    aiSummary: 'Aday teknik sorularda güçlü, ölçek deneyimi sınırlı.',
    transcript: [
        { role: 'Mülakatçı', text: 'React ile ne kadar çalıştınız?' },
        { role: 'Aday', text: 'Yaklaşık dört yıl.' },
    ],
};

const REPORT = {
    mode: 'live',
    evidence: { score: 66, asked: 3 },
    outcome: 'proceed',
    recruiterOutcome: null,
    items: [
        {
            requirementIndex: 1, text: 'React ile 3 yıl deneyim', must: true, verdict: 'met',
            quote: 'Dört yıldır React yazıyorum', question: 'React deneyiminiz?', answer: 'Dört yıl',
            observation: 'Somut örnek verdi.',
        },
    ],
    unlinked: [{ question: 'Neden ayrıldınız?', answer: 'Uzaktan çalışma', observation: '' }],
    summary: 'Genel değerlendirme olumlu.',
    strengths: ['Hızlı düşünüyor'],
    concerns: ['Ölçek deneyimi az'],
    requirementsStale: false,
    noScoreReason: null,
    hasAnything: true,
};

const belge = (over = {}) => buildInterviewReportDoc({
    candidate: { name: 'Kaan Yenidağ', position: 'Frontend Developer' },
    session: SESSION,
    report: REPORT,
    now: new Date('2026-09-04T08:00:00.000Z'),
    ...over,
});

describe('mülakat raporu PDF belgesi', () => {
    it('EKRANDAKİ HER BÖLÜM BELGEDE', () => {
        const t = tumMetin(belge().content);
        for (const beklenen of [
            'Kaan Yenidağ',
            'Özet',
            'Genel değerlendirme olumlu.',
            'Güçlü yönler',
            'Hızlı düşünüyor',
            'Dikkat edilecekler',
            'Gereksinim değerlendirmesi',
            'React ile 3 yıl deneyim',
            'Maddeye bağlanmayan sorular',
            'STAR kanıt analizi',
            'Yetkinlik analizi',
            'Oturum bilgileri',
            'Anahtar kelimeler',
            'Tam transkript',
        ]) {
            expect(t).toContain(beklenen);
        }
    });

    it('ÖZET TAM METİN — şikâyetin merkezi buydu', () => {
        const uzun = 'A'.repeat(4000);
        const t = tumMetin(belge({ report: { ...REPORT, summary: uzun } }).content);
        expect(t).toContain(uzun);
    });

    it('TRANSKRİPTİN TAMAMI GİRİYOR — ekranda 640 pikselde kesiliyordu', () => {
        const cok = Array.from({ length: 300 }, (_, i) => ({ role: 'Aday', text: `Satır ${i}` }));
        const t = tumMetin(belge({ session: { ...SESSION, transcript: cok } }).content);
        expect(t).toContain('Satır 0');
        expect(t).toContain('Satır 299');
    });

    it('manuel görüşmenin düz metin transkripti de basılıyor', () => {
        const t = tumMetin(belge({ session: { ...SESSION, transcript: 'Birinci satır\n\nİkinci satır' } }).content);
        expect(t).toContain('Birinci satır');
        expect(t).toContain('İkinci satır');
    });

    it('transkript hiç yoksa uydurulmuyor', () => {
        const t = tumMetin(belge({ session: { ...SESSION, transcript: null, messages: [] } }).content);
        expect(t).toContain('transkript kaydı yok');
    });

    it('SKOR YOKSA BAŞKA SKORLA DOLDURULMUYOR', () => {
        // Ekrandaki kuralın aynısı: manuel görüşmede finalScore yazılmıyor ve
        // yerine CV skorunu basmak, onu mülakattan gelmiş gibi gösterirdi.
        const t = tumMetin(belge({ session: { ...SESSION, finalScore: null, interviewScore: null } }).content);
        expect(t).not.toContain('Genel skor');
        expect(t).not.toContain('Mülakat skoru');
        expect(t).toContain('Kanıt oranı');
    });

    it('skor üretilememişse sebebi yazılıyor', () => {
        const t = tumMetin(belge({ report: { ...REPORT, noScoreReason: 'no-questions', evidence: null } }).content);
        expect(t.length).toBeGreaterThan(0);
        expect(t).not.toContain('Kanıt oranı');
    });

    it('MÜLAKATÇI DEĞERLENDİRMESİ BELGEYE GİRMİYOR', () => {
        // O bölüm adayı değil, görüşmeyi yapan kişiyi değerlendiriyor. Belge
        // adayla ilgili ve elden ele dolaşıyor.
        const t = tumMetin(belge({
            recruiterEval: {
                overallScore: 2,
                summary: 'Mülakatçı hiç soru sormamış.',
                dimensions: [{ key: 'depth', label: 'Derinlik', score: 1, explanation: 'x', tip: 'y' }],
            },
        }).content);
        expect(t).not.toContain('Mülakatçı hiç soru sormamış.');
        expect(t).not.toContain('Derinlik');
    });

    it('CEVAP KISALTILIYOR, ALINTI TAM KALIYOR', () => {
        // Aynı paragraf dört maddede tekrar ediyordu; kanıt alıntıdır,
        // cevabın tamamı transkriptte duruyor.
        const uzunCevap = 'Birinci cümle burada. ' + 'Tekrar eden uzun bir anlatı. '.repeat(60);
        const t = tumMetin(belge({
            report: { ...REPORT, items: [{ ...REPORT.items[0], answer: uzunCevap, quote: 'Kısa ama kritik alıntı' }] },
        }).content);
        expect(t).toContain('Kısa ama kritik alıntı');
        expect(t).toContain('Birinci cümle burada.');
        expect(t).not.toContain(uzunCevap);
        expect(t).toContain('transkriptte');
    });

    it('SORU MADDE METNİNİ TEKRAR EDİYORSA BASILMIYOR', () => {
        const t = tumMetin(belge({
            report: {
                ...REPORT,
                items: [{
                    ...REPORT.items[0],
                    text: 'React ile 3 yıl deneyim',
                    question: 'React ile 3 yıl deneyim konusunda yaptığınız işi anlatır mısınız?',
                }],
            },
        }).content);
        expect(t).toContain('React ile 3 yıl deneyim');
        expect(t).not.toContain('konusunda yaptığınız işi anlatır mısınız?');
    });

    it('farklı bir soru metni basılıyor', () => {
        const t = tumMetin(belge({
            report: { ...REPORT, items: [{ ...REPORT.items[0], question: 'Ekipte kaç kişiydiniz?' }] },
        }).content);
        expect(t).toContain('Ekipte kaç kişiydiniz?');
    });

    it('HİÇ SORULMAYAN MADDELER EKSİKLİK GİBİ GÖSTERİLMİYOR', () => {
        const t = tumMetin(belge({
            requirements: [
                { text: 'React ile 3 yıl deneyim' },
                { text: 'Ölçekli sistem deneyimi' },
                { text: 'Takım yönetimi' },
            ],
        }).content);
        expect(t).toContain('hiç sorulmayan maddeler');
        expect(t).toContain('Madde 2: Ölçekli sistem deneyimi');
        expect(t).toContain('karşılamadığı maddeler değil');
    });

    it('KARAR VERİLEMEYEN MADDE PAYDAYA GİRMİYOR — bu yazılı', () => {
        const t = tumMetin(belge({
            report: { ...REPORT, evidence: { score: 100, asked: 6, inconclusive: 1 } },
        }).content);
        expect(t).toContain('6 maddede ölçüldü');
        expect(t).toContain('karar verilemedi');
        expect(t).toContain('paydasına girmiyor');
    });

    it('ÜÇ HÜKMÜN KAYNAĞI YAZILI', () => {
        const t = tumMetin(belge({
            report: { ...REPORT, outcome: 'positive', recruiterOutcome: 'pending' },
            finalDecision: 'Beklemede',
        }).content);
        expect(t).toContain('Nihai karar (İK)');
        expect(t).toContain('izlenim (mülakatçı)');
        expect(t).toContain('Sistem önerisi');
    });

    it('DEĞERLENDİRME ÜRETİLEMEDİYSE SÖYLENİYOR', () => {
        const t = tumMetin(belge({
            session: { ...SESSION, aiSummary: '' },
            report: { ...REPORT, summary: '', strengths: [], concerns: [] },
        }).content);
        expect(t).toContain('üretilemedi');
        expect(t).toContain('damgalar aşağıda duruyor ve geçerli');
    });

    it('notlar ve karar belgeye giriyor', () => {
        const t = tumMetin(belge({ recruiterNotes: 'İkinci tura alalım.', finalDecision: 'Olumlu' }).content);
        expect(t).toContain('İkinci tura alalım.');
        expect(t).toContain('Olumlu');
    });

    it('gereksinim listesi eskiyse sebebi yazılıyor, metin uydurulmuyor', () => {
        const t = tumMetin(belge({
            report: { ...REPORT, requirementsStale: true, items: [{ ...REPORT.items[0], text: null }] },
        }).content);
        expect(t).toContain('sonradan değiştiği için');
        expect(t).toContain('Madde metni bu rapora bağlı listede yok.');
    });

    it('boş kayıtta çökmüyor', () => {
        expect(() => buildInterviewReportDoc({})).not.toThrow();
        const doc = buildInterviewReportDoc({});
        expect(doc.content.length).toBeGreaterThan(0);
        expect(tumMetin(doc.content)).toContain('İsimsiz aday');
    });

    it('sayfa numarası ve üstbilgi her sayfada', () => {
        const doc = belge();
        expect(tumMetin(doc.header())).toContain('Mülakat Raporu');
        expect(tumMetin(doc.footer(2, 5))).toContain('2 / 5');
    });

    it('gömülü Roboto kullanılıyor — Türkçe karakterler için şart', () => {
        expect(belge().defaultStyle.font).toBe('Roboto');
    });
});

describe('dosyaAdi', () => {
    it('Türkçe karakter ve boşluk bırakmıyor', () => {
        expect(dosyaAdi({ name: 'Kaan Yenidağ' }, { date: '2026-08-20T00:00:00.000Z' }))
            .toBe('mulakat-raporu-kaan-yenidag-2026-08-20.pdf');
    });

    it('adsız kayıtta da geçerli bir ad üretiyor', () => {
        expect(dosyaAdi(null, { date: 'bozuk' })).toMatch(/^mulakat-raporu-aday\.pdf$/);
    });
});

describe('tarihMetni', () => {
    it('bozuk tarihi uydurmuyor', () => {
        expect(tarihMetni('bozuk')).toBe('');
        expect(tarihMetni(null)).toBe('');
    });
});
