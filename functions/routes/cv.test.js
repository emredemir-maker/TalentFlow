// Tests for the cv routes' CV storage helpers.
//
// buildCvDownloadUrl / buildLocalCvUrl are pure; storeCvFile is covered with
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

import { buildCvDownloadUrl, buildLocalCvUrl, storeCvFile } from './cv.js';

describe('buildCvDownloadUrl', () => {
    it('builds a firebasestorage.googleapis.com URL for the given bucket', () => {
        const url = buildCvDownloadUrl('my-app.appspot.com', 'cvs/cv-1-2.pdf', 'tok-123');
        expect(url).toBe(
            'https://firebasestorage.googleapis.com/v0/b/my-app.appspot.com/o/cvs%2Fcv-1-2.pdf?alt=media&token=tok-123'
        );
    });

    it('percent-encodes the path separator so the object name stays one URL segment', () => {
        const url = buildCvDownloadUrl('b', 'cvs/a b+c.pdf', 't');
        expect(url).toContain('/o/cvs%2Fa%20b%2Bc.pdf');
        expect(url).not.toContain('/o/cvs/');
    });

    it('appends alt=media and the download token as query params', () => {
        const url = new URL(buildCvDownloadUrl('b', 'cvs/x.pdf', 'the-token'));
        expect(url.searchParams.get('alt')).toBe('media');
        expect(url.searchParams.get('token')).toBe('the-token');
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

    it('uploads to cvs/<filename> with a download token and returns the token URL', async () => {
        const upload = vi.fn().mockResolvedValue([]);
        mocks.getStorageBucket.mockReturnValue({ name: 'test-bucket', upload });
        const tempPath = makeTempFile('cv-42.pdf');

        const url = await storeCvFile({
            path: tempPath,
            filename: 'cv-42.pdf',
            mimetype: 'application/pdf',
        });

        expect(upload).toHaveBeenCalledTimes(1);
        const [srcPath, options] = upload.mock.calls[0];
        expect(srcPath).toBe(tempPath);
        expect(options.destination).toBe('cvs/cv-42.pdf');
        expect(options.metadata.contentType).toBe('application/pdf');

        const token = options.metadata.metadata.firebaseStorageDownloadTokens;
        expect(token).toBeTruthy();
        expect(url).toBe(
            `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/cvs%2Fcv-42.pdf?alt=media&token=${token}`
        );
        // Temp copy is deleted once Storage holds the file
        expect(fs.existsSync(tempPath)).toBe(false);
    });

    it('falls back to the local /uploads URL when Storage fails outside serverless', async () => {
        mocks.getStorageBucket.mockImplementation(() => {
            throw new Error('Bucket name not specified');
        });
        const tempPath = makeTempFile('cv-7.pdf');

        const url = await storeCvFile({
            path: tempPath,
            filename: 'cv-7.pdf',
            mimetype: 'application/pdf',
        });

        expect(url).toBe('http://localhost:3001/uploads/cvs/cv-7.pdf');
        // File must survive — it's what the /uploads static mount serves
        expect(fs.existsSync(tempPath)).toBe(true);
    });

    it('returns an empty cvUrl (never a dead link) when Storage fails on serverless', async () => {
        process.env.K_SERVICE = 'api';
        mocks.getStorageBucket.mockReturnValue({
            name: 'test-bucket',
            upload: vi.fn().mockRejectedValue(new Error('permission denied')),
        });
        const tempPath = makeTempFile('cv-9.pdf');

        const url = await storeCvFile({
            path: tempPath,
            filename: 'cv-9.pdf',
            mimetype: 'application/pdf',
        });

        expect(url).toBe('');
        // /tmp copy is useless without a link — cleaned up
        expect(fs.existsSync(tempPath)).toBe(false);
    });
});
