// Proje kimliği korumasının kuralları. Koruma düşerse yer tutucuyla ya da eski
// projenin kimliğiyle yapılan bir merge doğrudan üretim dağıtımına gider.
import { describe, it, expect } from 'vitest';
import {
    PLACEHOLDER,
    RETIRED_VALUES,
    validateProjectId,
    productionSiteProblem,
    demoSiteProblem,
    findForbidden,
    validateDemoProjectId,
} from '../scripts/check-project-config.mjs';

describe('validateProjectId', () => {
    it('geçerli bir kimliği kabul eder', () => {
        expect(validateProjectId('talentflow-prod')).toBeNull();
        expect(validateProjectId('tf-a1b2c3')).toBeNull();
    });

    it('boş kimliği reddeder', () => {
        expect(validateProjectId('')).toMatch(/tanımlı değil/);
        expect(validateProjectId(undefined)).toMatch(/tanımlı değil/);
    });

    it('yer tutucuyu reddeder', () => {
        expect(validateProjectId(PLACEHOLDER)).toMatch(/yer tutucu/);
    });

    it('eski projeyi reddeder', () => {
        expect(validateProjectId('talentflow-84bb6')).toMatch(/eski projeyi/);
    });

    it('kurala uymayan kimliği reddeder', () => {
        expect(validateProjectId('Talentflow')).toMatch(/geçerli/);
        expect(validateProjectId('ab')).toMatch(/geçerli/);
        expect(validateProjectId('bitiyor-')).toMatch(/geçerli/);
    });
});

describe('productionSiteProblem', () => {
    it('adlı ve geçerli bir site ister', () => {
        expect(
            productionSiteProblem({ hosting: { site: 'talentflow-app', public: 'dist' } })
        ).toBeNull();
    });

    it('site yoksa reddeder — paylaşılan projenin varsayılan sitesine giderdi', () => {
        expect(productionSiteProblem({ hosting: { public: 'dist' } })).toMatch(
            /hosting\.site tanımlı değil/
        );
        expect(productionSiteProblem({})).toMatch(/bir hosting girdisi/);
    });

    it('eski site adını, yer tutucuyu ve geçersiz adı reddeder', () => {
        expect(productionSiteProblem({ hosting: { site: 'talentflow-84bb6' } })).toMatch(/eski/);
        expect(productionSiteProblem({ hosting: { site: PLACEHOLDER } })).toMatch(/eski/);
        expect(productionSiteProblem({ hosting: { site: 'Kötü Ad' } })).toMatch(/geçerli/);
    });
});

describe('demoSiteProblem', () => {
    it("demo config'inde site sabitlenmemeli", () => {
        expect(demoSiteProblem({ hosting: { public: 'dist' } })).toBeNull();
        expect(demoSiteProblem({ hosting: { site: 'x-demo' } })).toMatch(/sabitlenmiş/);
    });
});

describe('findForbidden', () => {
    it('eski değerleri ve yer tutucuyu bulur', () => {
        for (const v of RETIRED_VALUES) expect(findForbidden(`a ${v} b`)).toEqual([v]);
        expect(findForbidden(`--project ${PLACEHOLDER}`)).toEqual([PLACEHOLDER]);
    });

    it('temiz metinde hiçbir şey bulmaz', () => {
        expect(findForbidden('https://talentflow-prod.web.app')).toEqual([]);
    });
});

describe('validateDemoProjectId', () => {
    it('"demo" içeren geçerli kimliği kabul eder', () => {
        expect(validateDemoProjectId('talentflow-demo-1a2b')).toBeNull();
    });

    it('"demo" içermeyen kimliği reddeder — tohumlama havuzu siliyor', () => {
        expect(validateDemoProjectId('talentflow-prod')).toMatch(/demo/);
    });

    it('yer tutucuyu ve boş değeri reddeder', () => {
        expect(validateDemoProjectId('')).toMatch(/tanımlı değil/);
        expect(validateDemoProjectId(PLACEHOLDER)).toMatch(/yer tutucu/);
    });
});
