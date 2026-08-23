import { createContext, useContext, useState, useCallback, useEffect , useMemo } from 'react';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        const count = notifications.filter(n => !n.read).length;
        setUnreadCount(count);
    }, [notifications]);

    const addNotification = useCallback((notification) => {
        const newNotification = {
            id: Date.now() + Math.random(),
            timestamp: new Date(),
            read: false,
            type: 'info',
            ...notification
        };
        setNotifications(prev => [newNotification, ...prev].slice(0, 50));
    }, []);

    const markAsRead = useCallback((id) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }, []);

    const markAllAsRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, []);

    const clearAll = useCallback(() => {
        setNotifications([]);
    }, []);

    /**
     * Context değeri memoize.
     *
     * Düz nesne her render'da yeni referans üretiyor ve bu context'i tüketen
     * HER bileşeni yeniden render ettiriyordu. Ekranlar arası yavaşlığın
     * kaynaklarından biri buydu.
     *
     * Fonksiyonlar bilerek bağımlılıkta yok: hiçbiri bileşen state'ini
     * okumuyor, yalnızca stabil setter'ları ve servis çağrılarını kullanıyor.
     */
    const value = useMemo(() => ({
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearAll
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [notifications, unreadCount]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
}
