// STAR ne ölçüyor — ekrandaki KELİMELER.
//
// Bu bir arayüz metni testi ve fazla titiz görünebilir. Sebebi somut: kart
// "STAR Yetkinlik Analizi" diyordu ve yanında "GENEL SKOR: 100" yazıyordu.
// Yöneticiler bunu "çok yetkin aday" diye okudu, sonra CV'ye bakıp haklı
// olarak "bize uymaz" dedi ve skorlamaya güveni sarsıldı.
//
// Oysa STAR adayın niteliğini DEĞİL, CV'de ne kadar kanıt bulunduğunu ölçüyor
// — bunu prompt'ta özellikle böyle kurduk ("anılmış / anlatılmış / ölçülmüş").
// Etiket ölçümle çeliştiği sürece özellik yanlış anlaşılmaya devam eder.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const SCREENS = [
    'components/StarScoreCard.jsx',
    'components/ScoreBreakdownPanel.jsx',
    'pages/CandidateProcessPage.jsx',
];

describe('STAR etiketleri', () => {
    it('never calls STAR a competence measure', () => {
        // "Yetkinlik" burada yalan söyler: ölçüm CV'de kanıt var mı diye bakar,
        // adayın yetkin olup olmadığına değil
        for (const file of SCREENS) {
            expect(read(file)).not.toMatch(/STAR Yetkinlik/);
        }
    });

    it('never presents the STAR number as an overall score', () => {
        // "GENEL SKOR" ifadesi, alana kör bir ölçümü genel bir yargı gibi
        // gösteriyordu
        expect(read('components/StarScoreCard.jsx')).not.toMatch(/GENEL SKOR/);
        expect(read('components/StarScoreCard.jsx')).toMatch(/KANIT SKORU/);
    });

    it('says what it actually measures on the card', () => {
        const card = read('components/StarScoreCard.jsx');
        expect(card).toMatch(/STAR Kanıt Analizi/);
        expect(card).toMatch(/CV'de bulunan kanıtın yoğunluğu/);
    });

    it('explains the badge on hover instead of leaving a bare percentage', () => {
        const page = read('pages/CandidateProcessPage.jsx');
        expect(page).toMatch(/CV'de ne kadar kanıt bulunduğunu ölçer/);
        expect(page).toMatch(/adayın ne kadar iyi olduğunu değil/);
    });

    it('keeps the score breakdown consistent with the card', () => {
        expect(read('components/ScoreBreakdownPanel.jsx')).toMatch(/CV'deki Kanıt \(STAR\)/);
    });

    it('keeps the measurement anchored to evidence, not quality', () => {
        // Etiketin doğru olması, ölçümün de o kalmasına bağlı. Ölçüm artık
        // skor çağrısında; anlatım çağrısı aynı tanımı tekrar ediyor.
        expect(read('services/ai/coverageScorer.js'))
            .toMatch(/CV'de NE KADAR KANIT var \(adayın niteliği DEĞİL\)/);
        expect(read('services/ai/extraction.js'))
            .toMatch(/adayın NİTELİĞİNİ değil, CV'de NE KADAR KANIT bulunduğunu anlatır/);
    });
});
