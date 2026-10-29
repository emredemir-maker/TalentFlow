// Üyelik yönetimi — yalnız sunucu ucu üzerinden (functions/routes/admin.js).
// İstemci üyelik belgesine rol/departman YAZAMAZ (firestore.rules); şirket
// yöneticisi bu çağrılarla atar. Kişi ekleme Hub'dan (K3).
import { auth } from '../config/firebase';

async function call(method, uid, body) {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/admin/members/${encodeURIComponent(uid)}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Sunucu hatası (${res.status})`);
    return data;
}

/** Rol ve departman (departman yalnız department_user'da tutulur). */
export function updateMember(uid, { role, departments = [] }) {
    return call('PATCH', uid, { role, departments });
}

/** Departman listesini değiştirir, rolü korur. */
export function setMemberDepartments(member, departments) {
    return updateMember(member.id, { role: member.role, departments });
}

/** Üyeliği kaldırır (Firebase hesabı silinmez). */
export function removeMember(uid) {
    return call('DELETE', uid);
}

/** Departman listesinden yalnız verilen departmanı çıkarır (diğerleri kalır). */
export function withoutDepartment(departments, name) {
    return (Array.isArray(departments) ? departments : []).filter((d) => d !== name);
}
