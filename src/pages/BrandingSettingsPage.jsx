// src/pages/BrandingSettingsPage.jsx
// Corporate branding settings — logo, company name, color, tagline

import { useState, useEffect, useRef } from 'react';
import { db, storage } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Building2, Upload, CheckCircle, Loader2, Palette, Globe, Type, Image, X, Eye, Target } from 'lucide-react';

import { SECTOR_OPTIONS, MODEL_OPTIONS, TYPE_OPTIONS } from '../utils/sectorTaxonomy';
import { ORG_PROFILE_FIELD } from '../services/orgProfile';

const BRANDING_PATH = 'artifacts/talent-flow/public/data/settings/branding';

const PRESET_COLORS = [
    '#13294E', '#7C3AED', '#DC2626', '#059669',
    '#D97706', '#0891B2', '#BE185D', '#374151'
];

export default function BrandingSettingsPage() {
    const [branding, setBranding] = useState({
        companyName: '',
        logoUrl: '',
        primaryColor: '#13294E',
        tagline: '',
        website: '',
        // Sektör uyumu ölçümünün HEDEFİ (utils/sectorFit.js). Boş eksen
        // uydurulmaz: tanımsız kalırsa ölçüm "hedef yok" der, sıfır uyum demez.
        [ORG_PROFILE_FIELD]: { sector: null, model: null, type: null },
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
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-n900">Kurumsal Kimlik</h2>
                    <p className="text-sm text-n500 mt-0.5">
                        Gönderilen tüm e-postalarda kullanılacak kurumsal marka bilgilerinizi ayarlayın.
                    </p>
                </div>
                <button
                    onClick={() => setPreviewMode(p => !p)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-n200 text-n500 hover:bg-n25 transition-colors"
                >
                    <Eye className="w-4 h-4" />
                    {previewMode ? 'Düzenle' : 'Önizle'}
                </button>
            </div>

            {previewMode ? (
                /* EMAIL PREVIEW */
                <div className="border border-n200 rounded-[14px] overflow-hidden">
                    <div className="bg-n25 border-b border-n200 px-4 py-2.5 flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-bad" />
                        <div className="w-3 h-3 rounded-full bg-warn" />
                        <div className="w-3 h-3 rounded-full bg-ok" />
                        <span className="ml-2 text-xs text-n400">E-posta Önizleme</span>
                    </div>
                    <div className="p-3 bg-n100">
                        <div className="max-w-[500px] mx-auto bg-n0 rounded-md overflow-hidden shadow-sm border border-n200">
                            {/* Header */}
                            <div
                                className="px-8 py-6 text-center"
                                style={{ backgroundColor: branding.primaryColor }}
                            >
                                {branding.logoUrl ? (
                                    <img src={branding.logoUrl} alt="Logo" className="h-10 mx-auto mb-2 object-contain" />
                                ) : (
                                    <div className="inline-block bg-n0/20 rounded-md px-4 py-2 mb-2">
                                        <span className="text-white font-semibold text-lg">{branding.companyName || 'Şirket Adı'}</span>
                                    </div>
                                )}
                                {branding.tagline && (
                                    <p className="text-white/70 text-xs">{branding.tagline}</p>
                                )}
                            </div>
                            {/* Body */}
                            <div className="p-6">
                                <h3 className="text-n900 font-semibold text-base mb-2">Mülakat Davetiniz</h3>
                                <p className="text-n600 text-sm mb-4">Merhaba <strong>Aday Adı</strong>,<br/><br/>
                                    {branding.companyName || 'Şirketiniz'} İK ekibi olarak sizinle tanışmak isteriz.
                                </p>
                                <div
                                    className="rounded-r-xl p-3 mb-4"
                                    style={{
                                        backgroundColor: branding.primaryColor + '14',
                                        borderLeft: `4px solid ${branding.primaryColor}`
                                    }}
                                >
                                    <p className="text-n500 text-xs font-semibold uppercase tracking-[0.08em] mb-2">Mülakat Detayları</p>
                                    <p className="text-n900 text-sm">📅 Tarih: 25 Mart 2026</p>
                                    <p className="text-n900 text-sm">🕐 Saat: 14:00</p>
                                    <p className="text-n900 text-sm">🎯 Tür: Teknik Mülakat</p>
                                </div>
                                <div className="text-center">
                                    <span
                                        className="inline-block px-6 py-3 rounded-md text-white text-sm font-semibold"
                                        style={{ backgroundColor: branding.primaryColor }}
                                    >
                                        Mülakata Katıl →
                                    </span>
                                </div>
                            </div>
                            {/* Footer */}
                            <div className="bg-n25 border-t border-n200 px-6 py-3 text-center">
                                <p className="text-n400 text-xs">
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
                    <div className="bg-n0 border border-n200 rounded-[14px] p-3.5">
                        <div className="flex items-center gap-2 mb-4">
                            <Image className="w-4 h-4 text-brand" />
                            <h3 className="text-sm font-semibold text-n900">Şirket Logosu</h3>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-20 h-20 rounded-md border-2 border-dashed border-n200 bg-n25 flex items-center justify-center overflow-hidden flex-shrink-0">
                                {branding.logoUrl ? (
                                    <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                                ) : (
                                    <Building2 className="w-8 h-8 text-n300" />
                                )}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm text-n600 mb-3">PNG, JPG veya SVG. Maksimum 2MB.</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploadingLogo}
                                        className="flex items-center gap-2 px-3 py-2 text-sm bg-brand text-white rounded-md hover:bg-brand/90 transition-colors disabled:opacity-50"
                                    >
                                        {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                        {uploadingLogo ? 'Yükleniyor...' : 'Logo Yükle'}
                                    </button>
                                    {branding.logoUrl && (
                                        <button
                                            onClick={() => setBranding(p => ({ ...p, logoUrl: '' }))}
                                            className="flex items-center gap-1.5 px-3 py-2 text-sm text-bad border border-transparent rounded-md hover:bg-bad-bg transition-colors"
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
                    <div className="bg-n0 border border-n200 rounded-[14px] p-3.5 space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Type className="w-4 h-4 text-brand" />
                            <h3 className="text-sm font-semibold text-n900">Şirket Bilgileri</h3>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-n500 uppercase tracking-[0.08em] mb-1.5">
                                Şirket Adı *
                            </label>
                            <input
                                type="text"
                                value={branding.companyName}
                                onChange={e => setBranding(p => ({ ...p, companyName: e.target.value }))}
                                placeholder="örn: BTC Türk, Infoset, Talent-Inn"
                                className="w-full px-3 py-2.5 text-sm border border-n200 rounded-md bg-n25 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-n500 uppercase tracking-[0.08em] mb-1.5">
                                Slogan / Tagline
                            </label>
                            <input
                                type="text"
                                value={branding.tagline}
                                onChange={e => setBranding(p => ({ ...p, tagline: e.target.value }))}
                                placeholder="örn: Türkiye'nin Önde Gelen Kripto Para Platformu"
                                className="w-full px-3 py-2.5 text-sm border border-n200 rounded-md bg-n25 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-n500 uppercase tracking-[0.08em] mb-1.5">
                                Web Sitesi
                            </label>
                            <input
                                type="url"
                                value={branding.website}
                                onChange={e => setBranding(p => ({ ...p, website: e.target.value }))}
                                placeholder="https://www.sirketiniz.com"
                                className="w-full px-3 py-2.5 text-sm border border-n200 rounded-md bg-n25 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                            />
                        </div>
                    </div>

                    {/* Brand Color */}
                    <div className="bg-n0 border border-n200 rounded-[14px] p-3.5">
                        <div className="flex items-center gap-2 mb-4">
                            <Palette className="w-4 h-4 text-brand" />
                            <h3 className="text-sm font-semibold text-n900">Marka Rengi</h3>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
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
                                    className="w-9 h-9 rounded-md border border-n200 cursor-pointer"
                                    title="Özel renk seç"
                                />
                                <span className="text-xs text-n500 font-mono">{branding.primaryColor}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── SEKTÖR PROFİLİ ───────────────────────────────────────────────
                Adayların sektör deneyimi BUNA göre ölçülüyor. Üç eksen ayrı
                duruyor çünkü tek başına "sektör" yanıltıyor: bir B2C pazaryeri
                ile bir B2B SaaS aynı dikeyde sayılabilir ama işe alımda ayırt
                eden çoğu zaman kime ve nasıl satıldığı. */}
            {!previewMode && (
                <div className="border border-n200 rounded-[14px] p-3.5 space-y-4">
                    <div className="flex items-start gap-2">
                        <Target className="w-5 h-5 text-brand mt-0.5 shrink-0" />
                        <div>
                            <h3 className="text-sm font-semibold text-n900">Sektör Profili</h3>
                            <p className="text-xs text-n500 mt-0.5">
                                Adayların sektör deneyimi bu profile göre ölçülür. Boş bıraktığınız eksen
                                ölçüme girmez — tahmin edilmez.
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        {[
                            { key: 'sector', label: 'Faaliyet alanı', options: SECTOR_OPTIONS, hint: 'Hangi dikey alanda çalışıyorsunuz' },
                            { key: 'model', label: 'İş modeli', options: MODEL_OPTIONS, hint: 'Kime satıyorsunuz' },
                            { key: 'type', label: 'Gelir modeli', options: TYPE_OPTIONS, hint: 'Nasıl para kazanıyorsunuz' },
                        ].map(({ key, label, options, hint }) => (
                            <div key={key}>
                                <label htmlFor={`sector-${key}`} className="block text-xs font-semibold text-n700 mb-1.5">
                                    {label}
                                </label>
                                <select
                                    id={`sector-${key}`}
                                    value={branding[ORG_PROFILE_FIELD]?.[key] || ''}
                                    onChange={e => setBranding(p => ({
                                        ...p,
                                        [ORG_PROFILE_FIELD]: {
                                            ...(p[ORG_PROFILE_FIELD] || {}),
                                            [key]: e.target.value || null,
                                        },
                                    }))}
                                    className="w-full px-3 py-2 text-sm rounded-md border border-n200 bg-n0 text-n900 focus:outline-none focus:ring-2 focus:ring-brand/20"
                                >
                                    <option value="">Belirtilmemiş</option>
                                    {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                </select>
                                <p className="text-[10px] text-n400 mt-1">{hint}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Save Button */}
            {!previewMode && (
                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving || !branding.companyName.trim()}
                        className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-semibold rounded-md hover:bg-brand/90 transition-colors disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : null}
                        {saving ? 'Kaydediliyor...' : saved ? 'Kaydedildi!' : 'Değişiklikleri Kaydet'}
                    </button>
                </div>
            )}
        </div>
    );
}
