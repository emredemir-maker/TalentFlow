// src/utils/templateService.js
// Loads saved email templates from Firestore and applies variable substitution.
// Falls back to built-in templates if no custom template is saved.

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { buildInterviewInviteEmail, buildRescheduleEmail, buildParticipantNotificationEmail, buildFeedbackEmail } from './emailTemplates';

const SETTINGS_PATH = 'artifacts/talent-flow/public/data/settings';

let _templateCache = null;
let _cacheTs = 0;
const CACHE_TTL = 60_000; // 1 minute

async function loadTemplates() {
    if (_templateCache && Date.now() - _cacheTs < CACHE_TTL) return _templateCache;
    try {
        const snap = await getDoc(doc(db, SETTINGS_PATH, 'emailTemplates'));
        _templateCache = snap.exists() ? snap.data() : {};
    } catch {
        _templateCache = {};
    }
    _cacheTs = Date.now();
    return _templateCache;
}

// Build the branding header block (logo img or initials div) from branding object.
// Used to resolve {{BRANDING_HEADER}} at send-time so the current logo/name always shows.
function buildBrandingHeader(branding) {
    const color = branding?.primaryColor || '#0E7490';
    const company = branding?.companyName || '';
    const tagline = branding?.tagline || '';
    const logoUrl = branding?.logoUrl || '';
    const initials = company.split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || 'IK';
    if (logoUrl) {
        return `<img src="${logoUrl}" alt="${company}" style="height:44px;max-width:200px;object-fit:contain;display:block;"/>`;
    }
    return `<div style="display:inline-flex;align-items:center;gap:10px;"><div style="width:36px;height:36px;border-radius:9px;background:${color};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="color:#fff;font-size:13px;font-weight:800;letter-spacing:-0.5px;">${initials}</span></div><div><div style="color:#0F172A;font-size:16px;font-weight:800;line-height:1.2;">${company}</div>${tagline ? `<div style="color:#94A3B8;font-size:11px;margin-top:2px;">${tagline}</div>` : ''}</div></div>`;
}

// Apply {{variable}} substitution — merges branding fields into vars so
// {{companyName}}, {{tagline}}, {{BRANDING_HEADER}} etc. in saved templates are always resolved.
function applyVars(html, vars, branding) {
    const merged = {
        companyName:    branding?.companyName   || '',
        tagline:        branding?.tagline        || '',
        logoUrl:        branding?.logoUrl        || '',
        primaryColor:   branding?.primaryColor   || '#0E7490',
        BRANDING_HEADER: buildBrandingHeader(branding),
        ...vars,
    };
    let result = html;
    for (const [key, value] of Object.entries(merged)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
    }
    return result;
}

// When a template was saved before logo support was added, the header still
// shows coloured initials.  If branding now has a logoUrl we patch the saved
// HTML in-memory so the logo appears without requiring a re-save.
function patchLogoInSavedHtml(html, branding) {
    if (!branding?.logoUrl) return html;

    // Already has a real <img> for the logo → nothing to do
    if (/height:40px[^"]*object-fit:contain/.test(html)) {
        // Update the src in case the logo URL changed
        return html.replace(
            /<img([^>]*?)style="height:40px[^"]*object-fit:contain[^"]*"([^>]*?)\/>/g,
            `<img src="${branding.logoUrl}" alt="${branding.companyName || ''}" style="height:40px;max-width:160px;object-fit:contain;"/>`
        );
    }

    // Replace the initials <div style="display:inline-flex..."> block with an <img>
    // We target the wrapper that contains the coloured square + company name text.
    const logoImg = `<img src="${branding.logoUrl}" alt="${branding.companyName || ''}" style="height:40px;max-width:160px;object-fit:contain;"/>`;
    return html.replace(
        /<div style="display:inline-flex;align-items:center;gap:10px;">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
        logoImg
    );
}

// ─── Interview Invite ─────────────────────────────────────────────────────────
export async function getInviteEmail(branding, vars) {
    const templates = await loadTemplates();
    if (templates?.invite?.html) {
        const patched = patchLogoInSavedHtml(templates.invite.html, branding);
        return {
            html:    applyVars(patched, vars, branding),
            subject: applyVars(templates.invite.subject || '', vars, branding),
        };
    }
    const html = buildInterviewInviteEmail(branding, {
        candidateName:  vars.candidateName,
        recruiterName:  vars.recruiterName,
        position:       vars.position,
        date:           vars.date,
        time:           vars.time,
        interviewType:  vars.interviewType,
        joinLink:       vars.joinLink,
        companyEmail:   vars.companyEmail,
    });
    return { html, subject: null };
}

// ─── Reschedule / Cancel ──────────────────────────────────────────────────────
export async function getRescheduleEmail(branding, vars) {
    const templates = await loadTemplates();
    if (templates?.reschedule?.html) {
        const patched = patchLogoInSavedHtml(templates.reschedule.html, branding);
        return {
            html:    applyVars(patched, vars, branding),
            subject: applyVars(templates.reschedule.subject || '', vars, branding),
        };
    }
    const html = buildRescheduleEmail(branding, {
        candidateName: vars.candidateName,
        recruiterName: vars.recruiterName,
        position:      vars.position,
        oldDate:       vars.oldDate,
        oldTime:       vars.oldTime,
        newDate:       vars.newDate,
        newTime:       vars.newTime,
        joinLink:      vars.joinLink,
        isCancelled:   vars.isCancelled,
        companyEmail:  vars.companyEmail,
    });
    return { html, subject: null };
}

// ─── Participant Notification ─────────────────────────────────────────────────
export async function getParticipantEmail(branding, vars) {
    const templates = await loadTemplates();
    if (templates?.participant?.html) {
        const patched = patchLogoInSavedHtml(templates.participant.html, branding);
        return {
            html:    applyVars(patched, vars, branding),
            subject: applyVars(templates.participant.subject || '', vars, branding),
        };
    }
    const html = buildParticipantNotificationEmail(branding, {
        participantName: vars.participantName,
        candidateName:   vars.candidateName,
        position:        vars.position,
        date:            vars.date,
        time:            vars.time,
        interviewType:   vars.interviewType,
        meetLink:        vars.meetLink,
        googleMeetLink:  vars.googleMeetLink || null,
        recruiterName:   vars.recruiterName,
    });
    return { html, subject: null };
}

// ─── Candidate Feedback Email ─────────────────────────────────────────────────
// Thin wrapper around buildFeedbackEmail so callers can use the same pattern
// as getInviteEmail / getRescheduleEmail — allowing future Firestore-saved
// overrides without changing call sites.
export async function getFeedbackEmail(branding, vars) {
    const templates = await loadTemplates();
    if (templates?.feedback?.html) {
        const patched = patchLogoInSavedHtml(templates.feedback.html, branding);
        return {
            html:    applyVars(patched, vars, branding),
            subject: applyVars(templates.feedback.subject || '', vars, branding),
        };
    }
    const html = buildFeedbackEmail(branding, {
        candidateName: vars.candidateName,
        recruiterName: vars.recruiterName,
        position:      vars.position,
        outcome:       vars.outcome,
        feedbackText:  vars.feedbackText,
        companyEmail:  vars.companyEmail,
    });
    return { html, subject: null };
}

// Invalidate cache (call after saving a template)
export function invalidateTemplateCache() {
    _templateCache = null;
    _cacheTs = 0;
}
