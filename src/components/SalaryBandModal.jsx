// src/components/SalaryBandModal.jsx
//
// MAAŞ ARALIĞI TANIMLA — "Yeni Mülakat" menüsünden açılır.
//
// NEDEN KENDİ POZİSYON SEÇİCİSİ VAR:
// Mülakat ekranındaki diğer akışlar (hızlı mülakat, manuel görüşme, CV
// yükleme) pozisyonu kendi state'lerinde tutuyor. Bu modal onlardan birinin
// state'ini ödünç alsaydı, bandı tanımlayan kullanıcı farkında olmadan
// yarım kalmış bir mülakat formunun pozisyonunu da değiştirmiş olurdu.
//
// NEDEN YALNIZCA ÜST SINIR:
// Band, pozisyonun bir özelliği ve PositionsPage aynı alanı `{ max, currency,
// period, basis }` olarak yazıyor. Buraya bir alt sınır koysaydık, pozisyon
// ekranından yapılan ilk düzenlemede sessizce silinirdi. Bütçenin kısıt olan
// ucu zaten tavan.
import { useEffect, useState } from 'react';
import { X, Wallet } from 'lucide-react';
import { usePositions } from '../context/PositionsContext';
import {
    normalizeBand, formatBand,
    CURRENCIES, CURRENCY_LABEL, PERIODS, PERIOD_LABEL, BASES, BASIS_LABEL,
} from '../utils/salaryBand';

const FIELD_CLS =
    'w-full bg-n50 border border-n200 rounded-md px-2.5 py-2 text-[13px] ' +
    'text-n800 focus:outline-none focus:border-brand';

export default function SalaryBandModal({ open, onClose }) {
    const { positions, updatePosition } = usePositions();
    const openPositions = (positions || []).filter(p => p.status === 'open');

    const [positionId, setPositionId] = useState('');
    const [max, setMax] = useState('');
    const [currency, setCurrency] = useState('TRY');
    const [period, setPeriod] = useState('monthly');
    const [basis, setBasis] = useState('gross');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    const selected = openPositions.find(p => p.id === positionId) || null;

    // Pozisyon seçilince KAYITLI BAND alanlara gelir. Boş form göstermek,
    // tanımlı bir bandın üstüne yanlışlıkla yazmayı kolaylaştırırdı.
    useEffect(() => {
        if (!selected) return;
        const band = normalizeBand(selected.salaryBand);
        setMax(band?.max != null ? String(band.max) : '');
        setCurrency(band?.currency || 'TRY');
        setPeriod(band?.period || 'monthly');
        setBasis(band?.basis || 'gross');
        setSaved(false);
        setError('');
    }, [selected]);

    // Modal her açılışta temiz başlar.
    useEffect(() => {
        if (open) return;
        setPositionId('');
        setSaving(false);
        setSaved(false);
        setError('');
    }, [open]);

    if (!open) return null;

    const nextBand = normalizeBand({ max, currency, period, basis });
    const preview = formatBand(nextBand);
    const currentBand = selected ? formatBand(selected.salaryBand) : '';

    const handleSave = async () => {
        if (!selected) { setError('Önce bir pozisyon seçin.'); return; }
        if (!nextBand) { setError('Bütçe üst sınırı girilmedi.'); return; }
        setError('');
        setSaving(true);
        try {
            await updatePosition(selected.id, { salaryBand: nextBand });
            setSaved(true);
        } catch (err) {
            setError(err.message || 'Kaydedilemedi.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="infoset fixed inset-0 z-[120] bg-ink/40 flex items-center justify-center p-3">
            <div className="bg-n0 w-full max-w-[520px] rounded-[14px] border border-n200 shadow-xl overflow-hidden">
                <div className="h-[52px] px-[18px] flex items-center gap-2.5 border-b border-n200">
                    <div className="w-7 h-7 rounded-md bg-brand-50 text-brand flex items-center justify-center">
                        <Wallet className="w-[15px] h-[15px]" />
                    </div>
                    <div>
                        <h2 className="text-[13px] font-semibold m-0 tracking-[-0.01em]">Maaş aralığı tanımla</h2>
                        <span className="text-[10px] text-n400">Pozisyonun bütçe tavanı — aday beklentisi bununla kıyaslanır</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="ml-auto w-7 h-7 rounded-md text-n400 hover:bg-n50 hover:text-n700 flex items-center justify-center"
                        aria-label="Kapat"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-[18px] flex flex-col gap-3.5">
                    <div>
                        <label className="text-[10px] font-semibold text-n500 tracking-[0.08em] uppercase block mb-1.5">
                            Pozisyon
                        </label>
                        <select
                            value={positionId}
                            onChange={(e) => setPositionId(e.target.value)}
                            className={FIELD_CLS + ' appearance-none cursor-pointer'}
                        >
                            <option value="">Pozisyon seçin…</option>
                            {openPositions.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.title}{p.department ? ` · ${p.department}` : ''}
                                </option>
                            ))}
                        </select>
                        {openPositions.length === 0 && (
                            <p className="mt-1.5 text-[10px] text-n400 m-0">
                                Açık pozisyon yok — band tanımlanacak bir ilan bulunmuyor.
                            </p>
                        )}
                        {selected && (
                            <p className="mt-1.5 text-[10px] text-n400 m-0">
                                {currentBand
                                    ? <>Kayıtlı band: <strong className="text-n600 font-semibold">{currentBand}</strong></>
                                    : 'Bu pozisyonda tanımlı band yok.'}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="text-[10px] font-semibold text-n500 tracking-[0.08em] uppercase block mb-1.5">
                            Bütçe üst sınırı
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <input
                                type="text"
                                inputMode="numeric"
                                placeholder="120.000"
                                value={max}
                                onChange={(e) => setMax(e.target.value)}
                                className={FIELD_CLS}
                            />
                            <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                                className={FIELD_CLS + ' appearance-none cursor-pointer'}>
                                {CURRENCIES.map(c => <option key={c} value={c}>{c} {CURRENCY_LABEL[c]}</option>)}
                            </select>
                            <select value={period} onChange={(e) => setPeriod(e.target.value)}
                                className={FIELD_CLS + ' appearance-none cursor-pointer'}>
                                {PERIODS.map(x => <option key={x} value={x}>{PERIOD_LABEL[x]}</option>)}
                            </select>
                            {/* BRÜT/NET DE BİR BİRİM: aday net konuşur, bütçe brüt
                                tutulur. İkisini kıyaslamak farkı %30-40 küçük
                                gösterir ve bu hata makul göründüğü için fark
                                edilmez — bu yüzden seçim zorunlu. */}
                            <select value={basis} onChange={(e) => setBasis(e.target.value)}
                                className={FIELD_CLS + ' appearance-none cursor-pointer'}>
                                {BASES.map(x => <option key={x} value={x}>{BASIS_LABEL[x]}</option>)}
                            </select>
                        </div>
                        <p className="mt-1.5 text-[10px] text-n400 m-0">
                            {preview
                                ? <>Kaydedilecek: <strong className="text-n600 font-semibold">{preview}</strong></>
                                : 'Band girilmezse aday beklentileri bir şeyle kıyaslanamaz.'}
                        </p>
                    </div>

                    {error && (
                        <div className="bg-bad-bg text-bad-text text-[12px] rounded-md px-3 py-2">{error}</div>
                    )}
                    {saved && (
                        <div className="bg-ok-bg text-ok-text text-[12px] rounded-md px-3 py-2">
                            {selected?.title} için band kaydedildi.
                        </div>
                    )}
                </div>

                <div className="px-[18px] py-3 border-t border-n200 flex items-center justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="text-[12px] font-medium text-n600 bg-n50 border border-n200 hover:bg-n100 rounded-md px-3 py-1.5"
                    >
                        Kapat
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !selected || !nextBand}
                        className="text-[13px] font-semibold text-white bg-brand hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-md px-[13px] py-[7px]"
                    >
                        {saving ? 'Kaydediliyor…' : 'Bandı kaydet'}
                    </button>
                </div>
            </div>
        </div>
    );
}
