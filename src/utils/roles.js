// Shared role → human-readable label mapping (Turkish UI).
// Single source of truth used by Header, Sidebar, and anywhere a user's
// role needs to be displayed.

export const ROLE_LABELS = {
    super_admin: 'Sistem Yöneticisi',
    recruiter: 'Recruiter',
    department_user: 'Departman Kullanıcısı',
    candidate: 'Aday',
};

/**
 * @param {string|undefined} role
 * @returns {string} display label, falling back to 'Kullanıcı'
 */
export function roleLabel(role) {
    return ROLE_LABELS[role] || 'Kullanıcı';
}
