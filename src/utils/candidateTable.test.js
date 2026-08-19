import { describe, it, expect } from 'vitest';
import {
    cleanRoleText,
    resolveStageKey,
    getAppliedDate,
    applyTableFilters,
    scoreForPosition,
    withCoherentScores,
    sortRows,
    buildExportRows,
    DEFAULT_FILTERS,
    isIstanbulLocation,
    locationBucket,
    analysisForPosition,
    VERIFICATION_RANK,
} from './candidateTable';
import { requirementsFingerprint } from './positionRequirements';

const mkTs = (iso) => ({ toMillis: () => new Date(iso).getTime() });

const CANDIDATES = [
    {
        id: '1', name: 'Ayşe Yılmaz', email: 'ayse@example.com', phone: '+90 555 111 1111',
        position: 'Frontend Developer', bestTitle: 'Frontend Developer', department: 'Yazılım',
        source: 'LinkedIn', sourceDetail: 'Sponsorlu', status: 'interview',
        bestScore: 85, interviewScore: 90, combinedScore: 88, experience: 5,
        location: 'İstanbul', education: 'Bilgisayar Müh.', skills: ['React', 'TypeScript'],
        appliedDate: '2026-07-01',
    },
    {
        id: '2', name: 'Mehmet Demir', email: 'mehmet@example.com', phone: '+90 555 222 2222',
        position: 'Backend Developer', bestTitle: 'Backend Developer', department: 'Yazılım',
        source: 'Kariyer.net', status: 'new', // legacy status → ai_analysis
        bestScore: 70, interviewScore: null, combinedScore: 70, experience: 3,
        location: 'Ankara', skills: ['Node.js'], createdAt: mkTs('2026-07-15T09:30:00Z'),
    },
    {
        id: '3', name: 'Zeynep Çelik', email: 'zeynep@example.com',
        position: 'İK Uzmanı', bestTitle: 'İK Uzmanı', department: 'İnsan Kaynakları',
        source: 'LinkedIn', status: 'hired',
        bestScore: 60, interviewScore: 75, combinedScore: 68, experience: 8,
        location: 'İzmir', skills: [], appliedDate: '2026-06-20',
    },
];

describe('resolveStageKey', () => {
    it('maps canonical keys to themselves', () => {
        expect(resolveStageKey('interview')).toBe('interview');
        expect(resolveStageKey('hired')).toBe('hired');
    });
    it('maps legacy statuses onto canonical stages', () => {
        expect(resolveStageKey('new')).toBe('ai_analysis');
        expect(resolveStageKey('Review')).toBe('review');
        expect(resolveStageKey('Mülakat')).toBe('interview');
    });
    it('falls back to ai_analysis for unknown/empty', () => {
        expect(resolveStageKey('')).toBe('ai_analysis');
        expect(resolveStageKey('garbage')).toBe('ai_analysis');
    });
});

describe('getAppliedDate', () => {
    it('prefers explicit appliedDate', () => {
        expect(getAppliedDate(CANDIDATES[0])).toBe('2026-07-01');
    });
    it('falls back to createdAt timestamp', () => {
        expect(getAppliedDate(CANDIDATES[1])).toBe('2026-07-15');
    });
    it('returns empty string when neither exists', () => {
        expect(getAppliedDate({})).toBe('');
    });
});

describe('applyTableFilters', () => {
    it('returns all rows with default filters', () => {
        expect(applyTableFilters(CANDIDATES, DEFAULT_FILTERS)).toHaveLength(3);
    });
    it('searches across name, email and skills', () => {
        expect(applyTableFilters(CANDIDATES, { search: 'ayşe' })).toHaveLength(1);
        expect(applyTableFilters(CANDIDATES, { search: 'mehmet@' })).toHaveLength(1);
        expect(applyTableFilters(CANDIDATES, { search: 'react' })).toHaveLength(1);
        expect(applyTableFilters(CANDIDATES, { search: 'bulunamaz' })).toHaveLength(0);
    });
    it('filters by stage including legacy statuses', () => {
        const rows = applyTableFilters(CANDIDATES, { stage: 'ai_analysis' });
        expect(rows.map((c) => c.id)).toEqual(['2']);
    });
    it('filters by position, department and source', () => {
        expect(applyTableFilters(CANDIDATES, { position: 'İK Uzmanı' })).toHaveLength(1);
        expect(applyTableFilters(CANDIDATES, { department: 'Yazılım' })).toHaveLength(2);
        expect(applyTableFilters(CANDIDATES, { source: 'LinkedIn' })).toHaveLength(2);
    });
    it('filters by minimum combined score', () => {
        const rows = applyTableFilters(CANDIDATES, { minScore: '70' });
        expect(rows.map((c) => c.id).sort()).toEqual(['1', '2']);
    });
    it('filters by autonomous-scan status', () => {
        const rows = [
            { ...CANDIDATES[0], aiAnalysis: { starAnalysis: { Situation: { score: 7 } } } },
            CANDIDATES[1],
            CANDIDATES[2],
        ];
        expect(applyTableFilters(rows, { scan: 'scanned' }).map((c) => c.id)).toEqual(['1']);
        expect(applyTableFilters(rows, { scan: 'unscanned' }).map((c) => c.id).sort()).toEqual(['2', '3']);
        expect(applyTableFilters(rows, { scan: 'all' })).toHaveLength(3);
    });

    it('sorts by scan status (scanned first when descending)', () => {
        const rows = [
            CANDIDATES[1],
            { ...CANDIDATES[0], aiAnalysis: { starAnalysis: {} } },
        ];
        expect(sortRows(rows, 'scanStatus', 'desc')[0].id).toBe('1');
    });

    it('filters by applied date range', () => {
        const rows = applyTableFilters(CANDIDATES, { dateFrom: '2026-07-01', dateTo: '2026-07-10' });
        expect(rows.map((c) => c.id)).toEqual(['1']);
    });
    it('combines filters with AND', () => {
        const rows = applyTableFilters(CANDIDATES, { source: 'LinkedIn', department: 'Yazılım' });
        expect(rows.map((c) => c.id)).toEqual(['1']);
    });
    it('does not mutate the input array', () => {
        const input = [...CANDIDATES];
        applyTableFilters(input, { search: 'ayşe' });
        expect(input).toHaveLength(3);
    });
});

describe('cleanRoleText', () => {
    it('keeps clean role titles as-is', () => {
        expect(cleanRoleText('Growth Product Manager')).toBe('Growth Product Manager');
        expect(cleanRoleText('  "Senior UI Engineer." ')).toBe('Senior UI Engineer');
    });
    it('joins up to 3 equally-suitable roles with commas', () => {
        expect(cleanRoleText('Product Manager / Growth Lead')).toBe('Product Manager, Growth Lead');
        expect(cleanRoleText('A Uzmani, B Uzmani, C Uzmani, D Uzmani')).toBe('A Uzmani, B Uzmani, C Uzmani');
    });
    it('rejects commentary sentences and falls back to the CV role', () => {
        const yorum = 'Adayin profili dijital pazarlama alaninda cok guclu oldugu icin kendisine oncelikle growth odakli roller onerilir';
        expect(cleanRoleText(yorum, 'Marketing Specialist')).toBe('Marketing Specialist');
        expect(cleanRoleText('', 'Fallback Rol')).toBe('Fallback Rol');
    });
    it('takes only the first sentence when a title is followed by commentary', () => {
        expect(cleanRoleText('Growth Product Manager. Aday ayrica satis rollerine de bakabilir.')).toBe('Growth Product Manager');
    });
});

describe('scoreForPosition', () => {
    const POSITION = { id: 'p1', title: 'Frontend Developer' };

    it('takes the max of the saved AI analysis and the keyword score', () => {
        const c = { positionAnalyses: { 'Frontend Developer': { score: 62 } } };
        expect(scoreForPosition(c, POSITION, () => 40)).toBe(62);
        expect(scoreForPosition(c, POSITION, () => 80)).toBe(80);
    });
    it('works without a keyword function (saved analysis only)', () => {
        const c = { positionAnalyses: { 'Frontend Developer': { score: 55 } } };
        expect(scoreForPosition(c, POSITION)).toBe(55);
    });
    it('returns 0 for missing analysis, missing position, or empty candidate', () => {
        expect(scoreForPosition({}, POSITION)).toBe(0);
        expect(scoreForPosition({}, null, () => 90)).toBe(0);
    });
});

describe('withCoherentScores', () => {
    const OPEN = [{ id: 'p1', title: 'Growth Product Manager' }];

    it('replaces the best-fit score with the DISPLAYED position\'s score', () => {
        // Eda vakası: başlık Growth PM, eski analiz başka pozisyon için %75,
        // Growth PM'in gerçek skoru %34 — satır %34 göstermeli.
        const rows = withCoherentScores([{
            id: 'c1', matchedPositionTitle: 'Growth Product Manager',
            bestScore: 75, combinedScore: 75, interviewScore: null,
            positionAnalyses: {},
            aiAnalysis: { score: 75, analyzedForPosition: 'Senior Performance Marketing Specialist' },
        }], OPEN, () => 34);
        expect(rows[0].bestScore).toBe(34);
        expect(rows[0].combinedScore).toBe(34);
    });

    it('uses the deep-analysis score when it was made FOR the displayed position', () => {
        const rows = withCoherentScores([{
            id: 'c1', matchedPositionTitle: 'Growth Product Manager',
            bestScore: 20, interviewScore: null, positionAnalyses: {},
            aiAnalysis: { score: 81, analyzedForPosition: 'Growth Product Manager' },
        }], OPEN, () => 34);
        expect(rows[0].bestScore).toBe(81);
    });

    it('recombines the interview score with the coherent AI score', () => {
        const rows = withCoherentScores([{
            id: 'c1', matchedPositionTitle: 'Growth Product Manager',
            bestScore: 75, interviewScore: 90,
            positionAnalyses: { 'Growth Product Manager': { score: 40 } },
        }], OPEN, () => 0);
        expect(rows[0].bestScore).toBe(40);
        expect(rows[0].combinedScore).toBe(65); // (40+90)/2
    });

    it('leaves rows untouched when the title is absent or not an open position', () => {
        const input = [
            { id: 'a', matchedPositionTitle: null, bestScore: 70, combinedScore: 70 },
            { id: 'b', matchedPositionTitle: 'Kapalı Pozisyon', bestScore: 60, combinedScore: 60 },
        ];
        const rows = withCoherentScores(input, OPEN, () => 99);
        expect(rows[0].bestScore).toBe(70);
        expect(rows[1].bestScore).toBe(60);
    });
});

describe('applyTableFilters — pozisyon uygunluk modu', () => {
    const POSITION = { id: 'p1', title: 'Frontend Developer' };
    // Aday 3'ün en-iyi skoru düşük ama SEÇİLİ pozisyondaki kayıtlı analizi yüksek;
    // aday 1'in en-iyi skoru yüksek ama bu pozisyondaki skoru düşük.
    const ROWS = [
        { ...CANDIDATES[0], positionAnalyses: { 'Frontend Developer': { score: 40 } } },
        { ...CANDIDATES[1], positionAnalyses: {} },
        { ...CANDIDATES[2], positionAnalyses: { 'Frontend Developer': { score: 85 } } },
    ];
    const OPTS = { position: POSITION, keywordScoreFn: () => 0 };

    it('applies the min-score threshold to the SELECTED position score, not the best-fit score', () => {
        const rows = applyTableFilters(ROWS, { position: 'Frontend Developer', minScore: '80' }, OPTS);
        // Eski davranış combinedScore'a bakıp ['1'] döndürürdü; doğrusu ['3'].
        expect(rows.map((c) => c.id)).toEqual(['3']);
    });
    it('does not exclude candidates by label in position mode — everyone gets a score', () => {
        const rows = applyTableFilters(ROWS, { position: 'Frontend Developer' }, OPTS);
        expect(rows).toHaveLength(3);
        expect(rows.map((c) => c.positionScore)).toEqual([40, 0, 85]);
    });
    it('falls back to label matching when no position object is supplied', () => {
        const rows = applyTableFilters(ROWS, { position: 'Frontend Developer' });
        expect(rows.map((c) => c.id)).toEqual(['1']);
    });
    it('sorts by positionScore with the standard sorter', () => {
        const rows = applyTableFilters(ROWS, { position: 'Frontend Developer' }, OPTS);
        expect(sortRows(rows, 'positionScore', 'desc').map((c) => c.id)).toEqual(['3', '1', '2']);
    });
});

describe('sortRows', () => {
    it('sorts numerically descending by default', () => {
        expect(sortRows(CANDIDATES, 'combinedScore').map((c) => c.id)).toEqual(['1', '2', '3']);
    });
    it('sorts numerically ascending', () => {
        expect(sortRows(CANDIDATES, 'experience', 'asc').map((c) => c.id)).toEqual(['2', '1', '3']);
    });
    it('sorts strings with Turkish locale', () => {
        expect(sortRows(CANDIDATES, 'name', 'asc').map((c) => c.name)).toEqual([
            'Ayşe Yılmaz', 'Mehmet Demir', 'Zeynep Çelik',
        ]);
    });
    it('puts null values last in both directions', () => {
        expect(sortRows(CANDIDATES, 'interviewScore', 'desc').map((c) => c.id)).toEqual(['1', '3', '2']);
        expect(sortRows(CANDIDATES, 'interviewScore', 'asc').map((c) => c.id)).toEqual(['3', '1', '2']);
    });
    it('returns a new array without mutating input', () => {
        const input = [...CANDIDATES];
        const sorted = sortRows(input, 'name', 'asc');
        expect(sorted).not.toBe(input);
        expect(input.map((c) => c.id)).toEqual(['1', '2', '3']);
    });
    it('returns a copy for unknown sort keys', () => {
        expect(sortRows(CANDIDATES, 'nope').map((c) => c.id)).toEqual(['1', '2', '3']);
    });
});

describe('buildExportRows', () => {
    it('maps candidates to Turkish-labelled flat rows', () => {
        const [row] = buildExportRows([CANDIDATES[0]]);
        expect(row).toEqual({
            'Ad Soyad': 'Ayşe Yılmaz',
            'E-posta': 'ayse@example.com',
            'Telefon': '+90 555 111 1111',
            'Pozisyon': 'Frontend Developer',
            "CV'ye Göre İdeal Rol": 'Frontend Developer',
            'Departman': 'Yazılım',
            'Aşama': 'Mülakat',
            'Kaynak': 'LinkedIn',
            'Kaynak Detayı': 'Sponsorlu',
            'Otonom Tarama': 'Yapılmadı',
            'Doğrulama': 'Doğrulanmadı',
            'Sektör Uyumu': 'Ölçülemedi',
            'Ön Skor (İlk)': '',
            'Ön Skor Yöntemi': '',
            'AI Skoru': 85,
            'STAR %': '',
            'STAR Kırılım': '',
            'Mülakat Skoru': 90,
            'Genel Skor': 88,
            'Deneyim (Yıl)': 5,
            'Lokasyon': 'İstanbul',
            'Eğitim': 'Bilgisayar Müh.',
            'Yetenekler': 'React, TypeScript',
            'Başvuru Tarihi': '2026-07-01',
        });
    });
    it('renders empty strings for missing fields and blank for null scores', () => {
        const [row] = buildExportRows([{ id: 'x', status: 'new' }]);
        expect(row['Ad Soyad']).toBe('');
        expect(row['Aşama']).toBe('Ön Eleme');
        expect(row['Mülakat Skoru']).toBe('');
        expect(row['Yetenekler']).toBe('');
    });

    // "Tarama skorları yükseltti mi?" sorusunun cevabı iki sayıyı YAN YANA
    // görmeyi gerektiriyor. Tek kolonda toplandıklarında taranmış adayın giriş
    // skoru hiç görünmüyordu ve soru ancak tahminle cevaplanabiliyordu.
    it('exports the intake score alongside the deep-scan score', () => {
        const [row] = buildExportRows([{
            id: 'x', status: 'new', initialAiScore: 41, bestScore: 78,
        }]);
        expect(row['Ön Skor (İlk)']).toBe(41);
        expect(row['AI Skoru']).toBe(78);
    });

    it('keeps a zero intake score instead of blanking it', () => {
        // 0 bir ölçüm: "hiçbir maddeyi karşılamıyor". Boş bırakmak onu
        // "ölçülmedi" ile karıştırır.
        const [row] = buildExportRows([{ id: 'x', status: 'new', initialAiScore: 0 }]);
        expect(row['Ön Skor (İlk)']).toBe(0);
    });

    it('leaves the intake score blank when there never was one', () => {
        const [row] = buildExportRows([{ id: 'x', status: 'new' }]);
        expect(row['Ön Skor (İlk)']).toBe('');
    });

    // Yüzde doygunluğu gizler: dört boyut da 3/3 ise ölçek ayrıştırmıyordur ve
    // bu ancak ham değerlerde görünür.
    it('exports both the STAR percentage and the per-dimension breakdown', () => {
        const [row] = buildExportRows([{
            id: 'x',
            status: 'new',
            aiAnalysis: {
                starAnalysis: {
                    Situation: { score: 3 }, Task: { score: 3 },
                    Action: { score: 2 }, Result: { score: 3 },
                },
            },
        }]);
        expect(row['STAR %']).toBe(92);
        expect(row['STAR Kırılım']).toBe('3/3 · 3/3 · 2/3 · 3/3');
    });

    // Hangi cetvelin ölçtüğünü görmeden dağılıma bakmak yanıltıcı: iki cetvel
    // tek kolonda toplanınca sıralama sessizce anlamını yitiriyor.
    it('names the ruler that produced the intake score', () => {
        expect(buildExportRows([{ id: 'x', status: 'new', prescoreMethod: 'ai' }])[0]['Ön Skor Yöntemi'])
            .toBe('AI');
        expect(buildExportRows([{ id: 'x', status: 'new', prescoreMethod: 'keyword' }])[0]['Ön Skor Yöntemi'])
            .toBe('Anahtar kelime');
    });

    it('leaves the method blank on older records instead of guessing one', () => {
        expect(buildExportRows([{ id: 'x', status: 'new' }])[0]['Ön Skor Yöntemi']).toBe('');
    });

    it('leaves STAR columns blank when the analysis never ran', () => {
        const [row] = buildExportRows([{ id: 'x', status: 'new' }]);
        expect(row['STAR %']).toBe('');
        expect(row['STAR Kırılım']).toBe('');
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// Konum filtresi — CV'den okunan konum bilgisiyle İstanbul içi/dışı eleme.
// Türkçe büyük İ tuzağı: 'İstanbul'.toLowerCase() "i̇stanbul" üretir
// (i + birleşen nokta), bu yüzden düz includes('istanbul') kaçırır.
// ─────────────────────────────────────────────────────────────────────────────
describe('isIstanbulLocation', () => {
    it('matches the Turkish capital-İ spelling', () => {
        expect(isIstanbulLocation('İstanbul')).toBe(true);
        expect(isIstanbulLocation('İSTANBUL')).toBe(true);
    });

    it('matches ASCII and mixed spellings', () => {
        expect(isIstanbulLocation('Istanbul, Türkiye')).toBe(true);
        expect(isIstanbulLocation('istanbul')).toBe(true);
    });

    it('matches when a district or country wraps the city', () => {
        expect(isIstanbulLocation('Kadıköy/İstanbul')).toBe(true);
        expect(isIstanbulLocation('Ataşehir, İstanbul, Türkiye')).toBe(true);
    });

    it('rejects other cities and empty values', () => {
        expect(isIstanbulLocation('Ankara')).toBe(false);
        expect(isIstanbulLocation('İzmir, Türkiye')).toBe(false);
        expect(isIstanbulLocation('')).toBe(false);
        expect(isIstanbulLocation(null)).toBe(false);
    });
});

describe('locationBucket', () => {
    it('separates inside / outside / unknown', () => {
        expect(locationBucket({ location: 'İstanbul' })).toBe('istanbul');
        expect(locationBucket({ location: 'Bursa' })).toBe('outside');
        expect(locationBucket({ location: '   ' })).toBe('unknown');
        expect(locationBucket({})).toBe('unknown');
    });

    it('treats a missing location as unknown, never as "outside"', () => {
        // Veri eksikliği şehir dışı olmakla aynı şey değil — aksi halde konumu
        // okunamamış adaylar "İstanbul dışı" filtresinde elenirdi.
        expect(locationBucket({ location: undefined })).not.toBe('outside');
    });
});

describe('applyTableFilters — konum', () => {
    const rows = [
        { id: '1', name: 'A', location: 'İstanbul, Türkiye' },
        { id: '2', name: 'B', location: 'Kadıköy/İstanbul' },
        { id: '3', name: 'C', location: 'Ankara' },
        { id: '4', name: 'D', location: '' },
    ];
    const ids = (out) => out.map((c) => c.id);

    it('filters to İstanbul only', () => {
        expect(ids(applyTableFilters(rows, { location: 'istanbul' }))).toEqual(['1', '2']);
    });

    it('filters to outside İstanbul without sweeping in unknown locations', () => {
        expect(ids(applyTableFilters(rows, { location: 'outside' }))).toEqual(['3']);
    });

    it('can isolate candidates whose location could not be read', () => {
        expect(ids(applyTableFilters(rows, { location: 'unknown' }))).toEqual(['4']);
    });

    it('is inactive by default', () => {
        expect(ids(applyTableFilters(rows, {}))).toEqual(['1', '2', '3', '4']);
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// scoreForPosition — keywordScoreFn'in dönüş ŞEKLİ.
//
// Gerçek hata: matchService.calculateMatchScore {score, reasons, ...} objesi
// döndürür. Bir çağıran fonksiyonu ham geçince Number(obje) → NaN → 0 oldu ve
// TÜM adayların anahtar-kelime skoru sessizce sıfırlandı; kullanıcı "min skor
// 56 üstünde 0 aday" gördü. Sınır artık iki şekli de kabul ediyor.
// ─────────────────────────────────────────────────────────────────────────────
describe('scoreForPosition — skor fonksiyonunun dönüş şekli', () => {
    const position = { title: 'Growth PM' };
    const candidate = { positionAnalyses: {} };

    it('accepts a plain number', () => {
        expect(scoreForPosition(candidate, position, () => 62)).toBe(62);
    });

    it('accepts calculateMatchScore\'s object shape instead of silently scoring 0', () => {
        expect(scoreForPosition(candidate, position, () => ({ score: 62, reasons: [] }))).toBe(62);
    });

    it('still prefers the saved analysis when it is higher', () => {
        const analysed = { positionAnalyses: { 'Growth PM': { score: 80 } } };
        expect(scoreForPosition(analysed, position, () => ({ score: 62 }))).toBe(80);
    });

    it('uses the keyword score when it beats a stale saved analysis', () => {
        const analysed = { positionAnalyses: { 'Growth PM': { score: 30 } } };
        expect(scoreForPosition(analysed, position, () => ({ score: 62 }))).toBe(62);
    });

    it('treats unusable values as 0 rather than NaN', () => {
        expect(scoreForPosition(candidate, position, () => ({}))).toBe(0);
        expect(scoreForPosition(candidate, position, () => undefined)).toBe(0);
        expect(scoreForPosition(candidate, position, () => 'çok iyi')).toBe(0);
        expect(scoreForPosition(candidate, position, null)).toBe(0);
    });

    it('returns 0 for a position without a title', () => {
        expect(scoreForPosition(candidate, {}, () => ({ score: 90 }))).toBe(0);
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// analysisForPosition — GÖSTERİLEN metin, GÖSTERİLEN pozisyonun metnidir.
//
// Arayüz analiz metnini tek bir aiAnalysis.summary alanından okuyordu; analizler
// ise pozisyon başlığıyla anahtarlı positionAnalyses haritasında ayrı ayrı
// duruyor. Sonuç: aday hangi pozisyon bağlamında açılırsa açılsın aynı yorum
// görünüyordu ("bu yorum hep sabit kalıyor" bildirimi).
// ─────────────────────────────────────────────────────────────────────────────
describe('analysisForPosition', () => {
    const candidate = {
        positionAnalyses: {
            'Growth PM': { summary: 'Growth PM için üretilmiş metin', score: 60 },
            'Backend Dev': { summary: 'Backend için üretilmiş metin', score: 25 },
        },
        aiAnalysis: { summary: 'Backend için üretilmiş metin', analyzedForPosition: 'Backend Dev', score: 25 },
    };

    it('returns the analysis written for the position being displayed', () => {
        expect(analysisForPosition(candidate, 'Growth PM')).toEqual({
            summary: 'Growth PM için üretilmiş metin', analyzedFor: 'Growth PM', score: 60,
        });
    });

    it('does not leak another position\'s narrative', () => {
        const forGrowth = analysisForPosition(candidate, 'Growth PM');
        expect(forGrowth.summary).not.toBe(candidate.aiAnalysis.summary);
    });

    it('falls back to aiAnalysis when it was produced for the same position', () => {
        const onlyTopLevel = {
            aiAnalysis: { summary: 'Tek metin', analyzedForPosition: 'Growth PM', score: 70 },
        };
        expect(analysisForPosition(onlyTopLevel, 'Growth PM')).toEqual({
            summary: 'Tek metin', analyzedFor: 'Growth PM', score: 70,
        });
    });

    it('returns null when nothing was written for this position', () => {
        expect(analysisForPosition(candidate, 'Data Analyst')).toBeNull();
        const otherPosition = { aiAnalysis: { summary: 'X', analyzedForPosition: 'Backend Dev' } };
        expect(analysisForPosition(otherPosition, 'Growth PM')).toBeNull();
    });

    it('handles missing input', () => {
        expect(analysisForPosition(null, 'Growth PM')).toBeNull();
        expect(analysisForPosition(candidate, '')).toBeNull();
        expect(analysisForPosition({}, 'Growth PM')).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// MÜLAKAT LİSTEYE YANSIR.
//
// Aday odada bir zorunlu maddeyi kapattıysa listede de yukarı çıkmalı. Skor
// aday sayfasında değişip tabloda değişmeseydi, iki ekran birbirine ters
// düşerdi — bu modülün en başta çözdüğü sorunun aynısı.
//
// Ve değişim GÖRÜNÜR olmalı: dün 65 gördüğü adayı bugün 78'de bulan kullanıcı
// nedenini bilebilmeli.
// ─────────────────────────────────────────────────────────────────────────────
describe('mülakat tabloya yansır', () => {
    const POS = {
        title: 'Growth PM',
        requirementsMeta: [
            { text: 'Funnel sahipliği', must: true },
            { text: 'A/B test', must: true },
        ],
    };

    const rowFor = (extra) => applyTableFilters(
        [{
            id: 'c1',
            name: 'Aday',
            status: 'ai_analysis',
            positionAnalyses: {
                'Growth PM': {
                    requirementsFingerprint: requirementsFingerprint(POS),
                    starAnalysis: {
                        Situation: { score: 3 }, Task: { score: 3 }, Action: { score: 3 }, Result: { score: 3 },
                    },
                    requirementCoverage: {
                        assessments: [{ index: 1, status: 'met' }, { index: 2, status: 'missing' }],
                    },
                },
            },
            ...extra,
        }],
        { ...DEFAULT_FILTERS, position: 'Growth PM' },
        { position: POS, positionMode: true }
    )[0];

    const interviewed = (verdicts) => ({
        interviewCoverage: {
            'Growth PM': { verdicts, requirementsFingerprint: requirementsFingerprint(POS) },
        },
    });

    it('raises the row score when the room closed a must-have', () => {
        const before = rowFor({});
        const after = rowFor(interviewed([{ requirementIndex: 2, verdict: 'met', quote: 'Testleri ben kurdum' }]));
        expect(after.positionScore).toBeGreaterThan(before.positionScore);
    });

    it('opens the row gate too, so the badge and the score agree', () => {
        // Skor yükselip rozet kırmızı kalsaydı iki ekran birbirine ters düşerdi
        expect(rowFor({}).positionGate.status).toBe('missing');
        const after = rowFor(interviewed([{ requirementIndex: 2, verdict: 'met' }]));
        expect(after.positionGate.status).toBe('ok');
        expect(after.positionGate.fromInterview).toBe(1);
    });

    it('marks the row so the change is not silent', () => {
        expect(rowFor({}).positionInterviewed).toBe(false);
        expect(rowFor(interviewed([{ requirementIndex: 2, verdict: 'met' }])).positionInterviewed).toBe(true);
    });

    it('ignores verdicts recorded against an older requirement list', () => {
        const stale = rowFor({
            interviewCoverage: {
                'Growth PM': { verdicts: [{ requirementIndex: 2, verdict: 'met' }], requirementsFingerprint: 'rESKI' },
            },
        });
        expect(stale.positionScore).toBe(rowFor({}).positionScore);
        expect(stale.positionGate.status).toBe('missing');
        expect(stale.positionInterviewed).toBe(false);
    });
});

// ── Doğrulama filtreleri ────────────────────────────────────────────────────
// Filtrenin sınıflandırması utils/candidateBadges.js'te; burada filtrenin o
// sınıflandırmayı DOĞRU uyguladığı sabitleniyor.
describe('sektör ve doğrulama filtreleri', () => {
    const withSector = (id, verdict) => ({ id, name: id, experiences: [], verification: { at: 'x', sector: { verdict } } });
    const rows = [
        withSector('guclu', 'guclu'),
        withSector('kismi', 'kismi'),
        withSector('komsu', 'yakin'),
        withSector('disi', 'yok'),
        withSector('olculemedi', 'olculemedi'),
        { id: 'taranmamis', name: 'taranmamis', experiences: [] },
    ];
    const idsFor = (filters) => applyTableFilters(rows, filters).map((c) => c.id);

    it('matches the same and partial fit under "aynı sektör"', () => {
        expect(idsFor({ sector: 'match' }).sort()).toEqual(['guclu', 'kismi']);
    });

    it('unions same and neighbour so the user does not combine two filters by hand', () => {
        expect(idsFor({ sector: 'near_or_match' }).sort()).toEqual(['guclu', 'kismi', 'komsu']);
    });

    it('isolates neighbour-only', () => {
        expect(idsFor({ sector: 'near' })).toEqual(['komsu']);
    });

    // ASIL KORUMA: taranmamış adaylar "sektör dışı" filtresine düşmemeli.
    it('keeps unmeasured candidates out of "sektör dışı"', () => {
        expect(idsFor({ sector: 'outside' })).toEqual(['disi']);
        expect(idsFor({ sector: 'unmeasured' }).sort()).toEqual(['olculemedi', 'taranmamis']);
    });

    it('leaves the list untouched when the filter is off', () => {
        expect(idsFor({ sector: 'all' })).toHaveLength(rows.length);
        expect(idsFor({ verification: 'all' })).toHaveLength(rows.length);
    });

    it('separates contradiction, attention, clean and unverified', () => {
        const vrows = [
            { id: 'celiskili', experiences: [], verification: { at: 'x', counts: { celiski: 1, dikkat: 0 } } },
            { id: 'dikkatli', experiences: [], verification: { at: 'x', counts: { celiski: 0, dikkat: 3 } } },
            { id: 'temiz', experiences: [], verification: { at: 'x', counts: { celiski: 0, dikkat: 0 } } },
            { id: 'taranmamis', experiences: [] },
        ];
        const pick = (v) => applyTableFilters(vrows, { verification: v }).map((c) => c.id);
        expect(pick('contradiction')).toEqual(['celiskili']);
        expect(pick('attention')).toEqual(['dikkatli']);
        expect(pick('clean')).toEqual(['temiz']);
        expect(pick('unverified')).toEqual(['taranmamis']);
    });
});

describe('doğrulama kolonu — sıralama ve dışa aktarım', () => {
    const row = (id, rank) => ({ id, experiences: [], verificationRank: rank });

    // Azalan sıralamada çelişkililer başa gelmeli — kolonu tıklayan
    // işe alımcının beklediği şey bu.
    it('sorts the most urgent verification state first', () => {
        const rows = [
            row('temiz', VERIFICATION_RANK.clean),
            row('celiskili', VERIFICATION_RANK.contradiction),
            row('taranmamis', VERIFICATION_RANK.unverified),
            row('dikkatli', VERIFICATION_RANK.attention),
        ];
        expect(sortRows(rows, 'verification', 'desc').map((c) => c.id))
            .toEqual(['celiskili', 'dikkatli', 'temiz', 'taranmamis']);
    });

    it('ranks contradiction above attention above clean above unverified', () => {
        expect(VERIFICATION_RANK.contradiction).toBeGreaterThan(VERIFICATION_RANK.attention);
        expect(VERIFICATION_RANK.attention).toBeGreaterThan(VERIFICATION_RANK.clean);
        expect(VERIFICATION_RANK.clean).toBeGreaterThan(VERIFICATION_RANK.unverified);
    });

    // Tabloda görünen bir kolonun dışa aktarımda olmaması, kullanıcının
    // hemen çarpacağı bir tutarsızlık.
    it('carries both columns into the Excel export', () => {
        const [out] = buildExportRows([{
            name: 'Aday', experiences: [],
            verification: { at: 'x', counts: { celiski: 1, dikkat: 0 }, sector: { verdict: 'yok' } },
        }]);
        expect(out['Doğrulama']).toBe('Çelişkili');
        expect(out['Sektör Uyumu']).toBe('Sektör dışı');
    });

    it('never labels an unscanned candidate as clean in the export', () => {
        const [out] = buildExportRows([{ name: 'Aday', experiences: [] }]);
        expect(out['Doğrulama']).toBe('Doğrulanmadı');
        expect(out['Sektör Uyumu']).toBe('Ölçülemedi');
    });
});
