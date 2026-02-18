// src/components/SendMessageModal.jsx
// Human-in-the-loop DM approval modal
// Shows AI-generated draft, allows editing, then saves to Firestore queue

import { useState, useEffect, useRef } from 'react';
import {
    X,
    Send,
    Edit3,
    Sparkles,
    Copy,
    Check,
    AlertCircle,
    Linkedin,
    MessageSquare,
    Loader2,
    User,
    Briefcase,
    Target,
    CheckCircle,
} from 'lucide-react';
import { createMessage, approveMessage, MESSAGE_STATUS } from '../services/messageQueueService';
import { generatePersonalizedDM } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';

export default function SendMessageModal({ candidate, aiAnalysisResult, onClose, onSent }) {
    const { userId } = useAuth();
    const textareaRef = useRef(null);

    // State
    const [messageContent, setMessageContent] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);

    // Initialize message from AI analysis or generate new
    useEffect(() => {
        if (aiAnalysisResult?.personalizedMessage) {
            setMessageContent(aiAnalysisResult.personalizedMessage);
        } else {
            generateDM();
        }
    }, []);

    async function generateDM() {
        setGenerating(true);
        setError(null);
        try {
            const dm = await generatePersonalizedDM(
                candidate.name,
                candidate.skills || [],
                candidate.position,
                'Şirketimiz'
            );
            setMessageContent(dm);
        } catch (err) {
            console.error('[SendMessageModal] DM generation error:', err);
            // Fallback template
            setMessageContent(
                `Merhabalar ${candidate.name},\n\n` +
                `${candidate.position} pozisyonu için profilinizi inceledim ve ` +
                `tecrübelerinizin, özellikle ${(candidate.skills || ['genel yetkinlikleriniz'])[0]} ` +
                `konusundaki başarınızın çok uygun olduğunu gördüm.\n\n` +
                `Kısa bir görüşme için müsait olur musunuz?\n\n` +
                `İyi günler dilerim.`
            );
        } finally {
            setGenerating(false);
        }
    }

    async function handleApproveAndQueue() {
        if (!messageContent.trim()) {
            setError('Mesaj içeriği boş olamaz.');
            return;
        }

        setSaving(true);
        setError(null);

        try {
            // 1. Create the message in Firestore queue
            const messageId = await createMessage({
                candidateId: candidate.id || '',
                candidateName: candidate.name,
                candidatePosition: candidate.position,
                candidateEmail: candidate.email || '',
                candidateLinkedIn: candidate.linkedIn || '',
                messageContent: messageContent.trim(),
                jobDescription: '',
                aiGenerated: !!aiAnalysisResult?.personalizedMessage,
                createdBy: userId || '',
                matchScore: candidate.matchScore || null,
            });

            // 2. Immediately approve → ready_to_send
            await approveMessage(messageId, messageContent.trim());

            setSaved(true);

            // Notify parent
            onSent?.({
                messageId,
                candidateId: candidate.id,
                candidateName: candidate.name,
                status: MESSAGE_STATUS.READY_TO_SEND,
            });

            // Auto-close after success animation
            setTimeout(() => onClose?.(), 2000);
        } catch (err) {
            console.error('[SendMessageModal] Save error:', err);
            setError(err.message || 'Mesaj kaydedilirken bir hata oluştu.');
        } finally {
            setSaving(false);
        }
    }

    function handleCopy() {
        navigator.clipboard.writeText(messageContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    }

    function handleEdit() {
        setIsEditing(true);
        setTimeout(() => textareaRef.current?.focus(), 100);
    }

    if (!candidate) return null;

    return (
        <>
            {/* Overlay */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] animate-fade-in"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none">
                <div
                    className="bg-navy-900 border border-white/[0.08] rounded-2xl shadow-[0_32px_64px_rgba(0,0,0,0.5)] w-full max-w-lg max-h-[85vh] flex flex-col pointer-events-auto animate-fade-in-up overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >

                    {/* ===== HEADER ===== */}
                    <div className="shrink-0 p-5 border-b border-white/[0.06]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0077B5] to-[#00A0DC] flex items-center justify-center shadow-[0_0_16px_rgba(0,119,181,0.3)]">
                                    <Linkedin className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-white">Sales Navigator DM</h2>
                                    <p className="text-[11px] text-navy-400">Human-in-the-Loop Onay</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-navy-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Candidate info strip */}
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-electric to-violet-accent flex items-center justify-center text-sm font-bold text-white shrink-0">
                                {(candidate.name || 'Aday').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <User className="w-3.5 h-3.5 text-navy-500" />
                                    <span className="text-[13px] font-semibold text-navy-200 truncate">{candidate.name || 'İsimsiz Aday'}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <Briefcase className="w-3.5 h-3.5 text-navy-500" />
                                    <span className="text-[11px] text-navy-400 truncate">{candidate.position || 'Pozisyon Belirtilmemiş'}</span>
                                </div>
                            </div>
                            {candidate.matchScore && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-electric/10 shrink-0">
                                    <Target className="w-3.5 h-3.5 text-electric-light" />
                                    <span className="text-[12px] font-bold text-electric-light">%{candidate.matchScore}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ===== CONTENT ===== */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {/* Status bar */}
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5">
                                {generating ? (
                                    <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                                ) : (
                                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                                )}
                                <span className="text-[11px] font-semibold text-navy-400">
                                    {generating ? 'AI mesaj oluşturuyor...' : 'AI tarafından oluşturuldu'}
                                </span>
                            </div>
                            <div className="flex-1" />
                            <button
                                onClick={handleEdit}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-navy-400 hover:text-navy-200 hover:bg-white/[0.04] transition-all cursor-pointer"
                            >
                                <Edit3 className="w-3 h-3" />
                                Düzenle
                            </button>
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-navy-400 hover:text-navy-200 hover:bg-white/[0.04] transition-all cursor-pointer"
                            >
                                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                {copied ? 'Kopyalandı' : 'Kopyala'}
                            </button>
                        </div>

                        {/* Message content */}
                        {generating ? (
                            <div className="space-y-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <div className="skeleton h-4 w-4/5 rounded" />
                                <div className="skeleton h-4 w-full rounded" />
                                <div className="skeleton h-4 w-3/5 rounded" />
                                <div className="skeleton h-4 w-full rounded" />
                                <div className="skeleton h-4 w-2/5 rounded" />
                            </div>
                        ) : isEditing ? (
                            <textarea
                                ref={textareaRef}
                                value={messageContent}
                                onChange={(e) => setMessageContent(e.target.value)}
                                rows={10}
                                className="w-full px-4 py-3.5 rounded-xl bg-white/[0.04] border border-electric/20 text-[13px] text-navy-200 placeholder:text-navy-500 outline-none focus:border-electric/40 focus:ring-2 focus:ring-electric/10 transition-all resize-none leading-relaxed font-[inherit]"
                                placeholder="Mesajınızı yazın..."
                            />
                        ) : (
                            <div
                                className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] cursor-text hover:border-white/[0.1] transition-all"
                                onClick={handleEdit}
                            >
                                <p className="text-[13px] text-navy-200 leading-relaxed whitespace-pre-wrap">
                                    {messageContent}
                                </p>
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/10 animate-fade-in">
                                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                <span className="text-[12px] text-red-400">{error}</span>
                            </div>
                        )}

                        {/* Success state */}
                        {saved && (
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 animate-fade-in-up">
                                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div>
                                    <div className="text-[13px] font-semibold text-emerald-300">Mesaj Kuyruğa Eklendi!</div>
                                    <div className="text-[11px] text-navy-400 mt-0.5">
                                        Durum: <code className="text-emerald-400/80">ready_to_send</code> — Chrome Extension tarafından gönderilecek
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Info note */}
                        {!saved && (
                            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                <MessageSquare className="w-4 h-4 text-navy-500 shrink-0 mt-0.5" />
                                <div className="text-[11px] text-navy-500 leading-relaxed">
                                    <strong className="text-navy-400">Nasıl çalışır:</strong> Onayladığınız mesaj Firestore{' '}
                                    <code className="text-electric-light/60">messageQueue</code> koleksiyonuna{' '}
                                    <code className="text-electric-light/60">ready_to_send</code> durumunda kaydedilir.
                                    Chrome Extension bu kuyruğu dinleyerek mesajları LinkedIn Sales Navigator üzerinden gönderir.
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ===== FOOTER ===== */}
                    <div className="shrink-0 p-4 border-t border-white/[0.06] flex gap-3">
                        <button
                            onClick={onClose}
                            disabled={saving}
                            className="flex-1 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] font-semibold text-navy-300 hover:bg-white/[0.08] transition-all cursor-pointer disabled:opacity-50"
                        >
                            İptal
                        </button>
                        <button
                            onClick={handleApproveAndQueue}
                            disabled={saving || saved || generating || !messageContent.trim()}
                            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#0077B5] to-[#00A0DC] text-[13px] font-semibold text-white shadow-[0_4px_16px_rgba(0,119,181,0.3)] hover:shadow-[0_6px_24px_rgba(0,119,181,0.4)] hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {saving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : saved ? (
                                <CheckCircle className="w-4 h-4" />
                            ) : (
                                <Send className="w-4 h-4" />
                            )}
                            {saving ? 'Kaydediliyor...' : saved ? 'Gönderildi ✓' : 'Onayla & Kuyruğa Ekle'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
