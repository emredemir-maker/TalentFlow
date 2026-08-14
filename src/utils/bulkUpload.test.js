// TOPLU YÜKLEMENİN İSTEMCİ YARDIMCILARI.
//
// BU DOSYADAN 28MB PARÇALAMA TESTLERİ KALDIRILDI. Testler geçiyordu ve
// parçalama doğru çalışıyordu — ama yanlış duvarı ölçüyordu. Parçalama
// Cloud Functions'ın 32MB gövde sınırına karşıydı; asıl sorun Firebase
// Hosting'in 60 saniyede isteği kesmesiydi ve parçalama ona hiçbir şey
// yapmıyordu. Üstelik küçük dosyaları 28MB'a kadar aynı isteğe topladığı için
// süre açısından tek büyük ZIP ile birebir aynı sonucu veriyordu.
//
// "Yeşil test" ile "doğru davranış" aynı şey değil: bu oturumda dört ayrı
// test, düzeltilmesi gereken bir davranışı sabitlediği için hatayı korumuştu.
// Dosya artık Storage'a doğrudan gidiyor, parçalamaya gerek kalmadı.
import { describe, expect, it } from 'vitest';

import {
    sanitizeStorageName,
    bulkStoragePath,
    oversizedFiles,
    formatBytes,
    totalBytes,
    MAX_SOURCE_BYTES,
} from './bulkUpload';

describe('sanitizeStorageName', () => {
    it('keeps a plain ascii name intact', () => {
        expect(sanitizeStorageName('ali_veli-cv.pdf')).toBe('ali_veli-cv.pdf');
    });

    // Türkçe adlar bu üründe kural, istisna değil. Baştaki '_' de atılır:
    // Storage'da alt çizgiyle başlayan adlar bazı araçlarda gizli sayılıyor.
    it('folds Turkish letters and spaces into underscores but keeps the extension', () => {
        expect(sanitizeStorageName('Özgür Şahin CV.pdf')).toBe('zg_r_ahin_CV.pdf');
    });

    it('strips any directory part so a name cannot escape its folder', () => {
        expect(sanitizeStorageName('../../etc/passwd.pdf')).toBe('passwd.pdf');
        expect(sanitizeStorageName('C:\\Users\\x\\cv.docx')).toBe('cv.docx');
    });

    // Adsız bir yol parçası ('bulk-imports/u/tok/0-') Storage'da klasör gibi
    // davranır ve dosyayı erişilemez kılardı.
    it('never returns an empty stem', () => {
        expect(sanitizeStorageName('.pdf')).toBe('dosya.pdf');
        expect(sanitizeStorageName('')).toBe('dosya');
    });

    it('caps a very long name', () => {
        const out = sanitizeStorageName(`${'a'.repeat(200)}.pdf`);
        expect(out).toBe(`${'a'.repeat(60)}.pdf`);
    });
});

describe('bulkStoragePath', () => {
    // uid yolun içinde: Storage kuralı ve sunucu doğrulaması aynı tek gerçeği
    // okur, ikisinin ayrışma ihtimali kalmaz.
    it('puts the uid inside the path', () => {
        expect(bulkStoragePath('u1', 'tok', 0, 'cv.pdf')).toBe('bulk-imports/u1/tok/0-cv.pdf');
    });

    it('keeps same-named files apart with the index', () => {
        const a = bulkStoragePath('u1', 'tok', 0, 'cv.pdf');
        const b = bulkStoragePath('u1', 'tok', 1, 'cv.pdf');
        expect(a).not.toBe(b);
    });

    it('cannot be pushed outside the user folder by a crafted filename', () => {
        expect(bulkStoragePath('u1', 'tok', 0, '../../u2/cv.pdf')).toBe('bulk-imports/u1/tok/0-cv.pdf');
    });
});

describe('oversizedFiles', () => {
    it('flags only files above the cap', () => {
        const files = [{ name: 'a.zip', size: 10 }, { name: 'b.zip', size: MAX_SOURCE_BYTES + 1 }];
        expect(oversizedFiles(files).map((f) => f.name)).toEqual(['b.zip']);
    });

    it('handles an empty or missing list', () => {
        expect(oversizedFiles([])).toEqual([]);
        expect(oversizedFiles(undefined)).toEqual([]);
    });
});

describe('formatBytes', () => {
    it('scales to KB and MB', () => {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(2048)).toBe('2 KB');
        expect(formatBytes(3.2 * 1024 * 1024)).toBe('3.2 MB');
    });

    it('treats a missing size as zero', () => {
        expect(formatBytes(undefined)).toBe('0 B');
    });
});

describe('totalBytes', () => {
    it('sums sizes and tolerates missing ones', () => {
        expect(totalBytes([{ size: 100 }, { size: 50 }, {}])).toBe(150);
    });
});
