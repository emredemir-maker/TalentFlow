// MULTIPART SARMALAYICISI — JSON GÖVDESİNİ EZMEMELİ.
//
// Bu testlerin varlık sebebi bir üretim hatası: `wrapMulter`, multipart
// olmayan isteklerde de multipart dalına giriyor ve son satırında
// `req.body = stream.body || {}` diyerek express.json()'ın ayrıştırdığı
// gövdeyi {} ile eziyordu.
//
// Yerelde görünmüyordu çünkü tetikleyicisi ortam farkı: Cloud Functions
// çalışma ortamı HER isteği tamponlayıp `req.rawBody` veriyor, yerel dev
// sunucusu vermiyor. Dolayısıyla dal yalnızca üretimde çalışıyordu ve hiçbir
// birim testi oraya uğramıyordu.
//
// Sonuç kullanıcı tarafında şuydu: gövdeyi gönderen istemciye sunucu
// "gövde göndermediniz" diyordu. Yani sistem, KENDİ sildiği veriyi
// kullanıcının hiç göndermediği gibi rapor ediyordu.
import { describe, expect, it, vi } from 'vitest';

import { wrapMulter } from './multipart.js';

const jsonReq = (body, { rawBody = true } = {}) => ({
    headers: { 'content-type': 'application/json' },
    body,
    ...(rawBody ? { rawBody: Buffer.from(JSON.stringify(body)) } : {}),
});

const multipartReq = ({ rawBody = true } = {}) => ({
    headers: { 'content-type': 'multipart/form-data; boundary=----x' },
    body: {},
    ...(rawBody ? { rawBody: Buffer.from('--x--') } : {}),
});

describe('wrapMulter — multipart olmayan istek', () => {
    // ASIL HATA BU: rawBody dolu ama gövde JSON.
    it('leaves a parsed JSON body untouched when rawBody is present', () => {
        const parsed = { positionId: 'p1', sources: [{ storagePath: 'a' }] };
        const req = jsonReq(parsed);
        const next = vi.fn();

        wrapMulter(vi.fn())(req, {}, next);

        expect(req.body).toBe(parsed);
        expect(req.body.sources).toHaveLength(1);
        expect(next).toHaveBeenCalledWith();
    });

    it('never invokes multer for a JSON request', () => {
        const multer = vi.fn();
        wrapMulter(multer)(jsonReq({ records: [] }), {}, vi.fn());
        expect(multer).not.toHaveBeenCalled();
    });

    it('leaves the body alone in local dev too (no rawBody)', () => {
        const parsed = { records: [{ name: 'Ali' }] };
        const req = jsonReq(parsed, { rawBody: false });
        wrapMulter(vi.fn())(req, {}, vi.fn());
        expect(req.body).toBe(parsed);
    });

    it('treats a missing content-type as non-multipart', () => {
        const req = { headers: {}, body: { a: 1 }, rawBody: Buffer.from('x') };
        wrapMulter(vi.fn())(req, {}, vi.fn());
        expect(req.body).toEqual({ a: 1 });
    });
});

describe('wrapMulter — multipart istek', () => {
    // Sarmalayıcının asıl işi: functions-framework akışı tükettiği için
    // multer'a tamponlanmış baytları taze bir Readable ile tekrar oynatmak.
    it('replays rawBody through multer and copies the results back', () => {
        const req = multipartReq();
        const multer = vi.fn((stream, res, cb) => {
            stream.files = [{ originalname: 'cv.pdf' }];
            stream.body = { positionTitle: 'PM' };
            cb();
        });
        const next = vi.fn();

        wrapMulter(multer)(req, {}, next);

        expect(multer).toHaveBeenCalled();
        // multer gerçek isteği değil, sahte akışı okur
        expect(multer.mock.calls[0][0]).not.toBe(req);
        expect(multer.mock.calls[0][0].headers).toBe(req.headers);
        expect(req.files).toEqual([{ originalname: 'cv.pdf' }]);
        expect(req.body).toEqual({ positionTitle: 'PM' });
        expect(next).toHaveBeenCalledWith();
    });

    it('runs multer directly when there is no rawBody (local dev)', () => {
        const req = multipartReq({ rawBody: false });
        const multer = vi.fn((r, res, cb) => cb());
        wrapMulter(multer)(req, {}, vi.fn());
        expect(multer.mock.calls[0][0]).toBe(req);
    });

    it('passes a multer error on to the error handler', () => {
        const err = new Error('Unexpected end of form');
        const multer = vi.fn((stream, res, cb) => cb(err));
        const next = vi.fn();
        wrapMulter(multer)(multipartReq(), {}, next);
        expect(next).toHaveBeenCalledWith(err);
    });
});
