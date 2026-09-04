// MÜLAKAT RAPORUNUN PDF BELGESİ.
//
// ── NEDEN YAZDIRMA DEĞİL ────────────────────────────────────────────────────
// "PDF" düğmesi `window.print()` çağırıyordu. Bu, raporu EKRAN DÜZENİYLE
// yazıcıya veriyor ve üç ayrı yerden içerik kaybettiriyordu:
//
//   1. Sayfa `h-screen overflow-hidden`: ekranda kaydırılan bölümlerin
//      yalnızca görünen kısmı basılıyor.
//   2. Transkript kutusu `h-[640px]` sabit yükseklikte ve kendi içinde
//      kayıyor — 640 pikselden sonrası çıktıya HİÇ girmiyor.
//   3. Rapor iki SEKME: "Genel bakış" açıkken transkript, transkript
//      açıkken değerlendirme basılmıyor.
//
// Üstüne kullanıcının seçtiği "Microsoft Print to PDF" sürücüsü sayfayı
// resme çeviriyor: gelen dosyada tek bir metin karakteri yok, arama
// yapılamıyor, kopyalanamıyor (11 sayfa, 1 MB, 0 font).
//
// Bu dosya raporu EKRANDAN DEĞİL VERİDEN kuruyor. Çıktı gerçek metin
// katmanı olan, sayfaları kendi bölünen, sekme kavramı olmayan tek bir
// belge — ekranda ne varsa hepsi, kırpılmadan.
//
// ── NEDEN AYRI VE SAF ───────────────────────────────────────────────────────
// Burada pdfmake `import` EDİLMEZ. Belge tanımı düz bir nesne; kütüphane
// yalnızca indirme anında (services/pdfExport.js) dinamik yükleniyor. Bu
// sayede hem raporun içeriği kütüphanesiz test edilebiliyor hem de ~600 KB'lık
// paket, PDF indirmeyen kullanıcıya hiç inmiyor.

import { VERDICT_LABEL, OUTCOME_LABEL, NO_SCORE_TEXT } from './interviewReport';

/** Marka rengi — ekrandaki `--color-brand` ile aynı. */
const BRAND = '#5068FF';
const INK = '#1A1D29';
const MUTED = '#6B7384';

/** STAR ekseni etiketleri — ekrandaki sırayla. */
const STAR_ROWS = [
    { key: 'S', label: 'Durum' },
    { key: 'T', label: 'Görev' },
    { key: 'A', label: 'Eylem' },
    { key: 'R', label: 'Sonuç' },
];

/** Yetkinlik ekseni etiketleri — ekrandaki sırayla. */
const COMPETENCY_ROWS = [
    { key: 'technical', label: 'Teknik' },
    { key: 'communication', label: 'İletişim' },
    { key: 'problemSolving', label: 'Problem çözme' },
    { key: 'cultureFit', label: 'Kültür uyumu' },
    { key: 'adaptability', label: 'Adaptasyon' },
];

const metin = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
/**
 * Gerçekten bir sayı mı?
 *
 * `Number(null)` ve `Number('')` SIFIR döndürüyor — çıplak `Number.isFinite`
 * ile yazılan bir denetim, skoru olmayan bir kaydı "0 puan" sanır ve belgeye
 * "%null" bastırır. Testte tam olarak bu yakalandı.
 */
const sayiMi = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/** Tarih — kayıt bozuksa uydurulmuyor, boş dönüyor. */
export function tarihMetni(value) {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Dosya adı — Türkçe karakter ve boşluk indirme akışında sorun çıkarıyor. */
export function dosyaAdi(candidate, session) {
    const ad = metin(candidate?.name) || 'aday';
    const sade = ad
        .replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/Ş/g, 'S').replace(/ş/g, 's')
        .replace(/Ğ/g, 'G').replace(/ğ/g, 'g').replace(/Ü/g, 'U').replace(/ü/g, 'u')
        .replace(/Ö/g, 'O').replace(/ö/g, 'o').replace(/Ç/g, 'C').replace(/ç/g, 'c')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'aday';
    const gun = (() => {
        const d = session?.date ? new Date(session.date) : new Date();
        return Number.isNaN(d.getTime()) ? '' : `-${d.toISOString().slice(0, 10)}`;
    })();
    return `mulakat-raporu-${sade}${gun}.pdf`;
}

const baslik = (text) => ({ text, style: 'h2', margin: [0, 14, 0, 6] });
const altBaslik = (text) => ({ text, style: 'h3', margin: [0, 8, 0, 3] });
const paragraf = (text) => ({ text, style: 'p', margin: [0, 0, 0, 4] });

/** Etiket–değer çiftleri; boş değerler DÜŞÜRÜLÜR, "N/A" basılmaz. */
function bilgiTablosu(rows) {
    const dolu = rows.filter((r) => metin(r.value));
    if (dolu.length === 0) return null;
    return {
        table: {
            widths: ['auto', '*'],
            body: dolu.map((r) => ([
                { text: r.label, style: 'label' },
                { text: metin(r.value), style: 'p' },
            ])),
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 6],
    };
}

/** 0-100 puan satırı — çubuk yerine sayı; PDF'te çubuk okunmuyor. */
function puanTablosu(rows) {
    if (rows.length === 0) return null;
    return {
        table: {
            widths: ['*', 'auto'],
            body: rows.map((r) => ([
                { text: r.label, style: 'p' },
                { text: `${r.value}/100`, style: 'pBold', alignment: 'right' },
            ])),
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 6],
    };
}

/**
 * Madde damgaları — raporun çekirdeği.
 *
 * Her madde için: gereksinim metni, hüküm, sorulan soru, adayın cevabı,
 * alıntı ve mülakatçı gözlemi. Ekranda bunlar açılır kapanır kutulardaydı;
 * PDF'te AÇIK basılıyor — kapalı bir kutu kâğıtta açılamaz.
 */
function maddeBlogu(items) {
    const out = [];
    for (const it of items) {
        const satirlar = [];
        const label = VERDICT_LABEL[it.verdict] || it.verdict || '—';
        satirlar.push({
            text: [
                { text: `Madde ${it.requirementIndex}`, style: 'pBold' },
                it.must ? { text: '  · Zorunlu', style: 'label' } : '',
                { text: `  · ${label}`, style: 'label' },
            ],
            margin: [0, 6, 0, 2],
        });
        // METİN YOKSA SEBEBİ YAZILIYOR. Ekranda da böyle: ilan görüşmeden
        // sonra değiştiyse madde metni gösterilmiyor, çünkü bugünkü listeden
        // okumak cevabı yanlış maddeye yazmak olurdu.
        satirlar.push(paragraf(metin(it.text) || 'Madde metni bu rapora bağlı listede yok.'));
        if (metin(it.question)) satirlar.push({ text: `Soru: ${it.question}`, style: 'pMuted' });
        if (metin(it.answer)) satirlar.push({ text: `Cevap: ${it.answer}`, style: 'p' });
        if (metin(it.quote)) satirlar.push({ text: `Alıntı: “${it.quote}”`, style: 'quote' });
        if (metin(it.observation)) satirlar.push({ text: `Gözlem: ${it.observation}`, style: 'pMuted' });
        out.push({ stack: satirlar, unbreakable: true });
    }
    return out;
}

/**
 * Transkript — TAMAMI.
 *
 * Ekranda 640 piksellik bir kutuda kayıyor ve çıktıya yalnızca ilk ekran
 * giriyordu. Burada satır satır, kesintisiz basılıyor. İki biçim de
 * destekleniyor: canlı mülakatın rol etiketli dizisi ve manuel görüşmenin
 * tek parça metni (bkz. InterviewReportPage'deki aynı ayrım).
 */
function transkriptBlogu(session) {
    const ham = session?.transcript;
    if (Array.isArray(ham) && ham.length > 0) {
        return ham
            .filter((m) => metin(m?.text))
            .map((m) => ({
                text: [
                    { text: `${metin(m.role) || 'Konuşmacı'}: `, style: 'pBold' },
                    { text: metin(m.text), style: 'p' },
                ],
                margin: [0, 0, 0, 3],
            }));
    }
    if (typeof ham === 'string' && ham.trim()) {
        return ham.trim().split(/\n+/).map((satir) => paragraf(satir));
    }
    const mesajlar = Array.isArray(session?.messages) ? session.messages : [];
    if (mesajlar.length > 0) {
        return mesajlar
            .filter((m) => metin(m?.text))
            .map((m) => ({
                text: [
                    { text: `${metin(m.role) || 'Konuşmacı'}: `, style: 'pBold' },
                    { text: metin(m.text), style: 'p' },
                ],
                margin: [0, 0, 0, 3],
            }));
    }
    return [{ text: 'Bu görüşme için transkript kaydı yok.', style: 'pMuted' }];
}

/**
 * Mülakat raporunun pdfmake belge tanımını kurar.
 *
 * @param {object} input
 *   candidate      — aday kaydı
 *   session        — mülakat oturumu (kanonik kayıtla birleştirilmiş hâli)
 *   report         — buildInterviewReport() çıktısı
 *   recruiterEval  — mülakatçı değerlendirmesi (varsa)
 *   recruiterNotes — değerlendirme notları (varsa)
 *   finalDecision  — karar (varsa)
 *   now            — üretim zamanı; testler sabitleyebilsin diye dışarıdan
 * @returns {object} pdfmake docDefinition
 */
export function buildInterviewReportDoc({
    candidate,
    session,
    report,
    recruiterEval = null,
    recruiterNotes = '',
    finalDecision = '',
    now = new Date(),
} = {}) {
    const adayAdi = metin(candidate?.name) || 'İsimsiz aday';
    const pozisyon = metin(candidate?.position) || metin(candidate?.bestTitle) || '';
    const tarih = tarihMetni(session?.date);
    const content = [];

    // ── Kimlik ──────────────────────────────────────────────────────────────
    content.push({ text: adayAdi, style: 'h1' });
    const kimlik = [pozisyon, tarih, report?.mode === 'manual' ? 'Manuel girilen görüşme' : 'Canlı mülakat']
        .filter(Boolean).join('  ·  ');
    content.push({ text: kimlik, style: 'pMuted', margin: [0, 0, 0, 10] });

    // ── Skorlar — YALNIZCA KAYITTA OLAN ─────────────────────────────────────
    // Ekrandaki kuralın aynısı: eksik skoru başka bir skorla doldurmak,
    // CV puanını mülakattan gelmiş gibi göstermek olurdu.
    const skorlar = [];
    if (sayiMi(session?.finalScore)) skorlar.push({ label: 'Genel skor', value: `%${session.finalScore}` });
    if (sayiMi(session?.interviewScore)) skorlar.push({ label: 'Mülakat skoru', value: `%${session.interviewScore}` });
    if (sayiMi(report?.evidence?.score)) {
        skorlar.push({ label: 'Kanıt oranı', value: `%${report.evidence.score} (${report.evidence.asked} madde)` });
    }
    const skorTablo = bilgiTablosu(skorlar);
    if (skorTablo) content.push(skorTablo);

    // ── Sonuç ───────────────────────────────────────────────────────────────
    const sonuclar = [];
    if (report?.recruiterOutcome) {
        sonuclar.push({ label: 'Mülakatçı kararı', value: OUTCOME_LABEL[report.recruiterOutcome] || report.recruiterOutcome });
    }
    if (report?.outcome) {
        sonuclar.push({ label: 'Önerilen sonuç', value: OUTCOME_LABEL[report.outcome] || report.outcome });
    }
    if (metin(finalDecision)) sonuclar.push({ label: 'Karar', value: finalDecision });
    const sonucTablo = bilgiTablosu(sonuclar);
    if (sonucTablo) {
        content.push(baslik('Sonuç'));
        content.push(sonucTablo);
    }
    // SKOR ÜRETİLEMEDİYSE SEBEBİ YAZILIYOR. Boş bırakmak, ölçülmemiş bir şeyi
    // ölçülmüş sanmaya açık kapı bırakırdı.
    if (report?.noScoreReason && NO_SCORE_TEXT[report.noScoreReason]) {
        content.push({ text: NO_SCORE_TEXT[report.noScoreReason], style: 'pMuted', margin: [0, 0, 0, 4] });
    }

    // ── Özet — TAM METİN, KIRPILMADAN ───────────────────────────────────────
    // Şikâyetin merkezi burasıydı: çıktıda özet yarım kalıyordu. Metin
    // kayıtta eksiksiz duruyor; kaybolduğu yer sayfa sonuydu.
    const ozet = metin(report?.summary) || metin(session?.aiSummary);
    if (ozet) {
        content.push(baslik('Özet'));
        content.push(paragraf(ozet));
    }
    // İki farklı özet varsa ikisi de basılıyor; birini seçmek bilgi atmak olur.
    const ikinciOzet = metin(session?.aiSummary);
    if (ikinciOzet && ikinciOzet !== ozet) {
        content.push(altBaslik('Görüşme özeti'));
        content.push(paragraf(ikinciOzet));
    }

    const guclu = Array.isArray(report?.strengths) ? report.strengths.filter(Boolean) : [];
    const endise = Array.isArray(report?.concerns) ? report.concerns.filter(Boolean) : [];
    if (guclu.length > 0) {
        content.push(altBaslik('Güçlü yönler'));
        content.push({ ul: guclu.map(metin), style: 'p', margin: [0, 0, 0, 4] });
    }
    if (endise.length > 0) {
        content.push(altBaslik('Dikkat edilecekler'));
        content.push({ ul: endise.map(metin), style: 'p', margin: [0, 0, 0, 4] });
    }

    // ── Madde madde değerlendirme ───────────────────────────────────────────
    const items = Array.isArray(report?.items) ? report.items : [];
    if (items.length > 0) {
        content.push(baslik('Gereksinim değerlendirmesi'));
        if (report?.requirementsStale) {
            content.push({
                text: 'Bu damgalar, ilanın görüşme anındaki gereksinim listesine ait. Liste sonradan değiştiği için madde metinleri gösterilmiyor.',
                style: 'pMuted',
                margin: [0, 0, 0, 4],
            });
        }
        content.push(...maddeBlogu(items));
    }

    const unlinked = Array.isArray(report?.unlinked) ? report.unlinked : [];
    if (unlinked.length > 0) {
        content.push(baslik('Maddeye bağlanmayan sorular'));
        for (const q of unlinked) {
            const satir = [{ text: metin(q.question), style: 'pBold', margin: [0, 6, 0, 2] }];
            if (metin(q.answer)) satir.push({ text: `Cevap: ${q.answer}`, style: 'p' });
            if (metin(q.observation)) satir.push({ text: `Gözlem: ${q.observation}`, style: 'pMuted' });
            content.push({ stack: satir, unbreakable: true });
        }
    }

    // ── STAR ve yetkinlik ───────────────────────────────────────────────────
    const star = STAR_ROWS
        .filter((r) => sayiMi(session?.starScores?.[r.key]))
        .map((r) => ({ label: r.label, value: Number(session.starScores[r.key]) }));
    if (star.length > 0) {
        content.push(baslik('STAR kanıt analizi'));
        content.push(puanTablosu(star));
    }

    const yetkinlik = COMPETENCY_ROWS
        .filter((r) => sayiMi(session?.starScores?.[r.key]))
        .map((r) => ({ label: r.label, value: Number(session.starScores[r.key]) }));
    if (yetkinlik.length > 0) {
        content.push(baslik('Yetkinlik analizi'));
        content.push(puanTablosu(yetkinlik));
        const ort = Math.round(yetkinlik.reduce((s, r) => s + r.value, 0) / yetkinlik.length);
        content.push({ text: `Ortalama: %${ort}`, style: 'pBold', margin: [0, 0, 0, 4] });
    }

    // ── Mülakatçı değerlendirmesi — BOYUTLAR AÇIK ───────────────────────────
    // Ekranda katlanır bir bölümdü; kâğıtta katlanmış bölüm açılamaz.
    if (recruiterEval) {
        content.push(baslik('Mülakatçı değerlendirmesi'));
        if (sayiMi(recruiterEval.overallScore)) {
            content.push({ text: `Genel: ${recruiterEval.overallScore}/5`, style: 'pBold', margin: [0, 0, 0, 3] });
        }
        if (metin(recruiterEval.summary)) content.push(paragraf(recruiterEval.summary));
        for (const dim of (Array.isArray(recruiterEval.dimensions) ? recruiterEval.dimensions : [])) {
            const satir = [{
                text: `${metin(dim.label) || metin(dim.key)}${sayiMi(dim.score) ? ` — ${dim.score}/5` : ''}`,
                style: 'pBold',
                margin: [0, 5, 0, 2],
            }];
            if (metin(dim.explanation)) satir.push(paragraf(dim.explanation));
            if (metin(dim.tip)) satir.push({ text: `Öneri: ${dim.tip}`, style: 'quote' });
            content.push({ stack: satir, unbreakable: true });
        }
    }

    if (metin(recruiterNotes)) {
        content.push(baslik('Değerlendirme notları'));
        content.push(paragraf(recruiterNotes));
    }

    // ── Oturum bilgileri ────────────────────────────────────────────────────
    const oturum = bilgiTablosu([
        { label: 'Tür', value: report?.mode === 'manual' ? 'Manuel görüşme' : 'Canlı mülakat' },
        { label: 'Tarih', value: tarih },
        { label: 'Süre', value: session?.duration },
        { label: 'Dil', value: session?.language },
        { label: 'Pozisyon', value: session?.positionTitle },
    ]);
    if (oturum) {
        content.push(baslik('Oturum bilgileri'));
        content.push(oturum);
    }

    const keywords = Array.isArray(session?.keywords) ? session.keywords.filter(Boolean) : [];
    if (keywords.length > 0) {
        content.push(altBaslik('Anahtar kelimeler'));
        content.push(paragraf(keywords.map(metin).join(' · ')));
    }

    // ── Transkript — EN SONA, KESİNTİSİZ ────────────────────────────────────
    content.push({ text: 'Tam transkript', style: 'h2', pageBreak: 'before', margin: [0, 0, 0, 6] });
    content.push(...transkriptBlogu(session));

    return {
        info: {
            title: `Mülakat Raporu — ${adayAdi}`,
            author: 'TalentFlow',
            subject: pozisyon || 'Mülakat raporu',
        },
        pageSize: 'A4',
        pageMargins: [40, 54, 40, 44],
        header: () => ({
            columns: [
                { text: 'Mülakat Raporu', style: 'headerLeft' },
                { text: [adayAdi, tarih].filter(Boolean).join('  ·  '), style: 'headerRight', alignment: 'right' },
            ],
            margin: [40, 22, 40, 0],
        }),
        // SAYFA NUMARASI ŞART: rapor elden ele dolaşıyor ve kaçıncı sayfanın
        // eksik olduğu ancak numarayla anlaşılır.
        footer: (currentPage, pageCount) => ({
            columns: [
                { text: `TalentFlow · ${now.toLocaleDateString('tr-TR')} tarihinde üretildi`, style: 'footer' },
                { text: `${currentPage} / ${pageCount}`, style: 'footer', alignment: 'right' },
            ],
            margin: [40, 12, 40, 0],
        }),
        content,
        defaultStyle: { font: 'Roboto', fontSize: 9.5, color: INK, lineHeight: 1.35 },
        styles: {
            h1: { fontSize: 17, bold: true, color: INK, margin: [0, 0, 0, 2] },
            h2: { fontSize: 12, bold: true, color: BRAND },
            h3: { fontSize: 10, bold: true, color: INK },
            p: { fontSize: 9.5, color: INK },
            pBold: { fontSize: 9.5, bold: true, color: INK },
            pMuted: { fontSize: 9, color: MUTED },
            label: { fontSize: 9, color: MUTED },
            quote: { fontSize: 9, italics: true, color: MUTED },
            headerLeft: { fontSize: 8, color: MUTED },
            headerRight: { fontSize: 8, color: MUTED },
            footer: { fontSize: 7.5, color: MUTED },
        },
    };
}
