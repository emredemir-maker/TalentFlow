// src/services/applicationService.js
import { db } from '../config/firebase';
import {
    collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
    query, where, serverTimestamp, onSnapshot
} from 'firebase/firestore';

const APPLICATIONS_COLLECTION = 'artifacts/talent-flow/public/data/applications';

// Detect traffic source from URL param or document.referrer
export function detectSource(refParam) {
    if (refParam) {
        const r = refParam.toLowerCase();
        if (r.includes('linkedin'))  return 'LinkedIn';
        if (r.includes('kariyer'))   return 'Kariyer.net';
        if (r.includes('instagram')) return 'Instagram';
        if (r.includes('twitter') || r.includes('x.com')) return 'Twitter/X';
        if (r.includes('email') || r.includes('mail') || r === 'email') return 'E-posta';
        if (r.includes('google'))    return 'Google';
        if (r.includes('facebook'))  return 'Facebook';
        // Use the raw param value capitalised if nothing matched
        return refParam.charAt(0).toUpperCase() + refParam.slice(1);
    }

    // Fall back to document.referrer
    const referrer = typeof document !== 'undefined' ? document.referrer : '';
    if (!referrer) return 'Direkt';
    if (referrer.includes('linkedin.com'))  return 'LinkedIn';
    if (referrer.includes('kariyer.net'))   return 'Kariyer.net';
    if (referrer.includes('instagram.com')) return 'Instagram';
    if (referrer.includes('twitter.com') || referrer.includes('x.com')) return 'Twitter/X';
    if (referrer.includes('facebook.com'))  return 'Facebook';
    if (referrer.includes('google.com'))    return 'Google';
    try {
        const url = new URL(referrer);
        return url.hostname.replace('www.', '');
    } catch {
        return 'Web';
    }
}

// Submit a job application
export async function submitApplication({
    positionId, positionTitle,
    name, email, phone, linkedin,
    cvText, cvFileName,
    source,
    parsedCandidate, aiScore, aiScoreBreakdown, aiSummary,
}) {
    const docRef = await addDoc(collection(db, APPLICATIONS_COLLECTION), {
        positionId,
        positionTitle,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        linkedin: linkedin.trim(),
        cvFileName,
        cvText: cvText ? cvText.slice(0, 6000) : '',  // trim for Firestore size
        source,
        parsedCandidate: parsedCandidate || null,
        aiScore: aiScore || 0,
        aiScoreBreakdown: aiScoreBreakdown || null,
        aiSummary: aiSummary || '',
        status: 'new',
        kvkkConsent: true,
        createdAt: serverTimestamp(),
    });
    return docRef.id;
}

// Get all applications for a position (one-time fetch)
export async function getApplicationsForPosition(positionId) {
    const q = query(
        collection(db, APPLICATIONS_COLLECTION),
        where('positionId', '==', positionId)
    );
    const snap = await getDocs(q);
    return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

// Real-time listener for applications of a position
export function subscribeToApplications(positionId, callback) {
    const q = query(
        collection(db, APPLICATIONS_COLLECTION),
        where('positionId', '==', positionId)
    );
    return onSnapshot(q, snap => {
        const apps = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        callback(apps);
    });
}

// Update application status
export async function updateApplicationStatus(applicationId, status) {
    await updateDoc(doc(db, APPLICATIONS_COLLECTION, applicationId), { status });
}

// Delete an application
export async function deleteApplication(applicationId) {
    await deleteDoc(doc(db, APPLICATIONS_COLLECTION, applicationId));
}

// Check if an application already exists for this email+position combination
export async function checkDuplicateApplication(positionId, email) {
    const emailNorm = email.trim().toLowerCase();
    const q = query(
        collection(db, APPLICATIONS_COLLECTION),
        where('positionId', '==', positionId),
        where('email', '==', emailNorm)
    );
    const snap = await getDocs(q);
    return !snap.empty;
}

// Source → badge colour mapping
export const SOURCE_COLORS = {
    'LinkedIn':    { bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-200' },
    'Kariyer.net': { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
    'Instagram':   { bg: 'bg-pink-50',   text: 'text-pink-600',   border: 'border-pink-200' },
    'Twitter/X':   { bg: 'bg-slate-50',  text: 'text-slate-600',  border: 'border-slate-200' },
    'Facebook':    { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
    'Google':      { bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200' },
    'E-posta':     { bg: 'bg-emerald-50',text: 'text-emerald-600',border: 'border-emerald-200' },
    'Direkt':      { bg: 'bg-slate-50',  text: 'text-slate-500',  border: 'border-slate-200' },
};

export function getSourceColor(source) {
    return SOURCE_COLORS[source] || { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200' };
}

export const APP_STATUS_CONFIG = {
    new:         { label: 'Yeni',         pill: 'bg-violet-50 text-violet-600 border-violet-200' },
    reviewed:    { label: 'İncelendi',    pill: 'bg-blue-50 text-blue-600 border-blue-200' },
    shortlisted: { label: 'Kısa Liste',   pill: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    rejected:    { label: 'Reddedildi',   pill: 'bg-red-50 text-red-500 border-red-200' },
};
