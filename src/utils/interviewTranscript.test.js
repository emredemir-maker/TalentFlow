import { describe, it, expect } from 'vitest';
import { parseTranscriptText, recruiterLinesOf } from './interviewTranscript';

const MANUEL = [
    '[12:31:43] Emre Demir | Infoset: Sesiniz kesiliyor gibi.',
    '[12:33:14] Sema Kartal: Eğitim hayatınızdan başlayarak anlatır mısınız?',
    '[12:33:29] Kerem: Ben lisansta psikoloji mezunuyum.',
    '[12:34:03] Kerem: Sonra yüksek lisans yaptım.',
].join('\n');

describe('düz metin transkript ayrıştırma', () => {
    it('zaman damgalı satırları konuşmacı ve metne ayırıyor', () => {
        const out = parseTranscriptText(MANUEL);
        expect(out).toHaveLength(4);
        expect(out[1]).toEqual({ speaker: 'Sema Kartal', text: 'Eğitim hayatınızdan başlayarak anlatır mısınız?' });
    });

    it('TEK SATIR HÂLİNDE YAPIŞTIRILMIŞ TRANSKRİPT DE AYRIŞIYOR', () => {
        // Yapıştırılan transkriptlerin bir kısmı satır sonu taşımıyor.
        const tek = '[12:31:43] Sema Kartal: Merhaba. [12:31:50] Kerem: Merhaba efendim.';
        const out = parseTranscriptText(tek);
        expect(out.map((l) => l.speaker)).toEqual(['Sema Kartal', 'Kerem']);
    });

    it('konuşmacısı olmayan satır öncekine ekleniyor, atılmıyor', () => {
        const out = parseTranscriptText('Sema Kartal: Birinci cümle.\ndevamı ikinci satırda');
        expect(out).toHaveLength(1);
        expect(out[0].text).toContain('devamı ikinci satırda');
    });

    it('boş girdide çökmüyor', () => {
        expect(parseTranscriptText('')).toEqual([]);
        expect(parseTranscriptText(null)).toEqual([]);
    });
});

describe('mülakatçı satırlarının bulunması', () => {
    it("CANLI AKIŞTAKİ 'YÖNETİCİ' ROLÜ ARTIK TANINIYOR", () => {
        // Asıl hata buydu: canlı akış mülakatçıyı 'YÖNETİCİ' diye
        // etiketliyor, değerlendirici 'MÜLAKATÇI' arıyordu. Hiç eşleşmiyordu.
        const { lines, reason } = recruiterLinesOf([
            { role: 'YÖNETİCİ', text: 'Bize kendinizden bahseder misiniz?' },
            { role: 'ADAY', text: 'Tabii, ben...' },
        ]);
        expect(reason).toBeNull();
        expect(lines).toEqual(['Bize kendinizden bahseder misiniz?']);
    });

    it('MANUEL GÖRÜŞMENİN DÜZ METNİ DE ÇÖZÜLÜYOR', () => {
        const { lines, reason } = recruiterLinesOf(MANUEL, 'Kerem Can Demirtaş');
        expect(reason).toBeNull();
        expect(lines).toHaveLength(2);
        expect(lines[1]).toContain('Eğitim hayatınızdan');
        expect(lines.join(' ')).not.toContain('psikoloji mezunuyum');
    });

    it('adayın ilk adı yeterli — transkriptte çoğu zaman soyad yok', () => {
        const { lines } = recruiterLinesOf(MANUEL, 'Kerem');
        expect(lines).toHaveLength(2);
    });

    it('ADAY BİLİNMİYORSA ÖLÇÜM YAPILMIYOR', () => {
        // Yanlış tarafı mülakatçı sayıp adayın cümleleri üzerinden not vermek,
        // hiç ölçmemekten kötüdür.
        const { lines, reason } = recruiterLinesOf(MANUEL, '');
        expect(lines).toEqual([]);
        expect(reason).toContain('Aday adı');
    });

    it('adayın satırları bulunamazsa ölçüm yapılmıyor', () => {
        const { lines, reason } = recruiterLinesOf(MANUEL, 'Bambaşka Biri');
        expect(lines).toEqual([]);
        expect(reason).toContain('adayın satırları bulunamadı');
    });

    it('adaydan başka konuşan yoksa ölçüm yapılmıyor', () => {
        const { lines, reason } = recruiterLinesOf('Kerem: Tek başıma konuştum.', 'Kerem');
        expect(lines).toEqual([]);
        expect(reason).toContain('başka konuşan yok');
    });

    it('rol etiketi tanınmazsa aday dışındakiler mülakatçı sayılıyor', () => {
        const { lines, reason } = recruiterLinesOf([
            { role: 'HIRING_MANAGER', text: 'Ekip yapınız neydi?' },
            { role: 'ADAY', text: 'Beş kişiydik.' },
        ]);
        expect(reason).toBeNull();
        expect(lines).toEqual(['Ekip yapınız neydi?']);
    });

    it('transkript hiç yoksa sebebi söyleniyor', () => {
        expect(recruiterLinesOf(null, 'Kerem').reason).toContain('transkript kaydı yok');
        expect(recruiterLinesOf([], 'Kerem').reason).toContain('transkript kaydı yok');
    });
});
