// src/pages/MessagesPage.jsx
// Message Queue management page — shows all DM drafts and their status

import { useState } from 'react';
import { useMessageQueue } from '../context/MessageQueueContext';
import {
    updateMessageStatus,
    simulateSend,
    deleteMessage,
    MESSAGE_STATUS,
} from '../services/messageQueueService';
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
    User,
    Target,
    RefreshCw,
    FileText,
    Sparkles,
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

export default function MessagesPage() {
    const { messages, loading, stats } = useMessageQueue();
    const [filter, setFilter] = useState('all');
    const [expandedId, setExpandedId] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);

    const filtered = filter === 'all'
        ? messages
        : messages.filter((m) => m.status === filter);

    async function handleSimulateSend(msg) {
        setActionLoading(msg.id);
        try {
            await simulateSend(msg.id);
        } catch (err) {
            console.error('[Messages] Simulate send error:', err);
        } finally {
            setActionLoading(null);
        }
    }

    async function handleDelete(msg) {
        setActionLoading(msg.id);
        try {
            await deleteMessage(msg.id);
        } catch (err) {
            console.error('[Messages] Delete error:', err);
        } finally {
            setActionLoading(null);
        }
    }

    async function handleRetry(msg) {
        setActionLoading(msg.id);
        try {
            await updateMessageStatus(msg.id, MESSAGE_STATUS.READY_TO_SEND);
        } catch (err) {
            console.error('[Messages] Retry error:', err);
        } finally {
            setActionLoading(null);
        }
    }

    function formatDate(ts) {
        if (!ts?.toDate) return '—';
        return ts.toDate().toLocaleString('tr-TR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }

    return (
        <>
            {/* Header */}
            <header className="sticky top-0 z-40 px-6 lg:px-8 h-16 flex items-center justify-between border-b border-white/[0.06] bg-navy-900/80 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white to-navy-300 bg-clip-text text-transparent">
                        Mesaj Kuyruğu
                    </h1>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
                        <Linkedin className="w-3 h-3 text-[#0077B5]" />
                        <span className="text-[10px] text-navy-400 font-medium">Sales Navigator</span>
                    </div>
                </div>
            </header>

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
                        <button
                            key={tab.id}
                            onClick={() => setFilter(tab.id)}
                            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${filter === tab.id
                                    ? 'bg-electric/10 text-electric-light'
                                    : 'text-navy-500 hover:text-navy-300'
                                }`}
                        >
                            {tab.label}
                            {tab.id !== 'all' && (
                                <span className="ml-1.5 text-[10px] opacity-60">
                                    {tab.id === 'ready_to_send' ? stats.readyToSend
                                        : tab.id === 'sent' ? stats.sent
                                            : tab.id === 'draft' ? stats.draft
                                                : tab.id === 'failed' ? stats.failed : ''}
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
                            <MessageSquare className="w-8 h-8 text-navy-500" style={{ animation: 'float-subtle 3s ease-in-out infinite' }} />
                        </div>
                        <h3 className="text-lg font-bold text-navy-300">Mesaj Yok</h3>
                        <p className="text-sm text-navy-500 max-w-sm">
                            {filter !== 'all'
                                ? 'Bu filtreye uygun mesaj bulunamadı.'
                                : 'Henüz kuyrukta mesaj yok. Aday profilinden AI ile mesaj oluşturabilirsiniz.'}
                        </p>
                    </div>
                )}

                {!loading && filtered.map((msg) => {
                    const statusConf = STATUS_CONFIG[msg.status] || STATUS_CONFIG.draft;
                    const StatusIcon = statusConf.icon;
                    const isExpanded = expandedId === msg.id;
                    const isLoading = actionLoading === msg.id;

                    return (
                        <div
                            key={msg.id}
                            className="glass gradient-border rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/[0.02]"
                        >
                            {/* Row header */}
                            <div
                                className="flex items-center gap-4 p-4 cursor-pointer"
                                onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                            >
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-electric to-violet-accent flex items-center justify-center text-sm font-bold text-text-primary shrink-0">
                                    {msg.candidateName?.split(' ').map(n => n[0]).join('').substring(0, 2) || '?'}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[14px] font-semibold text-navy-200 truncate">{msg.candidateName}</span>
                                        {msg.matchScore && (
                                            <span className="text-[11px] font-bold text-electric-light bg-electric/10 px-1.5 py-0.5 rounded">
                                                %{msg.matchScore}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-navy-500 truncate">{msg.candidatePosition}</div>
                                </div>

                                {/* Status badge */}
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 ring-inset ${statusConf.color} ${statusConf.bg} ${statusConf.ring} shrink-0`}>
                                    <StatusIcon className={`w-3 h-3 ${msg.status === 'sending' ? 'animate-spin' : ''}`} />
                                    {statusConf.label}
                                </span>

                                <span className="text-[11px] text-navy-600 shrink-0 hidden sm:block">
                                    {formatDate(msg.createdAt)}
                                </span>
                            </div>

                            {/* Expanded content */}
                            {isExpanded && (
                                <div className="px-4 pb-4 space-y-3 border-t border-white/[0.04] pt-3 animate-fade-in">
                                    {/* Message preview */}
                                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                        <div className="flex items-center gap-1.5 mb-2">
                                            {msg.aiGenerated && <Sparkles className="w-3 h-3 text-violet-400" />}
                                            <span className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
                                                {msg.aiGenerated ? 'AI Tarafından Oluşturuldu' : 'Manuel'}
                                            </span>
                                        </div>
                                        <p className="text-[13px] text-navy-300 leading-relaxed whitespace-pre-wrap">
                                            {msg.messageContent}
                                        </p>
                                    </div>

                                    {/* Sent timestamp */}
                                    {msg.sentTimestamp && (
                                        <div className="flex items-center gap-2 text-[11px] text-emerald-400/80">
                                            <CheckCircle className="w-3 h-3" />
                                            <span>Gönderildi: {formatDate(msg.sentTimestamp)}</span>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 pt-1">
                                        {msg.status === 'ready_to_send' && (
                                            <button
                                                onClick={() => handleSimulateSend(msg)}
                                                disabled={isLoading}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#0077B5] to-[#00A0DC] text-text-primary text-[12px] font-semibold shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
                                            >
                                                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                                                Gönderimi Simüle Et
                                            </button>
                                        )}

                                        {msg.status === 'failed' && (
                                            <button
                                                onClick={() => handleRetry(msg)}
                                                disabled={isLoading}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[12px] font-semibold hover:bg-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
                                            >
                                                <RefreshCw className="w-3 h-3" />
                                                Tekrar Dene
                                            </button>
                                        )}

                                        <div className="flex-1" />

                                        <button
                                            onClick={() => handleDelete(msg)}
                                            disabled={isLoading}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 text-[12px] font-medium transition-all cursor-pointer disabled:opacity-50"
                                        >
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
