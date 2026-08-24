// Bu test canlıda görülen bir BEYAZ EKRANDAN doğdu: bir adayın `skills`
// alanı dizi yerine metindi ve dizi bekleyen sekiz çağrı noktası
// TypeError fırlatıyordu. Header her sayfada render edildiği için hata
// uygulamanın tamamını düşürüyordu.
import { describe, expect, it } from 'vitest';
import { normalizeSkills } from './normalizeSkills.js';

describe('normalizeSkills', () => {
    it('diziyi olduğu gibi bırakır, boşları atar', () => {
        expect(normalizeSkills(['React', ' TypeScript ', '', null])).toEqual(['React', 'TypeScript']);
    });

    it('METNİ diziye çevirir — beyaz ekranın sebebi buydu', () => {
        expect(normalizeSkills('React, TypeScript; GraphQL')).toEqual(['React', 'TypeScript', 'GraphQL']);
    });

    it('satır sonu ve dikey çizgiyle ayrılmış metni de böler', () => {
        expect(normalizeSkills('React\nVue|Svelte')).toEqual(['React', 'Vue', 'Svelte']);
    });

    it('yokluk ve geçersiz tipler boş dizi döner — çağıran taraf her zaman dizi görür', () => {
        for (const v of [undefined, null, 42, {}, true]) {
            expect(normalizeSkills(v)).toEqual([]);
        }
    });

    it('sonuç HER ZAMAN dizidir — çağrı noktalarının varsayımı bu', () => {
        for (const v of [undefined, null, 'a,b', ['x'], 7, {}]) {
            expect(Array.isArray(normalizeSkills(v))).toBe(true);
        }
    });
});
