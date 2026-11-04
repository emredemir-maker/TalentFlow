// E-posta uçları şirket hesabından gönderim yapar. Anonim oturumu herkes alabildiği,
// şifreli hesap da profil olmadan açılabildiği için bu uçlar profil ve rol ister.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';

const users = vi.hoisted(() => ({
    recruiter: { uid: 'u-rec', firebase: { sign_in_provider: 'google.com' } },
    anon: { uid: 'u-anon', firebase: { sign_in_provider: 'anonymous' } },
    noProfile: { uid: 'u-noprofile', firebase: { sign_in_provider: 'password' } },
}));

vi.mock('../config/firebaseAdmin.js', () => ({
    db: {
        doc: (path) => ({
            get: async () => ({
                exists: path.endsWith('/u-rec'),
                data: () => ({ role: 'recruiter' }),
            }),
        }),
    },
    admin: { auth: () => ({ verifyIdToken: async (token) => users[token] }) },
}));

import emailRouter from './email.js';

const ROUTES = ['send-feedback', 'send-interview-invite', 'send-info-request', 'check-info-replies'];

let server;
let base;

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(emailRouter);
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const post = (route, token) =>
    fetch(`${base}/api/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: '{}',
    });

describe.each(ROUTES)('/api/%s', (route) => {
    it('oturumsuz istek reddedilir', async () => {
        expect((await post(route)).status).toBe(401);
    });
    it('anonim oturum reddedilir', async () => {
        expect((await post(route, 'anon')).status).toBe(403);
    });
    it('profilsiz hesap reddedilir', async () => {
        expect((await post(route, 'noProfile')).status).toBe(403);
    });
});

describe('profili olan iç kullanıcı', () => {
    it('kapıdan geçer, eksik gövde kendi hatasını alır', async () => {
        expect((await post('send-feedback', 'recruiter')).status).toBe(400);
    });
});
