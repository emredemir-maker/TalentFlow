// DEMO VERİ SETİ — tamamı uydurma.
//
// ── NEDEN VAR ───────────────────────────────────────────────────────────────
// İki yerde aynı veri gerekiyor ve ikisinin de gerçek adaylarla çalışması
// kabul edilemez:
//   1. Tanıtım ekran görüntüleri — ürünü anlatan sayfa gerçek CV'lerin,
//      telefonların ve mülakat transkriptlerinin ekran görüntüsüyle
//      yayımlanamaz.
//   2. Paylaşılan demo kurulumu — ziyaretçilerin gezdiği havuz.
//
// Tek kaynak olması bilinçli: iki ayrı uydurma veri seti tutmak, tanıtımda
// gösterilen ekranla demoda görülen ekranın zamanla ayrışması demek olurdu.
//
// ── İSİMLER VE ŞİRKETLER ────────────────────────────────────────────────────
// Kişi adları kurgusal. Şirket adları da öyle: gerçek bir şirketin adını
// uydurma bir "doğrulama bulgusu"nun yanına yazmak, olmayan bir iddiayı o
// şirkete mal etmek olurdu.
//
// ── VERİ NEDEN "MÜKEMMEL" DEĞİL ─────────────────────────────────────────────
// Kayıtların bir kısmında eksik tarih, karar verilemeyen madde ve
// doğrulanamayan şirket var. Ürünün anlattığı şey tam da bu: ölçülemeyeni
// ölçülmüş gibi göstermemek. Her şeyin yeşil olduğu bir demo, ürünün en
// önemli davranışını gizlerdi.

export const DEMO_POSITIONS = [
    {
        id: 'poz-growth',
        title: 'Growth Ürün Yöneticisi',
        department: 'Ürün',
        location: 'İstanbul · Hibrit',
        status: 'open',
        employmentType: 'Tam zamanlı',
        description:
            'Kayıt ve aktivasyon akışlarının sahibi olacak, deney kurgusunu kendisi tasarlayıp '
            + 'sonucu veriyle savunacak bir ürün yöneticisi arıyoruz.',
        requirementsMeta: [
            { text: 'Uçtan uca funnel sahipliği (kayıt → aktivasyon)', must: true },
            { text: 'A/B test kurgusu ve sonuç okuma', must: true },
            { text: 'SQL ile kendi analizini çıkarabilme', must: true },
            { text: 'B2B SaaS ürününde çalışmış olmak', must: false },
            { text: 'Ekip yönetimi deneyimi', must: false },
        ],
        createdAt: '2026-08-18T09:00:00.000Z',
    },
    {
        id: 'poz-backend',
        title: 'Backend Geliştirici',
        department: 'Mühendislik',
        location: 'Uzaktan',
        status: 'open',
        employmentType: 'Tam zamanlı',
        description: 'Ödeme ve faturalama servislerini geliştirecek bir backend geliştirici.',
        requirementsMeta: [
            { text: 'Node.js ile üretim servisi yazmış olmak', must: true },
            { text: 'İlişkisel veritabanı tasarımı', must: true },
            { text: 'Ödeme sistemleri deneyimi', must: false },
        ],
        createdAt: '2026-08-25T09:00:00.000Z',
    },
];

/** Ana aday — tanıtımdaki derin ekranların hepsi bu kayda bakıyor. */
const ZEYNEP = {
    id: 'aday-zeynep',
    name: 'Zeynep Aksoy',
    email: 'zeynep.aksoy@ornek-posta.com',
    phone: '+90 5XX XXX XX XX',
    location: 'İstanbul',
    position: 'Growth Ürün Yöneticisi',
    department: 'Ürün',
    positionId: 'poz-growth',
    matchedPositionTitle: 'Growth Ürün Yöneticisi',
    bestTitle: 'Growth Ürün Yöneticisi',
    status: 'interview_done',
    source: 'LinkedIn',
    experience: 8,
    appliedDate: '2026-08-22T10:12:00.000Z',
    skills: ['Funnel analizi', 'A/B test', 'SQL', 'Amplitude', 'Jira', 'Figma'],
    education: 'Endüstri Mühendisliği (Lisans)',
    // CV metni — ekranın "CV Bulunamadı" boşluğuyla açılmaması için. Gerçek
    // kayıtlarda bu alan CV dosyasından çıkarılıyor.
    cvText: `ZEYNEP AKSOY
Growth Ürün Yöneticisi · İstanbul

DENEYİM

Kıdemli Ürün Yöneticisi — Marbis Teknoloji (2023-04 - Halen)
Kayıt ve aktivasyon akışlarının sahibi. Kayıt ekranından ilk değerli aksiyona
kadar olan adımların tamamı sorumluluğumda. Deney programını kurdum; çeyrek
hedeflerini veriyle savundum. 14 aylık dönemde kayıt tamamlama oranı iki katına
çıktı.

Ürün Yöneticisi — Kavun Yazılım (2020-09 - 2023-03)
B2B abonelik ürününde fiyatlandırma ve paketleme. Üç ayrı paket yapısını test
edip sonucunu satış ekibiyle birlikte değerlendirdim.

İş Analisti — Ardıç Bilişim (2018-02 - 2020-08)
Gereksinim toplama, süreç dokümantasyonu ve raporlama. Ürün ekibine analiz
desteği verdim.

EĞİTİM
Endüstri Mühendisliği (Lisans)

BECERİLER
Funnel analizi, A/B test kurgusu, SQL, Amplitude, Jira, Figma`,
    experiences: [
        {
            role: 'Kıdemli Ürün Yöneticisi',
            company: 'Marbis Teknoloji',
            duration: '2023-04 - Halen',
            desc: 'Kayıt ve aktivasyon akışlarının sahibi. Deney programını kurdu, '
                + 'çeyrek bazlı hedefleri veriyle savundu.',
        },
        {
            role: 'Ürün Yöneticisi',
            company: 'Kavun Yazılım',
            duration: '2020-09 - 2023-03',
            desc: 'B2B abonelik ürününde fiyatlandırma ve paketleme çalışmalarını yürüttü.',
        },
        {
            role: 'İş Analisti',
            company: 'Ardıç Bilişim',
            duration: '2018-02 - 2020-08',
            desc: 'Gereksinim toplama ve raporlama; ürün ekibine analiz desteği.',
        },
    ],
    positionAnalyses: {
        'Growth Ürün Yöneticisi': {
            score: 74,
            analyzedAt: '2026-08-23T08:30:00.000Z',
            assessments: [
                { index: 1, status: 'met', note: 'Kayıt akışı sahipliği CV\'de açıkça yazılı.' },
                { index: 2, status: 'partial', note: 'Deney programı kurmuş; analiz sahipliği belirsiz.' },
                { index: 3, status: 'unknown', note: 'SQL beceri listesinde var, örnek yok.' },
                { index: 4, status: 'met', note: 'B2B abonelik ürünü deneyimi var.' },
                { index: 5, status: 'missing', note: 'Ekip yönetimine dair kayıt yok.' },
            ],
        },
    },
    interviewScore: 71,
    verificationReport: {
        verifiedAt: '2026-08-28T14:05:00.000Z',
        counts: { celiski: 0, dikkat: 2, bilgi: 1 },
        flags: [
            {
                id: 'unvan-sicramasi',
                severity: 'dikkat',
                title: 'Hızlı unvan yükselişi',
                detail: '"İş Analisti" (Ardıç Bilişim) görevinden 2 yıl 7 ay sonra '
                    + '"Ürün Yöneticisi" (Kavun Yazılım). Kıdem merdiveninde 2 basamak.',
                question: 'İş Analisti pozisyonundan Ürün Yöneticisi pozisyonuna geçişte '
                    + 'sorumluluklarınız ve ekip büyüklüğünüz nasıl değişti?',
            },
            {
                id: 'unvan-olcek',
                severity: 'dikkat',
                title: 'Yönetici unvanı, çok küçük bir şirkette',
                detail: '"Kıdemli Ürün Yöneticisi" unvanı bildirilmiş; "Marbis Teknoloji" '
                    + 'için bulunan ölçek 1-10 kişi.',
                question: 'Marbis Teknoloji\'de kaç kişilik bir ekiple çalışıyordunuz?',
            },
            {
                id: 'sirket-dogrulanamadi',
                severity: 'bilgi',
                title: 'Şirket doğrulanamadı',
                detail: '"Ardıç Bilişim" için bağımsız bir kayıt bulunamadı. Bu, şirketin '
                    + 'var olmadığı anlamına GELMEZ — küçük ölçekli, yurtdışı merkezli ya da '
                    + 'dijital izi olmayan şirketler de bu sonucu verir.',
                question: 'Ardıç Bilişim hakkında biraz bilgi verir misiniz — kaç kişilik bir '
                    + 'ekipti, ne iş yapıyordu?',
            },
        ],
        questions: [
            'İş Analisti pozisyonundan Ürün Yöneticisi pozisyonuna geçişte sorumluluklarınız ve '
                + 'ekip büyüklüğünüz nasıl değişti?',
            'Marbis Teknoloji\'de kaç kişilik bir ekiple çalışıyordunuz?',
            'Ardıç Bilişim hakkında biraz bilgi verir misiniz — kaç kişilik bir ekipti, ne iş yapıyordu?',
        ],
        sectorFit: null,
        companies: [
            {
                company: 'Marbis Teknoloji',
                verdict: 'dogrulandi',
                claim: { company: 'Marbis Teknoloji', role: 'Kıdemli Ürün Yöneticisi', duration: '2023-04 - Halen', startYear: 2023 },
                evidence: {
                    name: 'Marbis Teknoloji A.Ş.', exists: 'evet', website: 'marbis.ornek',
                    foundedYear: 2019, sizeBand: '1-10', sector: 'Yazılım', sectorRaw: 'B2B SaaS',
                    headquarters: 'İstanbul', founders: [], registry: null, source: '',
                    sources: [{ title: 'Kurumsal site', uri: 'https://marbis.ornek' }],
                },
            },
            {
                company: 'Kavun Yazılım',
                verdict: 'dogrulandi',
                claim: { company: 'Kavun Yazılım', role: 'Ürün Yöneticisi', duration: '2020-09 - 2023-03', startYear: 2020 },
                evidence: {
                    name: 'Kavun Yazılım Ltd. Şti.', exists: 'evet', website: 'kavunyazilim.ornek',
                    foundedYear: 2015, sizeBand: '51-200', sector: 'Yazılım', sectorRaw: 'Abonelik yazılımı',
                    headquarters: 'Ankara', founders: [], registry: { source: 'Ticaret Sicil Gazetesi', foundedYear: 2015, founders: [] },
                    source: '', sources: [{ title: 'Ticaret sicili kaydı', uri: 'https://ornek-sicil' }],
                },
            },
            {
                company: 'Ardıç Bilişim',
                verdict: 'dogrulanamadi',
                claim: { company: 'Ardıç Bilişim', role: 'İş Analisti', duration: '2018-02 - 2020-08', startYear: 2018 },
                evidence: null,
            },
        ],
        lookup: { fromCache: 1, looked: 2, skipped: [], failed: [], total: 3 },
    },
    interviewSessions: [
        {
            id: 'oturum-1',
            date: '2026-08-29T11:00:00.000Z',
            time: '14:00',
            duration: '45 dk',
            durationMinutes: 45,
            language: 'Türkçe',
            mode: 'manual',
            evalSchema: 2,
            status: 'completed',
            type: 'other',
            interviewerName: 'Deniz Yalçın',
            positionTitle: 'Growth Ürün Yöneticisi',
            positionId: 'poz-growth',
            candidateName: 'Zeynep Aksoy',
            interviewScore: 71,
            recommendedOutcome: 'positive',
            recruiterOutcome: null,
            evidence: { score: 66, asked: 3, met: 1, partial: 1, missing: 0, inconclusive: 1, mustMissing: 0 },
            questions: [
                {
                    question: 'Kayıt akışında uçtan uca sahiplik dediğinizde neyi kastediyorsunuz?',
                    answer: 'Kayıt ekranından ilk değerli aksiyona kadar olan bütün adımlar bendeydi. '
                        + 'Metinleri, adım sayısını, doğrulama akışını ben kurdum; 14 ayda dönüşümü '
                        + 'iki katına çıkardık.',
                    requirementIndex: 1,
                },
                {
                    question: 'Kurduğunuz bir A/B testini ve sonucunu anlatır mısınız?',
                    answer: 'Deneyleri kurguluyorduk ama analizi veri ekibi yapıyordu. '
                        + 'Hangi metriğe bakacağımıza birlikte karar veriyorduk.',
                    requirementIndex: 2,
                },
                {
                    question: 'Son çeyrekte kendi yazdığınız bir sorgu oldu mu?',
                    answer: 'Genelde hazır panolara bakıyorum.',
                    requirementIndex: 3,
                },
                {
                    question: 'Neden yeni bir rol arıyorsunuz?',
                    answer: 'Daha büyük ölçekli bir üründe çalışmak istiyorum.',
                },
            ],
            requirementVerdicts: [
                { requirementIndex: 1, verdict: 'met', quote: 'Kayıt ekranından ilk değerli aksiyona kadar olan bütün adımlar bendeydi' },
                { requirementIndex: 2, verdict: 'partial', quote: 'Deneyleri kurguluyorduk ama analizi veri ekibi yapıyordu' },
                { requirementIndex: 3, verdict: 'inconclusive', quote: 'Genelde hazır panolara bakıyorum' },
            ],
            aiAnalysis: {
                summary: 'Aday funnel sahipliğini somut örnek ve rakamla anlatıyor. Deney tarafında '
                    + 'kurgu sahipliği var, analiz sahipliği belirsiz kaldı. SQL için verilen cevap '
                    + 'hüküm vermeye yetmedi — bu madde ikinci görüşmede yeniden sorulmalı.',
                strengths: [
                    'Funnel sahipliğini adım adım ve rakamla anlattı',
                    'Kararlarının gerekçesini kendisi kurdu',
                ],
                concerns: [
                    'Deney analizinde sahiplik sınırı net değil',
                    'Kendi sorgusunu yazma alışkanlığı görünmüyor',
                ],
                questions: [
                    { question: 'Kayıt akışında uçtan uca sahiplik dediğinizde neyi kastediyorsunuz?', observation: 'Somut örnek ve rakam verdi.' },
                    { question: 'Kurduğunuz bir A/B testini ve sonucunu anlatır mısınız?', observation: 'Kurgu var, analiz sahipliği yok.' },
                    { question: 'Son çeyrekte kendi yazdığınız bir sorgu oldu mu?', observation: 'Cevap hüküm vermeye yetmedi.' },
                ],
            },
            transcript: [
                { role: 'Mülakatçı', text: 'Kayıt akışında uçtan uca sahiplik dediğinizde neyi kastediyorsunuz?' },
                { role: 'Aday', text: 'Kayıt ekranından ilk değerli aksiyona kadar olan bütün adımlar bendeydi.' },
                { role: 'Mülakatçı', text: 'Kurduğunuz bir A/B testini ve sonucunu anlatır mısınız?' },
                { role: 'Aday', text: 'Deneyleri kurguluyorduk ama analizi veri ekibi yapıyordu.' },
            ],
        },
    ],
};

/** Havuz — liste ekranının dolu görünmesi için. */
export const DEMO_CANDIDATES = [
    ZEYNEP,
    {
        id: 'aday-mert',
        name: 'Mert Doğan',
        email: 'mert.dogan@ornek-posta.com',
        location: 'İzmir',
        position: 'Growth Ürün Yöneticisi',
        matchedPositionTitle: 'Growth Ürün Yöneticisi',
        bestTitle: 'Growth Ürün Yöneticisi',
        positionId: 'poz-growth',
        department: 'Ürün',
        status: 'interview_scheduled',
        source: 'Kariyer.net',
        experience: 6,
        appliedDate: '2026-08-24T08:00:00.000Z',
        skills: ['SQL', 'Looker', 'Deney tasarımı'],
        experiences: [
            { role: 'Ürün Yöneticisi', company: 'Peyzaj Dijital', duration: '2021-05 - Halen' },
            { role: 'Veri Analisti', company: 'Peyzaj Dijital', duration: '2019-01 - 2021-04' },
        ],
        positionAnalyses: {
            'Growth Ürün Yöneticisi': {
                score: 68,
                assessments: [
                    { index: 1, status: 'partial' }, { index: 2, status: 'met' },
                    { index: 3, status: 'met' }, { index: 4, status: 'unknown' },
                    { index: 5, status: 'missing' },
                ],
            },
        },
        interviewSessions: [
            {
                id: 'oturum-mert',
                date: '2026-09-08T09:30:00.000Z',
                time: '12:30',
                status: 'scheduled',
                type: 'other',
                positionTitle: 'Growth Ürün Yöneticisi',
                candidateName: 'Mert Doğan',
                interviewerName: 'Deniz Yalçın',
            },
        ],
    },
    {
        id: 'aday-elif',
        name: 'Elif Şahin',
        email: 'elif.sahin@ornek-posta.com',
        location: 'İstanbul',
        position: 'Growth Ürün Yöneticisi',
        matchedPositionTitle: 'Growth Ürün Yöneticisi',
        bestTitle: 'Growth Ürün Yöneticisi',
        positionId: 'poz-growth',
        department: 'Ürün',
        status: 'review',
        source: 'Referans',
        experience: 9,
        appliedDate: '2026-08-26T13:20:00.000Z',
        skills: ['Funnel analizi', 'A/B test', 'SQL', 'Ekip yönetimi'],
        experiences: [
            { role: 'Ürün Müdürü', company: 'Selen Bulut', duration: '2022-01 - Halen' },
            { role: 'Kıdemli Ürün Yöneticisi', company: 'Selen Bulut', duration: '2019-06 - 2021-12' },
        ],
        positionAnalyses: {
            'Growth Ürün Yöneticisi': {
                score: 81,
                assessments: [
                    { index: 1, status: 'met' }, { index: 2, status: 'met' },
                    { index: 3, status: 'partial' }, { index: 4, status: 'met' },
                    { index: 5, status: 'met' },
                ],
            },
        },
    },
    {
        id: 'aday-burak',
        name: 'Burak Yıldırım',
        email: 'burak.yildirim@ornek-posta.com',
        location: 'Ankara',
        position: 'Growth Ürün Yöneticisi',
        matchedPositionTitle: 'Growth Ürün Yöneticisi',
        bestTitle: 'Growth Ürün Yöneticisi',
        positionId: 'poz-growth',
        department: 'Ürün',
        status: 'ai_analysis',
        source: 'LinkedIn',
        experience: 4,
        appliedDate: '2026-09-01T07:45:00.000Z',
        skills: ['Ürün analitiği', 'Jira'],
        // TARİHİ OKUNAMAYAN KAYIT — ölçümün kısmi kalabildiği bilerek gösteriliyor.
        experiences: [
            { role: 'Ürün Yöneticisi', company: 'Tuna İnteraktif', duration: 'yaklaşık 2 yıl' },
        ],
        positionAnalyses: {
            'Growth Ürün Yöneticisi': {
                score: 47,
                assessments: [
                    { index: 1, status: 'partial' }, { index: 2, status: 'unknown' },
                    { index: 3, status: 'missing' }, { index: 4, status: 'unknown' },
                    { index: 5, status: 'missing' },
                ],
            },
        },
    },
    {
        id: 'aday-selin',
        name: 'Selin Kaya',
        email: 'selin.kaya@ornek-posta.com',
        location: 'Uzaktan',
        position: 'Backend Geliştirici',
        matchedPositionTitle: 'Backend Geliştirici',
        bestTitle: 'Backend Geliştirici',
        positionId: 'poz-backend',
        department: 'Mühendislik',
        status: 'offer',
        source: 'Referans',
        experience: 7,
        appliedDate: '2026-08-15T11:00:00.000Z',
        skills: ['Node.js', 'PostgreSQL', 'Ödeme sistemleri'],
        experiences: [
            { role: 'Backend Geliştirici', company: 'Ferah Ödeme', duration: '2021-03 - Halen' },
        ],
        positionAnalyses: {
            'Backend Geliştirici': {
                score: 88,
                assessments: [
                    { index: 1, status: 'met' }, { index: 2, status: 'met' }, { index: 3, status: 'met' },
                ],
            },
        },
    },
    {
        id: 'aday-onur',
        name: 'Onur Demirtaş',
        email: 'onur.demirtas@ornek-posta.com',
        location: 'Bursa',
        position: 'Backend Geliştirici',
        matchedPositionTitle: 'Backend Geliştirici',
        bestTitle: 'Backend Geliştirici',
        positionId: 'poz-backend',
        department: 'Mühendislik',
        status: 'rejected',
        rejectionReasonId: 'kriter-karsilanmadi',
        source: 'Kariyer.net',
        experience: 3,
        appliedDate: '2026-08-19T15:30:00.000Z',
        skills: ['PHP', 'MySQL'],
        experiences: [
            { role: 'Yazılım Geliştirici', company: 'Kestane Yazılım', duration: '2022-06 - 2026-07' },
        ],
        positionAnalyses: {
            'Backend Geliştirici': {
                score: 32,
                assessments: [
                    { index: 1, status: 'missing' }, { index: 2, status: 'partial' }, { index: 3, status: 'missing' },
                ],
            },
        },
    },
];

/** Takvim ekranı için — biri adaya bağlı, biri mülakat şüphesi, biri alakasız. */
export const DEMO_CALENDAR_EVENTS = [
    {
        id: 'etk-1',
        summary: 'Zeynep Aksoy — Growth Ürün Yöneticisi mülakatı',
        description: 'Aday: Zeynep Aksoy\nPozisyon: Growth Ürün Yöneticisi',
        location: 'https://meet.ornek/abc-defg-hij',
        start: { dateTime: '2026-09-08T14:00:00+03:00' },
        end: { dateTime: '2026-09-08T15:00:00+03:00' },
        attendees: [{ email: 'zeynep.aksoy@ornek-posta.com' }],
    },
    {
        id: 'etk-2',
        summary: 'İK görüşmesi — teknik ekip',
        start: { dateTime: '2026-09-09T10:00:00+03:00' },
        end: { dateTime: '2026-09-09T10:45:00+03:00' },
        attendees: [],
    },
    {
        id: 'etk-3',
        summary: 'Çeyrek planlama',
        start: { dateTime: '2026-09-10T13:00:00+03:00' },
        end: { dateTime: '2026-09-10T15:00:00+03:00' },
        attendees: [],
    },
    {
        id: 'etk-4',
        summary: 'Yıllık izin',
        start: { date: '2026-09-14' },
        end: { date: '2026-09-16' },
        attendees: [],
    },
];
