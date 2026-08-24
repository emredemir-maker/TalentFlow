// "Değerlendirmeye Gönder" — seçili adayları uyum skoru + pozisyon uyum
// analizi + kariyer özeti + detay kart derin-linkiyle iş arkadaşlarına
// e-postalar. Gönderim, kullanıcının Entegrasyonlar'dan bağladığı Google
// hesabı üzerinden (Gmail API) yapılır — yani mail KULLANICININ KENDİ
// adresinden çıkar. Google bağlı değilse içerik panoya kopyalanabilir.
import { useState } from 'react';
import { X, Mail, Loader2, AlertTriangle, Copy, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sendDirectEmail } from '../services/integrationService';
import { calculateMatchScore } from '../services/matchService';
import { prepareEvaluationRows, buildEvaluationEmail } from '../utils/evaluationEmail';

export default function EvaluationEmailModal({ isOpen, onClose, candidates, openPositions, onSent }) {
    const { user, userProfile } = useAuth();
    const [to, setTo] = useState('');
    const [note, setNote] = useState('Merhaba, aşağıdaki adayları birlikte değerlendirelim. Görüşlerinizi bekliyorum.');
    const [includeTable, setIncludeTable] = useState(true);
    const [includeLinks, setIncludeLinks] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const googleConnected = Boolean(userProfile?.integrations?.google?.connected);
    const googleToken = userProfile?.integrations?.google?.accessToken;
    const recipients = to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const canSend = googleConnected && recipients.length > 0 && (includeTable || includeLinks) && !sending;

    const buildEmail = () => {
        const rows = prepareEvaluationRows(candidates, openPositions, (c, p) => calculateMatchScore(c, p).score);
        return buildEvaluationEmail({
            rows,
            note,
            appUrl: window.location.origin,
            includeTable,
            includeLinks,
            senderName: user?.displayName || user?.email || '',
        });
    };

    const handleSend = async () => {
        if (!canSend) return;
        setSending(true);
        setError(null);
        try {
            const email = buildEmail();
            const result = await sendDirectEmail(user.uid, googleToken, {
                to: recipients.join(', '),
                subject: email.subject,
                body: email.text,
                html: email.html,
            });
            if (!result.success) throw new Error(result.error || 'E-posta gönderilemedi.');
            onSent?.(`${candidates.length} adaylık değerlendirme e-postası ${recipients.length} alıcıya gönderildi`);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    };

    // Google bağlı değilse (ya da farklı bir istemciden gönderilmek istenirse)
    // içerik HTML olarak panoya kopyalanır — herhangi bir e-posta istemcisine
    // yapıştırılabilir.
    const handleCopy = async () => {
        setError(null);
        try {
            const email = buildEmail();
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': new Blob([email.html], { type: 'text/html' }),
                        'text/plain': new Blob([email.text], { type: 'text/plain' }),
                    }),
                ]);
            } catch {
                await navigator.clipboard.writeText(email.text);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            setError('Panoya kopyalanamadı — tarayıcı izni gerekebilir.');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={sending ? undefined : onClose} />
            <div className="relative w-full max-w-lg bg-white rounded-2xl border border-slate-100 shadow-2xl p-3.5 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-[#13294E] flex items-center justify-center">
                            <Mail className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-[13px] font-black text-slate-900">Değerlendirmeye Gönder</h3>
                            <p className="text-[10px] text-slate-400 font-bold">{candidates.length} aday · e-posta sizin hesabınızdan çıkar</p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={sending} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Alıcılar</label>
                        <input
                            type="text"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            placeholder="ornek@sirket.com, ik@sirket.com"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-blue-300 transition-all"
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Notunuz</label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={2}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-blue-300 transition-all resize-none"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={includeTable} onChange={(e) => setIncludeTable(e.target.checked)} className="w-3.5 h-3.5 accent-[#13294E]" />
                            Uyum analizi ve kariyer özeti
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={includeLinks} onChange={(e) => setIncludeLinks(e.target.checked)} className="w-3.5 h-3.5 accent-[#13294E]" />
                            Detay kart linkleri
                        </label>
                    </div>

                    <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                            E-posta aday kişisel verisi içerir — yalnızca kurum içine gönderin. Detay linkleri giriş ve yetki
                            gerektirir; alıcı departman kullanıcısıysa adayları önce "Departmana Aç" ile görünür yapın.
                        </span>
                    </div>

                    {!googleConnected && (
                        <div className="text-[11px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                            Google hesabınız bağlı değil — kendi adresinizden göndermek için Ayarlar → Entegrasyonlar'dan
                            Google'ı bağlayın. Şimdilik içeriği kopyalayıp kendi e-posta istemcinize yapıştırabilirsiniz.
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center gap-2 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
                        </div>
                    )}
                </div>

                <div className="mt-4 flex gap-2">
                    <button
                        onClick={handleCopy}
                        disabled={sending || (!includeTable && !includeLinks)}
                        className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
                    >
                        {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Kopyalandı' : 'Panoya Kopyala'}
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={!canSend}
                        className="flex-[2] py-2.5 rounded-xl bg-[#13294E] hover:bg-[#1E3A6E] text-white text-[11px] font-black disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                        {sending ? 'Gönderiliyor…' : 'Gönder'}
                    </button>
                </div>
            </div>
        </div>
    );
}
