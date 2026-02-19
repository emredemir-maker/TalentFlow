import { useState, useEffect } from 'react';
import { useCandidates } from '../context/CandidatesContext';
import { getAvailableModels, parseCandidateFromText } from '../services/geminiService';
import Header from '../components/Header';
import {
    DownloadCloud,
    FileText,
    CheckCircle2,
    AlertTriangle,
    Loader2,
    UserPlus,
    Layers,
    Copy,
    ArrowRight,
    Upload,
    Search
} from 'lucide-react';

export default function ScraperPage() {
    const { addCandidate } = useCandidates();
    const [textInput, setTextInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    // Auto Scraper State
    const [searchQuery, setSearchQuery] = useState('');
    const [autoScraping, setAutoScraping] = useState(false);
    const [autoResults, setAutoResults] = useState([]);

    // Model Selection
    const [availableModels, setAvailableModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');

    useEffect(() => {
        getAvailableModels().then(models => {
            setAvailableModels(models);
            if (models.length > 0) setSelectedModel(models[0].id);
            else setSelectedModel('gemini-2.0-flash');
        });
    }, []);

    const handleParse = async () => {
        if (!textInput.trim()) return;

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const parsedData = await parseCandidateFromText(textInput, selectedModel);

            // Add metadata
            const candidateData = {
                ...parsedData,
                status: 'new',
                matchScore: 0,
                appliedDate: new Date().toISOString(),
                source: 'AI Scraper',
                notes: 'LinkedIn profilinden otomatik ayrıştırıldı.'
            };

            // Save to Firestore via Context
            const docId = await addCandidate(candidateData);

            setResult({ ...candidateData, id: docId });
            setTextInput(''); // Clear input on success
        } catch (err) {
            console.error('Scraper Error:', err);
            setError(err.message || 'Profil ayrıştırılırken bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    // Bulk Upload Handler
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                setLoading(true);
                const jsonContent = JSON.parse(event.target.result);
                const candidatesArray = Array.isArray(jsonContent) ? jsonContent : [jsonContent];

                let successCount = 0;
                for (const candidate of candidatesArray) {
                    await addCandidate({
                        ...candidate,
                        status: 'new',
                        matchScore: 0,
                        appliedDate: new Date().toISOString(),
                        source: 'CLI Scraper',
                        notes: 'Dosyadan toplu yüklendi.'
                    });
                    successCount++;
                }

                alert(`${successCount} aday başarıyla yüklendi!`);
                setResult({ name: `${successCount} Aday`, position: 'Toplu Yükleme', company: 'Dosya', location: 'Sistem' });
            } catch (err) {
                console.error('File upload error:', err);
                setError('Dosya formatı geçersiz veya bir hata oluştu.');
            } finally {
                setLoading(false);
                e.target.value = null; // Reset input
            }
        };
        reader.readAsText(file);
    };

    // Auto Scraper Handler (Backend API)
    const handleAutoScrape = async (visual = false) => {
        if (!searchQuery.trim()) {
            alert('Lütfen bir arama terimi girin.');
            return;
        }

        console.log('[Scraper] handleAutoScrape triggered for:', searchQuery);

        // Immediate UI feedback
        setAutoScraping(true);
        setError(null);
        setAutoResults([]);

        try {
            console.log(`[Scraper] Fetching from API (Visual: ${visual})...`);
            const response = await fetch(`/api/scrape?q=${encodeURIComponent(searchQuery)}&visual=${visual}`);

            console.log('[Scraper] API Response status:', response.status);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Bilinmeyen sunucu hatası.' }));
                throw new Error(errorData.error || `Sunucu hatası: ${response.status}`);
            }

            const data = await response.json();
            console.log('[Scraper] API Data received:', data);

            if (data.candidates && data.candidates.length > 0) {
                let successCount = 0;
                for (const candidate of data.candidates) {
                    await addCandidate({
                        ...candidate,
                        status: 'new',
                        matchScore: 0,
                        appliedDate: new Date().toISOString(),
                        source: 'Auto Scraper',
                        notes: `Otomatik arama sonucu: ${searchQuery}`
                    });
                    successCount++;
                }
                setAutoResults(data.candidates);
                alert(`${successCount} aday başarıyla bulundu ve eklendi!`);
            } else {
                alert('Arama botu LinkedIn veya Arama Motoru tarafından engellendi.\n\nLütfen "Manuel Profil Metni" kutusuna profil sayfasını kopyalayıp yapıştırarak devam edin. Bu yöntem %100 çalışır durumdadır.');
            }
        } catch (err) {
            console.error('[Scraper] Auto Scrape Error:', err);
            setError(`Arama işlemi şu an gerçekleştirilemiyor: ${err.message}. Lütfen manuel yöntemi deneyin.`);
        } finally {
            console.log('[Scraper] Setting autoScraping to false');
            setAutoScraping(false);
        }
    };

    const handleSetupBrowser = async () => {
        setAutoScraping(true);
        try {
            await fetch('/api/scrape?q=https://www.linkedin.com/login&visual=true');
        } catch (err) {
            alert('Tarayıcı açılamadı: ' + err.message);
        } finally {
            setAutoScraping(false);
        }
    };

    return (
        <div className="min-h-screen pb-20">
            <Header title="Profil Ayrıştırıcı (Scraper)" />

            <div className="max-w-5xl mx-auto px-6 lg:px-8 py-8">
                {/* Intro Card */}
                <div className="bg-gradient-to-br from-violet-900/20 to-electric/10 rounded-2xl p-6 border border-white/[0.06] mb-8 flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-violet-500/20 text-violet-300">
                        <DownloadCloud className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white mb-2">LinkedIn Profilini Adaya Dönüştür</h2>
                        <p className="text-sm text-navy-300 leading-relaxed">
                            Aşağıdaki yöntemlerden birini kullanarak adayları sisteme ekleyin.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left Column: Input Methods */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* 1. AUTO SCRAPER CARD */}
                        <div className="glass rounded-2xl p-6 border border-electric/20 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Search className="w-24 h-24 text-electric" />
                            </div>

                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <Search className="w-5 h-5 text-electric" />
                                URL ile Çek veya Otomatik Arama
                            </h3>

                            <div className="flex flex-col gap-4">
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="LinkedIn URL veya Arama Terimi (Örn: Senior Developer)"
                                        className="flex-1 px-4 py-3 rounded-xl bg-navy-950/50 border border-white/[0.06] text-sm text-navy-200 placeholder:text-navy-500 outline-none focus:border-electric/40 focus:ring-1 focus:ring-electric/40"
                                        onKeyDown={(e) => e.key === 'Enter' && handleAutoScrape(false)}
                                    />
                                    <button
                                        onClick={() => handleAutoScrape(false)}
                                        disabled={autoScraping || !searchQuery.trim()}
                                        className="px-6 py-3 rounded-xl bg-electric text-white font-bold hover:bg-electric-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                        type="button"
                                    >
                                        {autoScraping ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Çek / Ara'}
                                    </button>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => handleAutoScrape(true)}
                                        disabled={autoScraping || !searchQuery.trim()}
                                        className="flex-1 py-3 rounded-xl bg-violet-600/20 text-violet-300 border border-violet-500/30 font-bold hover:bg-violet-600/30 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Search className="w-4 h-4" />
                                        Görsel Tarayıcıyı Aç ve Ara (LinkedIn & SalesNav)
                                    </button>
                                </div>
                                <div className="flex justify-center">
                                    <button
                                        onClick={handleSetupBrowser}
                                        className="text-[11px] text-navy-400 hover:text-white underline decoration-navy-600 transition-colors"
                                    >
                                        ⚙️ Tarayıcıda Oturumu Hazırla (İlk Sefer İçin Giriş Yap)
                                    </button>
                                </div>
                            </div>
                            <p className="text-[10px] text-navy-500 mt-2">
                                * <b>Görsel Tarayıcı:</b> Gerçek bir pencere açar. LinkedIn veya Sales Navigator girişinizi bir kez yapmanız yeterlidir, sistem hatırlar.
                            </p>

                            {/* MAGIC BUTTON SECTION */}
                            <div className="mt-8 p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 relative overflow-hidden">
                                <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />

                                <h4 className="text-sm font-bold text-emerald-400 mb-2 flex items-center gap-2">
                                    <Layers className="w-4 h-4" />
                                    🚀 Sales Navigator PRO & LinkedIn Sihirli Buton
                                </h4>
                                <p className="text-[11px] text-navy-400 mb-4 leading-relaxed">
                                    Sizin Sales Navigator üyeliğinizi kullanarak <b>toplu aday</b> çeken profesyonel yöntem.
                                    Arama sonuçları sayfasında veya tekli profildeyken aşağıdaki kodu kopyalayıp konsola (F12) yapıştırın.
                                </p>

                                <div className="relative group">
                                    <pre className="text-[10px] bg-black/60 p-4 rounded-xl text-emerald-300/90 font-mono overflow-x-auto max-h-[150px] border border-white/5 backdrop-blur-sm">
                                        {`/* SALESNAV PRO SCRIPT */
(async () => {
  const isSearch = window.location.href.includes('/search/');
  const endpoint = isSearch ? '/api/bulk-add' : '/api/direct-add';
  const server = 'http://localhost:3001';
  
  if (isSearch) {
    const items = Array.from(document.querySelectorAll('.artdeco-list__item')).slice(0, 10);
    const candidates = items.map(i => ({ text: i.innerText, url: i.querySelector('a')?.href }));
    const res = await fetch(server + endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ candidates })
    });
    const data = await res.json();
    alert('Toplu Ekleme Başarılı: ' + data.addedCount + ' aday.');
  } else {
    const text = document.body.innerText;
    const url = window.location.href;
    const res = await fetch(server + endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ text, url })
    });
    const data = await res.json();
    alert('Aday Eklendi: ' + data.candidate.name);
  }
})();`}
                                    </pre>
                                    <button
                                        onClick={() => {
                                            const code = `(async () => { const isSearch = window.location.href.includes('/search/'); const endpoint = isSearch ? '/api/bulk-add' : '/api/direct-add'; const server = 'http://localhost:3001'; if (isSearch) { alert('Toplu tarama başlıyor (İlk 10 aday)...'); const items = Array.from(document.querySelectorAll('.artdeco-list__item')).slice(0, 10); const candidates = items.map(i => ({ text: i.innerText, url: i.querySelector('a')?.href })); const res = await fetch(server + endpoint, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ candidates }) }); const data = await res.json(); alert('Toplu Ekleme Başarılı: ' + data.addedCount + ' aday.'); } else { const text = document.body.innerText; const url = window.location.href; const res = await fetch(server + endpoint, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ text, url }) }); const data = await res.json(); alert('Aday Eklendi: ' + data.candidate.name); } })();`;
                                            navigator.clipboard.writeText(code);
                                            alert('Pro Kod kopyalandı! Sales Navigator sayfasında konsola (F12) yapıştırın.');
                                        }}
                                        className="absolute top-2 right-2 p-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 group-hover:scale-110 active:scale-95"
                                        title="Pro Kodu Kopyala"
                                    >
                                        <div className="flex items-center gap-2 text-xs font-bold px-2">
                                            <Copy className="w-4 h-4" />
                                            <span>KODU KOPYALA</span>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 2. MANUAL SCRAPER CARD */}
                        <div className="glass rounded-2xl p-6 border border-white/[0.06]">
                            <div className="flex items-center justify-between mb-4">
                                <label className="text-sm font-semibold text-navy-200 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-emerald-400" />
                                    Manuel Profil Metni (Kopyala/Yapıştır)
                                </label>

                                {/* Model Selector */}
                                <div className="flex items-center gap-2">
                                    <Layers className="w-3.5 h-3.5 text-navy-400" />
                                    <select
                                        value={selectedModel}
                                        onChange={(e) => setSelectedModel(e.target.value)}
                                        className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1.5 text-xs text-navy-300 outline-none focus:border-electric/40"
                                    >
                                        {availableModels.map(m => (
                                            <option key={m.id} value={m.id} className="bg-navy-900">{m.displayName}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <textarea
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                placeholder="LinkedIn profil sayfasını açıp Ctrl+A (Tümünü Seç) ve Ctrl+C (Kopyala) yaptıktan sonra buraya (Ctrl+V) yapıştırın. AI sizin için ayrıştıracaktır..."
                                className="w-full h-48 p-4 rounded-xl bg-navy-950/50 border border-white/[0.06] text-sm text-navy-200 placeholder:text-navy-500 focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/40 outline-none resize-none font-mono"
                            />

                            <div className="mt-4 flex flex-wrap justify-end gap-3">

                                {/* Hidden File Input */}
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    id="bulk-upload"
                                />
                                <label
                                    htmlFor="bulk-upload"
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-navy-300 text-sm font-semibold hover:bg-white/[0.08] hover:text-white transition-all cursor-pointer ${loading ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                    <Upload className="w-4 h-4" />
                                    JSON Yükle
                                </label>

                                <button
                                    onClick={handleParse}
                                    disabled={loading || !textInput.trim()}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-semibold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            İşleniyor...
                                        </>
                                    ) : (
                                        <>
                                            <UserPlus className="w-5 h-5" />
                                            Profili Oluştur
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Error State */}
                        {error && (
                            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400 animate-fade-in">
                                <AlertTriangle className="w-5 h-5 shrink-0" />
                                <p className="text-sm">{error}</p>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Result Preview */}
                    <div className="lg:col-span-1">
                        {result || (autoResults && autoResults.length > 0) ? (
                            <div className="space-y-4">
                                {(autoResults.length > 0 ? autoResults : [result]).map((res, idx) => (
                                    <div key={idx} className="glass rounded-2xl p-6 border border-emerald-500/20 animate-fade-in-up relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />

                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                                                <CheckCircle2 className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-white">Başarıyla Eklendi!</h3>
                                                <p className="text-xs text-navy-400">{res.source}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <PreviewRow label="İsim" value={res.name} />
                                            <PreviewRow label="Pozisyon" value={res.position} />
                                            <PreviewRow label="Şirket" value={res.company} />

                                            <div className="pt-4 border-t border-white/[0.06]">
                                                <p className="text-xs font-semibold text-navy-400 mb-2">Yetenekler</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {res.skills?.slice(0, 5).map((skill, i) => (
                                                        <span key={i} className="px-2 py-1 rounded-md bg-white/[0.04] text-[10px] text-navy-300 border border-white/[0.04]">
                                                            {skill}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="glass rounded-2xl p-8 border border-white/[0.06] flex flex-col items-center justify-center text-center h-full min-h-[300px] opacity-60">
                                <div className="w-16 h-16 rounded-full bg-white/[0.04] flex items-center justify-center mb-4">
                                    <ArrowRight className="w-6 h-6 text-navy-500" />
                                </div>
                                <h3 className="text-sm font-semibold text-navy-300">Sonuç Bekleniyor</h3>
                                <p className="text-xs text-navy-500 mt-2 max-w-[200px]">
                                    Analiz işlemi tamamlandığında aday kartı burada görünecektir.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div >
        </div >
    );
}

function PreviewRow({ label, value }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-navy-500 font-bold">{label}</span>
            <span className="text-sm text-navy-200 font-medium truncate" title={value || '-'}>
                {value || '-'}
            </span>
        </div>
    );
}
