// Structured logger — Phase 4b foundation.
//
// Why pino:
//   1. JSON output in prod is parsed natively by Google Cloud Logging, so
//      `logger.error({ err }, 'msg')` becomes a queryable log entry with
//      severity, structured fields, and stack traces — no regex over text.
//   2. Pretty output in dev keeps the local DX close to console.* (colored
//      level prefix, time, message).
//   3. Level filtering via LOG_LEVEL env var lets ops dial verbosity in
//      prod without redeploying.
//
// Migration shape: prefer `logger.info({ ctx }, 'msg')` for new code, but
// the `console`-style positional API (`logger.info('Hello', x)`) also works
// — pino accepts it and concatenates. The Phase 4b mass migration uses the
// positional shape to keep the diff mechanical; future PRs upgrade hot
// call-sites to structured fields as they touch them.
import pino from 'pino';

// Cloud Run / Firebase Functions sets K_SERVICE; emulator and `node
// functions/server.js` locally do not.
const isProd = !!process.env.K_SERVICE || process.env.NODE_ENV === 'production';

const baseOptions = {
    level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
    // pino's default `level` field collides with Cloud Logging's severity
    // expectation. Map level numbers → string severities so log entries
    // surface correctly in the Logs Explorer UI.
    formatters: {
        level(label) {
            return { severity: label.toUpperCase() };
        },
    },
    // Pino emits `time` as a number by default; Cloud Logging expects ISO
    // strings on the `timestamp` field. Switch only in prod so dev output
    // stays compact.
    timestamp: isProd
        ? () => `,"timestamp":"${new Date().toISOString()}"`
        : pino.stdTimeFunctions.isoTime,
    // Redact common credential-shaped keys defensively. The actual API key
    // never reaches log output (we removed those metadata logs in Phase 1)
    // but this guards against future regressions.
    redact: {
        paths: ['apiKey', 'token', 'idToken', 'authorization', 'password', '*.apiKey', '*.token'],
        censor: '[REDACTED]',
    },
};

const transportOptions = isProd
    ? undefined // raw JSON to stdout for Cloud Logging
    : {
          target: 'pino-pretty',
          options: {
              colorize: true,
              translateTime: 'HH:MM:ss.l',
              ignore: 'pid,hostname',
              singleLine: false,
          },
      };

export const logger = pino({
    ...baseOptions,
    ...(transportOptions ? { transport: transportOptions } : {}),
});

// Module-scoped child loggers — `import { logger } from '../services/logger.js';
// const log = logger.child({ mod: 'cv' });` adds a `mod:'cv'` field to every
// entry from that module, making greps/filters trivial.
export function childLogger(name) {
    return logger.child({ mod: name });
}
