// Aday ekleme penceresi: düğmedeki sayı, kaydetmenin yazacağı adaylarla aynı
// olmalı. Mükerrer bir CV'de düğme "1 Adayı Havuza Ekle" deyip hiçbir şey
// kaydetmiyordu (başlık doğru şekilde "0 Aday Kaydedilecek" diyordu).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveableResults, saveButtonState } from './addCandidateResults';

const yeni = (ad) => ({ fileName: `${ad}.pdf`, candidate: { name: ad }, success: true, isDuplicate: false });
const mukerrer = (ad) => ({ fileName: `${ad}.pdf`, candidate: { name: ad }, success: true, isDuplicate: true });
const hatali = (ad) => ({ fileName: `${ad}.pdf`, error: 'okunamadı', success: false });

describe('saveableResults', () => {
    it('mükerrerleri, hatalıları ve adaysız sonuçları dışarıda bırakır', () => {
        const r = [yeni('a'), mukerrer('b'), hatali('c'), { success: true, isDuplicate: false }];
        expect(saveableResults(r).map((x) => x.fileName)).toEqual(['a.pdf']);
    });
    it('boş/null girdide boş dizi döner', () => {
        expect(saveableResults(null)).toEqual([]);
        expect(saveableResults([])).toEqual([]);
    });
});

describe('saveButtonState', () => {
    it('yalnızca mükerrer varsa 0 sayar ve düğme kapalıdır', () => {
        const s = saveButtonState([mukerrer('b')]);
        expect(s).toEqual({ count: 0, label: '0 Adayı Havuza Ekle', disabled: true });
    });
    it('karışık sonuçta yalnızca yeni adayları sayar', () => {
        const s = saveButtonState([yeni('a'), mukerrer('b'), hatali('c'), yeni('d')]);
        expect(s.count).toBe(2);
        expect(s.label).toBe('2 Adayı Havuza Ekle');
        expect(s.disabled).toBe(false);
    });
    it('sayı, kaydetmenin yazacağı kayıt sayısına eşittir', () => {
        const r = [yeni('a'), mukerrer('b'), hatali('c')];
        expect(saveButtonState(r).count).toBe(saveableResults(r).length);
    });
    it('kaydederken (loading) kapalıdır', () => {
        expect(saveButtonState([yeni('a')], { loading: true }).disabled).toBe(true);
    });
    it('demoda yalnızca pencereyi kapatır; mükerrer olsa da incelenmiş CV varken açıktır', () => {
        expect(saveButtonState([mukerrer('b')], { isDemo: true })).toMatchObject({ label: 'Sonucu Kapat', disabled: false });
        expect(saveButtonState([hatali('c')], { isDemo: true }).disabled).toBe(true);
    });
});

describe('AddCandidateModal bağlantısı', () => {
    const src = fs.readFileSync(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../components/AddCandidateModal.jsx'),
        'utf8',
    );
    it('düğme etiketi ve kaydetme aynı yardımcıyı kullanır', () => {
        expect(src).toMatch(/saveButtonState\(results/);
        expect(src).toMatch(/const toSave = saveableResults\(results\)/);
        // Eski, mükerrerleri de sayan etiket geri gelmemeli.
        expect(src).not.toMatch(/filter\(r => r\.success\)\.length\} Adayı Havuza Ekle/);
    });
});
