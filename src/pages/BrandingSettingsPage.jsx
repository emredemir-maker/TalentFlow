// src/pages/BrandingSettingsPage.jsx
// Corporate branding settings — logo, company name, color, tagline

import { useState, useEffect, useRef } from 'react';
import { db, storage } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Building2, Upload, CheckCircle, Loader2, Palette, Globe, Type, Image, X, Eye } from 'lucide-react';

const BRANDING_PATH = 'artifacts/talent-flow/public/data/settings/branding';

const PRESET_COLORS = [
    '#1E3A8A', '#7C3AED', '#DC2626', '#059669',
    '#D97706', '#0891B2', '#BE185D', '#374151'
];

export default function BrandingSettingsPage() {
    const [branding, setBranding] = useState({
        companyName: '',
        logoUrl: '',
        primaryColor: '#1E3A8A',
        tagline: '',
        website: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [previewMode, setPreviewMode] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        const load = async () => {
            try {
                const snap = await getDoc(doc(db, BRANDING_PATH));
                if (snap.exists()) setBranding(prev => ({ ...prev, ...snap.data() }));
            } catch (e) {
                console.warn('Branding load error:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { alert('Lütfen bir görsel dosyası seçin.'); return; }
        if (file.size > 2 * 1024 * 1024) { alert('Logo dosyası 2MB\'dan küçük olmalıdır.'); return; }

        setUploadingLogo(true);
        try {
            const storageRef = ref(storage, `branding/logo_${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            setBranding(prev => ({ ...prev, logoUrl: url }));
        } catch (err) {
            alert('Logo yüklenemedi: ' + err.message);
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, BRANDING_PATH), branding, { merge: true });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            alert('Kayıt hatası: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-[#1E3A8A]" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-[#0F172A]">Kurumsal Kimlik</h2>
                    <p className="text-sm text-[#64748B] mt-0.5">
                        Gönderilen tüm e-postalarda kullanılacak kurumsal marka bilgilerinizi ayarlayın.
                    </p>
                </div>
                <button
                    onClick={() => setPreviewMode(p => !p)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
                >
                    <Eye className="w-4 h-4" />
                    {previewMode ? 'Düzenle' : 'Önizle'}
                </button>
            </div>

            {previewMode ? (
                /* EMAIL PREVIEW */
                <div className="border border-[#E2E8F0] rounded-2xl overflow-hidden">
                    <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-4 py-2.5 flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-400" />
                        <div className="w-3 h-3 rounded-full bg-yellow-400" />
                        <div className="w-3 h-3 rounded-full bg-green-400" />
                        <span className="ml-2 text-xs text-[#94A3B8]">E-posta Önizleme</span>
                    </div>
                    <div className="p-4 bg-[#F1F5F9]">
                        <div className="max-w-[500px] mx-auto bg-white rounded-xl overflow-hidden shadow-sm border border-[#E2E8F0]">
                            {/* Header */}
                            <div
                                className="px-8 py-6 text-center"
                                style={{ backgroundColor: branding.primaryColor }}
                            >
                                {branding.logoUrl ? (
                                    <img src={branding.logoUrl} alt="Logo" className="h-10 mx-auto mb-2 object-contain" />
                                ) : (
                                    <div className="inline-block bg-white/20 rounded-lg px-4 py-2 mb-2">
                                        <span className="text-white font-bold text-lg">{branding.companyName || 'Şirket Adı'}</span>
                                    </div>
                                )}
                                {branding.tagline && (
                                    <p className="text-white/70 text-xs">{branding.tagline}</p>
                                )}
                            </div>
                            {/* Body */}
                            <div className="p-6">
                                <h3 className="text-[#0F172A] font-bold text-base mb-2">Mülakat Davetiniz</h3>
                                <p className="text-[#475569] text-sm mb-4">Merhaba <strong>Aday Adı</strong>,<br/><br/>
                                    {branding.companyName || 'Şirketiniz'} İK ekibi olarak sizinle tanışmak isteriz.
                                </p>
                                <div
                                    className="rounded-r-xl p-4 mb-4"
                                    style={{
                                        backgroundColor: branding.primaryColor + '14',
                                        borderLeft: `4px solid ${branding.primaryColor}`
                                    }}
                                >
                                    <p className="text-[#64748B] text-xs font-bold uppercase tracking-wider mb-2">Mülakat Detayları</p>
                                    <p className="text-[#0F172A] text-sm">📅 Tarih: 25 Mart 2026</p>
                                    <p className="text-[#0F172A] text-sm">🕐 Saat: 14:00</p>
                                    <p className="text-[#0F172A] text-sm">🎯 Tür: Teknik Mülakat</p>
                                </div>
                                <div className="text-center">
                                    <span
                                        className="inline-block px-6 py-3 rounded-lg text-white text-sm font-bold"
                                        style={{ backgroundColor: branding.primaryColor }}
                                    >
                                        Mülakata Katıl →
                                    </span>
                                </div>
                            </div>
                            {/* Footer */}
                            <div className="bg-[#F8FAFC] border-t border-[#E2E8F0] px-6 py-3 text-center">
                                <p className="text-[#94A3B8] text-xs">
                                    Bu e-posta <strong style={{ color: branding.primaryColor }}>{branding.companyName || 'Şirketiniz'}</strong> tarafından gönderilmiştir.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* EDIT FORM */
                <div className="space-y-5">
                    {/* Logo Upload */}
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Image className="w-4 h-4 text-[#1E3A8A]" />
                            <h3 className="text-sm font-semibold text-[#0F172A]">Şirket Logosu</h3>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-center overflow-hidden flex-shrink-0">
                                {branding.logoUrl ? (
                                    <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                                ) : (
                                    <Building2 className="w-8 h-8 text-[#CBD5E1]" />
                                )}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm text-[#475569] mb-3">PNG, JPG veya SVG. Maksimum 2MB.</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploadingLogo}
                                        className="flex items-center gap-2 px-3 py-2 text-sm bg-[#1E3A8A] text-white rounded-lg hover:bg-[#1e3a8a]/90 transition-colors disabled:opacity-50"
                                    >
                                        {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                        {uploadingLogo ? 'Yükleniyor...' : 'Logo Yükle'}
                                    </button>
                                    {branding.logoUrl && (
                                        <button
                                            onClick={() => setBranding(p => ({ ...p, logoUrl: '' }))}
                                            className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" /> Kaldır
                                        </button>
                                    )}
                                </div>
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                            </div>
                        </div>
                    </div>

                    {/* Company Info */}
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Type className="w-4 h-4 text-[#1E3A8A]" />
                            <h3 className="text-sm font-semibold text-[#0F172A]">Şirket Bilgileri</h3>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1.5">
                                Şirket Adı *
                            </label>
                            <input
                                type="text"
                                value={branding.companyName}
                                onChange={e => setBranding(p => ({ ...p, companyName: e.target.value }))}
                                placeholder="örn: BTC Türk, Infoset, Talent-Inn"
                                className="w-full px-3 py-2.5 text-sm border border-[#E2E8F0] rounded-lg bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/20 focus:border-[#1E3A8A] transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1.5">
                                Slogan / Tagline
                            </label>
                            <input
                                type="text"
                                value={branding.tagline}
                                onChange={e => setBranding(p => ({ ...p, tagline: e.target.value }))}
                                placeholder="örn: Türkiye'nin Önde Gelen Kripto Para Platformu"
                                className="w-full px-3 py-2.5 text-sm border border-[#E2E8F0] rounded-lg bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/20 focus:border-[#1E3A8A] transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1.5">
                                Web Sitesi
                            </label>
                            <input
                                type="url"
                                value={branding.website}
                                onChange={e => setBranding(p => ({ ...p, website: e.target.value }))}
                                placeholder="https://www.sirketiniz.com"
                                className="w-full px-3 py-2.5 text-sm border border-[#E2E8F0] rounded-lg bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/20 focus:border-[#1E3A8A] transition-all"
                            />
                        </div>
                    </div>

                    {/* Brand Color */}
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Palette className="w-4 h-4 text-[#1E3A8A]" />
                            <h3 className="text-sm font-semibold text-[#0F172A]">Marka Rengi</h3>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            {PRESET_COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setBranding(p => ({ ...p, primaryColor: c }))}
                                    className="w-9 h-9 rounded-full border-2 transition-all hover:scale-110"
                                    style={{
                                        backgroundColor: c,
                                        borderColor: branding.primaryColor === c ? '#0F172A' : 'transparent',
                                        boxShadow: branding.primaryColor === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none'
                                    }}
                                />
                            ))}
                            <div className="flex items-center gap-2 ml-2">
                                <input
                                    type="color"
                                    value={branding.primaryColor}
                                    onChange={e => setBranding(p => ({ ...p, primaryColor: e.target.value }))}
                                    className="w-9 h-9 rounded-lg border border-[#E2E8F0] cursor-pointer"
                                    title="Özel renk seç"
                                />
                                <span className="text-xs text-[#64748B] font-mono">{branding.primaryColor}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Save Button */}
            {!previewMode && (
                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving || !branding.companyName.trim()}
                        className="flex items-center gap-2 px-5 py-2.5 bg-[#1E3A8A] text-white text-sm font-semibold rounded-xl hover:bg-[#1e3a8a]/90 transition-colors disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : null}
                        {saving ? 'Kaydediliyor...' : saved ? 'Kaydedildi!' : 'Değişiklikleri Kaydet'}
                    </button>
                </div>
            )}
        </div>
    );
}
