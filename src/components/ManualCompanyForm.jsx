// ELLE ŞİRKET DOĞRULAMA FORMU.
//
// Otomatik arama bir şirketi bulamadığında İK'nın elindeki bilgiyi sisteme
// yazdığı yer. Gerekçe ve kanıt gücü tartışması: utils/manualCompanyIntel.js
//
// ── FORMUN TAŞIMAK ZORUNDA OLDUĞU İKİ CÜMLE ────────────────────────────────
// 1. Bu kayıt ŞİRKETİN altında durur: aynı şirketi taşıyan her adayı etkiler.
// 2. Bu kayıt "aday burada çalıştı" demez; şirketin var olduğunu söyler.
//
// Alanların hiçbiri zorunlu değil ama EN AZ BİRİ dolu olmak zorunda: hiçbir
// bilgi vermeden "doğrulandı" işaretlemek, raporda kanıtsız bir hüküm
// üretirdi.

import { useState } from 'react';
import { Loader2, Save, Trash2, X, Info } from 'lucide-react';

import {
    MANUAL_SIZE_BANDS,
    hasManualEvidence,
    normalizeWebsite,
    normalizeFoundedYear,
} from '../utils/manualCompanyIntel';
import { SECTOR_OPTIONS, MODEL_OPTIONS, TYPE_OPTIONS } from '../utils/sectorTaxonomy';

const BOS_FORM = {
    website: '',
    foundedYear: '',
    sizeBand: '',
    sector: '',
    model: '',
    type: '',
    sectorRaw: '',
    headquarters: '',
    note: '',
};

const alanCls = 'w-full bg-n0 border border-n200 rounded-md px-2.5 py-1.5 text-[12px] text-n700 outline-none focus:border-brand';
const etiketCls = 'text-[10px] font-semibold text-n400 uppercase tracking-[0.08em] block mb-1';

function Alan({ label, hint = '', children }) {
    return (
        <label className="block">
            <span className={etiketCls}>{label}</span>
            {children}
            {hint && <span className="text-[10px] text-n400 mt-1 block leading-relaxed">{hint}</span>}
        </label>
    );
}

/**
 * @param {object} props
 * @param {string} props.company — şirketin CV'deki adı
 * @param {object|null} props.initial — düzenleme için mevcut form değerleri
 * @param {(form: object) => Promise<void>} props.onSave
 * @param {(() => Promise<void>)|null} props.onRemove — yalnızca kayıtlı iken
 * @param {() => void} props.onCancel
 */
export default function ManualCompanyForm({ company, initial = null, onSave, onRemove = null, onCancel }) {
    const [form, setForm] = useState({ ...BOS_FORM, ...(initial || {}) });
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [error, setError] = useState('');

    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    // Adres yazılmış ama çözümlenemiyorsa kullanıcıya SESSİZ KALINMAZ:
    // kaydedip sonra "kaynak yok" görmek, yazdığının kaybolduğunu anlamayı
    // imkânsız kılardı.
    const adresYazildi = String(form.website || '').trim().length > 0;
    const adresGecerli = Boolean(normalizeWebsite(form.website));
    const yilYazildi = String(form.foundedYear || '').trim().length > 0;
    const yilGecerli = normalizeFoundedYear(form.foundedYear) !== null;
    const yeterliBilgi = hasManualEvidence(form);
    const kaydedilebilir = yeterliBilgi
        && (!adresYazildi || adresGecerli)
        && (!yilYazildi || yilGecerli)
        && !saving && !removing;

    const kaydet = async () => {
        setSaving(true);
        setError('');
        try {
            await onSave(form);
        } catch (err) {
            setError(err?.message || 'Kaydedilemedi.');
        } finally {
            setSaving(false);
        }
    };

    const kaldir = async () => {
        setRemoving(true);
        setError('');
        try {
            await onRemove();
        } catch (err) {
            setError(err?.message || 'Kaldırılamadı.');
        } finally {
            setRemoving(false);
        }
    };

    return (
        <div className="mt-3 border-t border-n200 pt-3 space-y-3">
            <div className="bg-brand-50 rounded-md p-2.5 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-brand mt-0.5 shrink-0" />
                <p className="text-[11px] text-n700 leading-relaxed">
                    Bu bilgi <strong>{company}</strong> şirketinin altına kaydedilir ve bu şirketi
                    CV&apos;sinde taşıyan diğer adaylarda da görünür. Kayıt, adayın orada çalıştığını
                    değil <strong>şirketin var olduğunu</strong> belgeler.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="sm:col-span-2">
                    <Alan
                        label="Web sitesi"
                        hint={adresYazildi && !adresGecerli ? '' : 'Şema yazmanıza gerek yok — acme.com.tr yeterli.'}
                    >
                        <input
                            type="text"
                            value={form.website}
                            onChange={set('website')}
                            placeholder="acme.com.tr"
                            aria-invalid={adresYazildi && !adresGecerli}
                            className={`${alanCls} ${adresYazildi && !adresGecerli ? 'border-bad' : ''}`}
                        />
                    </Alan>
                    {adresYazildi && !adresGecerli && (
                        <p className="text-[10px] text-bad-text mt-1">Bu adres okunamadı. Örnek: acme.com.tr</p>
                    )}
                </div>

                <div>
                    <Alan label="Kuruluş yılı">
                        <input
                            type="text"
                            inputMode="numeric"
                            value={form.foundedYear}
                            onChange={set('foundedYear')}
                            placeholder="2015"
                            aria-invalid={yilYazildi && !yilGecerli}
                            className={`${alanCls} ${yilYazildi && !yilGecerli ? 'border-bad' : ''}`}
                        />
                    </Alan>
                    {yilYazildi && !yilGecerli && (
                        <p className="text-[10px] text-bad-text mt-1">Geçerli bir yıl girin.</p>
                    )}
                </div>

                <Alan label="Ölçek">
                    <select value={form.sizeBand} onChange={set('sizeBand')} className={alanCls}>
                        <option value="">Bilinmiyor</option>
                        {MANUAL_SIZE_BANDS.map((b) => <option key={b} value={b}>{b} kişi</option>)}
                    </select>
                </Alan>

                <Alan label="Sektör">
                    <select value={form.sector} onChange={set('sector')} className={alanCls}>
                        <option value="">Bilinmiyor</option>
                        {SECTOR_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                </Alan>

                <Alan label="İş modeli">
                    <select value={form.model} onChange={set('model')} className={alanCls}>
                        <option value="">Bilinmiyor</option>
                        {MODEL_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                </Alan>

                <Alan label="Şirket tipi">
                    <select value={form.type} onChange={set('type')} className={alanCls}>
                        <option value="">Bilinmiyor</option>
                        {TYPE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                </Alan>

                <Alan label="Merkez">
                    <input type="text" value={form.headquarters} onChange={set('headquarters')} placeholder="İstanbul" className={alanCls} />
                </Alan>

                <div className="sm:col-span-2">
                    <Alan
                        label="Nasıl doğruladınız?"
                        hint="Raporu sonradan okuyan kişi için en değerli alan burası."
                    >
                        <textarea
                            value={form.note}
                            onChange={set('note')}
                            rows={2}
                            placeholder="Ticaret sicilinden baktım · Eski çalışanıyla görüştüm · Şirket kapanmış, arşiv kaydı var"
                            className={`${alanCls} resize-y`}
                        />
                    </Alan>
                </div>
            </div>

            {!yeterliBilgi && (
                <p className="text-[10px] text-n500">
                    En az bir alan doldurun — bilgi olmadan &quot;doğrulandı&quot; kaydı oluşturulmuyor.
                </p>
            )}
            {error && <p className="text-[11px] text-bad-text">{error}</p>}

            <div className="flex items-center justify-between gap-2">
                {onRemove ? (
                    <button
                        type="button"
                        onClick={kaldir}
                        disabled={saving || removing}
                        className="h-8 px-3 rounded-md text-[11px] font-semibold text-bad-text border border-n200 hover:bg-bad-bg disabled:opacity-50 flex items-center gap-1.5"
                    >
                        {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        Elle doğrulamayı kaldır
                    </button>
                ) : <span />}

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={saving || removing}
                        className="h-8 px-3 rounded-md text-[11px] font-semibold text-n500 border border-n200 hover:bg-n50 disabled:opacity-50 flex items-center gap-1.5"
                    >
                        <X className="w-3 h-3" /> Vazgeç
                    </button>
                    <button
                        type="button"
                        onClick={kaydet}
                        disabled={!kaydedilebilir}
                        className="h-8 px-4 rounded-md text-[11px] font-semibold bg-brand hover:bg-brand-600 text-white disabled:opacity-50 flex items-center gap-1.5"
                    >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Kaydet ve yeniden değerlendir
                    </button>
                </div>
            </div>
        </div>
    );
}
