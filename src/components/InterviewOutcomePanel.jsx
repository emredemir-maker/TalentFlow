// MÜLAKAT SONUCU — odada ne değişti?
//
// Mülakat değerlendirmesi eskiden havada duran bir 0-100'dü: hangi gereksinime
// dair olduğu kayıtlı değildi, CV skoruyla kıyaslanamıyordu. Bu panel o sayının
// yerine tek bir soruyu cevaplıyor: hangi madde odada kapandı, hangisi açıldı,
// hangisi hâlâ belirsiz.
//
// CV yargısı SİLİNMİYOR. Her satır "neydi → ne oldu" biçiminde duruyor ve
// dayanağı adayın kendi cümlesi. Üzerine yazsaydık bir hafta sonra kimse
// skorun neden değiştiğini açıklayamazdı.

import {
    AlertTriangle, ArrowRight, CheckCircle2, HelpCircle, MessageSquareQuote, TrendingDown, TrendingUp,
} from 'lucide-react';

import {
    mergeInterviewCoverage, interviewAdjustedScore, statusLabel, isUpgrade,
} from '../utils/interviewCoverage';

export default function InterviewOutcomePanel({ candidate, position, analysis }) {
    const merged = mergeInterviewCoverage(analysis, candidate, position);

    // Mülakat yoksa panel HİÇ görünmez. Boş bir kutu "mülakat yapıldı ama bir
    // şey çıkmadı" izlenimi verirdi; oysa henüz yapılmamış.
    if (!merged.hasInterview) {
        if (merged.cvStale) {
            return (
                <Shell>
                    <div className="flex items-start gap-2 rounded-md border bg-warn-bg px-3 py-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
                        <p className="text-[11px] text-n700 leading-relaxed">
                            Mülakat kaydı var ama <strong>CV taraması eski gereksinim listesine ait</strong>.
                            İki kanıtı birleştirmek için ortak bir taban gerekiyor — adayı yeniden tarayın,
                            mülakat damgaları korunuyor.
                        </p>
                    </div>
                </Shell>
            );
        }
        return null;
    }

    const { score, cvScore, delta } = interviewAdjustedScore(analysis, candidate, position);
    const up = delta > 0;

    return (
        <Shell date={merged.date}>
            {/* Skor: önce ve sonra. Aynı ölçek, o yüzden yan yana durabiliyorlar. */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-n50 border border-n200">
                    <span className="text-[11px] font-semibold text-n400 uppercase tracking-[0.08em]">CV</span>
                    <span className="text-[13px] font-semibold text-n600">{cvScore}</span>
                </div>
                <ArrowRight className="w-3 h-3 text-n300" />
                <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${
                        delta === 0
                            ? 'bg-n50 border-n200'
                            : up
                              ? 'bg-ok-bg border-transparent'
                              : 'bg-bad-bg border-transparent'
                    }`}
                >
                    <span className="text-[11px] font-semibold text-n400 uppercase tracking-[0.08em]">Mülakat sonrası</span>
                    <span className={`text-[13px] font-semibold ${delta === 0 ? 'text-n600' : up ? 'text-ok' : 'text-bad'}`}>
                        {score}
                    </span>
                    {delta !== 0 && (
                        <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${up ? 'text-ok' : 'text-bad'}`}>
                            {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {up ? '+' : ''}{delta}
                        </span>
                    )}
                </div>
                {merged.unchanged > 0 && (
                    <span className="text-[11px] text-n400 ml-auto">
                        {merged.unchanged} madde doğrulandı
                    </span>
                )}
            </div>

            {/* Değişiklikler — panelin asıl işi */}
            {merged.changes.length === 0 ? (
                <p className="text-[11px] text-n500 leading-relaxed">
                    Mülakat, CV taramasının vardığı sonuçları <strong>değiştirmedi</strong>. Bu bir
                    başarısızlık değil: cevaplar mevcut yargıyı doğruladı.
                </p>
            ) : (
                <ul className="space-y-2">
                    {merged.changes.map((c) => {
                        const better = isUpgrade(c.from, c.to);
                        return (
                            <li
                                key={c.requirementIndex}
                                className={`rounded-md border px-3 py-2.5 ${
                                    better ? 'border-transparent bg-ok-bg/50' : 'border-transparent bg-bad-bg/50'
                                }`}
                            >
                                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                    {c.must && (
                                        <span className="px-1.5 py-0.5 rounded border border-transparent bg-bad-bg text-bad text-[11px] font-semibold">
                                            zorunlu
                                        </span>
                                    )}
                                    <span className="text-[12px] font-semibold text-n700">{c.text}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                                    <span className="text-n400 line-through">{statusLabel(c.from)}</span>
                                    <ArrowRight className="w-3 h-3 text-n300" />
                                    <span className={better ? 'text-ok' : 'text-bad'}>
                                        {statusLabel(c.to)}
                                    </span>
                                </div>
                                {/* Alıntı damganın hesabıdır: adayın kendi cümlesi
                                    olmadan "odada kapandı" iddiası denetlenemez. */}
                                {c.quote && (
                                    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-n600 italic leading-relaxed">
                                        <MessageSquareQuote className="w-3 h-3 text-n300 shrink-0 mt-0.5" />
                                        “{c.quote}”
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Hâlâ açık kalanlar — cevapsız kalmak kusur değil, eksik bilgi */}
            {merged.inconclusive.length > 0 && (
                <div className="rounded-md border border-n200 bg-n50 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                        <HelpCircle className="w-3 h-3 text-n400" />
                        <span className="text-[11px] font-semibold text-n500 uppercase tracking-[0.08em]">
                            Karar verilemedi
                        </span>
                    </div>
                    <p className="text-[11px] text-n500 mb-1.5 leading-relaxed">
                        Bu maddelerde cevap hüküm vermeye yetmedi — soru atlanmış, kısa kalmış ya da
                        konuya girmemiş olabilir. <strong>Adayın eksiği sayılmadı</strong>, skoru
                        değişmedi.
                    </p>
                    <ul className="space-y-0.5">
                        {merged.inconclusive.map((i) => (
                            <li key={i.requirementIndex} className="text-[11px] text-n600">
                                · {i.text}
                                {i.must && <span className="text-bad font-semibold ml-1">zorunlu</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Shell>
    );
}

function Shell({ date, children }) {
    return (
        <div className="rounded-md border border-n200 bg-n0 p-4 space-y-3">
            <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-ok" />
                <span className="text-[11px] font-semibold text-n700 uppercase tracking-[0.08em]">
                    Mülakat Sonucu
                </span>
                {date && <span className="text-[11px] text-n400">· {date}</span>}
            </div>
            {children}
        </div>
    );
}
