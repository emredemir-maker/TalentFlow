import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { logAccess, ACCESS_ACTIONS } from '../services/accessLog';
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
    const { user } = useAuth();

    // CV DOSYASINA ERİŞİM AYRICA KAYDEDİLİYOR.
    //
    // Aday detayını açmak zaten deftere yazılıyor ama dosyanın kendisine
    // ulaşmak ayrı bir olay: indirilen bir CV artık uygulamanın dışında ve
    // geri alınamıyor. Bir incelemede sorulan soru "kim baktı" değil,
    // "kim indirdi" oluyor.
    const cvErisimiKaydet = (nasil) => {
        if (!user?.uid) return;
        logAccess(ACCESS_ACTIONS.CV_VIEW, {
            uid: user.uid,
            email: user.email,
            candidateId: candidate?.id,
            note: nasil,
        });
    };

    const [mode, setMode] = useState(() => defaultCvMode(candidate));

    const cvText = cvTextOf(candidate);
    const embeddable = isEmbeddableCv(candidate);
    const hasFile = hasOriginalCvFile(candidate);

    if (hasNoCv(candidate)) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                <div className="w-14 h-14 rounded-[14px] bg-n50 border border-n200 flex items-center justify-center">
                    <FileText className="w-7 h-7 text-n300" />
                </div>
                <div>
                    <p className="text-[11px] font-semibold text-n700 mb-1">CV Bulunamadı</p>
                    <p className="text-[11px] text-n400 max-w-xs leading-relaxed">
                        Bu aday için ne orijinal dosya ne de çıkarılmış CV metni kayıtlı.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-n200">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-3.5 rounded-full bg-brand" />
                    <h3 className="text-[10px] font-semibold text-n700 uppercase tracking-[0.08em]">Aday CV'si</h3>
                </div>

                <div className="flex items-center gap-2">
                    {/* Geçiş yalnızca iki görünüm de anlamlıysa — tek seçenek varken
                        kapalı bir düğme göstermek kullanıcıyı yanıltır. */}
                    {embeddable && cvText && (
                        <div className="flex items-center rounded-md border border-n200 overflow-hidden">
                            <button
                                onClick={() => setMode('pdf')}
                                className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                                    mode === 'pdf' ? 'bg-brand text-white' : 'bg-n0 text-n500 hover:bg-n50'
                                }`}
                            >
                                Orijinal
                            </button>
                            <button
                                onClick={() => setMode('form')}
                                className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                                    mode === 'form' ? 'bg-brand text-white' : 'bg-n0 text-n500 hover:bg-n50'
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
                                onClick={() => cvErisimiKaydet('yeni sekme')}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-n50 border border-n200 text-[11px] font-semibold text-n500 hover:border-brand-200 hover:text-brand hover:bg-brand-50 transition-colors"
                            >
                                <ExternalLink size={10} /> Yeni Sekmede
                            </a>
                            <a
                                href={candidate.cvUrl}
                                download
                                onClick={() => cvErisimiKaydet('indirme')}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-n50 border border-n200 text-[11px] font-semibold text-n500 hover:border-brand-200 hover:text-brand hover:bg-brand-50 transition-colors"
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
                <div className="flex items-start gap-2 bg-warn-bg rounded-md px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
                    <p className="text-[11px] text-warn leading-relaxed">
                        Orijinal dosya PDF olmadığı için tarayıcıda gösterilemiyor. Yukarıdaki
                        <strong> İndir </strong> bağlantısını kullanabilirsiniz; aşağıda CV'nin metin hâli var.
                    </p>
                </div>
            )}

            {mode === 'pdf' && embeddable ? (
                <div className="rounded-md border border-n200 overflow-hidden bg-n50">
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
                <Section icon={<User className="w-3.5 h-3.5 text-brand" />} title="Künye">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                        {fields.map((f) => (
                            <div key={f.label} className="flex flex-col gap-0.5">
                                <dt className="text-[10px] font-semibold text-n400 uppercase tracking-[0.08em]">{f.label}</dt>
                                <dd className="text-[11px] font-medium text-n700 break-words">{f.value}</dd>
                            </div>
                        ))}
                    </dl>
                </Section>
            )}

            {skills.length > 0 && (
                <Section icon={<Briefcase className="w-3.5 h-3.5 text-brand" />} title="Yetenekler">
                    <div className="flex flex-wrap gap-1.5">
                        {skills.map((s, i) => (
                            <span
                                key={i}
                                className="px-2.5 py-1 bg-n0 border border-n200 rounded-md text-[11px] font-semibold text-n600 shadow-sm uppercase"
                            >
                                {s}
                            </span>
                        ))}
                    </div>
                </Section>
            )}

            {experiences.length > 0 && (
                <Section icon={<Briefcase className="w-3.5 h-3.5 text-brand" />} title="Kariyer Geçmişi">
                    <div className="space-y-4 pl-2">
                        {experiences.map((exp, i) => (
                            <div key={i} className="relative pl-5 border-l-2 border-brand-100 pb-1">
                                <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-n0 border-2 border-brand shadow-sm" />
                                <div className="flex justify-between items-start mb-1 flex-wrap gap-1">
                                    <div>
                                        {exp.role && <h4 className="text-[12px] font-semibold text-n900">{exp.role}</h4>}
                                        {exp.company && <p className="text-[11px] font-semibold text-n500 uppercase">{exp.company}</p>}
                                    </div>
                                    {exp.duration && (
                                        <span className="text-[11px] font-semibold text-n400 bg-n100 px-2 py-0.5 rounded-md border border-n200 shrink-0">
                                            {exp.duration}
                                        </span>
                                    )}
                                </div>
                                {exp.desc && (
                                    <p className="text-[11px] text-n500 leading-relaxed bg-n50 p-2 rounded-md border border-n200">
                                        {exp.desc}
                                    </p>
                                )}
                                {exp.milestones.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                        {exp.milestones.map((m, idx) => (
                                            <span
                                                key={idx}
                                                className="px-2 py-0.5 bg-ok-bg text-ok-text text-[11px] font-semibold rounded-md border border-transparent"
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
                <Section icon={<AlignLeft className="w-3.5 h-3.5 text-brand" />} title="CV Metninin Tamamı">
                    {/* whitespace-pre-wrap: CV metni satır sonlarıyla anlam taşıyor;
                        tek paragrafa çökerse okunmaz hâle geliyor. */}
                    <div className="max-h-[60vh] overflow-y-auto rounded-md border border-n200 bg-n50 p-3">
                        <p className="text-[11px] text-n600 leading-relaxed whitespace-pre-wrap break-words">
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
            <div className="flex items-center gap-2 pb-2 border-b border-n200">
                {icon}
                <h4 className="text-[10px] font-semibold text-n700 uppercase tracking-[0.08em]">{title}</h4>
            </div>
            {children}
        </div>
    );
}
