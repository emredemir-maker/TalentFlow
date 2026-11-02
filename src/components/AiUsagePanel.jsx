// AI KULLANIM RAPORU — sayaç vardı, gösterge yoktu.
//
// services/usage.js her AI çağrısının tokenını Firestore'a yazıyordu ama
// hiçbir yer okumuyordu. "Hangi özellik ne yakıyor" sorusunun cevabı
// veritabanında duruyordu ve kimse göremiyordu.
//
// ── İKİ AYRI SAYI, ÇÜNKÜ İKİ AYRI FATURA KALEMİ ─────────────────────────────
// Tablodaki tutar YALNIZCA token fiyatı (usage.js PRICING). Google, arama
// destekli çağrıları token'dan bağımsız olarak İSTEK BAŞINA da faturalandırıyor
// ve bu tutar ölçümde görünmüyor. Bu yüzden aramalı çağrı ADEDİ ayrı bir kutuda
// duruyor: ekrandaki tutarla faturadaki tutar arasındaki farkın adı var.
//
// ── TAHMİN OLDUĞU YAZILI ────────────────────────────────────────────────────
// Fiyat tablosu elle tutuluyor ve fiyatlar değişiyor. Rakamı kesinmiş gibi
// göstermek, faturayla karşılaştırıldığında güveni bir kerede bitirirdi.

import { useCallback, useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { RefreshCw, Loader2, AlertCircle, Gauge } from 'lucide-react';

import { aggregateByLabel, usageTotals, limitState, labelText } from '../utils/aiUsageReport';

const para = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const sayi = (n) => (Number(n) || 0).toLocaleString('tr-TR');
const yuzde = (n) => `%${Math.round((Number(n) || 0) * 100)}`;

const TONE_BG = { none: 'bg-n300', ok: 'bg-brand', warn: 'bg-warn', over: 'bg-bad' };

/** Sınır tanımlıysa doluluk çubuğu; değilse "sınır yok" der. */
function LimitBox({ title, used, limit, unit, note }) {
    const { open: acik, ratio: oran, tone } = limitState(used, limit);
    const renk = TONE_BG[tone];

    return (
        <div className="bg-n0 border border-n200 rounded-[10px] p-3">
            <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.06em] m-0">{title}</p>
            <p className="text-[15px] font-semibold text-n900 mt-1 m-0">
                {sayi(used)}
                {acik && <span className="text-[11px] text-n400 font-normal"> / {sayi(limit)} {unit}</span>}
                {!acik && <span className="text-[11px] text-n400 font-normal"> {unit} · sınır yok</span>}
            </p>
            {acik && (
                <div className="h-1 bg-n100 rounded-full mt-2 overflow-hidden">
                    <div className={`h-full ${renk}`} style={{ width: `${oran * 100}%` }} />
                </div>
            )}
            {note && <p className="text-[10px] text-n400 mt-1.5 m-0 leading-relaxed">{note}</p>}
        </div>
    );
}

/** "yarın 03:00'te (TSİ)" — sıfırlama UTC gece yarısı. */
function resetText(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return "yarın 03:00'te (TSİ)";
    const saat = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
    return `yarın ${saat}'te (TSİ)`;
}

const UNIT_ROWS = [
    { key: 'prescreen', field: 'monthlyPrescreens', title: 'Ön analiz (bu ay)', note: 'AI ile işlenen her aday CV’si: tekil yükleme, toplu içe aktarma, başvuru formu.' },
    { key: 'interviewEval', field: 'monthlyInterviewEvals', title: 'Mülakat değerlendirmesi (bu ay)', note: 'Görüşme sonucunun AI ile değerlendirilmesi ve yeniden değerlendirme.' },
];

/** Şirket kotası ayrıntısı: kalan, reddedilen, kişi payları, paket hakları. */
function QuotaDetails({ quota, plan }) {
    const users = Array.isArray(quota.users) ? quota.users : [];
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-n0 border border-n200 rounded-[10px] p-3">
                    <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.06em] m-0">Bugün kalan</p>
                    <p className="text-[15px] font-semibold text-n900 mt-1 m-0">{sayi(quota.remaining)} <span className="text-[11px] text-n400 font-normal">token</span></p>
                </div>
                <div className="bg-n0 border border-n200 rounded-[10px] p-3">
                    <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.06em] m-0">Kotaya takılan istek</p>
                    <p className="text-[15px] font-semibold text-n900 mt-1 m-0">{sayi(quota.rejected)}</p>
                </div>
                <div className="bg-n0 border border-n200 rounded-[10px] p-3">
                    <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.06em] m-0">Kişi başı pay</p>
                    <p className="text-[15px] font-semibold text-n900 mt-1 m-0">%{quota.limits?.userSharePct ?? '—'}</p>
                    <p className="text-[10px] text-n400 mt-1.5 m-0 leading-relaxed">
                        Tek kullanıcı şirket kotasının en çok bu kadarını kullanır. Aday tarafı (başvuru formu, mülakat bağlantısı) ortak bir kovadır: %{quota.limits?.anonSharePct ?? '—'}.
                    </p>
                </div>
            </div>

            {plan && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {UNIT_ROWS.map((r) => (
                        <LimitBox
                            key={r.key}
                            title={`${r.title} — ${plan.label || 'Paket'}`}
                            used={plan.units?.[r.key] || 0}
                            limit={plan[r.field] || 0}
                            unit="adet"
                            note={r.note}
                        />
                    ))}
                </div>
            )}

            {users.length > 0 && (
                <div className="bg-n0 border border-n200 rounded-[10px] overflow-hidden">
                    <div className="px-3 py-2 border-b border-n200">
                        <span className="text-[11px] text-n600">Bugün kim ne kullandı</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="text-n500 text-left">
                                    <th className="font-medium px-3 py-1.5">Kullanıcı</th>
                                    <th className="font-medium px-3 py-1.5 text-right">Çağrı</th>
                                    <th className="font-medium px-3 py-1.5 text-right">Token</th>
                                    <th className="font-medium px-3 py-1.5 text-right">Pay sınırı</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.key} className="border-t border-n100">
                                        <td className="px-3 py-1.5 text-n700">{u.label}</td>
                                        <td className="px-3 py-1.5 text-right text-n600">{sayi(u.calls)}</td>
                                        <td className="px-3 py-1.5 text-right text-n900 font-semibold">{sayi(u.tokens)}</td>
                                        <td className="px-3 py-1.5 text-right text-n400">{sayi(u.limit)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AiUsagePanel() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [days, setDays] = useState(14);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const idToken = await getAuth().currentUser?.getIdToken();
            const res = await fetch(`/api/admin/usage?days=${days}`, {
                headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error || `Okunamadı (${res.status})`);
            setData(body);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [days]);

    useEffect(() => { load(); }, [load]);

    const gunler = data?.days || [];
    const satirlar = aggregateByLabel(gunler);
    const { cost: toplam, calls: cagri } = usageTotals(gunler);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
                <Gauge className="w-4 h-4 text-brand" />
                <h2 className="text-[12px] font-semibold text-n900 m-0">AI Kullanımı</h2>
                <div className="flex-1" />
                <select
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    className="bg-n0 border border-n200 rounded-md px-2 py-1 text-[11px] text-n700 outline-none focus:border-brand"
                >
                    {[7, 14, 30, 90].map((d) => <option key={d} value={d}>Son {d} gün</option>)}
                </select>
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-n200 text-[11px] text-n600 hover:bg-n50 disabled:opacity-50"
                >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Yenile
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-2 bg-bad-bg border border-bad/20 rounded-[10px] p-3">
                    <AlertCircle className="w-3.5 h-3.5 text-bad flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-bad-text m-0">{error}</p>
                </div>
            )}

            {/* Bugünün sayacı: FRENİN gördüğü değer. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <LimitBox
                    title="Bugün — token"
                    used={data?.today?.tokens || 0}
                    limit={data?.limits?.tokens || 0}
                    unit="token"
                    note={data?.quota
                        ? `Şirketinizin günlük kotası. Dolunca yeni AI çağrısı başlatılmaz; ${resetText(data.quota.resetAt)} kendiliğinden yenilenir.`
                          + (data.quota.reserved > 0 ? ` Şu an sürmekte olan çağrılar için ayrılan: ${sayi(data.quota.reserved)} token.` : '')
                        : 'Sınıra ulaşınca yeni AI çağrısı başlatılmaz.'}
                />
                <LimitBox
                    title="Bugün — aramalı çağrı"
                    used={data?.today?.groundedCalls || 0}
                    limit={data?.limits?.groundedCalls || 0}
                    unit="çağrı"
                    note="Arama destekli çağrılar token dışında, istek başına ayrıca faturalanır — aşağıdaki tutar bu kalemi İÇERMEZ."
                />
            </div>

            {data?.quota && <QuotaDetails quota={data.quota} plan={data.plan} />}

            <div className="bg-n0 border border-n200 rounded-[10px] overflow-hidden">
                <div className="px-3 py-2 border-b border-n200 flex items-center gap-3 flex-wrap">
                    <span className="text-[11px] text-n600">
                        Son {gunler.length} gün: <strong className="text-n900">{para(toplam)}</strong> · {sayi(cagri)} çağrı
                    </span>
                    <span className="text-[10px] text-n400">yalnızca token ücreti — tahmini</span>
                </div>

                {loading && gunler.length === 0 && (
                    <p className="text-[11px] text-n400 px-3 py-4 m-0">Okunuyor…</p>
                )}

                {!loading && gunler.length === 0 && !error && (
                    <p className="text-[11px] text-n400 px-3 py-4 m-0">
                        Bu aralıkta kayıt yok. Ölçüm ilk AI çağrısıyla başlar.
                    </p>
                )}

                {satirlar.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="text-n500 text-left">
                                    <th className="font-medium px-3 py-1.5">Özellik</th>
                                    <th className="font-medium px-3 py-1.5 text-right">Çağrı</th>
                                    <th className="font-medium px-3 py-1.5 text-right">Girdi</th>
                                    <th className="font-medium px-3 py-1.5 text-right">Çıktı</th>
                                    <th className="font-medium px-3 py-1.5 text-right">Tahmini</th>
                                    <th className="font-medium px-3 py-1.5 text-right">Çağrı başı</th>
                                </tr>
                            </thead>
                            <tbody>
                                {satirlar.map((p) => (
                                    <tr key={p.label} className="border-t border-n100">
                                        <td className="px-3 py-1.5 text-n700">{labelText(p.label)}</td>
                                        <td className="px-3 py-1.5 text-right text-n600">{sayi(p.calls)}</td>
                                        <td className="px-3 py-1.5 text-right text-n400">{sayi(p.inTokens)}</td>
                                        <td className="px-3 py-1.5 text-right text-n400">{sayi(p.outTokens)}</td>
                                        <td className="px-3 py-1.5 text-right text-n900 font-semibold">{para(p.cost)}</td>
                                        <td className="px-3 py-1.5 text-right text-n500">${p.perCall.toFixed(4)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {gunler.length > 0 && (
                <div className="bg-n0 border border-n200 rounded-[10px] p-3">
                    <p className="text-[10px] font-semibold text-n500 uppercase tracking-[0.06em] m-0 mb-2">Gün gün</p>
                    <div className="space-y-1">
                        {gunler.map((g) => (
                            <div key={g.day} className="flex items-center gap-2 text-[11px]">
                                <span className="text-n500 w-20 flex-shrink-0">{g.day}</span>
                                <span className="text-n900 font-semibold w-14 text-right">{para(g.totalCost)}</span>
                                <span className="text-n400 w-20 text-right">{sayi(g.calls)} çağrı</span>
                                <span className="text-n400">önbellek {yuzde(g.cacheHitRate)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <p className="text-[10px] text-n400 leading-relaxed m-0">
                Tutarlar <strong>tahmindir</strong>: fiyat tablosu uygulama içinde elle tutuluyor ve Google
                fiyatları değişiyor. Gerçek rakam faturada. Aramalı çağrıların istek başına ücreti bu
                tabloya dâhil değildir.
            </p>
        </div>
    );
}
