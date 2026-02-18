// src/services/messageQueueService.js
// Firestore-based message queue for Sales Navigator DM automation
// Supports: draft → ready_to_send → sent lifecycle

import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

const QUEUE_PATH = 'artifacts/talent-flow/public/data/messageQueue';

// ==================== MESSAGE STATUS ENUM ====================

export const MESSAGE_STATUS = {
    DRAFT: 'draft',
    READY_TO_SEND: 'ready_to_send',
    SENDING: 'sending',
    SENT: 'sent',
    FAILED: 'failed',
};

// ==================== CREATE ====================

/**
 * Creates a new message in the queue.
 * @param {object} messageData
 * @param {string} messageData.candidateId - Firestore candidate doc ID
 * @param {string} messageData.candidateName - Candidate display name
 * @param {string} messageData.candidatePosition - Candidate's target position
 * @param {string} messageData.candidateEmail - Candidate's email
 * @param {string} messageData.candidateLinkedIn - LinkedIn profile URL (optional)
 * @param {string} messageData.messageContent - The DM message text
 * @param {string} messageData.jobDescription - Job description used for analysis
 * @param {boolean} messageData.aiGenerated - Whether message was AI-generated
 * @param {string} messageData.createdBy - User ID who created the message
 * @param {number} messageData.matchScore - AI match score (optional)
 * @returns {Promise<string>} Document ID of the created message
 */
export async function createMessage(messageData) {
    const queueRef = collection(db, QUEUE_PATH);

    const message = {
        candidateId: messageData.candidateId || '',
        candidateName: messageData.candidateName || '',
        candidatePosition: messageData.candidatePosition || '',
        candidateEmail: messageData.candidateEmail || '',
        candidateLinkedIn: messageData.candidateLinkedIn || '',
        messageContent: messageData.messageContent || '',
        jobDescription: messageData.jobDescription || '',
        aiGenerated: messageData.aiGenerated || false,
        createdBy: messageData.createdBy || '',
        matchScore: messageData.matchScore || null,
        status: MESSAGE_STATUS.DRAFT,
        sentTimestamp: null,
        retryCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(queueRef, message);
    console.log(`[MessageQueue] Created message ${docRef.id} for ${message.candidateName}`);
    return docRef.id;
}

// ==================== UPDATE STATUS ====================

/**
 * Updates a message's status in the queue.
 */
export async function updateMessageStatus(messageId, newStatus) {
    const docRef = doc(db, QUEUE_PATH, messageId);

    const update = {
        status: newStatus,
        updatedAt: serverTimestamp(),
    };

    // If marking as sent, add sentTimestamp
    if (newStatus === MESSAGE_STATUS.SENT) {
        update.sentTimestamp = serverTimestamp();
    }

    // If marking as failed, increment retry count
    if (newStatus === MESSAGE_STATUS.FAILED) {
        // We'll handle increment in the caller if needed
    }

    await updateDoc(docRef, update);
    console.log(`[MessageQueue] Updated message ${messageId} → ${newStatus}`);
}

// ==================== UPDATE CONTENT ====================

/**
 * Updates message content (used when user edits the draft).
 */
export async function updateMessageContent(messageId, newContent) {
    const docRef = doc(db, QUEUE_PATH, messageId);
    await updateDoc(docRef, {
        messageContent: newContent,
        updatedAt: serverTimestamp(),
    });
    console.log(`[MessageQueue] Updated content for message ${messageId}`);
}

// ==================== APPROVE (Mark Ready) ====================

/**
 * Approves a message — sets status to 'ready_to_send'.
 * This is the human-in-the-loop approval step.
 */
export async function approveMessage(messageId, finalContent) {
    const docRef = doc(db, QUEUE_PATH, messageId);
    await updateDoc(docRef, {
        messageContent: finalContent,
        status: MESSAGE_STATUS.READY_TO_SEND,
        updatedAt: serverTimestamp(),
    });
    console.log(`[MessageQueue] Approved message ${messageId} → ready_to_send`);
}

// ==================== SIMULATE SEND ====================

/**
 * Simulates sending a message via Chrome Extension.
 * In production, this would be triggered by the extension polling
 * for messages with status: 'ready_to_send'.
 *
 * For now, it marks the message as 'sent' with a sentTimestamp.
 */
export async function simulateSend(messageId) {
    const docRef = doc(db, QUEUE_PATH, messageId);
    await updateDoc(docRef, {
        status: MESSAGE_STATUS.SENT,
        sentTimestamp: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    console.log(`[MessageQueue] Simulated send for message ${messageId}`);
}

// ==================== MARK FAILED ====================

/**
 * Marks a message as failed (e.g., LinkedIn rate limit).
 */
export async function markMessageFailed(messageId, errorReason) {
    const docRef = doc(db, QUEUE_PATH, messageId);
    await updateDoc(docRef, {
        status: MESSAGE_STATUS.FAILED,
        errorReason: errorReason || 'Bilinmeyen hata',
        updatedAt: serverTimestamp(),
    });
}

// ==================== DELETE ====================

/**
 * Deletes a message from the queue.
 */
export async function deleteMessage(messageId) {
    const docRef = doc(db, QUEUE_PATH, messageId);
    await deleteDoc(docRef);
    console.log(`[MessageQueue] Deleted message ${messageId}`);
}

// ==================== BATCH APPROVE ====================

/**
 * Approves multiple messages at once.
 */
export async function batchApprove(messageIds) {
    const promises = messageIds.map((id) =>
        updateMessageStatus(id, MESSAGE_STATUS.READY_TO_SEND)
    );
    await Promise.all(promises);
    console.log(`[MessageQueue] Batch approved ${messageIds.length} messages`);
}

// ==================== CHROME EXTENSION QUEUE STRUCTURE ====================

/**
 * This is the queue structure that a Chrome Extension would poll:
 *
 * Collection: artifacts/talent-flow/public/data/messageQueue
 *
 * Document structure:
 * {
 *   candidateId: string,
 *   candidateName: string,
 *   candidatePosition: string,
 *   candidateEmail: string,
 *   candidateLinkedIn: string,    // LinkedIn profile URL
 *   messageContent: string,       // The DM text to send
 *   status: 'draft' | 'ready_to_send' | 'sending' | 'sent' | 'failed',
 *   aiGenerated: boolean,
 *   createdBy: string,            // userId
 *   matchScore: number | null,
 *   sentTimestamp: Timestamp | null,
 *   retryCount: number,
 *   errorReason: string | null,
 *   createdAt: Timestamp,
 *   updatedAt: Timestamp,
 * }
 *
 * Chrome Extension Flow:
 * 1. Extension polls for documents where status === 'ready_to_send'
 * 2. Sets status to 'sending' (optimistic lock)
 * 3. Opens LinkedIn Sales Navigator and sends the DM
 * 4. On success: sets status to 'sent', updates sentTimestamp
 * 5. On failure: sets status to 'failed', increments retryCount
 * 6. Rate limiting: max 25 messages/hour, 100/day
 */
