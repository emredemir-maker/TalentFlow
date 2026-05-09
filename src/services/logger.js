// Frontend logger — Phase 4b foundation.
//
// Why loglevel and not pino-browser:
//   - Tiny (1KB gzipped) — no pino runtime overhead in the bundle
//   - Native level filtering: in production, debug/info logs are no-ops at
//     near-zero cost (no template-string allocation if level is off)
//   - Persistent level via localStorage so a developer can flip
//     `localStorage.setItem('loglevel:talent-flow', 'DEBUG')` in the console
//     to enable verbose logging without rebuilding
//
// Migration shape: prefer `log.info({ ctx }, 'msg')` for new code, but the
// console-style positional API works exactly the same. Phase 4b only sets
// up the module; mass page migration is a follow-up.
import loglevel from 'loglevel';

const log = loglevel.getLogger('talent-flow');

// Default level: warn in prod (only show real problems), debug locally
// (full trace). DEV is set by Vite for `vite dev` builds.
const isDev = import.meta.env?.DEV === true;
log.setDefaultLevel(isDev ? 'debug' : 'warn');

// Optional named child loggers for module-scoped tagging — analogous to
// pino's logger.child(). loglevel doesn't natively support children, so we
// fake it by prefixing the message with [name].
export function getLogger(name) {
    const child = loglevel.getLogger(`talent-flow:${name}`);
    child.setDefaultLevel(isDev ? 'debug' : 'warn');
    return child;
}

export default log;
