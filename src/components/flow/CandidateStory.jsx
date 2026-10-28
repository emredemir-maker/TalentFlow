import { MessageSquare, Target } from 'lucide-react';
import CandidateAvatar from '../CandidateAvatar';
import FlowTrace from './FlowTrace';
import { FLOW_STAGES, flowIndex, nextStepFor, waitingDays, STALE_DAYS } from '../../utils/candidateFlow';
import { getStage } from '../../utils/pipelineStages';
import { resolveCandidateStage, getAppliedDate, cleanRoleText } from '../../utils/candidateTable';
import { isSessionDone } from '../../utils/interviewSession';
import { resolveRejection } from '../../utils/rejectionReasons';

/**
 * ADAYIN HİKÂYESİ — aday detayının sol sütunu.
 *
 * Eskiden detay ekranı bir başlık satırı ve yedi sekmeden ibaretti; "bu aday
 * kim, neden bu skor, şu an nerede" sorularının cevabı sekmelere dağılmıştı.
 * Bu sütun üçünü yukarıdan aşağı sırayla anlatıyor: kimlik ve uyum skoru
 * (gerekçeleriyle), akıştaki yolculuk (başvuru → mülakatlar → teklif) ve
 * ekibin notları. Sekmeler ve alttaki eylemler aynen sağda duruyor.
 *
 * YALNIZCA OKUR. Kayıtlar bozuk tipte gelebiliyor (bkz.
 * tests/candidateDetailCrash.test.jsx): her alan kullanılmadan önce tipi
 * denetleniyor, beklenmeyen değer sessizce atlanıyor.
 */

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []);

function fmtDate(raw) {
    const s = str(raw).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

const TYPE_LABEL = { technical: 'Teknik', hr: 'İK', product: 'Ürün', cultural: 'Kültür', behavioral: 'Davranışsal' };

export default function CandidateStory({
    candidate, score, starScore, isTop2Percent, summary, onOpenComments, onOpenTab, className = '',
}) {
    if (!candidate) return null;
    const stageKey = resolveCandidateStage(candidate);
    const stage = getStage(stageKey);
    const idx = flowIndex(stageKey);
    const days = waitingDays(candidate);
    const step = nextStepFor(stageKey);
    const applied = getAppliedDate(candidate);

    const sessions = (Array.isArray(candidate.interviewSessions) ? candidate.interviewSessions : [])
        .filter((s) => s && typeof s === 'object' && s.status !== 'cancelled')
        .sort((a, b) => `${str(a.date)} ${str(a.time)}`.localeCompare(`${str(b.date)} ${str(b.time)}`));

    const strengths = strList(candidate.aiAnalysis?.strengths).slice(0, 3);
    const weaknesses = strList(candidate.aiAnalysis?.weaknesses).slice(0, 2);
    const reasonText = str(summary) || str(candidate.aiAnalysis?.summary);
    const comments = (Array.isArray(candidate.hrComments) ? candidate.hrComments : [])
        .filter((c) => c && typeof c === 'object' && str(c.text));
    const rejection = stageKey === 'rejected' ? resolveRejection(candidate.rejectionReason) : null;

    const role = candidate.matchedPositionTitle === null
        ? null
        : str(candidate.matchedPositionTitle) || str(candidate.position) || str(candidate.bestTitle);
    const cvRole = cleanRoleText(candidate.suggestedRole, str(candidate.position));

    const scoreNum = Number.isFinite(Number(score)) ? Math.round(Number(score)) : 0;

    return (
        <aside className={`w-[340px] flex-none border-r border-n200 overflow-y-auto custom-scrollbar flex-col ${className}`} aria-label="Adayın özeti">
            {/* KİMLİK */}
            <div className="px-6 pt-6 pb-5">
                <CandidateAvatar
                    name={candidate.name}
                    photo={candidate.photo}
                    photoUrl={candidate.photoUrl}
                    profileImage={candidate.profileImage}
                    size="md"
                    rounded="rounded-full"
                />
                <h1 className="m-0 mt-3 text-[22px] leading-7 font-semibold tracking-[-0.02em] text-n900 break-words">
                    {str(candidate.name) || 'İsimsiz'}
                </h1>
                <p className="m-0 mt-1 text-[14px] text-n600">
                    {role === null
                        ? <span className="text-warn-text font-medium">Uygun açık pozisyon yok</span>
                        : role || '—'}
                </p>
                {cvRole && cvRole !== role && (
                    <p className="m-0 mt-0.5 text-[13px] text-n500">CV&apos;ye göre: <span className="text-n700 font-medium">{cvRole}</span></p>
                )}
                {str(candidate.email) && (
                    <p className="m-0 mt-0.5 text-[13px] text-n500 break-all">{str(candidate.email)}</p>
                )}
                {isTop2Percent && (
                    <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-0.5 rounded-full bg-ok-bg text-ok-text">
                        <Target className="w-3 h-3" aria-hidden="true" /> İlk %2
                    </span>
                )}
            </div>

            {/* UYUM — skor ve gerekçesi yan yana: çıplak bir yüzde güven vermiyor. */}
            <section className="mx-4 mb-5 rounded-2xl bg-brand-50 px-4 py-4">
                <div className="flex items-end gap-3">
                    <span className="text-[40px] leading-[40px] font-semibold tabular-nums text-brand-700" title="Endeks skoru — CV analizi ve (varsa) mülakat kanıtının birleşimi">
                        {scoreNum || '—'}
                    </span>
                    <span className="pb-1 text-[13px] text-brand-700">Endeks skoru</span>
                    <span className="ml-auto pb-1 text-right">
                        <span className="block text-[16px] font-semibold tabular-nums text-n900" title="CV'de ne kadar kanıt bulunduğunu ölçer — adayın ne kadar iyi olduğunu değil.">
                            {starScore != null ? `%${starScore}` : '—'}
                        </span>
                        <span className="block text-[12px] text-n600">STAR kanıtı</span>
                    </span>
                </div>
                {Number.isFinite(Number(candidate.screeningScore)) && candidate.screeningScore != null && (
                    <p className="m-0 mt-2 text-[13px] text-n700">Eleme skoru <span className="font-semibold tabular-nums">%{Math.round(Number(candidate.screeningScore))}</span></p>
                )}
                {reasonText && <p className="m-0 mt-3 text-[13px] leading-[1.5] text-n800">{reasonText}</p>}
                {(strengths.length > 0 || weaknesses.length > 0) && (
                    <ul className="list-none m-0 mt-3 p-0 flex flex-col gap-1.5">
                        {strengths.map((t, i) => (
                            <li key={`s${i}`} className="flex gap-2 text-[13px] text-n800"><span className="text-brand-700 flex-none" aria-hidden="true">+</span><span className="sr-only">Güçlü yan:</span>{t}</li>
                        ))}
                        {weaknesses.map((t, i) => (
                            <li key={`w${i}`} className="flex gap-2 text-[13px] text-n700"><span className="text-warn-text flex-none" aria-hidden="true">−</span><span className="sr-only">Eksik yan:</span>{t}</li>
                        ))}
                    </ul>
                )}
                <button onClick={() => onOpenTab?.('cv_match')} className="mt-3 text-[13px] tf-link">Uyum analizini aç</button>
            </section>

            {/* YOLCULUK — akışın altı adımı, adayın geçtikleri ve şu anki yeri. */}
            <section className="px-6 pb-5">
                <div className="flex items-baseline justify-between mb-3">
                    <h2 className="tf-section-title">Aday akışı</h2>
                    <FlowTrace stageKey={stageKey} />
                </div>
                <ol className="list-none m-0 p-0 relative">
                    <li className="relative pl-6 pb-4">
                        <span className="absolute left-[5px] top-[18px] bottom-0 w-px bg-n200" aria-hidden="true" />
                        <span className="absolute left-0 top-[5px] w-[11px] h-[11px] rounded-full bg-brand-200" aria-hidden="true" />
                        <div className="text-[13px] font-medium text-n900">Başvurdu</div>
                        <div className="text-[12px] text-n500">
                            {[fmtDate(applied), str(candidate.source)].filter(Boolean).join(', ') || 'Tarih yok'}
                        </div>
                    </li>
                    {FLOW_STAGES.map((s, i) => {
                        const state = idx < 0 ? 'unknown' : i < idx ? 'done' : i === idx ? 'current' : 'next';
                        const last = i === FLOW_STAGES.length - 1 && !rejection;
                        const dot = state === 'current' ? 'bg-brand ring-4 ring-brand-100'
                            : state === 'done' ? 'bg-brand-200' : 'bg-n0 border border-n300';
                        const showSessions = s.key === 'interview_scheduled' && sessions.length > 0;
                        return (
                            <li key={s.key} className={`relative pl-6 ${last ? '' : 'pb-4'}`} aria-current={state === 'current' ? 'step' : undefined}>
                                {!last && <span className="absolute left-[5px] top-[18px] bottom-0 w-px bg-n200" aria-hidden="true" />}
                                <span className={`absolute left-0 top-[5px] w-[11px] h-[11px] rounded-full ${dot}`} aria-hidden="true" />
                                <div className={`text-[13px] ${state === 'current' ? 'font-semibold text-n900' : state === 'done' ? 'font-medium text-n800' : 'text-n500'}`}>
                                    {s.label}
                                </div>
                                {state === 'current' && (
                                    <div className="text-[12px] mt-0.5">
                                        <span className={days != null && days >= STALE_DAYS ? 'text-warn-text font-medium' : 'text-n600'}>
                                            {days == null ? 'Süre bilinmiyor' : days === 0 ? 'Bugün bu aşamaya geldi' : `${days} gündür burada`}
                                        </span>
                                        {step && (
                                            <span className="block text-n700">
                                                {step.owner === 'candidate' ? `${step.label} bekleniyor` : `Sıradaki: ${step.label}`}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {showSessions && (
                                    <ul className="list-none m-0 mt-1.5 p-0 flex flex-col gap-1">
                                        {sessions.slice(0, 4).map((ses, k) => {
                                            const done = isSessionDone(ses);
                                            const sc = Number(ses.finalScore) || Number(ses.aiOverallScore) || 0;
                                            return (
                                                <li key={str(ses.id) || k} className="text-[12px] text-n600 flex items-center gap-2">
                                                    <span className="tabular-nums text-n800">{[fmtDate(ses.date), str(ses.time)].filter(Boolean).join(' ') || 'Tarihsiz'}</span>
                                                    <span>{TYPE_LABEL[ses.type] || str(ses.title) || 'Mülakat'}</span>
                                                    <span className={`ml-auto ${done ? 'text-ok-text' : 'text-n500'}`}>
                                                        {done ? (sc ? `Yapıldı, ${Math.round(sc)}` : 'Yapıldı') : ses.status === 'live' ? 'Canlı' : 'Planlı'}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                    {rejection && (
                        <li className="relative pl-6" aria-current="step">
                            <span className="absolute left-0 top-[5px] w-[11px] h-[11px] rounded-full bg-n400" aria-hidden="true" />
                            <div className="text-[13px] font-semibold text-n900">{stage.label}</div>
                            <div className="text-[12px] text-n600">{rejection.note || rejection.label}</div>
                        </li>
                    )}
                    {stageKey === 'rejected' && !rejection && (
                        <li className="relative pl-6" aria-current="step">
                            <span className="absolute left-0 top-[5px] w-[11px] h-[11px] rounded-full bg-n400" aria-hidden="true" />
                            <div className="text-[13px] font-semibold text-n900">{stage.label}</div>
                            <div className="text-[12px] text-n500">Neden girilmemiş</div>
                        </li>
                    )}
                </ol>
                <button onClick={() => onOpenTab?.('history')} className="mt-3 text-[13px] tf-link">Süreç geçmişini aç</button>
            </section>

            {/* NOTLAR — ekibin yorumları; tamamı ve yenisi yorum penceresinde. */}
            <section className="px-6 pb-6">
                <div className="flex items-baseline justify-between mb-2">
                    <h2 className="tf-section-title">Notlar <span className="text-n500 font-normal tabular-nums">{comments.length}</span></h2>
                    <button onClick={onOpenComments} className="inline-flex items-center gap-1 text-[13px] tf-link">
                        <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" /> Yorum ekle
                    </button>
                </div>
                {comments.length === 0 ? (
                    <p className="m-0 text-[13px] text-n500">Henüz not yok.</p>
                ) : (
                    <ul className="list-none m-0 p-0 flex flex-col gap-2">
                        {comments.slice(-2).reverse().map((c, i) => (
                            <li key={i} className="bg-n50 rounded-xl px-3 py-2.5">
                                <p className="m-0 text-[13px] leading-[1.5] text-n800 line-clamp-3">{str(c.text)}</p>
                                <p className="m-0 mt-1 text-[12px] text-n500">
                                    {[str(c.author), str(c.createdAt).slice(0, 10)].filter(Boolean).join(', ')}
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </aside>
    );
}
