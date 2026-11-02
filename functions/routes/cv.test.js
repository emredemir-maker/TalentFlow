// Tests for the cv routes' CV storage helpers.
//
// buildLocalCvUrl / departmentCanSee are pure; storeCvFile is covered with
// a mocked Storage bucket (vi.mock on config/firebaseAdmin.js) so the
// success, local-fallback, and serverless-failure branches all run without
// real Firebase credentials. The /api/process-cv handler itself (multer +
// Gemini) stays integration territory — same split as interview.test.js.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const mocks = vi.hoisted(() => ({ getStorageBucket: vi.fn() }));

vi.mock('../config/firebaseAdmin.js', () => ({
    db: {},
    admin: {},
    getStorageBucket: mocks.getStorageBucket,
}));

import { buildLocalCvUrl, departmentCanSee, storeCvFile } from './cv.js';

describe('departmentCanSee (firestore.rules deptCanSee aynası)', () => {
    it('kendi departmanı ya da açıldığı departman; departmansız üye hiçbirini görmez', () => {
        expect(departmentCanSee({ department: 'Eng' }, ['Eng'])).toBe(true);
        expect(departmentCanSee({ department: 'Sales', visibleToDepartments: ['Eng'] }, ['Eng'])).toBe(true);
        expect(departmentCanSee({ department: 'Sales' }, ['Eng'])).toBe(false);
        expect(departmentCanSee({ department: 'Eng' }, [])).toBe(false);
        expect(departmentCanSee({}, undefined)).toBe(false);
    });
});

// Env vars the code under test reads — saved/restored around every test so
// the suite is order-independent and doesn't leak into other test files.
const ENV_KEYS = ['SERVER_URL', 'K_SERVICE', 'FUNCTION_NAME', 'FUNCTIONS_EMULATOR'];
let savedEnv;

beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
    for (const k of ENV_KEYS) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
    }
    vi.restoreAllMocks();
});

describe('buildLocalCvUrl', () => {
    it('defaults to localhost:3001 when SERVER_URL is unset', () => {
        expect(buildLocalCvUrl('cv-1.pdf')).toBe('http://localhost:3001/uploads/cvs/cv-1.pdf');
    });

    it('uses SERVER_URL when set', () => {
        process.env.SERVER_URL = 'https://talentflow.example.com';
        expect(buildLocalCvUrl('cv-1.pdf')).toBe(
            'https://talentflow.example.com/uploads/cvs/cv-1.pdf'
        );
    });
});

describe('storeCvFile', () => {
    const makeTempFile = (name) => {
        const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cvtest-')), name);
        fs.writeFileSync(p, 'dummy pdf bytes');
        return p;
    };

    it('uploads to tenants/<t>/cvs/<filename> WITHOUT a download token and returns the storage path', async () => {
        const upload = vi.fn().mockResolvedValue([]);
        mocks.getStorageBucket.mockReturnValue({ name: 'test-bucket', upload });
        const tempPath = makeTempFile('cv-42.pdf');

        const out = await storeCvFile({
            path: tempPath,
            filename: 'cv-42.pdf',
            mimetype: 'application/pdf',
        }, 'tenant-a');

        expect(upload).toHaveBeenCalledTimes(1);
        const [srcPath, options] = upload.mock.calls[0];
        expect(srcPath).toBe(tempPath);
        expect(options.destination).toBe('tenants/tenant-a/cvs/cv-42.pdf');
        expect(options.metadata.contentType).toBe('application/pdf');

        // Jetonlu (kuralları atlayan) indirme adresi üretilmez.
        expect(options.metadata.metadata?.firebaseStorageDownloadTokens).toBeUndefined();
        expect(out).toEqual({ cvPath: 'tenants/tenant-a/cvs/cv-42.pdf' });
        // Temp copy is deleted once Storage holds the file
        expect(fs.existsSync(tempPath)).toBe(false);
    });

    it('falls back to the local /uploads URL when Storage fails outside serverless', async () => {
        mocks.getStorageBucket.mockImplementation(() => {
            throw new Error('Bucket name not specified');
        });
        const tempPath = makeTempFile('cv-7.pdf');

        const out = await storeCvFile({
            path: tempPath,
            filename: 'cv-7.pdf',
            mimetype: 'application/pdf',
        }, 'tenant-a');

        expect(out).toEqual({ cvUrl: 'http://localhost:3001/uploads/cvs/cv-7.pdf' });
        // File must survive — it's what the /uploads static mount serves
        expect(fs.existsSync(tempPath)).toBe(true);
    });

    it('returns no file reference (never a dead link) when Storage fails on serverless', async () => {
        process.env.K_SERVICE = 'talentflowapi';
        mocks.getStorageBucket.mockReturnValue({
            name: 'test-bucket',
            upload: vi.fn().mockRejectedValue(new Error('permission denied')),
        });
        const tempPath = makeTempFile('cv-9.pdf');

        const out = await storeCvFile({
            path: tempPath,
            filename: 'cv-9.pdf',
            mimetype: 'application/pdf',
        }, 'tenant-a');

        expect(out).toEqual({});
        // /tmp copy is useless without a link — cleaned up
        expect(fs.existsSync(tempPath)).toBe(false);
    });
});
