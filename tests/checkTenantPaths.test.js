// Statik şirket yolu denetimi (scripts/check-tenant-paths.mjs): kuralların
// gerçekten yakaladığını ve deponun bugün temiz olduğunu sabitler.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { findViolations } from '../scripts/check-tenant-paths.mjs';

const f = (text, file = 'functions/routes/x.js') =>
    findViolations([{ file, text }]).map((v) => v.rule);

describe('check-tenant-paths', () => {
    it('eski ortak kökü (düz ve URL kodlu) yakalar; yalnız yol modülünde serbest', () => {
        expect(f("const P = 'artifacts/talent-flow/public/data/candidates';")).toEqual([
            'eski-kok',
        ]);
        expect(f('const u = `${B}/artifacts%2Ftalent-flow%2Fpublic`;')).toEqual(['eski-kok']);
        expect(f('// eski kök artifacts/talent-flow', 'functions/services/tenantPaths.js')).toEqual(
            []
        );
    });
    it('kök interviews/ dizgisini yakalar', () => {
        expect(f('db.doc(`interviews/${id}`)')).toContain('kok-interviews');
        expect(f("const p = 'interviews/abc';")).toEqual(['kok-interviews']);
        expect(f('log.info(`tenants/${t}/interviews/${id}`)')).toEqual([]);
    });
    it('db.collection/doc/collectionGroup içinde sabit yolu yakalar; göreli alt koleksiyon serbest', () => {
        expect(f("db.collection('candidates')")).toEqual(['sabit-yol']);
        expect(f('db.doc(`tenants/${t}/x`)')).toEqual(['sabit-yol']);
        expect(f("db.collectionGroup('bulkImportJobs')")).toEqual(['sabit-yol']);
        expect(f('db.collection(req.paths.candidates())')).toEqual([]);
        expect(f("jobRef.collection('items').doc('1')")).toEqual([]);
    });
    it('depo bugün temiz (betik 0 ile çıkar)', () => {
        const script = fileURLToPath(new URL('../scripts/check-tenant-paths.mjs', import.meta.url));
        expect(() => execFileSync(process.execPath, [script], { stdio: 'pipe' })).not.toThrow();
    });
});
