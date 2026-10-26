// Proje kimliği korumasının kuralları. Koruma düşerse yer tutucuyla ya da eski
// projenin kimliğiyle yapılan bir merge doğrudan üretim dağıtımına gider.
import { describe, it, expect } from 'vitest';
import {
    PLACEHOLDER,
    RETIRED_VALUES,
    validateProjectId,
    productionSiteProblem,
    demoSiteProblem,
    productionFunctionsProblem,
    functionSourceProblem,
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

    it('eski projeleri reddeder', () => {
        expect(validateProjectId('talentflow-84bb6')).toMatch(/eski projeyi/);
        // Hosting arka ucu Google tarafında bozuk çıkan ara proje.
        expect(validateProjectId('deploy-n8n-local')).toMatch(/eski projeyi/);
    });

    it('paylaşılan platform projesini kabul eder', () => {
        expect(validateProjectId('agentinn-nyqpx')).toBeNull();
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

    it('birden fazla hosting girdisini reddeder', () => {
        expect(
            productionSiteProblem({ hosting: [{ site: 'talentinn' }, { site: 'talentinn-hub' }] })
        ).toMatch(/hosting girdisi bekleniyor \(2 var\)/);
    });

    it('Hub-Inn ve CX-Inn sitelerini ve projenin varsayılan sitesini reddeder', () => {
        expect(productionSiteProblem({ hosting: { site: 'agentinn-nyqpx' } })).toMatch(
            /başka bir uygulamanın/
        );
        expect(productionSiteProblem({ hosting: { site: 'cxinn' } })).toMatch(
            /başka bir uygulamanın/
        );
        expect(
            productionSiteProblem(
                { hosting: { site: 'baska-proje' } },
                'firebase.json',
                'baska-proje'
            )
        ).toMatch(/başka bir uygulamanın/);
        expect(
            productionSiteProblem(
                { hosting: { site: 'talentinn' } },
                'firebase.json',
                'agentinn-nyqpx'
            )
        ).toBeNull();
    });

    it('eski site adını, yer tutucuyu ve geçersiz adı reddeder', () => {
        expect(productionSiteProblem({ hosting: { site: 'talentflow-84bb6' } })).toMatch(/eski/);
        expect(productionSiteProblem({ hosting: { site: 'talentinn-app' } })).toMatch(/eski/);
        expect(productionSiteProblem({ hosting: { site: PLACEHOLDER } })).toMatch(/eski/);
        expect(productionSiteProblem({ hosting: { site: 'Kötü Ad' } })).toMatch(/geçerli/);
    });
});

describe('productionFunctionsProblem', () => {
    const rewrite = (fn) => ({ source: '/api/**', function: fn });
    const ok = {
        hosting: {
            site: 'talentinn',
            rewrites: [
                rewrite({ functionId: 'talentflowApi', region: 'europe-west1' }),
                { source: '**', destination: '/index.html' },
            ],
        },
        functions: [{ source: 'functions', codebase: 'talentflow' }],
    };

    it('talentflow codebase ve talentflowApi@europe-west1 yönlendirmesini kabul eder', () => {
        expect(productionFunctionsProblem(ok)).toBeNull();
    });

    it("codebase talentflow değilse reddeder — Hub-Inn'in 'api' codebase'i ya da default", () => {
        expect(productionFunctionsProblem({ ...ok, functions: [{ codebase: 'api' }] })).toMatch(
            /codebase "api"/
        );
        expect(productionFunctionsProblem({ ...ok, functions: [{ source: 'functions' }] })).toMatch(
            /codebase "default"/
        );
    });

    it('functions girdisi yoksa ya da birden fazlaysa reddeder', () => {
        expect(productionFunctionsProblem({ ...ok, functions: [] })).toMatch(/0 var/);
        expect(
            productionFunctionsProblem({
                ...ok,
                functions: [{ codebase: 'talentflow' }, { codebase: 'x' }],
            })
        ).toMatch(/2 var/);
    });

    it("yönlendirme Hub-Inn'in api fonksiyonuna ya da yanlış bölgeye giderse reddeder", () => {
        const withRewrite = (fn) => ({
            ...ok,
            hosting: { ...ok.hosting, rewrites: [rewrite(fn)] },
        });
        expect(productionFunctionsProblem(withRewrite('api'))).toMatch(/api@us-central1/);
        expect(
            productionFunctionsProblem(withRewrite({ functionId: 'api', region: 'europe-west1' }))
        ).toMatch(/api@europe-west1/);
        expect(productionFunctionsProblem(withRewrite('talentflowApi'))).toMatch(/us-central1/);
        const stringForm = {
            ...ok,
            hosting: {
                ...ok.hosting,
                rewrites: [{ ...rewrite('talentflowApi'), region: 'europe-west1' }],
            },
        };
        expect(productionFunctionsProblem(stringForm)).toBeNull();
    });
});

describe('functionSourceProblem', () => {
    const src = (body) => `import { onRequest } from "x";\n${body}`;

    it('talentflowApi, europe-west1 kaynağını kabul eder', () => {
        expect(
            functionSourceProblem(
                src(
                    'export const talentflowApi = onRequest({\n    region: "europe-west1",\n}, app);'
                )
            )
        ).toBeNull();
    });

    it('eski adı ve eski bölgeyi reddeder', () => {
        expect(
            functionSourceProblem(
                src('export const api = onRequest({ region: "europe-west1" }, app);')
            )
        ).toMatch(/talentflowApi/);
        expect(
            functionSourceProblem(
                src('export const talentflowApi = onRequest({ region: "us-central1" }, app);')
            )
        ).toMatch(/europe-west1/);
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
