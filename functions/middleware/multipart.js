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
import { Readable } from 'stream';

export function wrapMulter(multerMiddleware) {
    return (req, res, next) => {
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
