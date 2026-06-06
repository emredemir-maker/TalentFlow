// Single source of truth for the 6 canonical recruitment pipeline stages.
//
// Before this module, Dashboard, PipelinePage, CandidateCard, BulkUpdateModal
// and CandidateProcessPage each defined their own stage→colour map, and they
// CONTRADICTED each other (e.g. "İnceleme" was blue in the funnel but amber on
// the candidate card). Everything now derives from STAGES so a stage looks the
// same everywhere.
//
// Palette: brand-anchored progression (navy/cyan brand identity).
//   Ön Eleme  cyan  ·  İnceleme teal ·  Mülakat violet
//   Teklif    amber ·  İşe Alındı emerald · Reddedildi red
//
// `color`  — primary hex (text / bar / dot)
// `bg`     — light tint background (chips, badges)
// `border` — light border (chips, badges)
// `goodnessOnIncrease` — is a rising count a GOOD outcome? (false for Reddedildi)
// `legacy` — historical status keys that map onto this canonical stage

export const STAGES = [
    { key: 'ai_analysis', label: 'Ön Eleme',   color: '#29A9E0', bg: '#ECFAFF', border: '#BAE6FD', goodnessOnIncrease: true,  legacy: ['new', 'pending', 'applied', 'unknown'] },
    { key: 'review',      label: 'İnceleme',   color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', goodnessOnIncrease: true,  legacy: ['Review', 'değerlendirme', 'Evaluation'] },
    { key: 'interview',   label: 'Mülakat',    color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', goodnessOnIncrease: true,  legacy: ['Interview', 'mülakat', 'Mülakat'] },
    { key: 'offer',       label: 'Teklif',     color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', goodnessOnIncrease: true,  legacy: ['Offer'] },
    { key: 'hired',       label: 'İşe Alındı', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', goodnessOnIncrease: true,  legacy: ['Hired'] },
    { key: 'rejected',    label: 'Reddedildi', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', goodnessOnIncrease: false, legacy: ['Rejected'] },
];

/** Map of stage key → stage object, for O(1) lookup. */
export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));

/** Look up a stage by key, falling back to a neutral grey stage. */
export function getStage(key) {
    return STAGE_BY_KEY[key] || { key, label: key || '?', color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0', goodnessOnIncrease: true, legacy: [] };
}
