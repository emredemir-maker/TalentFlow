// src/pages/MessagesPage.jsx
// Message Queue management page — shows DM drafts and email thread tracking

import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useMessageQueue } from '../context/MessageQueueContext';
import { useNotifications } from '../context/NotificationContext';
import {
    updateMessageStatus,
    simulateSend,
    deleteMessage,
    MESSAGE_STATUS,
} from '../services/messageQueueService';
import { fetchEmailThread, ensureValidGoogleToken, connectGoogleWorkspace } from '../services/integrationService';
import {
    Send,
    Clock,
    CheckCircle,
    XCircle,
    Edit3,
    Trash2,
    Linkedin,
    MessageSquare,
    Loader2,
    Play,
    RefreshCw,
    FileText,
    Sparkles,
    Mail,
    MailOpen,
    ChevronDown,
    ChevronRight,
    Reply,
    AlertCircle,
    ClipboardList,
    Paperclip,
    User,
} from 'lucide-react';

const STATUS_CONFIG = {
    draft: { label: 'Taslak', icon: Edit3, color: 'text-navy-400', bg: 'bg-navy-800', ring: 'ring-navy-700' },
    ready_to_send: { label: 'Gönderime Hazır', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20' },
    sending: { label: 'Gönderiliyor', icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/10', ring: 'ring-blue-500/20' },
    sent: { label: 'Gönderildi', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
    failed: { label: 'Başarısız', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', ring: 'ring-red-500/20' },
};

const FILTER_TABS = [
    { id: 'all', label: 'Tümü' },
    { id: 'ready_to_send', label: 'Hazır' },
    { id: 'sent', label: 'Gönderilen' },
    { id: 'draft', label: 'Taslak' },
    { id: 'failed', label: 'Başarısız' },
];

const PAGE_TABS = [
    { id: 'queue', label: 'Mesaj Kuyruğu', icon: Linkedin },
    { id: 'emails', label: 'E-posta Yazışmaları', icon: Mail },
    { id: 'info_requests', label: 'Bilgi Talepleri', icon: ClipboardList },
];

export default function MessagesPage() {
    const { messages, loading, stats } = useMessageQueue();
    const { user: currentUser, userId, userProfile } = useAuth();
    const { addNotification } = useNotifications();
    const [pageTab, setPageTab] = useState('queue');
    const [filter, setFilter] = useState('all');
    const [expandedId, setExpandedId] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);

    // Email threads state
    const [emailThreads, setEmailThreads] = useState([]);
    const [emailsLoading, setEmailsLoading] = useState(true);
    const [expandedThread, setExpandedThread] = useState(null);
    const [threadMessages, setThreadMessages] = useState({}); // threadId → messages[]
    const [checkingThread, setCheckingThread] = useState(null);

    // Info requests state
    const [infoRequests, setInfoRequests] = useState([]);
    const [infoReqLoading, setInfoReqLoading] = useState(true);
    const [expandedInfoReq, setExpandedInfoReq] = useState(null);
    const [checkingInfoReplies, setCheckingInfoReplies] = useState(false);
    const [checkInfoResult, setCheckInfoResult] = useState(null);
    const [markingReplied, setMarkingReplied] = useState(null);
    const [connectingGoogle, setConnectingGoogle] = useState(false);

    const filtered = filter === 'all'
        ? messages
        : messages.filter((m) => m.status === filter);

    // Load info requests from Firestore
    useEffect(() => {
        if (!currentUser?.email) { setInfoReqLoading(false); return; }
        const q = query(
            collection(db, 'artifacts/talent-flow/public/data/infoRequests'),
            where('recruiterEmail', '==', currentUser.email)
        );
        const unsub = onSnapshot(q, snap => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            docs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
            setInfoRequests(docs);
            setInfoReqLoading(false);
        }, () => setInfoReqLoading(false));
        return unsub;
    }, [currentUser?.email]);

    // Check Gmail inbox for replies to info request emails (IMAP)
    const handleCheckInfoReplies = useCallback(async () => {
        if (!currentUser) return;
        setCheckingInfoReplies(true);
        setCheckInfoResult(null);
        try {
            const token = await currentUser.getIdToken();
            const res = await fetch('/api/check-info-replies', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Hata oluştu');
            setCheckInfoResult({ scanned: data.scanned, updated: data.updated });
            if (data.updated > 0) addNotification('success', `${data.updated} talep otomatik olarak yanıtlandı olarak işaretlendi.`);
            else addNotification('info', `${data.scanned} e-posta tarandı, yeni yanıt bulunamadı.`);
        } catch (err) {
            addNotification('error', 'Yanıt kontrolü başarısız: ' + err.message);
        } finally {
            setCheckingInfoReplies(false);
        }
    }, [currentUser, addNotification]);

    // Manually mark an info request as replied
    const handleMarkReplied = useCallback(async (reqId) => {
        setMarkingReplied(reqId);
        try {
            await updateDoc(doc(db, 'artifacts/talent-flow/public/data/infoRequests', reqId), {
                status: 'responded',
                respondedAt: new Date(),
            });
            addNotification('success', 'Talep yanıtlandı olarak işaretlendi.');
        } catch (err) {
            addNotification('error', 'İşaretleme başarısız: ' + err.message);
        } finally {
            setMarkingReplied(null);
        }
    }, [addNotification]);

    // Load email threads from Firestore
    useEffect(() => {
        if (!userId) return;
        const q = query(
            collection(db, 'artifacts/talent-flow/public/data/emailThreads'),
            where('recruiterId', '==', userId)
        );
        const unsub = onSnapshot(q, snap => {
            const threads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            threads.sort((a, b) => {
                const ta = a.sentAt?.toMillis?.() || 0;
                const tb = b.sentAt?.toMillis?.() || 0;
                return tb - ta;
            });
            setEmailThreads(threads);
            setEmailsLoading(false);
        }, () => setEmailsLoading(false));
        return unsub;
    }, [userId]);

    async function handleSimulateSend(msg) {
        setActionLoading(msg.id);
        try { await simulateSend(msg.id); } catch (err) { console.error(err); } finally { setActionLoading(null); }
    }

    async function handleDelete(msg) {
        setActionLoading(msg.id);
        try { await deleteMessage(msg.id); } catch (err) { console.error(err); } finally { setActionLoading(null); }
    }

    async function handleRetry(msg) {
        setActionLoading(msg.id);
        try { await updateMessageStatus(msg.id, MESSAGE_STATUS.READY_TO_SEND); } catch (err) { console.error(err); } finally { setActionLoading(null); }
    }

    const handleCheckReplies = useCallback(async (thread) => {
        setCheckingThread(thread.id);
        try {
            const token = await ensureValidGoogleToken(userId, userProfile);
            if (!token) { alert('Google bağlantısı gerekli. Ayarlar → Sistem bölümünden bağlanın.'); return; }
            const result = await fetchEmailThread(token, thread.threadId);
            if (result.success) {
                setThreadMessages(prev => ({ ...prev, [thread.threadId]: result.messages }));
                const hasReply = result.messages.length > 1;
                if (hasReply !== thread.hasReply) {
                    await updateDoc(doc(db, 'artifacts/talent-flow/public/data/emailThreads', thread.id), { hasReply });
                    if (hasReply && !thread.hasReply) {
                        addNotification({
                            title: 'Yeni E-posta Yanıtı',
                            message: `${thread.candidateName} konuya yanıt verdi: "${thread.subject}"`,
                            type: 'info'
                        });
                    }
                }
            }
        } catch (err) {
            console.error('[EmailThreads] Check replies error:', err);
        } finally {
            setCheckingThread(null);
        }
    }, [userId, userProfile]);

    function formatDate(ts) {
        if (!ts?.toDate) return '—';
        return ts.toDate().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function parseEmailDate(dateStr) {
        if (!dateStr) return '—';
        try { return new Date(dateStr).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
        catch { return dateStr; }
    }

    const emailsWithReply = emailThreads.filter(t => t.hasReply).length;

    return (
        <>
            {/* Header */}
            <header className="sticky top-0 z-40 px-6 lg:px-8 h-16 flex items-center justify-between border-b border-white/[0.06] bg-navy-900/80 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white to-navy-300 bg-clip-text text-transparent">
                        Mesajlar
                    </h1>
                </div>
                {/* Page tabs */}
                <div className="flex gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    {PAGE_TABS.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setPageTab(tab.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${pageTab === tab.id ? 'bg-electric/10 text-electric-light' : 'text-navy-500 hover:text-navy-300'}`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {tab.label}
                                {tab.id === 'emails' && emailsWithReply > 0 && (
                                    <span className="w-4 h-4 rounded-full bg-emerald-500 text-[9px] text-white font-bold flex items-center justify-center">{emailsWithReply}</span>
                                )}
                                {tab.id === 'info_requests' && infoRequests.length > 0 && (
                                    <span className="w-4 h-4 rounded-full bg-cyan-500 text-[9px] text-white font-bold flex items-center justify-center">{infoRequests.length}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </header>

            {/* ── QUEUE TAB ─────────────────────────────────────────────── */}
            {pageTab === 'queue' && (
                <>
                    {/* Stats */}
                    <div className="px-6 lg:px-8 py-5">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <StatMini icon={FileText} label="Toplam" value={stats.total} color="text-navy-300" bg="bg-white/[0.03]" />
                            <StatMini icon={Clock} label="Gönderime Hazır" value={stats.readyToSend} color="text-amber-400" bg="bg-amber-500/5" />
                            <StatMini icon={CheckCircle} label="Gönderilen" value={stats.sent} color="text-emerald-400" bg="bg-emerald-500/5" />
                            <StatMini icon={XCircle} label="Başarısız" value={stats.failed} color="text-red-400" bg="bg-red-500/5" />
                        </div>
                    </div>

                    {/* Filter tabs */}
                    <div className="px-6 lg:px-8 pb-4">
                        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.06] w-fit">
                            {FILTER_TABS.map((tab) => (
                                <button key={tab.id} onClick={() => setFilter(tab.id)}
                                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${filter === tab.id ? 'bg-electric/10 text-electric-light' : 'text-navy-500 hover:text-navy-300'}`}
                                >
                                    {tab.label}
                                    {tab.id !== 'all' && (
                                        <span className="ml-1.5 text-[10px] opacity-60">
                                            {tab.id === 'ready_to_send' ? stats.readyToSend : tab.id === 'sent' ? stats.sent : tab.id === 'draft' ? stats.draft : tab.id === 'failed' ? stats.failed : ''}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Messages list */}
                    <div className="px-6 lg:px-8 pb-24 md:pb-8 space-y-3">
                        {loading && (
                            <div className="space-y-3">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="glass rounded-2xl p-5">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="skeleton w-10 h-10 rounded-full" />
                                            <div className="flex-1 space-y-2">
                                                <div className="skeleton h-4 w-2/5 rounded" />
                                                <div className="skeleton h-3 w-1/3 rounded" />
                                            </div>
                                        </div>
                                        <div className="skeleton h-3 w-full rounded mb-2" />
                                        <div className="skeleton h-3 w-4/5 rounded" />
                                    </div>
                                ))}
                            </div>
                        )}

                        {!loading && filtered.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                                <div className="w-20 h-20 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                                    <MessageSquare className="w-8 h-8 text-navy-500" />
                                </div>
                                <h3 className="text-lg font-bold text-navy-300">Mesaj Yok</h3>
                                <p className="text-sm text-navy-500 max-w-sm">
                                    {filter !== 'all' ? 'Bu filtreye uygun mesaj bulunamadı.' : 'Henüz kuyrukta mesaj yok. Aday profilinden AI ile mesaj oluşturabilirsiniz.'}
                                </p>
                            </div>
                        )}

                        {!loading && filtered.map((msg) => {
                            const statusConf = STATUS_CONFIG[msg.status] || STATUS_CONFIG.draft;
                            const StatusIcon = statusConf.icon;
                            const isExpanded = expandedId === msg.id;
                            const isLoading = actionLoading === msg.id;

                            return (
                                <div key={msg.id} className="glass gradient-border rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/[0.02]">
                                    <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : msg.id)}>
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-electric to-violet-accent flex items-center justify-center text-sm font-bold text-text-primary shrink-0">
                                            {msg.candidateName?.split(' ').map(n => n[0]).join('').substring(0, 2) || '?'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[14px] font-semibold text-navy-200 truncate">{msg.candidateName}</span>
                                                {msg.matchScore && (
                                                    <span className="text-[11px] font-bold text-electric-light bg-electric/10 px-1.5 py-0.5 rounded">%{msg.matchScore}</span>
                                                )}
                                            </div>
                                            <div className="text-[11px] text-navy-500 truncate">{msg.candidatePosition}</div>
                                        </div>
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 ring-inset ${statusConf.color} ${statusConf.bg} ${statusConf.ring} shrink-0`}>
                                            <StatusIcon className={`w-3 h-3 ${msg.status === 'sending' ? 'animate-spin' : ''}`} />
                                            {statusConf.label}
                                        </span>
                                        <span className="text-[11px] text-navy-600 shrink-0 hidden sm:block">{formatDate(msg.createdAt)}</span>
                                    </div>

                                    {isExpanded && (
                                        <div className="px-4 pb-4 space-y-3 border-t border-white/[0.04] pt-3 animate-fade-in">
                                            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                                <div className="flex items-center gap-1.5 mb-2">
                                                    {msg.aiGenerated && <Sparkles className="w-3 h-3 text-violet-400" />}
                                                    <span className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
                                                        {msg.aiGenerated ? 'AI Tarafından Oluşturuldu' : 'Manuel'}
                                                    </span>
                                                </div>
                                                <p className="text-[13px] text-navy-300 leading-relaxed whitespace-pre-wrap">{msg.messageContent}</p>
                                            </div>
                                            {msg.sentTimestamp && (
                                                <div className="flex items-center gap-2 text-[11px] text-emerald-400/80">
                                                    <CheckCircle className="w-3 h-3" />
                                                    <span>Gönderildi: {formatDate(msg.sentTimestamp)}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 pt-1">
                                                {msg.status === 'ready_to_send' && (
                                                    <button onClick={() => handleSimulateSend(msg)} disabled={isLoading}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#0077B5] to-[#00A0DC] text-text-primary text-[12px] font-semibold shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50">
                                                        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                                                        Gönderimi Simüle Et
                                                    </button>
                                                )}
                                                {msg.status === 'failed' && (
                                                    <button onClick={() => handleRetry(msg)} disabled={isLoading}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[12px] font-semibold hover:bg-amber-500/20 transition-all cursor-pointer disabled:opacity-50">
                                                        <RefreshCw className="w-3 h-3" />
                                                        Tekrar Dene
                                                    </button>
                                                )}
                                                <div className="flex-1" />
                                                <button onClick={() => handleDelete(msg)} disabled={isLoading}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 text-[12px] font-medium transition-all cursor-pointer disabled:opacity-50">
                                                    <Trash2 className="w-3 h-3" />
                                                    Sil
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* ── EMAIL THREADS TAB ─────────────────────────────────────── */}
            {pageTab === 'emails' && (
                <div className="px-6 lg:px-8 py-5 pb-24 md:pb-8 space-y-4">
                    {/* Stats row */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <StatMini icon={Mail} label="Toplam E-posta" value={emailThreads.length} color="text-navy-300" bg="bg-white/[0.03]" />
                        <StatMini icon={Reply} label="Yanıt Alınan" value={emailsWithReply} color="text-emerald-400" bg="bg-emerald-500/5" />
                        <StatMini icon={Clock} label="Yanıt Beklenen" value={emailThreads.length - emailsWithReply} color="text-amber-400" bg="bg-amber-500/5" />
                    </div>

                    {/* Info banner */}
                    {!userProfile?.integrations?.google?.connected && (
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                            <div className="flex-1">
                                <p className="text-[13px] text-amber-300 font-semibold">Gmail bağlantısı gerekli</p>
                                <p className="text-[12px] text-amber-400/70 mt-0.5">E-posta yazışmalarını görmek için Gmail API erişimine izin verin.</p>
                            </div>
                            <button
                                onClick={async () => {
                                    setConnectingGoogle(true);
                                    const result = await connectGoogleWorkspace(userId, false);
                                    setConnectingGoogle(false);
                                    if (!result.success) addNotification('error', result.error || 'Bağlantı başarısız.');
                                    else addNotification('success', 'Gmail başarıyla bağlandı.');
                                }}
                                disabled={connectingGoogle}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[11px] font-semibold border border-amber-500/30 transition-all disabled:opacity-50 shrink-0"
                            >
                                {connectingGoogle ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                                {connectingGoogle ? 'Bağlanıyor…' : 'Gmail\'e Bağlan'}
                            </button>
                        </div>
                    )}

                    {/* Loading skeleton */}
                    {emailsLoading && (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="glass rounded-2xl p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="skeleton w-10 h-10 rounded-full" />
                                        <div className="flex-1 space-y-2">
                                            <div className="skeleton h-4 w-2/5 rounded" />
                                            <div className="skeleton h-3 w-1/3 rounded" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Empty state */}
                    {!emailsLoading && emailThreads.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                            <div className="w-20 h-20 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                                <Mail className="w-8 h-8 text-navy-500" />
                            </div>
                            <h3 className="text-lg font-bold text-navy-300">E-posta Yok</h3>
                            <p className="text-sm text-navy-500 max-w-sm">
                                Mülakat Yönetimi ekranından aday veya katılımcılara e-posta gönderdiğinizde burada görünür.
                            </p>
                        </div>
                    )}

                    {/* Thread list */}
                    {!emailsLoading && emailThreads.map(thread => {
                        const isExpanded = expandedThread === thread.id;
                        const msgs = threadMessages[thread.threadId] || [];
                        const isChecking = checkingThread === thread.id;
                        const replyCount = msgs.length > 1 ? msgs.length - 1 : 0;

                        return (
                            <div key={thread.id} className="glass gradient-border rounded-2xl overflow-hidden">
                                {/* Thread header */}
                                <div
                                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/[0.02] transition-all"
                                    onClick={() => setExpandedThread(isExpanded ? null : thread.id)}
                                >
                                    {/* Avatar */}
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${thread.hasReply ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-electric to-violet-accent'}`}>
                                        {thread.candidateName?.split(' ').map(n => n[0]).join('').substring(0, 2) || '?'}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[14px] font-semibold text-navy-200 truncate">{thread.candidateName}</span>
                                            {thread.hasReply && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold ring-1 ring-emerald-500/20">
                                                    <Reply className="w-2.5 h-2.5" />
                                                    Yanıt Var
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[11px] text-navy-500 truncate">{thread.subject}</div>
                                        <div className="text-[10px] text-navy-600 mt-0.5">{thread.candidateEmail}</div>
                                    </div>

                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                        <span className="text-[10px] text-navy-600">{formatDate(thread.sentAt)}</span>
                                        <div className="flex items-center gap-1">
                                            {thread.hasReply
                                                ? <MailOpen className="w-3.5 h-3.5 text-emerald-400" />
                                                : <Mail className="w-3.5 h-3.5 text-navy-500" />
                                            }
                                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-navy-500" /> : <ChevronRight className="w-3.5 h-3.5 text-navy-500" />}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded thread */}
                                {isExpanded && (
                                    <div className="border-t border-white/[0.04] p-4 space-y-3 animate-fade-in">
                                        {/* Check replies button */}
                                        <div className="flex items-center justify-between">
                                            <span className="text-[12px] text-navy-500 font-medium">
                                                {msgs.length > 0
                                                    ? `${msgs.length} mesaj — ${replyCount > 0 ? `${replyCount} yanıt` : 'yanıt yok'}`
                                                    : 'Yanıtları kontrol etmek için butona tıklayın'}
                                            </span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleCheckReplies(thread); }}
                                                disabled={isChecking}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-electric/10 border border-electric/20 text-electric-light text-[12px] font-semibold hover:bg-electric/20 transition-all cursor-pointer disabled:opacity-50"
                                            >
                                                {isChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                                Yanıtları Kontrol Et
                                            </button>
                                        </div>

                                        {/* Messages in thread */}
                                        {msgs.length > 0 && (
                                            <div className="space-y-2">
                                                {msgs.map((m, idx) => {
                                                    const isSentByUs = m.from?.toLowerCase().includes(thread.recruiterName?.toLowerCase() || '') || m.from?.toLowerCase().includes('@');
                                                    const isFirst = idx === 0;
                                                    return (
                                                        <div key={m.id} className={`p-3 rounded-xl border ${isFirst ? 'bg-electric/5 border-electric/10' : 'bg-emerald-500/5 border-emerald-500/10'}`}>
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <span className={`text-[11px] font-semibold ${isFirst ? 'text-electric-light' : 'text-emerald-400'}`}>
                                                                    {isFirst ? 'Gönderilen' : 'Yanıt'}
                                                                </span>
                                                                <span className="text-[10px] text-navy-600">{parseEmailDate(m.date)}</span>
                                                            </div>
                                                            <div className="text-[11px] text-navy-400 mb-1 truncate">Kimden: {m.from}</div>
                                                            <p className="text-[12px] text-navy-300 leading-relaxed">{m.snippet}</p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {/* ── INFO REQUESTS TAB ─────────────────────────────────────── */}
            {pageTab === 'info_requests' && (
                <div className="px-6 lg:px-8 py-5 pb-24 md:pb-8 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="grid grid-cols-3 gap-3 flex-1">
                            <StatMini icon={ClipboardList} label="Toplam Talep" value={infoRequests.length} color="text-cyan-400" bg="bg-cyan-500/5" />
                            <StatMini icon={Clock} label="Bekleniyor" value={infoRequests.filter(r => r.status === 'pending').length} color="text-amber-400" bg="bg-amber-500/5" />
                            <StatMini icon={CheckCircle} label="Yanıtlandı" value={infoRequests.filter(r => r.status === 'responded').length} color="text-emerald-400" bg="bg-emerald-500/5" />
                        </div>
                        <button
                            onClick={handleCheckInfoReplies}
                            disabled={checkingInfoReplies}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-[12px] font-semibold border border-cyan-500/20 transition-all disabled:opacity-50 shrink-0"
                        >
                            {checkingInfoReplies
                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Kontrol ediliyor…</>
                                : <><RefreshCw className="w-3.5 h-3.5" /> Yanıtları Kontrol Et</>
                            }
                        </button>
                    </div>
                    {checkInfoResult && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-[11px] text-emerald-400">
                            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                            {checkInfoResult.scanned} e-posta tarandı — {checkInfoResult.updated > 0 ? `${checkInfoResult.updated} yeni yanıt bulundu ve işaretlendi.` : 'yeni yanıt bulunamadı.'}
                        </div>
                    )}

                    {infoReqLoading && (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="glass rounded-2xl p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="skeleton w-10 h-10 rounded-full" />
                                        <div className="flex-1 space-y-2">
                                            <div className="skeleton h-4 w-2/5 rounded" />
                                            <div className="skeleton h-3 w-1/3 rounded" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!infoReqLoading && infoRequests.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                            <div className="w-20 h-20 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                                <ClipboardList className="w-8 h-8 text-navy-500" />
                            </div>
                            <h3 className="text-lg font-bold text-navy-300">Bilgi Talebi Yok</h3>
                            <p className="text-sm text-navy-500 max-w-sm">Aday kartından "Mesaj Gönder → Bilgi İste" ile talep gönderdiğinizde burada görünür.</p>
                        </div>
                    )}

                    {!infoReqLoading && infoRequests.map(req => {
                        const isPending = req.status === 'pending';
                        const isExpanded = expandedInfoReq === req.id;
                        const createdAt = req.createdAt?.toDate?.()?.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) || '—';
                        return (
                            <div key={req.id} className="glass gradient-border rounded-2xl overflow-hidden">
                                <div
                                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/[0.02] transition-all"
                                    onClick={() => setExpandedInfoReq(isExpanded ? null : req.id)}
                                >
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                                        {req.candidateName?.split(' ').map(n => n[0]).join('').substring(0, 2) || '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[14px] font-semibold text-navy-200 truncate">{req.candidateName}</span>
                                            {req.position && (
                                                <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">{req.position}</span>
                                            )}
                                        </div>
                                        <div className="text-[11px] text-navy-500 truncate mt-0.5">{req.requestMessage || 'Bilgi talebi gönderildi'}</div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                        <span className="text-[10px] text-navy-600">{createdAt}</span>
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isPending ? 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'}`}>
                                            {isPending ? <Clock className="w-2.5 h-2.5" /> : <CheckCircle className="w-2.5 h-2.5" />}
                                            {isPending ? 'Bekleniyor' : 'Yanıtlandı'}
                                        </span>
                                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-navy-500" /> : <ChevronRight className="w-3.5 h-3.5 text-navy-500" />}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="border-t border-white/[0.04] p-4 space-y-3 animate-fade-in">
                                        <div className="flex items-center gap-2 mb-1">
                                            <User className="w-3 h-3 text-navy-500" />
                                            <span className="text-[11px] text-navy-500">{req.candidateEmail || '—'}</span>
                                        </div>
                                        {req.requestMessage && (
                                            <div className="p-3 rounded-xl bg-electric/5 border border-electric/10">
                                                <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold mb-1.5">Mesaj</p>
                                                <p className="text-[12px] text-navy-300 leading-relaxed whitespace-pre-wrap">{req.requestMessage}</p>
                                            </div>
                                        )}
                                        {req.requestedItems?.length > 0 && (
                                            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                                <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold mb-2">Talep Edilen Belgeler</p>
                                                <ul className="space-y-1">
                                                    {req.requestedItems.map((item, i) => (
                                                        <li key={i} className="flex items-center gap-1.5 text-[12px] text-navy-400">
                                                            <Paperclip className="w-3 h-3 text-cyan-400 shrink-0" /> {item}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {isPending && (
                                            <div className="flex items-center gap-3 pt-1">
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleMarkReplied(req.id); }}
                                                    disabled={markingReplied === req.id}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-semibold border border-emerald-500/20 transition-all disabled:opacity-50"
                                                >
                                                    {markingReplied === req.id
                                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                                        : <CheckCircle className="w-3 h-3" />
                                                    }
                                                    Yanıt Alındı
                                                </button>
                                                <span className="text-[10px] text-navy-600">Gelen kutunuzda yanıt gördüyseniz manuel olarak işaretleyebilirsiniz.</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
}

function StatMini({ icon: Icon, label, value, color, bg }) {
    return (
        <div className={`p-3.5 rounded-xl ${bg} border border-white/[0.06]`}>
            <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                <span className="text-[11px] text-navy-500 font-medium">{label}</span>
            </div>
            <div className={`text-xl font-extrabold ${color}`}>{value}</div>
        </div>
    );
}
