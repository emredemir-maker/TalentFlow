// Cloud Functions multipart shim.
//
// The Cloud Functions runtime (functions-framework) consumes the incoming
// HTTP request stream before Express ever sees it and exposes the buffered
// bytes as `req.rawBody`. Multer pipes `req` into busboy, so in production
// it reads an already-ended stream and fails with "Unexpected end of form"
// — every multipart endpoint 500s on the deployed function while working
// fine on the local dev server (where the stream is still live).
//
// wrapMulter(multerMw) returns a drop-in middleware: when `req.rawBody`
// is present it replays the buffered bytes through a fresh Readable that
// mimics the request (multer only needs `.headers` plus the stream API),
// lets multer parse THAT, then copies the results (files/file/body) back
// onto the real request. Without rawBody (local dev) the original multer
// middleware runs untouched.
// MULTIPART OLMAYAN İSTEĞE DOKUNULMAZ. Bu satır bir üretim hatasının tam
// merkeziydi ve yerelde görünmüyordu:
//
// Cloud Functions çalışma ortamı HER isteği tamponluyor, yalnızca multipart
// olanları değil — yani `req.rawBody` bir JSON POST'unda da dolu. Aşağıdaki
// akış o durumda şunu yapıyordu:
//
//   1. express.json() gövdeyi doğru ayrıştırıp req.body'ye yazıyor.
//   2. rawBody dolu olduğu için multipart dalına giriliyor.
//   3. multer, multipart olmayan bir akışta hiçbir şey yapmadan next() diyor;
//      sahte akışın `body` alanı hiç oluşmuyor.
//   4. `req.body = stream.body || {}` ayrıştırılmış JSON'u {} ile EZİYOR.
//
// Sonuç: sunucu gövdeyi hiç görmüyor ve "gövde göndermediniz" diyor —
// kullanıcı gövdeyi göndermiş olmasına rağmen. Yerelde rawBody olmadığı için
// dal hiç çalışmıyor, bu yüzden testler ve dev sunucusu temiz görünüyordu.
//
// Toplu içe aktarmanın `sources` yolu ilk kurbanı DEĞİL: `records` (JSON) yolu
// da üretimde aynı sebeple çalışmıyordu, yalnızca kimse denememişti.
import { Readable } from 'stream';

/** Gövde gerçekten multer'ın işi mi? */
function isMultipart(req) {
    return String(req.headers?.['content-type'] || '').toLowerCase().startsWith('multipart/');
}

export function wrapMulter(multerMiddleware) {
    return (req, res, next) => {
        // multer multipart olmayan istekte zaten hiçbir şey yapmaz; erken
        // çıkmak aynı davranışı verir ve req.body'yi kazara ezme ihtimalini
        // tamamen ortadan kaldırır.
        if (!isMultipart(req)) return next();
        if (!req.rawBody || !Buffer.isBuffer(req.rawBody)) {
            return multerMiddleware(req, res, next);
        }
        const stream = Readable.from(req.rawBody);
        stream.headers = req.headers;
        multerMiddleware(stream, res, (err) => {
            if (err) return next(err);
            req.files = stream.files;
            req.file = stream.file;
            // Multipart form fields parsed by multer live on the fake
            // stream; the real req.body only ever held the raw bytes.
            req.body = stream.body || {};
            next();
        });
    };
}
