// SAKLAMA SÜRESİ VE İMHA — süper admin ayarı.
//
// ── NEDEN ÖNCE SAYIYI GÖSTERİYOR ────────────────────────────────────────────
// İmha geri alınamaz. "6 ay" yazan bir kutu, kaç kaydın gideceğini söylemeden
// açıldığında insan ne kabul ettiğini bilmiyor. Ekran önce sayıyı veriyor,
// sonra açma düğmesini.
//
// ── NEDEN AÇIK GELMİYOR ─────────────────────────────────────────────────────
// Süre 6 ay olarak geliyor ama imha kapalı. Bir sürüm yükseltmesinin gerçek
// aday kayıtlarını sessizce silmesi kabul edilemez; açma kararı insanın.

import { useCallback, useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { Trash2, Loader2, AlertCircle, ShieldAlert, Check } from 'lucide-react';

/** Sunucudaki sebep kodlarının Türkçesi. */
const REASON_TR = {
    'sure-doldu': 'Süresi doldu',
    'sure-dolmadi': 'Süresi dolmadı',
    'ise-alindi': 'İşe alınmış (imha dışında)',
    'tarih-okunamadi': 'Kaydın tarihi okunamadı',
    'sure-tanimsiz': 'Saklama süresi tanımlı değil',
};

async function cagir(yol, secenek = {}) {
    const idToken = await getAuth().currentUser?.getIdToken();
    const res = await fetch(yol, {
        ...secenek,
        headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
            ...(secenek.headers || {}),
        },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `İstek başarısız (${res.status})`);
    return body;
}

export default function RetentionPanel() {
    const [durum, setDurum] = useState(null);
    const [ay, setAy] = useState(6);
    const [acik, setAcik] = useState(false);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [kaydediliyor, setKaydediliyor] = useState(false);
    const [imhaEdiliyor, setImhaEdiliyor] = useState(false);
    const [hata, setHata] = useState('');
    const [mesaj, setMesaj] = useState('');

    const oku = useCallback(async () => {
        setYukleniyor(true);
        setHata('');
        try {
            const d = await cagir('/api/admin/retention');
            setDurum(d);
            setAy(d.months);
            setAcik(d.enabled);
        } catch (err) {
            setHata(err.message);
        } finally {
            setYukleniyor(false);
        }
    }, []);

    useEffect(() => { oku(); }, [oku]);

    const kaydet = async () => {
        setKaydediliyor(true);
        setHata('');
        setMesaj('');
        try {
            await cagir('/api/admin/retention', {
                method: 'POST',
                body: JSON.stringify({ months: Number(ay), enabled: acik }),
            });
            setMesaj('Ayar kaydedildi.');
            await oku();
        } catch (err) {
            setHata(err.message);
        } finally {
            setKaydediliyor(false);
        }
    };

    const imhaEt = async () => {
        // Geri alınamayan işlem — tarayıcı onayı yetmiyor, sayıyı da söylüyor.
        const onay = window.confirm(
            `${durum?.dueCount ?? 0} aday kaydı ve CV dosyaları KALICI olarak silinecek.\n\n`
            + 'Bu işlem geri alınamaz. Devam edilsin mi?'
        );
        if (!onay) return;

        setImhaEdiliyor(true);
        setHata('');
        setMesaj('');
        try {
            const r = await cagir('/api/admin/retention/purge', { method: 'POST' });
            setMesaj(`${r.deleted} kayıt ve ${r.files} dosya silindi.`);
            await oku();
        } catch (err) {
            setHata(err.message);
        } finally {
            setImhaEdiliyor(false);
        }
    };

    const sebepler = Object.entries(durum?.reasons || {});

    return (
        <div className="max-w-lg space-y-4">
            <div>
                <h2 className="text-[12px] font-semibold text-n900 m-0 mb-1">Saklama Süresi ve İmha</h2>
                <p className="text-[11px] text-n500 leading-relaxed m-0">
                    Kişisel veri, işleme amacı ortadan kalktığında silinmek zorunda. Süresi
                    dolan aday kayıtları ve CV dosyaları bu ayara göre imha edilir.
                </p>
            </div>

            {hata && (
                <div className="flex items-start gap-2 bg-bad-bg border border-bad/20 rounded-[10px] p-3">
                    <AlertCircle className="w-3.5 h-3.5 text-bad flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-bad-text m-0">{hata}</p>
                </div>
            )}
            {mesaj && (
                <div className="flex items-start gap-2 bg-ok-bg border border-ok/20 rounded-[10px] p-3">
                    <Check className="w-3.5 h-3.5 text-ok flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-ok m-0">{mesaj}</p>
                </div>
            )}

            <div className="bg-n0 border border-n200 rounded-[10px] p-4 space-y-3">
                <label className="block">
                    <span className="text-[11px] font-semibold text-n700">Saklama süresi</span>
                    <div className="flex items-center gap-2 mt-1.5">
                        <input
                            type="number"
                            min="1"
                            max="120"
                            value={ay}
                            onChange={(e) => setAy(e.target.value)}
                            className="w-20 bg-n0 border border-n200 rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-brand"
                        />
                        <span className="text-[11px] text-n500">ay</span>
                    </div>
                    <p className="text-[10px] text-n400 mt-1.5 m-0 leading-relaxed">
                        Başvuru tarihinden itibaren. İşe alınmış adaylar imha dışında —
                        verileri özlük süreçlerine ait.
                    </p>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={acik}
                        onChange={(e) => setAcik(e.target.checked)}
                        className="mt-0.5"
                    />
                    <span className="text-[11px] text-n700 leading-relaxed">
                        İmhayı etkinleştir
                        <span className="block text-[10px] text-n400">
                            Kapalıyken hiçbir kayıt silinmez; süre yalnızca hesaplanır.
                        </span>
                    </span>
                </label>

                <button
                    onClick={kaydet}
                    disabled={kaydediliyor || yukleniyor}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand text-white text-[11px] font-semibold hover:opacity-90 disabled:opacity-50"
                >
                    {kaydediliyor && <Loader2 className="w-3 h-3 animate-spin" />}
                    Ayarı kaydet
                </button>
            </div>

            {/* Sayı önce, düğme sonra. */}
            <div className="bg-n0 border border-n200 rounded-[10px] p-4">
                {yukleniyor ? (
                    <p className="text-[11px] text-n400 m-0">Okunuyor…</p>
                ) : (
                    <>
                        <p className="text-[11px] text-n600 m-0">
                            Havuzda <strong className="text-n900">{durum?.total ?? 0}</strong> kayıt var;{' '}
                            <strong className={durum?.dueCount ? 'text-bad' : 'text-n900'}>
                                {durum?.dueCount ?? 0}
                            </strong>{' '}
                            tanesi {durum?.months} aylık süreyi doldurmuş görünüyor.
                        </p>

                        {sebepler.length > 0 && (
                            <div className="mt-2.5 space-y-1">
                                {sebepler.map(([kod, adet]) => (
                                    <div key={kod} className="flex items-center gap-2 text-[10px]">
                                        <span className="text-n400 w-48">{REASON_TR[kod] || kod}</span>
                                        <span className="text-n700 font-semibold tabular-nums">{adet}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {!durum?.enabled && (
                            <p className="text-[10px] text-n400 mt-3 m-0 leading-relaxed">
                                İmha kapalı. Yukarıdan etkinleştirip kaydettikten sonra
                                silme düğmesi kullanılabilir olur.
                            </p>
                        )}

                        <button
                            onClick={imhaEt}
                            disabled={!durum?.enabled || !durum?.dueCount || imhaEdiliyor}
                            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-bad/30 bg-bad-bg text-bad-text text-[11px] font-semibold hover:bg-bad/10 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {imhaEdiliyor
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Trash2 className="w-3 h-3" />}
                            Süresi dolanları şimdi imha et
                        </button>
                    </>
                )}
            </div>

            <div className="flex items-start gap-2 bg-warn-bg border border-warn/20 rounded-[10px] p-3">
                <ShieldAlert className="w-3.5 h-3.5 text-warn flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-warn leading-relaxed m-0">
                    İmha <strong>geri alınamaz</strong>: aday kaydı ve CV dosyası kalıcı olarak
                    silinir. Tarihi okunamayan kayıtlar bilerek imha edilmez — yaşı belirlenemeyen
                    bir kaydı eski varsaymak, geri dönüşü olmayan bir işlemde en kötü varsayım olurdu.
                </p>
            </div>
        </div>
    );
}
