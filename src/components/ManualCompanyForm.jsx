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
//
// ── ÖNCE SİTE, SONRA ELLE ───────────────────────────────────────────────────
// Otomatik çözümleme yalnızca ADI biliyor ve Türkiye'de aynı adı taşıyan
// onlarca şirket var; bu yüzden "bulunamadı" çıkıyor. Kullanıcı doğru alan
// adını biliyorsa belirsizlik bitiyor: araştırma o adrese çapalanıyor ve
// bulabildiği alanları FORMA yazıyor. Açıkta kalanları kullanıcı dolduruyor.
//
// SONUÇ DOĞRUDAN KAYDEDİLMİYOR. Alan adı yanlış yazılmış ya da park edilmiş
// bir siteyse modelin anlattığı şirket bambaşka olabilir; araya insan onayı
// koymadan bu veriyi yazmak, yanlış şirketi adayın geçmişine yapıştırmak
// olurdu. Araştırma formu doldurur, kaydetmeye kullanıcı karar verir.

import { useState } from 'react';
import { Loader2, Save, Trash2, X, Info, Search, CheckCircle2, ExternalLink } from 'lucide-react';

import {
    MANUAL_SIZE_BANDS,
    hasManualEvidence,
    normalizeWebsite,
    normalizeFoundedYear,
    mergeResearchIntoForm,
} from '../utils/manualCompanyIntel';
import { researchCompanySite } from '../services/ai/companyIntel';
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
    // Araştırma durumu: sonuç özeti ve bulunan kaynaklar.
    const [researching, setResearching] = useState(false);
    const [research, setResearch] = useState(null); // {filled, missing, sources, evidence}
    const [researchNote, setResearchNote] = useState('');

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

    /**
     * Girilen adresten şirketi araştırır ve BOŞ alanları doldurur.
     *
     * Kullanıcının yazdığının üstüne yazılmaz (bkz. mergeResearchIntoForm):
     * insan şirketi tanıyor olabilir ve girdiğinin sessizce değişmesi,
     * kaydettiğini sandığı şeyin kaybolması demektir.
     */
    const siteyiArastir = async () => {
        const adres = normalizeWebsite(form.website);
        if (!adres) {
            setError('Önce geçerli bir web adresi girin.');
            return;
        }
        setResearching(true);
        setError('');
        setResearchNote('');
        try {
            const evidence = await researchCompanySite(company, adres);
            if (evidence?.withheld) {
                // KAYNAKSIZ SONUÇ GÖSTERİLMEZ. Sebebini söylemek şart:
                // "arama yapılamadı" ile "arama yapıldı ama hiçbir sayfa
                // kaynak gösterilemedi" farklı şeyler.
                setResearch(null);
                setResearchNote(evidence.withheldReason === 'searched-uncited'
                    ? 'Arama yapıldı ama hiçbir sayfa kaynak olarak gösterilemedi. Alanları elle doldurabilirsiniz.'
                    : 'Bu adresten bilgi çıkarılamadı. Alanları elle doldurabilirsiniz.');
                return;
            }
            const { form: yeniForm, filled, missing } = mergeResearchIntoForm(form, evidence);
            setForm(yeniForm);
            setResearch({ filled, missing, sources: evidence.sources || [], evidence });
            if (evidence.caution) setResearchNote(evidence.caution);
        } catch (err) {
            setError(err?.message || 'Araştırma yapılamadı.');
        } finally {
            setResearching(false);
        }
    };

    const kaydet = async () => {
        setSaving(true);
        setError('');
        try {
            await onSave(form, research?.evidence
                ? {
                    sources: research.evidence.sources,
                    searchQueries: research.evidence.searchQueries,
                    searchSuggestionHtml: research.evidence.searchSuggestionHtml,
                    grounded: research.evidence.grounded,
                    site: normalizeWebsite(form.website),
                }
                : null);
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
                {/* SİTE ÖNCE. Otomatik çözümleme yalnızca adı biliyor ve aynı adı
                    taşıyan onlarca şirket yüzünden bulamıyor. Doğru adres
                    belirsizliği bitiriyor: araştırma o adrese çapalanıyor. */}
                <div className="sm:col-span-2">
                    <Alan
                        label="Şirketin web sitesi"
                        hint={adresYazildi && !adresGecerli ? '' : 'Adresi yazıp "Siteden araştır" deyin; bulunanlar aşağıdaki alanlara dolar.'}
                    >
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={form.website}
                                onChange={set('website')}
                                placeholder="acme.com.tr"
                                aria-invalid={adresYazildi && !adresGecerli}
                                className={`${alanCls} ${adresYazildi && !adresGecerli ? 'border-bad' : ''}`}
                            />
                            <button
                                type="button"
                                onClick={siteyiArastir}
                                disabled={!adresGecerli || researching || saving || removing}
                                title="Bu adresten şirketi araştırıp boş alanları doldurur"
                                className="shrink-0 h-[30px] px-3 rounded-md text-[11px] font-semibold bg-brand hover:bg-brand-600 text-white disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {researching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                                {researching ? 'Araştırılıyor…' : 'Siteden araştır'}
                            </button>
                        </div>
                    </Alan>
                    {adresYazildi && !adresGecerli && (
                        <p className="text-[10px] text-bad-text mt-1">Bu adres okunamadı. Örnek: acme.com.tr</p>
                    )}
                </div>

                {/* ARAŞTIRMA SONUCU — ne doldu, ne açıkta kaldı.
                    "Bir şeyler buldum" demek yetmiyor: kullanıcı hangi alanı
                    kendisinin tamamlaması gerektiğini görmeli. */}
                {research && (
                    <div className="sm:col-span-2 bg-ok-bg rounded-md p-2.5">
                        <div className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-ok mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-[11px] text-n700 leading-relaxed m-0">
                                    {research.filled.length > 0
                                        ? <>Siteden bulundu ve dolduruldu: <strong>{research.filled.join(', ')}</strong>.</>
                                        : 'Siteden yeni bir alan doldurulmadı; girdikleriniz olduğu gibi kaldı.'}
                                </p>
                                {research.missing.length > 0 && (
                                    <p className="text-[11px] text-n600 leading-relaxed mt-1 m-0">
                                        Açıkta kalan: {research.missing.join(', ')} — bunları siz doldurabilirsiniz.
                                    </p>
                                )}
                                {research.sources.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {research.sources.slice(0, 5).map((src, i) => (
                                            <a
                                                key={`${src.uri}-${i}`}
                                                href={src.uri}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={src.title || src.uri}
                                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-n600 hover:text-brand bg-n0 border border-n200 rounded-md px-2 py-0.5 max-w-[200px]"
                                            >
                                                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                                                <span className="truncate">{src.title || src.uri}</span>
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {researchNote && (
                    <p className="sm:col-span-2 text-[11px] text-n600 bg-n50 rounded-md px-2.5 py-2 m-0">{researchNote}</p>
                )}

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
                        hint={research
                            ? 'Araştırmanın bulamadığı bir şey biliyorsanız buraya yazın.'
                            : 'Raporu sonradan okuyan kişi için en değerli alan burası.'}
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
