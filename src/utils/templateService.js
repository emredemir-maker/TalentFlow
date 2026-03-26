// src/utils/templateService.js
// Loads saved email templates from Firestore and applies variable substitution.
// Falls back to built-in templates if no custom template is saved.

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { buildInterviewInviteEmail, buildRescheduleEmail, buildParticipantNotificationEmail } from './emailTemplates';

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

function applyVars(html, vars) {
    let result = html;
    for (const [key, value] of Object.entries(vars)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
    }
    return result;
}

// ─── Interview Invite ─────────────────────────────────────────────────────────
export async function getInviteEmail(branding, vars) {
    const templates = await loadTemplates();
    if (templates?.invite?.html) {
        return { html: applyVars(templates.invite.html, vars), subject: applyVars(templates.invite.subject || '', vars) };
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
        return { html: applyVars(templates.reschedule.html, vars), subject: applyVars(templates.reschedule.subject || '', vars) };
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
        return { html: applyVars(templates.participant.html, vars), subject: applyVars(templates.participant.subject || '', vars) };
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

// Invalidate cache (call after saving a template)
export function invalidateTemplateCache() {
    _templateCache = null;
    _cacheTs = 0;
}
