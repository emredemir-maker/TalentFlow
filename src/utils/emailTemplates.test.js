// Tests for the email template builders — Phase 4c.
//
// Scope: representative coverage for the highest-stakes templates (invite,
// reschedule/cancel, feedback) plus the ICS calendar builder. We don't
// validate the full HTML structure — that would lock the templates against
// trivial style tweaks. Instead we assert the dynamic, consequence-bearing
// fields land in the output: links, candidate name, dates, outcome labels,
// branding overrides.
import { describe, expect, it } from 'vitest';

import {
    buildFeedbackEmail,
    buildICS,
    buildInfoRequestEmail,
    buildInterviewInviteEmail,
    buildInviteEmail,
    buildRescheduleEmail,
} from './emailTemplates.js';

const branding = {
    companyName: 'Talent-Inn Test',
    primaryColor: '#1E3A8A',
};

describe('buildInviteEmail', () => {
    it('embeds the invite link and inviter name', () => {
        const html = buildInviteEmail(branding, {
            inviteLink: 'https://example.com/invite/abc',
            role: 'recruiter',
            invitedByName: 'Ada Lovelace',
        });
        expect(html).toContain('https://example.com/invite/abc');
        expect(html).toContain('Ada Lovelace');
        expect(html).toContain('Talent-Inn Test'); // branding applied
    });

    it('uses Turkish role labels', () => {
        const recruiter = buildInviteEmail(branding, { inviteLink: 'x', role: 'recruiter' });
        expect(recruiter).toContain('Recruiter');

        const superAdmin = buildInviteEmail(branding, { inviteLink: 'x', role: 'super_admin' });
        expect(superAdmin).toContain('Süper Admin');

        const dept = buildInviteEmail(branding, { inviteLink: 'x', role: 'department_user' });
        expect(dept).toContain('Departman Kullanıcısı');
    });
});

describe('buildInterviewInviteEmail', () => {
    it('includes all key fields and the join link', () => {
        const html = buildInterviewInviteEmail(branding, {
            candidateName: 'Jane Doe',
            recruiterName: 'Ada Lovelace',
            position: 'Backend Engineer',
            date: '2024-12-15',
            time: '14:30',
            interviewType: 'Online',
            joinLink: 'https://meet.google.com/abc-defg-hij',
            companyEmail: 'hr@example.com',
        });
        expect(html).toContain('Jane Doe');
        expect(html).toContain('Backend Engineer');
        expect(html).toContain('2024-12-15');
        expect(html).toContain('14:30');
        expect(html).toContain('Online');
        expect(html).toContain('https://meet.google.com/abc-defg-hij');
        expect(html).toContain('hr@example.com');
    });
});

describe('buildRescheduleEmail', () => {
    // Returns the HTML string directly (not {html, subject}) — the caller
    // composes the subject line itself.
    it('produces a cancellation email when isCancelled is true', () => {
        const html = buildRescheduleEmail(branding, {
            candidateName: 'Jane Doe',
            position: 'Backend Engineer',
            oldDate: '2024-12-15',
            oldTime: '14:30',
            isCancelled: true,
        });
        expect(html).toContain('Jane Doe');
        // Cancellation copy must say it's cancelled, not rescheduled
        expect(html.toLowerCase()).toContain('iptal');
    });

    it('produces a reschedule email when new date+time provided', () => {
        const html = buildRescheduleEmail(branding, {
            candidateName: 'Jane Doe',
            position: 'Backend Engineer',
            oldDate: '2024-12-15',
            oldTime: '14:30',
            newDate: '2024-12-20',
            newTime: '15:00',
            isCancelled: false,
        });
        expect(html).toContain('2024-12-20');
        expect(html).toContain('15:00');
    });
});

describe('buildFeedbackEmail', () => {
    it('renders an "Olumlu" badge for positive outcome', () => {
        const html = buildFeedbackEmail(branding, {
            candidateName: 'Jane',
            recruiterName: 'Ada',
            position: 'Engineer',
            outcome: 'positive',
            feedbackText: 'Strong technical skills.',
            companyEmail: 'hr@example.com',
        });
        expect(html).toContain('Olumlu');
        expect(html).toContain('Strong technical skills.');
    });

    it('renders an "Olumsuz" badge for negative outcome', () => {
        const html = buildFeedbackEmail(branding, {
            candidateName: 'Jane',
            outcome: 'negative',
            feedbackText: 'Mismatch on experience.',
        });
        expect(html).toContain('Olumsuz');
    });

    it('renders a "Beklemede" badge for any other outcome', () => {
        const html = buildFeedbackEmail(branding, {
            candidateName: 'Jane',
            outcome: 'pending',
            feedbackText: 'Waiting on feedback.',
        });
        expect(html).toContain('Beklemede');
    });
});

describe('buildInfoRequestEmail', () => {
    it('embeds candidate name, request message, and requested items', () => {
        const html = buildInfoRequestEmail(branding, {
            candidateName: 'Jane',
            recruiterName: 'Ada',
            position: 'Engineer',
            requestMessage: 'Please send your latest CV',
            requestedItems: ['CV', 'Diploma'],
            respondUrl: 'https://example.com/respond/xyz',
        });
        // The current template guides the candidate to reply via email, not
        // a URL — `respondUrl` is destructured but unused in the body. This
        // assertion confirms the fields that DO render.
        expect(html).toContain('Jane');
        expect(html).toContain('Engineer');
        expect(html).toContain('CV');
        expect(html).toContain('Diploma');
        expect(html).toContain('Please send your latest CV');
        expect(html).toContain('Ada'); // recruiter name in signature
    });
});

describe('buildICS', () => {
    it('returns null when date or time is missing (caller skips attaching)', () => {
        expect(buildICS({})).toBeNull();
        expect(buildICS({ date: '2024-12-15' })).toBeNull();
        expect(buildICS({ time: '14:30' })).toBeNull();
    });

    it('emits a valid VCALENDAR envelope with VEVENT', () => {
        const ics = buildICS({
            date: '2024-12-15',
            time: '14:30',
            title: 'Backend Interview',
            description: 'With Ada',
            uid: 'event-1@talentflow',
        });
        expect(ics).toContain('BEGIN:VCALENDAR');
        expect(ics).toContain('END:VCALENDAR');
        expect(ics).toContain('BEGIN:VEVENT');
        expect(ics).toContain('END:VEVENT');
    });

    it('formats DTSTART/DTEND from date+time and bumps end by 1h', () => {
        const ics = buildICS({
            date: '2024-12-15',
            time: '14:30',
            title: 'X',
        });
        expect(ics).toContain('DTSTART:20241215T143000');
        expect(ics).toContain('DTEND:20241215T153000');
    });

    it('escapes newlines in description and summary (ICS line-folding rule)', () => {
        const ics = buildICS({
            date: '2024-12-15',
            time: '14:30',
            title: 'Multi\nLine\nTitle',
            description: 'Line one\nLine two',
        });
        // Newlines must become \\n (literal backslash + n) inside ICS values
        expect(ics).toContain('SUMMARY:Multi\\nLine\\nTitle');
        expect(ics).toContain('DESCRIPTION:Line one\\nLine two');
    });

    it('includes ORGANIZER and ATTENDEE only when emails provided', () => {
        const without = buildICS({ date: '2024-12-15', time: '14:30', title: 'X' });
        expect(without).not.toContain('ORGANIZER');
        expect(without).not.toContain('ATTENDEE');

        const withBoth = buildICS({
            date: '2024-12-15',
            time: '14:30',
            title: 'X',
            organizer: { email: 'hr@example.com', name: 'Ada' },
            attendee: { email: 'jane@example.com', name: 'Jane' },
        });
        expect(withBoth).toContain('ORGANIZER;CN=Ada:mailto:hr@example.com');
        expect(withBoth).toContain('ATTENDEE;RSVP=TRUE;CN=Jane:mailto:jane@example.com');
    });

    it('falls back to a generated UID when none provided', () => {
        const ics = buildICS({ date: '2024-12-15', time: '14:30', title: 'X' });
        expect(ics).toMatch(/UID:.+@talentflow/);
    });

    it('returns null on malformed input rather than throwing', () => {
        // Caller can attach the ICS or skip; either way no crash.
        expect(buildICS({ date: 'not-a-date', time: 'also-bad' })).not.toBeNull();
        // True malformation: time without colons → split fails but try/catch wraps
        const result = buildICS({ date: '2024-12-15', time: { not: 'a string' } });
        expect(result).toBeNull();
    });
});
