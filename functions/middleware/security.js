// Helmet + hpp configuration. CSP runs in report-only mode so violations are
// logged in the browser console but not blocked. Once production violation
// reports are clean we'll flip reportOnly to false and tighten
// 'unsafe-inline' / 'unsafe-eval'.
//
// The directive list intentionally errs on the permissive side for first-party
// + the known third parties this app already calls (Spline 3D viewer,
// Recharts, Firebase JS SDK, Google Identity Toolkit, Generative Language API).
import helmet from 'helmet';
import hpp from 'hpp';

export const helmetMiddleware = helmet({
    contentSecurityPolicy: {
        reportOnly: true,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://apis.google.com", "https://www.googletagmanager.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: [
                "'self'",
                "https://*.googleapis.com",
                "https://*.firebaseio.com",
                "https://*.cloudfunctions.net",
                "https://*.firebaseapp.com",
                "https://identitytoolkit.googleapis.com",
                "https://securetoken.googleapis.com",
                "https://generativelanguage.googleapis.com",
                "wss://*.firebaseio.com",
            ],
            frameSrc: ["'self'", "https://*.firebaseapp.com", "https://accounts.google.com"],
            workerSrc: ["'self'", "blob:"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
        },
    },
});

export const hppMiddleware = hpp();
