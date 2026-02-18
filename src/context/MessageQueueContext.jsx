// src/context/MessageQueueContext.jsx
// Real-time Firestore listener for messageQueue collection

import { createContext, useContext, useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';

const MessageQueueContext = createContext();

const QUEUE_PATH = 'artifacts/talent-flow/public/data/messageQueue';

export function MessageQueueProvider({ children }) {
    const { isAuthenticated } = useAuth();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isAuthenticated) return;

        const queueRef = collection(db, QUEUE_PATH);
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
    }, [isAuthenticated]);

    // Computed stats
    const stats = {
        total: messages.length,
        draft: messages.filter((m) => m.status === 'draft').length,
        readyToSend: messages.filter((m) => m.status === 'ready_to_send').length,
        sent: messages.filter((m) => m.status === 'sent').length,
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
