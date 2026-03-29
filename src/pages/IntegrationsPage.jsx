// src/pages/IntegrationsPage.jsx
// Admin Integration Hub — super_admin only
// Google Workspace ve Microsoft 365 için tam OAuth yapılandırma paneli.

import { useState, useEffect, useCallback } from 'react';
import {
    Plug, CheckCircle, AlertTriangle, Info, ChevronDown, ChevronRight,
    Eye, EyeOff, Save, Trash2, Copy, Shield,
    Users, Loader2, ExternalLink, Zap, Mail, Calendar, Video, Globe
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

const INTEGRATIONS_PATH = 'artifacts/talent-flow/public/data/settings/integrations';

// ─── ICONS ────────────────────────────────────────────────────────────────────
function GoogleIcon({ size = 22 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
    );
}

function MicrosoftIcon({ size = 20 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 23 23">
            <path fill="#f25022" d="M0 0h11v11H0z" />
            <path fill="#00a4ef" d="M12 0h11v11H12z" />
            <path fill="#7fba00" d="M0 12h11v11H0z" />
            <path fill="#ffb900" d="M12 12h11v11H12z" />
        </svg>
    );
}

function SlackIcon({ size = 20 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A" />
            <path d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A" />
            <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0" />
            <path d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0" />
            <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D" />
            <path d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D" />
            <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E" />
            <path d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E" />
        </svg>
    );
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const cfg = {
        configured:   { label: 'Yapılandırıldı',      bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400' },
        partial:      { label: 'Eksik Bilgi',          bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400' },
        unconfigured: { label: 'Yapılandırılmamış',    bg: 'bg-slate-50',   text: 'text-slate-500',   border: 'border-slate-200',   dot: 'bg-slate-300' },
        soon:         { label: 'Yakında',              bg: 'bg-violet-50',  text: 'text-violet-600',  border: 'border-violet-200',  dot: 'bg-violet-400' },
    };
    const c = cfg[status] || cfg.unconfigured;
    return (
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
            {c.label}
        </span>
    );
}

// ─── CONFIG FIELD ─────────────────────────────────────────────────────────────
function ConfigField({ label, hint, value, onChange, type = 'text', mono = false, readOnly = false, copyable = false }) {
    const [visible, setVisible] = useState(false);
    const [copied, setCopied] = useState(false);
    const isSecret = type === 'password';
    const showAs = isSecret && !visible ? 'password' : 'text';

    const handleCopy = () => {
        navigator.clipboard.writeText(value || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
            {hint && <p className="text-[10px] text-slate-400 mb-1.5 leading-relaxed">{hint}</p>}
            <div className="relative">
                <input
                    type={showAs}
                    value={value || ''}
                    onChange={e => onChange && onChange(e.target.value)}
                    readOnly={readOnly}
                    className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all
                        ${mono ? 'font-mono' : ''}
                        ${readOnly ? 'cursor-default text-slate-500 select-all' : 'focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 text-slate-700'}
                        ${(isSecret || copyable) ? 'pr-16' : 'pr-3.5'}`}
                    placeholder={readOnly ? '' : `${label} girin...`}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {isSecret && (
                        <button type="button" onClick={() => setVisible(v => !v)} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                    )}
                    {(copyable || readOnly) && (
                        <button type="button" onClick={handleCopy} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                            {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── INFO BOX ─────────────────────────────────────────────────────────────────
function InfoBox({ type = 'info', children }) {
    const s = {
        info:    { bg: 'bg-blue-50 border-blue-200',    icon: Info,          ic: 'text-blue-500',    tc: 'text-blue-800' },
        warning: { bg: 'bg-amber-50 border-amber-200',  icon: AlertTriangle, ic: 'text-amber-500',   tc: 'text-amber-800' },
        success: { bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle, ic: 'text-emerald-500', tc: 'text-emerald-800' },
    }[type];
    const Icon = s.icon;
    return (
        <div className={`flex gap-3 p-3.5 rounded-xl border my-3 ${s.bg}`}>
            <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${s.ic}`} />
            <p className={`text-xs leading-relaxed ${s.tc}`}>{children}</p>
        </div>
    );
}

// ─── INTEGRATION CARD ─────────────────────────────────────────────────────────
function IntegrationCard({ icon, name, subtitle, status, features, configContent, onSave, onRemove, saving, saved }) {
    const [expanded, setExpanded] = useState(false);
    const isComingSoon = status === 'soon';

    return (
        <div className={`bg-white rounded-2xl border transition-all duration-200 ${expanded ? 'border-slate-300 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}>
            <div
                className={`flex items-center gap-4 p-5 ${!isComingSoon ? 'cursor-pointer' : ''}`}
                onClick={() => !isComingSoon && setExpanded(v => !v)}
            >
                <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 shadow-sm">
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-800">{name}</span>
                        <StatusBadge status={status} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
                    {features && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {features.map((f, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-md">
                                    {f.icon} {f.label}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                {!isComingSoon && (
                    <div className="shrink-0">
                        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </div>
                )}
            </div>

            {expanded && !isComingSoon && (
                <div className="border-t border-slate-100 px-5 pb-5 pt-4">
                    {configContent}
                    {onSave && (
                        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-100">
                            <button
                                onClick={onSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 transition-all"
                            >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                {saving ? 'Kaydediliyor...' : 'Kaydet'}
                            </button>
                            {saved && (
                                <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                    <CheckCircle className="w-3.5 h-3.5" /> Kaydedildi
                                </span>
                            )}
                            {onRemove && (
                                <button
                                    onClick={onRemove}
                                    className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 border border-red-100 transition-all"
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> Yapılandırmayı Temizle
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── SETUP STEPS ─────────────────────────────────────────────────────────────
function SetupSteps({ steps, accent = 'bg-slate-200 text-slate-600' }) {
    return (
        <ol className="space-y-2">
            {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                    <span className={`w-4 h-4 rounded-full ${accent} flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5`}>{i + 1}</span>
                    <span className="text-[11px] text-slate-600 leading-relaxed">{step}</span>
                </li>
            ))}
        </ol>
    );
}

// ─── SCOPE TABLE ─────────────────────────────────────────────────────────────
function ScopeTable({ scopes }) {
    return (
        <div className="grid grid-cols-2 gap-1.5">
            {scopes.map(s => (
                <div key={s.scope} className="flex items-start gap-2 bg-white border border-slate-100 rounded-lg p-2">
                    <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                        <code className="text-[10px] font-mono text-violet-700 font-bold">{s.scope}</code>
                        <p className="text-[9px] text-slate-400">{s.desc}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
    const { user, userProfile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [configs, setConfigs] = useState({});

    // Google Workspace form state
    const [goog, setGoog] = useState({ clientId: '', clientSecret: '', enabled: true });
    const [googSaving, setGoogSaving] = useState(false);
    const [googSaved, setGoogSaved] = useState(false);

    // Microsoft 365 form state
    const [ms, setMs] = useState({ clientId: '', tenantId: '', clientSecret: '', enabled: true });
    const [msSaving, setMsSaving] = useState(false);
    const [msSaved, setMsSaved] = useState(false);

    // Redirect URIs auto-calculated
    const googleRedirectUri = `${window.location.origin}/auth/google/callback`;
    const msRedirectUri = `${window.location.origin}/auth/microsoft/callback`;

    // ── Load from Firestore ─────────────────────────────────────────────────
    const loadConfigs = useCallback(async () => {
        try {
            setLoading(true);
            const snap = await getDoc(doc(db, INTEGRATIONS_PATH));
            if (snap.exists()) {
                const data = snap.data();
                setConfigs(data);
                if (data.google) {
                    setGoog({
                        clientId: data.google.clientId || '',
                        clientSecret: data.google.clientSecret || '',
                        enabled: data.google.enabled !== false,
                    });
                }
                if (data.microsoft365) {
                    setMs({
                        clientId: data.microsoft365.clientId || '',
                        tenantId: data.microsoft365.tenantId || '',
                        clientSecret: data.microsoft365.clientSecret || '',
                        enabled: data.microsoft365.enabled !== false,
                    });
                }
            }
        } catch (err) {
            console.error('[IntegrationsPage] Load error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadConfigs(); }, [loadConfigs]);

    // ── Helpers ──────────────────────────────────────────────────────────────
    const notifyServer = async (provider, config) => {
        try {
            const idToken = await user.getIdToken();
            await fetch('/api/admin/integrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ provider, config })
            });
        } catch { /* non-fatal */ }
    };

    // ── Save Google ───────────────────────────────────────────────────────────
    const saveGoogle = async () => {
        if (!goog.clientId || !goog.clientSecret) {
            alert('Client ID ve Client Secret zorunludur.');
            return;
        }
        try {
            setGoogSaving(true);
            const payload = {
                google: {
                    clientId: goog.clientId.trim(),
                    clientSecret: goog.clientSecret.trim(),
                    redirectUri: googleRedirectUri,
                    enabled: goog.enabled,
                    configuredAt: new Date().toISOString(),
                    configuredBy: userProfile?.displayName || user?.email || 'admin',
                }
            };
            await setDoc(doc(db, INTEGRATIONS_PATH), payload, { merge: true });
            await notifyServer('google', payload.google);
            setConfigs(prev => ({ ...prev, ...payload }));
            setGoogSaved(true);
            setTimeout(() => setGoogSaved(false), 3000);
        } catch (err) {
            alert('Kayıt hatası: ' + err.message);
        } finally {
            setGoogSaving(false);
        }
    };

    const removeGoogle = async () => {
        if (!window.confirm('Google Workspace yapılandırmasını silmek istediğinizden emin misiniz?')) return;
        await setDoc(doc(db, INTEGRATIONS_PATH), { google: null }, { merge: true });
        setGoog({ clientId: '', clientSecret: '', enabled: true });
        setConfigs(prev => { const n = { ...prev }; delete n.google; return n; });
    };

    // ── Save Microsoft ────────────────────────────────────────────────────────
    const saveMicrosoft = async () => {
        if (!ms.clientId || !ms.tenantId || !ms.clientSecret) {
            alert('Client ID, Tenant ID ve Client Secret zorunludur.');
            return;
        }
        try {
            setMsSaving(true);
            const payload = {
                microsoft365: {
                    clientId: ms.clientId.trim(),
                    tenantId: ms.tenantId.trim(),
                    clientSecret: ms.clientSecret.trim(),
                    redirectUri: msRedirectUri,
                    enabled: ms.enabled,
                    configuredAt: new Date().toISOString(),
                    configuredBy: userProfile?.displayName || user?.email || 'admin',
                }
            };
            await setDoc(doc(db, INTEGRATIONS_PATH), payload, { merge: true });
            await notifyServer('microsoft365', payload.microsoft365);
            setConfigs(prev => ({ ...prev, ...payload }));
            setMsSaved(true);
            setTimeout(() => setMsSaved(false), 3000);
        } catch (err) {
            alert('Kayıt hatası: ' + err.message);
        } finally {
            setMsSaving(false);
        }
    };

    const removeMicrosoft = async () => {
        if (!window.confirm('Microsoft 365 yapılandırmasını silmek istediğinizden emin misiniz?')) return;
        await setDoc(doc(db, INTEGRATIONS_PATH), { microsoft365: null }, { merge: true });
        setMs({ clientId: '', tenantId: '', clientSecret: '', enabled: true });
        setConfigs(prev => { const n = { ...prev }; delete n.microsoft365; return n; });
    };

    const googStatus = configs.google?.clientId
        ? (configs.google?.clientSecret ? 'configured' : 'partial')
        : 'unconfigured';

    const msStatus = configs.microsoft365?.clientId
        ? (configs.microsoft365?.tenantId && configs.microsoft365?.clientSecret ? 'configured' : 'partial')
        : 'unconfigured';

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="flex items-center gap-3 text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Entegrasyonlar yükleniyor...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
                        <Plug className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-slate-900 leading-none">Entegrasyon Merkezi</h1>
                        <p className="text-[11px] text-slate-400 mt-0.5">Dış servis bağlantılarını yönetin</p>
                    </div>
                    <span className="ml-auto text-[10px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Shield className="w-3 h-3" /> Süper Admin
                    </span>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

                {/* Taşınabilirlik Notu */}
                <div className="flex gap-3 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                    <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-bold text-blue-800 mb-0.5">Platform Bağımsız Yapılandırma</p>
                        <p className="text-xs text-blue-700 leading-relaxed">
                            Her iki entegrasyon da kendi OAuth credentials'larınızla yapılandırılır. Bu sayede uygulamayı farklı bir sunucuya veya kuruluşa deploy ettiğinizde sadece bu panelden kimlik bilgilerini güncelleyerek çalışmaya devam eder.
                        </p>
                    </div>
                </div>

                {/* Güvenlik Uyarısı */}
                <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                        <strong>Güvenlik:</strong> Client Secret değerleri Firestore'da saklanır. Yalnızca Süper Admin erişebilir. Üretim ortamında ek şifreleme katmanı önerilir.
                    </p>
                </div>

                {/* Aktif Entegrasyonlar */}
                <div>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Yapılandırılabilir Entegrasyonlar</h2>
                    <div className="space-y-3">

                        {/* ── Google Workspace ─── */}
                        <IntegrationCard
                            icon={<GoogleIcon size={24} />}
                            name="Google Workspace"
                            subtitle="Gmail, Google Calendar & Google Meet"
                            status={googStatus}
                            features={[
                                { icon: <Mail className="w-3 h-3" />, label: 'Gmail' },
                                { icon: <Calendar className="w-3 h-3" />, label: 'Takvim' },
                                { icon: <Video className="w-3 h-3" />, label: 'Meet' },
                            ]}
                            onSave={saveGoogle}
                            onRemove={googStatus !== 'unconfigured' ? removeGoogle : undefined}
                            saving={googSaving}
                            saved={googSaved}
                            configContent={
                                <div className="space-y-4">
                                    <InfoBox type="info">
                                        Google Cloud Console'da bir OAuth 2.0 istemci oluşturun ve aşağıdaki Redirect URI'yi "Yetkili yönlendirme URI'leri" listesine ekleyin.
                                    </InfoBox>

                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                        <p className="text-xs font-bold text-slate-600 mb-3 flex items-center gap-1.5">
                                            <Zap className="w-3.5 h-3.5 text-amber-500" /> Google Cloud Console Kurulum Adımları
                                        </p>
                                        <SetupSteps
                                            accent="bg-blue-100 text-blue-700"
                                            steps={[
                                                'Google Cloud Console → APIs & Services → Credentials',
                                                '"Create Credentials" → "OAuth client ID" seçin',
                                                'Application type: "Web application" seçin',
                                                'Authorized redirect URIs bölümüne aşağıdaki URL\'yi ekleyin',
                                                'Gmail API ve Google Calendar API\'yi etkinleştirin',
                                                'OAuth consent screen\'i "External" veya "Internal" olarak yapılandırın',
                                            ]}
                                        />
                                    </div>

                                    <ConfigField
                                        label="Redirect URI (Google Console'a kaydedin)"
                                        hint="Bu URL'yi Google Cloud Console → OAuth client → Authorized redirect URIs bölümüne ekleyin."
                                        value={googleRedirectUri}
                                        readOnly={true}
                                        mono={true}
                                        copyable={true}
                                    />

                                    <div className="grid grid-cols-1 gap-3">
                                        <ConfigField
                                            label="Client ID"
                                            hint="Google Cloud Console → Credentials → OAuth 2.0 Client IDs → Client ID"
                                            value={goog.clientId}
                                            onChange={v => setGoog(p => ({ ...p, clientId: v }))}
                                            mono={true}
                                        />
                                        <ConfigField
                                            label="Client Secret"
                                            hint="Google Cloud Console → Credentials → OAuth 2.0 Client IDs → Client Secret"
                                            value={goog.clientSecret}
                                            onChange={v => setGoog(p => ({ ...p, clientSecret: v }))}
                                            type="password"
                                            mono={true}
                                        />
                                    </div>

                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                        <p className="text-xs font-bold text-slate-600 mb-3">Gerekli OAuth Scopes</p>
                                        <ScopeTable scopes={[
                                            { scope: 'gmail.modify',     desc: 'Gmail okuma & gönderme' },
                                            { scope: 'calendar.events',  desc: 'Etkinlik oluşturma/okuma' },
                                            { scope: 'userinfo.email',   desc: 'Kullanıcı e-postası' },
                                            { scope: 'userinfo.profile', desc: 'Kullanıcı profili' },
                                            { scope: 'offline_access',   desc: 'Refresh token (openid)' },
                                            { scope: 'openid',           desc: 'Kimlik doğrulama' },
                                        ]} />
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-semibold hover:underline">
                                            Google Cloud Console <ExternalLink className="w-3 h-3" />
                                        </a>
                                        <span className="text-slate-300">·</span>
                                        <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-semibold hover:underline">
                                            Gmail API <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>

                                    {googStatus === 'configured' && (
                                        <InfoBox type="success">
                                            Google Workspace yapılandırması tamamlandı. Kullanıcılar <strong>Ayarlar → Hesabım</strong> bölümünden Google hesaplarını bağlayabilir.
                                        </InfoBox>
                                    )}

                                    {configs.google?.configuredAt && (
                                        <p className="text-[10px] text-slate-400">
                                            Son güncelleme: {new Date(configs.google.configuredAt).toLocaleString('tr-TR')} · {configs.google.configuredBy}
                                        </p>
                                    )}
                                </div>
                            }
                        />

                        {/* ── Microsoft 365 ─── */}
                        <IntegrationCard
                            icon={<MicrosoftIcon size={22} />}
                            name="Microsoft 365"
                            subtitle="Outlook Mail, Outlook Calendar & Microsoft Teams"
                            status={msStatus}
                            features={[
                                { icon: <Mail className="w-3 h-3" />, label: 'Outlook' },
                                { icon: <Calendar className="w-3 h-3" />, label: 'Takvim' },
                                { icon: <Video className="w-3 h-3" />, label: 'Teams' },
                            ]}
                            onSave={saveMicrosoft}
                            onRemove={msStatus !== 'unconfigured' ? removeMicrosoft : undefined}
                            saving={msSaving}
                            saved={msSaved}
                            configContent={
                                <div className="space-y-4">
                                    <InfoBox type="info">
                                        Microsoft Azure AD'de bir uygulama kaydı oluşturun ve aşağıdaki Redirect URI'yi "Yetkilendirme redirect URI'leri" listesine ekleyin.
                                    </InfoBox>

                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                        <p className="text-xs font-bold text-slate-600 mb-3 flex items-center gap-1.5">
                                            <Zap className="w-3.5 h-3.5 text-amber-500" /> Azure AD Kurulum Adımları
                                        </p>
                                        <SetupSteps
                                            accent="bg-slate-200 text-slate-600"
                                            steps={[
                                                'Azure Portal → Microsoft Entra ID → Uygulama kayıtları',
                                                '"Yeni kayıt" ile yeni bir uygulama oluşturun',
                                                'Desteklenen hesap türleri: Herhangi bir kuruluş + kişisel hesaplar',
                                                'Redirect URI olarak aşağıdaki URL\'yi Web türünde ekleyin',
                                                'Gerekli API izinlerini ekleyin: User.Read, Calendars.ReadWrite, Mail.Send',
                                                '"Sertifikalar ve Gizlilikler" bölümünden yeni bir Client Secret oluşturun',
                                            ]}
                                        />
                                    </div>

                                    <ConfigField
                                        label="Redirect URI (Azure'a kaydedin)"
                                        hint="Bu URL'yi Azure AD → Uygulamanız → Kimlik Doğrulama → Redirect URIs bölümüne ekleyin."
                                        value={msRedirectUri}
                                        readOnly={true}
                                        mono={true}
                                        copyable={true}
                                    />

                                    <div className="grid grid-cols-1 gap-3">
                                        <ConfigField
                                            label="Application (Client) ID"
                                            hint="Azure AD → Uygulamanız → Genel Bakış → Uygulama (istemci) kimliği"
                                            value={ms.clientId}
                                            onChange={v => setMs(p => ({ ...p, clientId: v }))}
                                            mono={true}
                                        />
                                        <ConfigField
                                            label="Directory (Tenant) ID"
                                            hint="'common' yazabilirsiniz (tüm hesaplar) veya kuruluşunuza özgü Tenant ID girin."
                                            value={ms.tenantId}
                                            onChange={v => setMs(p => ({ ...p, tenantId: v }))}
                                            mono={true}
                                        />
                                        <ConfigField
                                            label="Client Secret"
                                            hint="Azure AD → Uygulamanız → Sertifikalar ve Gizlilikler → Yeni istemci gizli anahtarı"
                                            value={ms.clientSecret}
                                            onChange={v => setMs(p => ({ ...p, clientSecret: v }))}
                                            type="password"
                                            mono={true}
                                        />
                                    </div>

                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                        <p className="text-xs font-bold text-slate-600 mb-3">Gerekli API İzinleri (Delegated)</p>
                                        <ScopeTable scopes={[
                                            { scope: 'User.Read',                desc: 'Kullanıcı profili' },
                                            { scope: 'Mail.Send',                desc: 'Outlook e-posta gönderme' },
                                            { scope: 'Calendars.ReadWrite',      desc: 'Takvim oluşturma/okuma' },
                                            { scope: 'OnlineMeetings.ReadWrite', desc: 'Teams toplantısı oluşturma' },
                                            { scope: 'offline_access',           desc: 'Refresh token alımı' },
                                            { scope: 'openid + profile',         desc: 'Kimlik doğrulama' },
                                        ]} />
                                    </div>

                                    {msStatus === 'configured' && (
                                        <InfoBox type="success">
                                            Microsoft 365 yapılandırması tamamlandı. Kullanıcılar <strong>Ayarlar → Hesabım</strong> bölümünden Microsoft hesaplarını bağlayabilir.
                                        </InfoBox>
                                    )}

                                    {configs.microsoft365?.configuredAt && (
                                        <p className="text-[10px] text-slate-400">
                                            Son güncelleme: {new Date(configs.microsoft365.configuredAt).toLocaleString('tr-TR')} · {configs.microsoft365.configuredBy}
                                        </p>
                                    )}
                                </div>
                            }
                        />
                    </div>
                </div>

                {/* Yakında */}
                <div>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Yakında</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                            {
                                icon: <SlackIcon size={22} />,
                                name: 'Slack',
                                desc: 'Mülakat bildirimleri ve aday güncellemelerini Slack kanalına gönderin.',
                                chips: ['Bildirimler', 'Botlar'],
                            },
                            {
                                icon: <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center"><Users className="w-4 h-4 text-white" /></div>,
                                name: 'LinkedIn',
                                desc: 'Aday profillerini LinkedIn üzerinden otomatik içe aktarın.',
                                chips: ['Aday Arama', 'Profil İçe Aktarma'],
                            },
                            {
                                icon: <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center"><Globe className="w-4 h-4 text-white" /></div>,
                                name: 'Greenhouse / Workday',
                                desc: 'ATS çift yönlü entegrasyonu ile mevcut İK sistemlerinize bağlanın.',
                                chips: ['ATS Sync', 'Webhook'],
                            },
                        ].map((item, i) => (
                            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 opacity-70">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">{item.icon}</div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-700">{item.name}</p>
                                        <StatusBadge status="soon" />
                                    </div>
                                </div>
                                <p className="text-[11px] text-slate-400 leading-relaxed mb-3">{item.desc}</p>
                                <div className="flex flex-wrap gap-1">
                                    {item.chips.map(c => (
                                        <span key={c} className="text-[9px] bg-slate-50 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded-md">{c}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="text-center text-[10px] text-slate-400 pb-6">
                    Entegrasyon Merkezi · Talent-Inn v2 · Yalnızca Süper Admin erişimi
                </p>
            </div>
        </div>
    );
}
