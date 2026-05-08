// Firestore REST API helpers.
//
// Used by routes that need to act on behalf of an end-user's Firebase ID
// token (so Firestore security rules apply to the read/write) instead of
// the Admin SDK, which bypasses rules. Wraps the v1 REST endpoints and
// converts plain JS values to/from Firestore's typed value envelopes.
//
//   fsGet   — GET  /:docPath           (returns null on 404, throws otherwise)
//   fsPatch — PATCH /:docPath          (sparse update with updateMask)
//   fsSet   — POST /:collPath?documentId=…  (create-or-overwrite)
//
// All three accept a Bearer ID token as the last argument.
const FS_BASE = () =>
    `https://firestore.googleapis.com/v1/projects/${process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

export function toFsValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
    if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, toFsValue(val)])) } };
    return { stringValue: String(v) };
}

export async function fsGet(docPath, token) {
    const r = await fetch(`${FS_BASE()}/${docPath}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Firestore GET failed: ${r.status}`);
    return r.json();
}

export async function fsPatch(docPath, fields, token) {
    const fsFields = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFsValue(v)]));
    const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const r = await fetch(`${FS_BASE()}/${docPath}?${mask}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: fsFields }),
    });
    if (!r.ok) throw new Error(`Firestore PATCH failed: ${r.status} ${await r.text()}`);
    return r.json();
}

export async function fsSet(collPath, docId, fields, token) {
    const fsFields = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFsValue(v)]));
    const r = await fetch(`${FS_BASE()}/${collPath}?documentId=${docId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: fsFields }),
    });
    if (!r.ok) throw new Error(`Firestore SET failed: ${r.status} ${await r.text()}`);
    return r.json();
}
