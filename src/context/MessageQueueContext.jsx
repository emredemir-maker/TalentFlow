// src/context/MessageQueueContext.jsx
// Real-time Firestore listener for messageQueue collection

import { createContext, useContext, useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { tc } from '../config/tenantPaths';

const MessageQueueContext = createContext();

const QUEUE_PATH = () => tc('messageQueue');

export function MessageQueueProvider({ children }) {
    const { isAuthenticated, user } = useAuth();
    // Anonim aday oturumu şirket listelerini okuyamaz (kurallar); dinleyici kurulmaz.
    const isMember = isAuthenticated && !user?.isAnonymous;
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isMember) return;

        const queueRef = collection(db, QUEUE_PATH());
        // Rule 2: No orderBy/limit — client-side filtering
        const unsubscribe = onSnapshot(
            queueRef,
            (snapshot) => {
                const docs = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                // Sort by createdAt descending (client-side)
                docs.sort((a, b) => {
                    const aTime = a.createdAt?.toMillis?.() || 0;
                    const bTime = b.createdAt?.toMillis?.() || 0;
                    return bTime - aTime;
                });
                setMessages(docs);
                setLoading(false);
            },
            (error) => {
                console.error('[MessageQueue] Listener error:', error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [isMember]);

    // Computed stats
    const stats = {
        total: messages.length,
        draft: messages.filter((m) => m.status === 'draft').length,
        readyToSend: messages.filter((m) => m.status === 'ready_to_send').length,
        sent: messages.filter((m) => m.status === 'sent').length,
        replied: messages.filter((m) => m.status === 'replied').length,
        failed: messages.filter((m) => m.status === 'failed').length,
    };

    return (
        <MessageQueueContext.Provider value={{ messages, loading, stats }}>
            {children}
        </MessageQueueContext.Provider>
    );
}

export function useMessageQueue() {
    const ctx = useContext(MessageQueueContext);
    if (!ctx) throw new Error('useMessageQueue must be used within MessageQueueProvider');
    return ctx;
}
