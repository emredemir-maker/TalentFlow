import { useState } from 'react';
import { FileText, Download, ExternalLink, User, Briefcase, AlignLeft, AlertCircle } from 'lucide-react';
import {
    cvProfileFields,
    cvTextOf,
    defaultCvMode,
    hasNoCv,
    hasOriginalCvFile,
    isEmbeddableCv,
    normalizeExperiences,
} from '../utils/candidateCv.js';

/**
 * Adayın CV'sini iki biçimde gösterir: orijinal dosya (PDF gömülü) ya da
 * tek sayfalık form. Hangisinin açılacağını defaultCvMode belirler —
 * gösterilebilir bir orijinal varsa kullanıcı fazladan tıklamamalı.
 *
 * Form görünümü orijinal olmayan adaylar için ZORUNLU: başvuru formu ve
 * toplu içe aktarma akışları çoğu zaman yalnızca metin bırakıyor, dosyayı
 * saklamıyor. Bu adaylarda "CV yok" demek yanlış olurdu; veri var, dosya yok.
 */
export default function CandidateCvPanel({ candidate }) {
    const [mode, setMode] = useState(() => defaultCvMode(candidate));

    const cvText = cvTextOf(candidate);
    const embeddable = isEmbeddableCv(candidate);
    const hasFile = hasOriginalCvFile(candidate);

    if (hasNoCv(candidate)) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                    <FileText className="w-7 h-7 text-slate-300" />
                </div>
                <div>
                    <p className="text-[12px] font-black text-slate-700 mb-1">CV Bulunamadı</p>
                    <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                        Bu aday için ne orijinal dosya ne de çıkarılmış CV metni kayıtlı.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-3.5 rounded-full bg-cyan-500" />
                    <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Aday CV'si</h3>
                </div>

                <div className="flex items-center gap-2">
                    {/* Geçiş yalnızca iki görünüm de anlamlıysa — tek seçenek varken
                        kapalı bir düğme göstermek kullanıcıyı yanıltır. */}
                    {embeddable && cvText && (
                        <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
                            <button
                                onClick={() => setMode('pdf')}
                                className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider transition-colors ${
                                    mode === 'pdf' ? 'bg-cyan-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                                }`}
                            >
                                Orijinal
                            </button>
                            <button
                                onClick={() => setMode('form')}
                                className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider transition-colors ${
                                    mode === 'form' ? 'bg-cyan-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                                }`}
                            >
                                Form
                            </button>
                        </div>
                    )}

                    {hasFile && (
                        <>
                            <a
                                href={candidate.cvUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[9px] font-black text-slate-500 hover:border-cyan-300 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
                            >
                                <ExternalLink size={10} /> Yeni Sekmede
                            </a>
                            <a
                                href={candidate.cvUrl}
                                download
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[9px] font-black text-slate-500 hover:border-cyan-300 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
                            >
                                <Download size={10} /> İndir
                            </a>
                        </>
                    )}
                </div>
            </div>

            {/* Orijinal dosya var ama gömülemiyor (DOCX vb.) — boş bir çerçeve
                göstermektense durumu açıkça söyle. */}
            {hasFile && !embeddable && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                        Orijinal dosya PDF olmadığı için tarayıcıda gösterilemiyor. Yukarıdaki
                        <strong> İndir </strong> bağlantısını kullanabilirsiniz; aşağıda CV'nin metin hâli var.
                    </p>
                </div>
            )}

            {mode === 'pdf' && embeddable ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                    <iframe
                        src={candidate.cvUrl}
                        title={`${candidate.name || 'Aday'} CV`}
                        className="w-full h-[75vh] min-h-[520px] border-0"
                    />
                </div>
            ) : (
                <CvForm candidate={candidate} cvText={cvText} />
            )}
        </div>
    );
}

/** Tek sayfalık "her şey bir arada" görünüm. */
function CvForm({ candidate, cvText }) {
    const fields = cvProfileFields(candidate);
    const experiences = normalizeExperiences(candidate);
    const skills = Array.isArray(candidate?.skills) ? candidate.skills.filter(Boolean) : [];

    return (
        <div className="space-y-6">
            {fields.length > 0 && (
                <Section icon={<User className="w-3.5 h-3.5 text-cyan-500" />} title="Künye">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                        {fields.map((f) => (
                            <div key={f.label} className="flex flex-col gap-0.5">
                                <dt className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{f.label}</dt>
                                <dd className="text-[12px] font-medium text-slate-700 break-words">{f.value}</dd>
                            </div>
                        ))}
                    </dl>
                </Section>
            )}

            {skills.length > 0 && (
                <Section icon={<Briefcase className="w-3.5 h-3.5 text-cyan-500" />} title="Yetenekler">
                    <div className="flex flex-wrap gap-1.5">
                        {skills.map((s, i) => (
                            <span
                                key={i}
                                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-600 shadow-sm uppercase"
                            >
                                {s}
                            </span>
                        ))}
                    </div>
                </Section>
            )}

            {experiences.length > 0 && (
                <Section icon={<Briefcase className="w-3.5 h-3.5 text-cyan-500" />} title="Kariyer Geçmişi">
                    <div className="space-y-4 pl-2">
                        {experiences.map((exp, i) => (
                            <div key={i} className="relative pl-5 border-l-2 border-cyan-100 pb-1">
                                <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-cyan-400 shadow-sm" />
                                <div className="flex justify-between items-start mb-1 flex-wrap gap-1">
                                    <div>
                                        {exp.role && <h4 className="text-[13px] font-black text-slate-800">{exp.role}</h4>}
                                        {exp.company && <p className="text-[11px] font-bold text-slate-500 uppercase">{exp.company}</p>}
                                    </div>
                                    {exp.duration && (
                                        <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 shrink-0">
                                            {exp.duration}
                                        </span>
                                    )}
                                </div>
                                {exp.desc && (
                                    <p className="text-[12px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                                        {exp.desc}
                                    </p>
                                )}
                                {exp.milestones.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                        {exp.milestones.map((m, idx) => (
                                            <span
                                                key={idx}
                                                className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-lg border border-emerald-100"
                                            >
                                                {m}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {cvText && (
                <Section icon={<AlignLeft className="w-3.5 h-3.5 text-cyan-500" />} title="CV Metninin Tamamı">
                    {/* whitespace-pre-wrap: CV metni satır sonlarıyla anlam taşıyor;
                        tek paragrafa çökerse okunmaz hâle geliyor. */}
                    <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-[12px] text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
                            {cvText}
                        </p>
                    </div>
                </Section>
            )}
        </div>
    );
}

// İkon hazır JSX olarak geçilir — CandidateProcessPage'deki TABS dizisiyle
// aynı kalıp.
function Section({ icon, title, children }) {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                {icon}
                <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">{title}</h4>
            </div>
            {children}
        </div>
    );
}
