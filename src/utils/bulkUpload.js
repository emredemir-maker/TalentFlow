// Pure helpers for the bulk CV upload flow (CandidateProcessPage modal).
//
// Why batching exists: the deployed API runs on Cloud Functions gen2, whose
// HTTP ingress hard-caps request bodies at 32MB. Anything larger is killed
// by Google's frontend with a plain-text 500 "Internal Error" BEFORE the
// request reaches our code — no logs, no JSON error, nothing to catch
// server-side. So the client must never build a multipart request anywhere
// near that ceiling; instead it splits the selected files into sequential
// requests, each safely under the limit.
export const MAX_REQUEST_BYTES = 28 * 1024 * 1024; // 28MB — margin under the 32MB cap
export const MAX_FILES_PER_REQUEST = 20; // mirrors multer's .array('cvs', 20)

/**
 * Split files into batches where each batch stays under maxBytes total AND
 * maxFiles count. Files individually larger than maxBytes cannot be sent at
 * all and are returned separately in `oversized`. Order is preserved.
 */
export function batchFilesBySize(files, maxBytes = MAX_REQUEST_BYTES, maxFiles = MAX_FILES_PER_REQUEST) {
    const oversized = [];
    const batches = [];
    let current = [];
    let currentBytes = 0;

    for (const file of files) {
        const size = Number(file?.size) || 0;
        if (size > maxBytes) {
            oversized.push(file);
            continue;
        }
        if (current.length > 0 && (currentBytes + size > maxBytes || current.length >= maxFiles)) {
            batches.push(current);
            current = [];
            currentBytes = 0;
        }
        current = [...current, file];
        currentBytes += size;
    }
    if (current.length > 0) batches.push(current);
    return { batches, oversized };
}

/** '3.2 MB' style human-readable size. */
export function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    if (n >= 1024) return `${Math.round(n / 1024)} KB`;
    return `${n} B`;
}

/** Total size of a file list in bytes. */
export function totalBytes(files) {
    return files.reduce((sum, f) => sum + (Number(f?.size) || 0), 0);
}
