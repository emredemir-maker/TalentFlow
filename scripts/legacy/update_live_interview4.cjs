const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'LiveInterviewPage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const splitMarker = 'if (candidatesLoading) {';
const startIndex = content.indexOf(splitMarker);

if (startIndex === -1) {
    console.error("Marker not found!");
    process.exit(1);
}

// Find the beginning of the line containing the marker
const lastNewLineBefore = content.lastIndexOf('\n', startIndex);
const finalStartIndex = lastNewLineBefore === -1 ? 0 : lastNewLineBefore + 1;

const topContent = content.substring(0, finalStartIndex);

// --- NEW DESIGN JSX ---
const simulationInsights = [
    [{ type: 'info', text: 'Strateji Uygulandı: Mimari derinlik analizi aktif.', id: 100 }],
    [{ type: 'signal', text: 'Sinyal Tespit Edildi: Ölçeklenebilirlik konusunda pratik deneyim.', id: 101 }],
    [{ type: 'suggestion', text: 'Öneri: Dağıtık sistemlerde veri tutarlılığı hakkında soru sorabilirsiniz.', id: 102 }],
    [{ type: 'signal', text: 'Sinyal Tespit Edildi: Karmaşıklık yönetimi vizyonu yüksek.', id: 103 }]
];

const transcriptData = [
    { role: 'MÜLAKATÇI', text: 'Hoş geldin, bugün bizimle olduğun için teşekkürler. Bize biraz deneyimlerinden bahseder misin?' },
    { role: 'ADAY', text: 'Merhabalar, ben teşekkür ederim. Yaklaşık 5 yıldır full-stack geliştirici olarak çalışıyorum.' },
    { role: 'ADAY', text: 'Özellikle yüksek trafikli sistemlerin ölçeklendirilmesi ve mikroservis mimarileri üzerine yoğunlaştım.' },
    { role: 'MÜLAKATÇI', text: 'Harika. Peki bu mimarilerde karşılaştığın en büyük zorluk neydi?' }
];

const newJSX = \`
    const changeDevice = async (type, id) => {
        const newSelected = { ...selectedDevices, [type]: id };
        setSelectedDevices(newSelected);
        requestMedia({
            video: newSelected.videoId ? { deviceId: { exact: newSelected.videoId } } : true,
            audio: newSelected.audioId ? { deviceId: { exact: newSelected.audioId } } : true
        });
    };

    if (candidatesLoading) {
        return <LoadingScreen message="Oturum verileri senkronize ediliyor..." subtext="Lütfen bekleyin" />;
    }

    if (!isAuthenticated) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-900 font-sans italic">
            <div className="text-center space-y-4">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
                <h1 className="text-xl font-bold italic uppercase tracking-tighter">Yetkisiz Erişim</h1>
                <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Lütfen giriş yapın.</p>
            </div>
        </div>
    );

    if (!candidateData) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-4 text-slate-900 font-sans italic">
                <AlertCircle className="w-12 h-12 text-amber-500" />
                <h1 className="text-xl font-bold italic uppercase tracking-tighter">Oturum Bulunamadı</h1>
                <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Geçersiz veya süresi dolmuş mülakat linki.</p>
                <button
                    onClick={() => navigate('/candidates')}
                    className="px-6 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 text-xs font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all"
                >
                    Kontrol Paneline Dön
                </button>
            </div>
        );
    }

    if (phase === 'lobby') {
        return (
            <div className="min-h-screen bg-slate-50 font-sans flex flex-col text-slate-800 italic">
                {/* Header Navbar */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#1e3a8a] flex items-center justify-center">
                            <Video className="w-4 h-4 text-white" />
                        </div>
                        <h1 className="text-xl font-bold text-[#1e3a8a] tracking-tight italic">TalentFlow</h1>
                    </div>
                    {isRecruiter && (
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                            <span className="hover:text-slate-900 cursor-pointer">Mülakatlar</span>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                            <span className="text-slate-900">Pre-flight Kontrolü</span>
                        </div>
                    )}
                    <div className="flex items-center gap-5">
                       <button className="text-slate-300 hover:text-slate-600 transition-colors"><AlertCircle className="w-5 h-5" /></button>
                       <button className="text-slate-300 hover:text-slate-600 transition-colors"><HelpCircle className="w-5 h-5" /></button>
                       <button onClick={() => setShowSettings(true)} className="text-slate-300 hover:text-slate-600 transition-colors"><Settings className="w-5 h-5" /></button>
                       <div className="flex items-center gap-2 border-l border-slate-100 pl-5 ml-2">
                           <div className="w-8 h-8 rounded-full bg-slate-50 overflow-hidden border border-slate-200 flex items-center justify-center">
                               <User className="w-5 h-5 text-slate-300" />
                           </div>
                           <span className="text-xs font-black text-slate-700 uppercase tracking-tighter">{userProfile?.name?.split(' ')[0] || 'Kullanıcı'}</span>
                       </div>
                    </div>
                </header>

                <div className="flex-1 flex flex-col items-center p-6 md:p-8 overflow-y-auto">
                    {isRecruiter ? (
                        // RECRUITER LOBBY (Pre-flight Kontrolü)
                        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                            {/* Left: Video */}
                            <div className="relative rounded-[3rem] bg-zinc-900 overflow-hidden shadow-2xl aspect-[4/3] group border border-slate-100">
                                {isVideoOn && stream ? (
                                    <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                                        <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                                            <Camera className="w-12 h-12 text-white/10" />
                                        </div>
                                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Kamera Hazır Bekliyor</span>
                                    </div>
                                )}
                                
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                                
                                <div className="absolute bottom-8 left-8 flex items-center gap-4">
                                    <button onClick={() => setIsVideoOn(!isVideoOn)} className={\`w-14 h-14 rounded-2xl flex items-center justify-center backdrop-blur-xl transition-all \${isVideoOn ? 'bg-white/10 text-white hover:bg-white/20 border border-white/20' : 'bg-red-500/80 text-white border border-red-500/50 shadow-lg shadow-red-500/20'}\`}>
                                        {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                                    </button>
                                    <button onClick={() => setIsMicOn(!isMicOn)} className={\`w-14 h-14 rounded-2xl flex items-center justify-center backdrop-blur-xl transition-all \${isMicOn ? 'bg-white/10 text-white hover:bg-white/20 border border-white/20' : 'bg-red-500/80 text-white border border-red-500/50 shadow-lg shadow-red-500/20'}\`}>
                                        {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                                    </button>
                                </div>
                                <div className="absolute bottom-8 right-8 flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
                                    <span className="text-[11px] font-black text-white tracking-widest uppercase italic">Sistem Check: OK</span>
                                </div>
                            </div>

                            {/* Right: Info & Launch */}
                            <div className="space-y-6">
                                {/* Candidate Profile Card */}
                                <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-xl relative overflow-hidden group/card shadow-slate-200/50">
                                     <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-50/50 rounded-full blur-3xl group-hover/card:bg-blue-100/50 transition-colors" />
                                    <div className="flex items-start justify-between mb-8 relative z-10">
                                        <div className="flex items-center gap-5">
                                            <div className="w-20 h-20 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-200 shadow-inner group-hover/card:scale-105 transition-transform">
                                                <User className="w-10 h-10 text-slate-300" />
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-black text-slate-900 tracking-tighter italic uppercase">{candidateData?.name || 'Aday Adı'}</h2>
                                                <p className="text-xs font-black text-[#1e3a8a] uppercase tracking-widest mt-1 opacity-70">{candidateData?.matchedPositionTitle || candidateData?.position || 'Pozisyon'}</p>
                                            </div>
                                        </div>
                                        {candidateData?.matchScore >= 0 && (
                                            <div className="flex flex-col items-center bg-blue-50 text-[#1e3a8a] px-5 py-3 rounded-2xl font-black border border-blue-100 shadow-sm">
                                                <span className="text-[8px] opacity-60 uppercase tracking-[0.2em] mb-1">AI Match</span>
                                                <span className="text-2xl leading-none italic">{Math.round(candidateData.matchScore)}%</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-8 mb-8 relative z-10">
                                        <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Tecrübe</span>
                                            <span className="text-sm font-black text-slate-800 italic">{(candidateData?.experience || 0)} Yıl / Senior</span>
                                        </div>
                                        <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Lokasyon</span>
                                            <span className="text-sm font-black text-slate-800 italic">{candidateData?.location || 'İstanbul, TR'}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="relative z-10 pt-6 border-t border-slate-100">
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Potansiyel Radar</span>
                                            <span className="text-[9px] font-black text-[#1e3a8a] uppercase bg-blue-50 px-2 py-0.5 rounded">STAR Method</span>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between text-[11px] font-black text-slate-600 uppercase tracking-tighter">
                                                    <span>Sistem Tasarımı</span>
                                                    <span>85%</span>
                                                </div>
                                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200 shadow-inner">
                                                     <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full" style={{width: '85%'}} />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between text-[11px] font-black text-slate-600 uppercase tracking-tighter">
                                                    <span>Problem Çözme</span>
                                                    <span>92%</span>
                                                </div>
                                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200 shadow-inner">
                                                     <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full" style={{width: '92%'}} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* AI Intelligence Info */}
                                <div className="bg-emerald-50/50 border border-emerald-100 rounded-[2rem] p-6 relative overflow-hidden group">
                                    <Brain className="absolute -right-8 -bottom-8 w-32 h-32 text-emerald-500 opacity-5 group-hover:scale-110 transition-transform duration-700" />
                                    <div className="flex items-center gap-2 mb-3 relative z-10">
                                        <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600">
                                            <Sparkles className="w-4 h-4" />
                                        </div>
                                        <h3 className="text-[11px] font-black text-emerald-700 uppercase tracking-widest">Stratejik AI Notu</h3>
                                    </div>
                                    <p className="text-sm font-bold text-emerald-900 leading-relaxed relative z-10 italic">
                                        "Adayın teknik derinliği yüksek, ancak 'Action' (Aksiyon) kısmında takımsal süreçlerden çok bireysel katkılarına odaklandığı gözlemlendi. Bu alanda derinleşilmesi önerilir."
                                    </p>
                                </div>

                                {/* Ready to Launch */}
                                <div className="bg-slate-900 rounded-[2.5rem] p-8 space-y-6 shadow-2xl shadow-slate-900/20">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
                                                <Target className="w-5 h-5 text-blue-400" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-white italic tracking-tight uppercase">Mülakat Oturumu Hazır</h3>
                                                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Strateji: Comprehensive</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1">
                                            <p className="text-[11px] font-bold text-white/60 mb-1">Link Kopyalandı</p>
                                            <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-[10px] font-mono text-white/40 truncate">
                                                {window.location.href}
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setPhase('active')}
                                            className="h-14 px-10 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm transition-all shadow-xl shadow-blue-600/20 active:scale-95 flex items-center gap-3 italic"
                                        >
                                            ODAYA GİRİŞ <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        // CANDIDATE LOBBY (Aday Görünümü)
                        <div className="max-w-5xl w-full flex flex-col pt-10">
                            <h1 className="text-[56px] leading-tight tracking-tighter font-black text-slate-900 mb-6 italic uppercase">Aday <span className="text-blue-600">Hazırlık Odası</span></h1>
                            <p className="text-lg text-slate-500 font-bold max-w-2xl mb-12 leading-relaxed uppercase tracking-tight">
                                Kariyer yolculuğunuzda yeni bir adım. Hazır olduğunuzda sisteme giriş yapabilirsiniz.
                            </p>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                                {/* Video Preview Center */}
                                <div className="lg:col-span-7 space-y-8">
                                    <div className="relative rounded-[3.5rem] bg-slate-200 overflow-hidden shadow-2xl aspect-[16/10] border-4 border-white">
                                        {isVideoOn && stream ? (
                                            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-zinc-950">
                                                <div className="relative">
                                                     <div className="absolute inset-0 bg-blue-600/20 blur-3xl rounded-full" />
                                                     <Camera className="w-24 h-24 text-white/10 relative z-10" />
                                                </div>
                                            </div>
                                        )}
                                        <div className="absolute top-8 right-8 flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-[#059669]/90 backdrop-blur-xl shadow-lg">
                                            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                            <span className="text-[11px] font-black text-white uppercase tracking-[0.2em] italic">Bağlantı Aktif</span>
                                        </div>
                                        
                                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-3xl p-3 rounded-3xl flex items-center gap-3 shadow-2xl border border-white/10">
                                            <button onClick={() => setIsMicOn(!isMicOn)} className={\`w-14 h-14 rounded-2xl flex items-center justify-center transition-all \${isMicOn ? 'bg-white/10 text-white hover:bg-white/20 border border-white/20' : 'bg-red-500/80 text-white border border-red-500/40 shadow-xl'}\`}>
                                                {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                                            </button>
                                            <button onClick={() => setIsVideoOn(!isVideoOn)} className={\`w-14 h-14 rounded-2xl flex items-center justify-center transition-all \${isVideoOn ? 'bg-white/10 text-white hover:bg-white/20 border border-white/20' : 'bg-red-500/80 text-white border border-red-500/40 shadow-xl'}\`}>
                                                {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                                            </button>
                                            <button onClick={() => setShowSettings(true)} className="w-14 h-14 rounded-2xl bg-white text-slate-900 shadow-xl flex items-center justify-center hover:bg-slate-50 transition-all">
                                                <Settings className="w-6 h-6" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4">
                                        {[
                                            { icon: Mic, label: 'Ses Girişi', status: 'Optimal' },
                                            { icon: Camera, label: 'Görüntü', status: 'Optimal' },
                                            { icon: Zap, label: 'Gecikme', status: '14ms' }
                                        ].map((item, i) => (
                                            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-4 shadow-sm group hover:border-blue-200 transition-colors">
                                                <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#1e3a8a] flex items-center justify-center shrink-0 border border-blue-100 group-hover:scale-110 transition-transform">
                                                    <item.icon className="w-6 h-6" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</span>
                                                    <span className="text-sm font-black text-slate-900 tracking-tighter italic">{item.status}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Right Checklist & Proceed */}
                                <div className="lg:col-span-5 space-y-8">
                                    <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-2xl space-y-10 relative overflow-hidden">
                                        <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-50 rounded-full blur-3xl opacity-50" />
                                        
                                        <div className="relative z-10">
                                            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter mb-6">Mülakat Yönergesi</h3>
                                            <div className="space-y-8">
                                                <div className="flex gap-6">
                                                    <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-sm font-black shrink-0">01</div>
                                                    <div className="space-y-1">
                                                        <h4 className="text-sm font-bold text-slate-900 uppercase">Sessiz Ortam</h4>
                                                        <p className="text-xs text-slate-500 font-bold leading-relaxed">Arka plan gürültüsünün az olduğu, ışığın yüzünüze önden geldiği bir yer seçin.</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-6">
                                                    <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-sm font-black shrink-0">02</div>
                                                    <div className="space-y-1">
                                                        <h4 className="text-sm font-bold text-slate-900 uppercase">KVKK Onayı</h4>
                                                        <p className="text-xs text-slate-500 font-bold leading-relaxed">Görüşme değerlendirme amaçlı kaydedilecektir. Lütfen aşağıdaki onay kutusunu işaretleyin.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-8 border-t border-slate-100 relative z-10">
                                            <label className="flex items-center gap-4 cursor-pointer group p-4 bg-slate-50 rounded-2xl border border-slate-200 hover:bg-white hover:border-blue-200 transition-all">
                                                <input 
                                                    type="checkbox" 
                                                    checked={hasConsent}
                                                    onChange={(e) => setHasConsent(e.target.checked)}
                                                    className="w-6 h-6 rounded-lg border-2 border-slate-300 text-blue-600 focus:ring-blue-500/20" 
                                                />
                                                <span className="text-[11px] font-black text-slate-600 uppercase tracking-tight italic">KVKK ve Kayıt Metnini Onaylıyorum</span>
                                            </label>
                                        </div>

                                        <div className="space-y-4 relative z-10">
                                            <button 
                                                onClick={() => setPhase('active')}
                                                disabled={!hasConsent}
                                                className="w-full h-16 rounded-[1.5rem] bg-[#1e3a8a] text-white font-black text-base italic uppercase tracking-widest shadow-2xl shadow-[#1e3a8a]/40 hover:bg-blue-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-4"
                                            >
                                                Odaya Bağlan <ChevronRight className="w-6 h-6" />
                                            </button>
                                            <p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Tahmini Bekleme: <span className="text-blue-600 font-black">45 Saniye</span></p>
                                        </div>
                                    </div>

                                    {/* Security Badge */}
                                    <div className="flex items-center justify-center gap-3 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
                                        <div className="h-[1px] flex-1 bg-slate-200" />
                                        <ShieldCheck className="w-5 h-5" />
                                        <span className="text-[9px] font-black uppercase tracking-[0.3em]">End-to-End Encrypted</span>
                                        <div className="h-[1px] flex-1 bg-slate-200" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {/* Global Footer */}
                <footer className="h-10 bg-white border-t border-slate-100 px-8 flex items-center justify-between shrink-0">
                     <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Core Engine: 2.4.1-stable</span>
                     <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5">
                               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                               <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Live Transcribe</span>
                          </div>
                     </div>
                </footer>
                
                {showSettings && <SettingsModal onClose={() => setShowSettings(false)} devices={devices} selectedDevices={selectedDevices} onDeviceChange={changeDevice} />}
            </div>
        );
    }

    // ====== ACTIVE INTERVIEW PHASE ======
    return (
        <div className="fixed inset-0 z-[200] bg-slate-50 flex flex-col overflow-hidden text-slate-900 font-sans italic">
            {/* Top Bar */}
            <header className="h-[64px] shrink-0 border-b border-slate-200 bg-white px-8 flex items-center justify-between z-20">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shadow-lg shadow-slate-900/20">
                            <Video className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex flex-col">
                             <h2 className="text-[13px] font-black text-slate-900 uppercase tracking-tighter italic">Live Interview</h2>
                             <p className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em]">{candidateData?.matchedPositionTitle || candidateData?.position || 'Aday'}</p>
                        </div>
                    </div>
                    
                    <div className="h-8 w-[1px] bg-slate-100 hidden md:block" />
                    
                    <div className="hidden lg:flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                         <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                         <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest italic">Recording Live (00:15:32)</span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {isRecruiter && (
                        <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-4">
                            <div className="flex -space-x-3">
                                <div className="w-8 h-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center"><User className="w-4 h-4 text-blue-600"/></div>
                                <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center"><User className="w-4 h-4 text-slate-400"/></div>
                            </div>
                            <span className="ml-2">Observers +2</span>
                        </div>
                    )}
                    <button
                        onClick={handleFinishInterview}
                        className="px-8 py-3 rounded-[1.2rem] bg-red-600 text-white hover:bg-red-700 font-black text-[11px] tracking-widest uppercase transition-all shadow-xl shadow-red-600/20 active:scale-95 italic"
                    >
                        Mülakatı Sonlandır
                    </button>
                    <button onClick={() => setShowSettings(true)} className="w-12 h-12 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-900 transition-all flex items-center justify-center shadow-sm">
                        <Settings className="w-5 h-5"/>
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden p-6 gap-6">
                {/* Center: Stage */}
                <div className="flex-1 flex flex-col gap-6 relative">
                    <div className="flex-1 bg-slate-900 rounded-[3.5rem] relative overflow-hidden shadow-2xl border-[6px] border-white group/video transition-all duration-700">
                         <div className="absolute inset-0 bg-zinc-950">
                             {(stream || !isRecruiter) ? (
                                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                             ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                     <User className="w-40 h-40 text-white/5 blur-sm" />
                                </div>
                             )}
                         </div>
                         
                         {/* Watermark branding */}
                         <div className="absolute top-10 left-10 flex items-center gap-4 z-20">
                              <div className="bg-white/5 backdrop-blur-2xl border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-3">
                                   <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" />
                                   <span className="text-[11px] font-black text-white tracking-[0.2em] uppercase italic">Cognitive Analysis Engine</span>
                              </div>
                         </div>

                         {/* Local PIP View */}
                         <div className="absolute top-10 right-10 w-44 md:w-64 aspect-video rounded-3xl bg-slate-800 border-2 border-white/20 overflow-hidden shadow-2xl z-20 group/pip hover:scale-105 transition-transform duration-500">
                              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg text-[10px] font-black text-white uppercase tracking-widest italic border border-white/10">Siz</div>
                         </div>

                         {/* Profile Tag */}
                         <div className="absolute bottom-10 left-10 z-20">
                              <div className="bg-black/80 backdrop-blur-3xl px-6 py-4 rounded-[2rem] border border-white/10 flex items-center gap-4 w-fit shadow-2xl">
                                   <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                                       <User className="w-6 h-6 text-white/30" />
                                   </div>
                                   <div>
                                       <h3 className="text-base font-black text-white tracking-tighter italic uppercase">{isRecruiter ? (candidateData?.name || 'Sarah Jenkins') : 'IK Yönetimi'}</h3>
                                       <span className={\`text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-md mt-1 block w-fit \${isRecruiter ? 'text-blue-400 bg-blue-400/10' : 'text-emerald-400 bg-emerald-400/10'}\`}>
                                            {isRecruiter ? 'ADAY' : 'MODERATÖR'}
                                       </span>
                                   </div>
                              </div>
                         </div>

                         {/* Current Question overlay (Candidate View Only) */}
                         {!isRecruiter && questions.length > 0 && (
                              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 min-w-[400px] max-w-xl z-20 group/qob">
                                   <div className="bg-white/95 backdrop-blur-2xl border border-white rounded-[2.5rem] p-8 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] transform-gpu hover:scale-[1.02] transition-transform">
                                        <div className="flex items-center gap-3 mb-3">
                                             <HelpCircle className="w-4 h-4 text-blue-600" />
                                             <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest italic">Aktif Soru</span>
                                        </div>
                                        <p className="text-lg font-black text-slate-900 leading-snug italic italic tracking-tight">"{questions[currentQuestionIndex]?.text}"</p>
                                   </div>
                              </div>
                         )}

                         {/* Overlaid Controls at Bottom Center */}
                         <div className="absolute bottom-10 left-6 right-6 flex items-center justify-center gap-4 z-30 opacity-0 group-hover/video:opacity-100 transition-all duration-500 translate-y-4 group-hover/video:translate-y-0">
                             <div className="bg-black/40 backdrop-blur-3xl px-6 py-4 rounded-[2.5rem] border border-white/10 flex items-center gap-4">
                                 <button onClick={() => setIsMicOn(!isMicOn)} className={\`w-14 h-14 rounded-2xl flex items-center justify-center transition-all \${isMicOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-600 text-white shadow-lg'}\`}>
                                     {isMicOn ? <Mic className="w-6 h-6"/> : <MicOff className="w-6 h-6"/>}
                                 </button>
                                 <button onClick={() => setIsVideoOn(!isVideoOn)} className={\`w-14 h-14 rounded-2xl flex items-center justify-center transition-all \${isVideoOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-600 text-white shadow-lg'}\`}>
                                     {isVideoOn ? <Video className="w-6 h-6"/> : <VideoOff className="w-6 h-6"/>}
                                 </button>
                                 <button className="w-14 h-14 rounded-2xl bg-white/10 text-white hover:bg-white/20 transition-all flex items-center justify-center">
                                     <Monitor className="w-6 h-6" />
                                 </button>
                                 <div className="w-[2px] h-8 bg-white/10 mx-2" />
                                 <button onClick={handleFinishInterview} className="w-14 h-14 rounded-2xl bg-red-600 text-white hover:bg-red-500 transition-all flex items-center justify-center shadow-xl shadow-red-600/20">
                                     <X className="w-6 h-6"/>
                                 </button>
                             </div>
                         </div>
                    </div>

                    {/* Simulation Bar (Recruiter Only) */}
                    {isRecruiter && simIndex < transcriptData.length && (
                        <div className="absolute top-1/2 -right-3 -translate-y-1/2 translate-x-full z-40 animate-in slide-in-from-left duration-500">
                             <button
                                 onClick={triggerNextSim}
                                 className="h-14 px-6 rounded-2xl bg-[#1e3a8a] text-white font-black text-[10px] uppercase tracking-widest shadow-2xl flex items-center gap-3 hover:scale-105 transition-all"
                             >
                                 Simulation Next <Play className="w-4 h-4 fill-white" />
                             </button>
                        </div>
                    )}
                </div>

                {/* Right Sidebar: Recruiter AI vs Candidate Info */}
                {isRecruiter ? (
                    <div className="w-[420px] lg:w-[480px] flex flex-col gap-6 shrink-0 relative z-30">
                        {/* Competency Radar Section (Image 4-style) */}
                        <section className="bg-white rounded-[3rem] p-8 border border-slate-200 shadow-2xl space-y-8 h-[45%] flex flex-col">
                             <div className="flex items-center justify-between shrink-0">
                                  <div className="flex flex-col">
                                       <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-tighter italic">Analytical Radar</h3>
                                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cognitive State: Stable</span>
                                  </div>
                                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-blue-50 border border-blue-100 italic">
                                       <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                                       <span className="text-xs font-black text-blue-900">{logicIntegrity}% STAR</span>
                                  </div>
                             </div>

                             <div className="flex-1 flex flex-col justify-center space-y-6">
                                 {Object.entries(starScores).map(([key, value]) => (
                                     <div key={key} className="space-y-2 group">
                                         <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-900 transition-colors">
                                             <span>{key === 'S' ? 'Situation' : key === 'T' ? 'Task' : key === 'A' ? 'Action' : 'Result'}</span>
                                             <span className="text-blue-600">{value}%</span>
                                         </div>
                                         <div className="h-3 bg-slate-100 rounded-full overflow-hidden p-1 border border-slate-200 shadow-inner">
                                              <div 
                                                className={\`h-full rounded-full transition-all duration-1000 \${key === 'S' ? 'bg-blue-600' : key === 'T' ? 'bg-indigo-600' : key === 'A' ? 'bg-violet-600' : 'bg-emerald-600'}\`} 
                                                style={{width: \`\${value}%\` }} 
                                              />
                                         </div>
                                     </div>
                                 ))}
                             </div>

                             <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between shrink-0">
                                  <div className="flex items-center gap-3">
                                       <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_#3b82f6]" />
                                       <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-slate-400 uppercase">Voice Frequency</span>
                                            <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight">Active Transmit</span>
                                       </div>
                                  </div>
                                  <div className="h-6 flex items-end gap-1 px-4">
                                       {waveHeight.slice(0, 10).map((h, i) => (
                                           <div key={i} className="flex-1 bg-blue-600/30 rounded-t-sm transition-all duration-200" style={{ height: \`\${h/5}%\` }} />
                                       ))}
                                  </div>
                             </div>
                        </section>

                        {/* AI Interaction Center & Transcript (Drawer Style) */}
                        <section className="bg-slate-900 rounded-[3rem] border border-white/10 flex-1 flex flex-col overflow-hidden shadow-2xl relative">
                             {/* AI Coach Overlay Header */}
                             <div className="p-8 border-b border-white/5 shrink-0 bg-slate-900/50 backdrop-blur-xl relative z-10">
                                  <div className="flex items-center justify-between mb-2">
                                       <div className="flex flex-col">
                                            <h3 className="text-[12px] font-black text-white uppercase italic tracking-tighter">AI Recruiter Assistant</h3>
                                            <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.3em]">Autonomous Feedback</span>
                                       </div>
                                       <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center animate-pulse">
                                           <Brain className="w-6 h-6 text-white/60" />
                                       </div>
                                  </div>
                             </div>

                             {/* Feed Area (Transcript & Insights) */}
                             <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar-dark" ref={transcriptRef}>
                                  {/* Strategic Insight */}
                                  <div className="p-5 rounded-3xl bg-blue-600 border border-blue-400 shadow-2xl shadow-blue-900/40 italic">
                                       <div className="flex items-center gap-3 mb-2">
                                            <Sparkles className="w-4 h-4 text-white" />
                                            <span className="text-[9px] font-black text-white/80 uppercase tracking-widest">Focus Recommendation</span>
                                       </div>
                                       <p className="text-[13px] font-black text-white leading-snug tracking-tight">
                                            "{aiInsights[0]?.text || "Adayın mikroservis tecrübesindeki veri tutarlılığı senaryolarını sorgulayarak derinleşebilirsiniz."}"
                                       </p>
                                  </div>

                                  {/* Transcript Feed */}
                                  <div className="space-y-4">
                                       <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.4em] block mb-4">Transcription Stream</span>
                                       {transcript.slice(-4).map((line, idx) => {
                                            const isMe = line.role === 'YÖNETİCİ';
                                            const isAday = line.role === 'ADAY';
                                            return (
                                                <div key={idx} className="flex flex-col gap-2 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                                                     <div className="flex items-center justify-between">
                                                          <span className={\`text-[9px] font-black uppercase tracking-widest \${isMe ? 'text-blue-400' : isAday ? 'text-emerald-400' : 'text-white/40'}\`}>
                                                              {line.role}
                                                          </span>
                                                          <span className="text-[8px] font-bold text-white/20">{line.time}</span>
                                                     </div>
                                                     <p className={\`text-xs font-bold leading-relaxed \${isMe ? 'text-white/60' : 'text-white/90 italic'}\`}>
                                                          "{line.text}"
                                                     </p>
                                                </div>
                                            );
                                       })}
                                  </div>
                             </div>

                             {/* Bottom Interaction Grid */}
                             <div className="p-6 bg-black/40 border-t border-white/5 backdrop-blur-3xl grid grid-cols-2 gap-3 shrink-0 italic">
                                  <button className="h-12 rounded-xl bg-white/5 border border-white/10 text-white font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                                       <Mic className="w-3.5 h-3.5 text-blue-400" /> STT Log
                                  </button>
                                  <button onClick={() => handleGenerateAIQuestion('resume')} className="h-12 rounded-xl bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20">
                                       <Box className="w-3.5 h-3.5" /> AI Follow-up
                                  </button>
                             </div>
                        </section>
                    </div>
                ) : (
                    // Candidate Sidebar (Notes and Files)
                    <div className="w-[420px] lg:w-[480px] flex flex-col gap-6 shrink-0 relative z-30">
                        <section className="bg-white rounded-[3.5rem] border border-slate-200 flex-1 flex flex-col overflow-hidden shadow-2xl">
                             <div className="p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                                  <h3 className="text-[14px] font-black text-slate-900 uppercase italic tracking-tighter">İlerleme Takibi</h3>
                                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-50 border border-slate-200">
                                       <span className="text-[10px] font-black text-slate-500 uppercase">{currentQuestionIndex + 1} / {questions.length}</span>
                                  </div>
                             </div>

                             <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                                  <div className="bg-blue-50/50 border border-blue-100 rounded-[2rem] p-6 space-y-4">
                                       <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-[#1e3a8a] flex items-center justify-center text-white shadow-lg shadow-blue-900/20">
                                                 <Star className="w-5 h-5 fill-white" />
                                            </div>
                                            <div>
                                                 <h4 className="text-xs font-black text-slate-900 uppercase">STAR Odaklı Yanıt</h4>
                                                 <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest opacity-70">Profesyonel Rezzervasyon</p>
                                            </div>
                                       </div>
                                       <p className="text-sm font-bold text-slate-600 leading-relaxed italic">
                                            Yanıtlarınızı verirken (S)ituation, (T)ask, (A)ction ve (R)esult çerçevesinde detaylandırmanız değerlendirme kalitesini artıracaktır.
                                       </p>
                                  </div>

                                  <div className="space-y-4">
                                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Mülakat Akışı</span>
                                       {questions.map((q, idx) => (
                                           <div 
                                               key={idx} 
                                               className={\`p-5 rounded-3xl border transition-all duration-500 \${
                                                   idx === currentQuestionIndex 
                                                       ? 'bg-white border-[#1e3a8a] shadow-xl shadow-blue-900/5 ring-4 ring-blue-50 scale-[1.02]' 
                                                       : idx < currentQuestionIndex 
                                                           ? 'bg-emerald-50 border-emerald-100 opacity-60' 
                                                           : 'bg-slate-50 border-slate-200 opacity-40'
                                               }\`}
                                           >
                                                <div className="flex items-start gap-4">
                                                     <div className={\`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shrink-0 shadow-sm border \${
                                                         idx === currentQuestionIndex 
                                                             ? 'bg-[#1e3a8a] text-white border-blue-900' 
                                                             : idx < currentQuestionIndex 
                                                                 ? 'bg-emerald-500 text-white border-emerald-600' 
                                                                 : 'bg-white text-slate-400 border-slate-200'
                                                     }\`}>
                                                          {idx < currentQuestionIndex ? <Check className="w-5 h-5" /> : idx + 1}
                                                     </div>
                                                     <div className="space-y-1">
                                                          <span className={\`text-[9px] font-black uppercase tracking-widest \${idx === currentQuestionIndex ? 'text-blue-600' : 'text-slate-400'}\`}>
                                                              {q.category}
                                                          </span>
                                                          <p className={\`text-sm font-black italic tracking-tight leading-snug \${idx === currentQuestionIndex ? 'text-slate-900' : 'text-slate-500'}\`}>
                                                              {q.text}
                                                          </p>
                                                     </div>
                                                </div>
                                           </div>
                                       ))}
                                  </div>
                             </div>

                             {/* Candidate Bottom Actions */}
                             <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-center">
                                  <button className="flex items-center gap-2 text-[11px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-all">
                                       <FileText className="w-4 h-4" /> CV Dosyasını Görüntüle
                                  </button>
                             </div>
                        </section>
                    </div>
                )}
            </div>

            {/* Background elements */}
            <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-blue-100/20 rounded-full blur-[180px] pointer-events-none -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-indigo-100/20 rounded-full blur-[180px] pointer-events-none translate-y-1/2 -translate-x-1/2" />

            {/* Settings Modal placed so it renders properly in lobby and over everything */}
            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} devices={devices} selectedDevices={selectedDevices} onDeviceChange={changeDevice} />}
        </div>
    );
}

// Settings Modal Component for reuse
function SettingsModal({ onClose, devices, selectedDevices, onDeviceChange }) {
    return (
        <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-md flex items-center justify-center p-6 italic">
            <div className="bg-white border border-slate-200 w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.1)] transition-all animate-in zoom-in-95 duration-200">
                <div className="p-10 space-y-10">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                             <h3 className="text-2xl font-black text-slate-900 tracking-tighter italic uppercase">Hardware Config</h3>
                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Device Selection</span>
                        </div>
                        <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all shadow-sm">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="space-y-8">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] block ml-1">Kamera Girişi</label>
                            <div className="relative group">
                                <select
                                    value={selectedDevices.videoId}
                                    onChange={(e) => onDeviceChange('videoId', e.target.value)}
                                    className="w-full h-16 bg-slate-50 border border-slate-200 rounded-2xl px-6 text-sm font-black text-slate-900 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none italic"
                                >
                                    <option value="">Varsayılan Kamera</option>
                                    {devices.video.map(dev => <option key={dev.deviceId} value={dev.deviceId}>{dev.label || \`Kamera \${dev.deviceId.substring(0, 5)}\`}</option>)}
                                </select>
                                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 pointer-events-none" />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] block ml-1">Mikrofon Girişi</label>
                            <div className="relative group">
                                <select
                                    value={selectedDevices.audioId}
                                    onChange={(e) => onDeviceChange('audioId', e.target.value)}
                                    className="w-full h-16 bg-slate-50 border border-slate-200 rounded-2xl px-6 text-sm font-black text-slate-900 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none italic"
                                >
                                    <option value="">Varsayılan Mikrofon</option>
                                    {devices.audio.map(dev => <option key={dev.deviceId} value={dev.deviceId}>{dev.label || \`Mikrofon \${dev.deviceId.substring(0, 5)}\`}</option>)}
                                </select>
                                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <button
                            onClick={onClose}
                            className="w-full h-16 rounded-2xl bg-[#1e3a8a] text-white text-[11px] font-black uppercase tracking-widest shadow-2xl shadow-blue-500/20 hover:bg-blue-900 transition-all active:scale-[0.98] italic"
                        >
                            Ayarları Uygula ve Kapat
                        </button>
                        <p className="text-center text-[9px] font-black text-slate-400 uppercase tracking-widest">Sistem Tarafından Doğrulanmış Cihazlar</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

\`;

const finalContent = topContent + newJSX;

fs.writeFileSync(filePath, finalContent, 'utf8');
console.log("Rewrite completed successfully!");
