const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'LiveInterviewPage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// The strategy is to find the return statement for lobby and active, then replace.
// Let's use string manipulation to carefully slice and dice.

const lobbyStartMatch = `    if (phase === 'lobby') {`;
const settingsMatchStart = `    // Settings Modal Component for reuse`;
const activeStartMatch = `    // ====== ACTIVE INTERVIEW PHASE ======`;

const topContent = content.substring(0, content.indexOf(lobbyStartMatch));

const settingsToActiveContent = content.substring(content.indexOf(settingsMatchStart), content.indexOf(activeStartMatch));

const endContent = `        </div>
    );
}

`;

// --- NEW LOBBY JSX ---
const newLobbyJSX = `    if (phase === 'lobby') {
        return (
            <div className="min-h-screen bg-slate-50 font-sans flex flex-col text-slate-800">
                {/* Header Navbar */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#1e3a8a] flex items-center justify-center">
                            <Video className="w-4 h-4 text-white" />
                        </div>
                        <h1 className="text-xl font-bold text-[#1e3a8a] tracking-tight">TalentFlow</h1>
                    </div>
                    {isRecruiter && (
                        <div className="flex items-center gap-2 text-sm text-slate-500 font-medium tracking-tight">
                            <span className="hover:text-slate-900 cursor-pointer">Mülakatlar</span>
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                            <span className="text-slate-900 font-bold">Pre-flight Kontrolü</span>
                        </div>
                    )}
                    <div className="flex items-center gap-5">
                       <button className="text-slate-400 hover:text-slate-600"><AlertCircle className="w-5 h-5" /></button>
                       <button className="text-slate-400 hover:text-slate-600"><HelpCircle className="w-5 h-5" /></button>
                       <button onClick={() => setShowSettings(true)} className="text-slate-400 hover:text-slate-600"><Settings className="w-5 h-5" /></button>
                       <div className="flex items-center gap-2">
                           <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-slate-300 flex items-center justify-center">
                               <User className="w-5 h-5 text-slate-400" />
                           </div>
                           <span className="text-sm font-bold text-slate-700">{userProfile?.name?.split(' ')[0] || 'Kullanıcı'}</span>
                       </div>
                    </div>
                </header>

                <div className="flex-1 flex flex-col items-center p-6 md:p-8 overflow-y-auto">
                    {isRecruiter ? (
                        // RECRUITER LOBBY (Pre-flight Kontrolü)
                        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                            {/* Left: Video */}
                            <div className="relative rounded-[2rem] bg-zinc-900 overflow-hidden shadow-xl aspect-[4/3] group border border-slate-200">
                                {isVideoOn && stream ? (
                                    <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                                            <Camera className="w-10 h-10 text-white/40" />
                                        </div>
                                    </div>
                                )}
                                
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                                
                                <div className="absolute bottom-6 left-6 flex items-center gap-3">
                                    <button onClick={() => setIsVideoOn(!isVideoOn)} className={\`w-12 h-12 rounded-2xl flex items-center justify-center backdrop-blur-md transition-all \${isVideoOn ? 'bg-white/20 text-white hover:bg-white/30 border border-white/30' : 'bg-red-500/80 text-white border border-red-500/50'}\`}>
                                        {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                                    </button>
                                    <button onClick={() => setIsMicOn(!isMicOn)} className={\`w-12 h-12 rounded-2xl flex items-center justify-center backdrop-blur-md transition-all \${isMicOn ? 'bg-white/20 text-white hover:bg-white/30 border border-white/30' : 'bg-red-500/80 text-white border border-red-500/50'}\`}>
                                        {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                                    </button>
                                </div>
                                <div className="absolute bottom-6 right-6 flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 border border-white/20 backdrop-blur-md">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[11px] font-bold text-white tracking-wide">Sistem Hazır</span>
                                </div>
                                {/* Waveform mock */}
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                                     <div className="flex items-center gap-1 opacity-70">
                                        <div className="w-0.5 h-2 bg-white rounded-full"></div>
                                        <div className="w-0.5 h-4 bg-white rounded-full"></div>
                                        <div className="w-0.5 h-3 bg-white rounded-full"></div>
                                        <div className="w-0.5 h-5 bg-white rounded-full"></div>
                                        <div className="w-0.5 h-2 bg-white rounded-full"></div>
                                     </div>
                                     <span className="text-[10px] text-white/70 font-medium tracking-tight">Giriş Seviyesi: Optimal</span>
                                </div>
                            </div>

                            {/* Right: Info & Launch */}
                            <div className="space-y-6">
                                {/* Candidate Profile Card */}
                                <div className="bg-white rounded-[1.5rem] p-6 border border-slate-200 shadow-sm relative overflow-hidden">
                                     {/* Background shape */}
                                     {candidateData?.matchScore >= 80 && <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-50 rounded-full blur-2xl" />}
                                    <div className="flex items-start justify-between mb-6 relative z-10">
                                        <div className="flex items-center gap-4">
                                            <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200">
                                                <User className="w-8 h-8 text-slate-400" />
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-bold text-slate-900 tracking-tight">{candidateData?.name || 'Aday Adı'}</h2>
                                                <p className="text-sm font-semibold text-slate-500">{candidateData?.matchedPositionTitle || candidateData?.position || 'Pozisyon'}</p>
                                            </div>
                                        </div>
                                        {candidateData?.matchScore >= 0 && (
                                            <div className="flex flex-col items-center bg-[#e0f2fe] text-[#0369a1] px-4 py-2 rounded-xl font-bold border border-[#bae6fd]">
                                                <span className="text-[10px] opacity-80 uppercase tracking-widest mb-1">AI SKOR:</span>
                                                <span className="text-xl leading-none">{Math.round(candidateData.matchScore)}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Tecrübe</span>
                                            <span className="text-sm font-bold text-slate-800">{(candidateData?.experience || 0)} Yıl</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Lokasyon</span>
                                            <span className="text-sm font-bold text-slate-800">{candidateData?.location || 'Belirtilmedi'}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="relative z-10 pt-4 border-t border-slate-100">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Star Değerlendirme Özeti</span>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                                <span>Sistem Düşüncesi</span>
                                                <div className="flex gap-1">{[1,2,3,4,5].map(i => <div key={i} className={\`w-4 h-1.5 rounded-full \${i<=4 ? 'bg-[#1e3a8a]' : 'bg-slate-200'}\`} />)}</div>
                                            </div>
                                            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                                <span>Liderlik</span>
                                                <div className="flex gap-1">{[1,2,3,4,5].map(i => <div key={i} className={\`w-4 h-1.5 rounded-full \${i<=3 ? 'bg-[#1e3a8a]' : 'bg-slate-200'}\`} />)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* AI Note */}
                                <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-[1.5rem] p-5 relative overflow-hidden">
                                    <Brain className="absolute -right-4 -bottom-4 w-24 h-24 text-[#4ade80] opacity-10" />
                                    <div className="flex items-center gap-2 mb-2 relative z-10">
                                        <Sparkles className="w-4 h-4 text-[#059669]" />
                                        <h3 className="text-xs font-bold text-[#059669] uppercase tracking-widest">AI Mülakat Notu</h3>
                                    </div>
                                    <p className="text-sm font-semibold text-[#065f46] leading-relaxed relative z-10">
                                        {candidateData?.summary || "Adayın analitik becerileri güçlü. Ancak kriz yönetimi senaryolarında daha derinlemesine sorgulanması önerilir."}
                                    </p>
                                </div>

                                {/* Question Set & Launch */}
                                <div className="bg-white rounded-[1.5rem] p-6 border border-slate-200 shadow-sm space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-slate-800">
                                            <Box className="w-5 h-5 text-[#1e3a8a]" />
                                            <h3 className="text-sm font-bold tracking-tight">Seçilen Soru Seti: {activeStrategy === 'comprehensive' ? 'Karma Soru Seti' : activeStrategy}</h3>
                                        </div>
                                        <select 
                                            value={activeStrategy}
                                            onChange={(e) => setActiveStrategy(e.target.value)}
                                            className="text-xs font-bold text-[#1e3a8a] bg-blue-50 border border-blue-100 rounded-lg px-2 py-1 cursor-pointer outline-none"
                                        >
                                            <option value="comprehensive">Seti Değiştir</option>
                                            <option value="technical">Teknik Odaklı</option>
                                            <option value="culture">Kültür Odaklı</option>
                                        </select>
                                    </div>
                                    <div className="space-y-3">
                                        {questions.slice(0,3).map((q, i) => (
                                            <div key={q.id} className="flex gap-3 items-start border border-slate-200 p-3 rounded-xl bg-slate-50">
                                                <div className="w-6 h-6 rounded-full bg-white border border-slate-200 text-[#1e3a8a] flex items-center justify-center text-[10px] font-black shrink-0 shadow-sm">
                                                    0{i+1}
                                                </div>
                                                <p className="text-xs font-semibold text-slate-700 leading-snug flex-1">{q.text}</p>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm">{q.category}</span>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <div className="pt-4 flex items-center justify-between gap-4">
                                        <div className="text-xs text-slate-500 font-medium flex items-center gap-2 tracking-tight">
                                            <Info className="w-4 h-4 text-slate-400" /> Tahmini mülakat süresi <span className="text-slate-800 font-bold">45 dk</span>
                                        </div>
                                        <button 
                                            onClick={() => setPhase('active')}
                                            className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-[#1e3a8a] hover:bg-[#172b66] text-white font-bold text-sm transition-all shadow-xl shadow-[#1e3a8a]/20 active:scale-95"
                                        >
                                            Mülakatı Başlat <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        // CANDIDATE LOBBY (Mülakata Hazır Mısın?)
                        <div className="max-w-5xl w-full flex flex-col pt-10 px-4">
                            <h1 className="text-[44px] tracking-tight font-black text-[#1e3a8a] mb-4">Mülakata <span className="text-slate-800">Hazır Mısın?</span></h1>
                            <p className="text-base text-slate-600 font-medium max-w-xl mb-10 leading-relaxed">
                                Cihazlarınızı kontrol edin ve hazır olduğunuzda giriş yapın. Mülakat odasına bağlanmadan önceki son adımdasınız.
                            </p>

                            <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
                                {/* Left Side: Camera & Checks */}
                                <div className="lg:col-span-3 space-y-6">
                                    <div className="relative rounded-[2.5rem] bg-slate-200 overflow-hidden shadow-sm aspect-[4/3] border border-slate-300">
                                        {isVideoOn && stream ? (
                                            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                                                <Camera className="w-16 h-16 text-white/20" />
                                            </div>
                                        )}
                                        <div className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 rounded-full bg-[#059669]/90 backdrop-blur-md shadow-sm">
                                            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                            <span className="text-[10px] font-bold text-white uppercase tracking-wider">Sinyal Güçlü</span>
                                        </div>
                                        {/* Floating bottom box for controls */}
                                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-xl p-2 rounded-2xl flex items-center gap-2 shadow-lg border border-white/20">
                                            <button onClick={() => setIsMicOn(!isMicOn)} className={\`w-12 h-12 rounded-xl flex items-center justify-center transition-all \${isMicOn ? 'bg-white text-slate-700 shadow-sm border border-slate-200' : 'bg-red-50 text-red-500 border border-red-100'}\`}>
                                                {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                                            </button>
                                            <button onClick={() => setIsVideoOn(!isVideoOn)} className={\`w-12 h-12 rounded-xl flex items-center justify-center transition-all \${isVideoOn ? 'bg-white text-slate-700 shadow-sm border border-slate-200' : 'bg-red-50 text-red-500 border border-red-100'}\`}>
                                                {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                                            </button>
                                            <button onClick={() => setShowSettings(true)} className="w-12 h-12 rounded-xl bg-white text-slate-700 shadow-sm flex items-center justify-center border border-slate-200">
                                                <Settings className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* 3 Status Cards underneath video */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
                                            <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#1e3a8a] flex items-center justify-center shrink-0 border border-blue-100">
                                                <Mic className="w-5 h-5" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Mikrofon</span>
                                                <span className="text-xs font-bold text-slate-800 tracking-tight">Varsayılan</span>
                                            </div>
                                        </div>
                                        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
                                            <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#1e3a8a] flex items-center justify-center shrink-0 border border-blue-100">
                                                <Camera className="w-5 h-5" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Kamera</span>
                                                <span className="text-xs font-bold text-slate-800 tracking-tight">Varsayılan</span>
                                            </div>
                                        </div>
                                        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
                                            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                                                <Zap className="w-5 h-5" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Bağlantı</span>
                                                <span className="text-xs font-bold font-mono text-slate-800 tracking-tight">120 Mbps</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Side: Info & Proceed */}
                                <div className="lg:col-span-2 space-y-6">
                                    {/* Recruiter Identity */}
                                    <div className="bg-white rounded-[1.5rem] p-6 border border-slate-200 shadow-sm relative overflow-hidden">
                                        <div className="flex items-center gap-4 mb-4 relative z-10">
                                            <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200">
                                                <User className="w-6 h-6 text-slate-400" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-bold text-slate-900 tracking-tight">IK Ekibi</h3>
                                                <p className="text-xs font-semibold text-[#1e3a8a]">Kıdemli İşe Alım Uzmanı</p>
                                                <div className="flex gap-2 mt-1">
                                                    <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 font-bold rounded uppercase tracking-widest">TalentFlow A.Ş.</span>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-sm text-slate-600 font-medium italic leading-relaxed relative z-10">
                                            "Geleceğin liderlerini arıyoruz. Bugün sizinle teknik yetkinliklerinizin yanı sıra problem çözme yaklaşımınızı konuşacağız."
                                        </p>
                                    </div>

                                    {/* RULES */}
                                    <div className="bg-[#f8fafc] rounded-[1.5rem] p-6 border border-slate-200 shadow-sm relative">
                                         {/* Top stripe */}
                                         <div className="absolute top-0 left-6 right-6 h-1 bg-slate-200 rounded-b-xl" />
                                        <div className="flex items-center gap-2 mb-5">
                                            <CheckCircle2 className="w-5 h-5 text-slate-800" />
                                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Mülakat Kuralları</h4>
                                        </div>
                                        <ul className="space-y-4">
                                            <li className="flex items-start gap-3">
                                                <div className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</div>
                                                <p className="text-xs font-semibold text-slate-700 leading-snug">Sessiz ve iyi aydınlatılmış bir ortamda bulunduğunuzdan emin olun.</p>
                                            </li>
                                            <li className="flex items-start gap-3">
                                                <div className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</div>
                                                <p className="text-xs font-semibold text-slate-700 leading-snug">Mülakat süresince internet tarayıcınızda başka sekme açmayın.</p>
                                            </li>
                                            <li className="flex items-start gap-3">
                                                <div className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</div>
                                                <p className="text-xs font-semibold text-slate-700 leading-snug">Mülakat kaydedilecektir. Gizlilik sözleşmesi geçerlidir.</p>
                                            </li>
                                        </ul>
                                        <div className="mt-6 flex items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                                            <input type="checkbox" id="consent" checked={hasConsent} onChange={(e) => setHasConsent(e.target.checked)} className="w-4 h-4 rounded appearance-none border border-slate-300 checked:bg-[#1e3a8a] checked:border-[#1e3a8a] checked:before:content-['✓'] checked:before:text-white checked:before:flex checked:before:items-center checked:before:justify-center cursor-pointer transition-colors" />
                                            <label htmlFor="consent" className="text-xs font-bold text-slate-700 cursor-pointer">KVKK Metnini Okudum ve Onaylıyorum</label>
                                        </div>
                                    </div>

                                    <div>
                                        <button 
                                            onClick={() => setPhase('active')}
                                            disabled={!hasConsent}
                                            className="w-full py-4 rounded-xl bg-[#1e3a8a] text-white font-bold text-sm tracking-wide shadow-xl shadow-[#1e3a8a]/20 flex items-center justify-center gap-2 hover:bg-[#172b66] transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                                        >   
                                            Hazırım, Başlayalım <ChevronRight className="w-5 h-5" />
                                        </button>
                                        <p className="text-center text-[10px] font-medium text-slate-500 mt-3">
                                            Butona tıklayarak mülakat odasına giriş yaparsınız.<br/>Bekleme süresi: <span className="font-bold text-[#1e3a8a]">~1 dakika</span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {/* Global Footer info for candidate */}
                {!isRecruiter && (
                    <div className="h-14 bg-white border-t border-slate-200 px-8 flex flex-row items-center justify-between shrink-0">
                        <div className="flex items-center gap-8">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Başvuru ID</span>
                                <span className="text-[11px] font-bold text-slate-800 uppercase">TF-2624-8849</span>
                            </div>
                            <div className="flex flex-col border-l border-slate-200 pl-8">
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Pozisyon</span>
                                <span className="text-[11px] font-bold text-slate-800">{candidateData?.matchedPositionTitle || candidateData?.position || 'Aday'}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                             <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                             Tüm sistemler çalışıyor. Güvenli bağlantı sağlandı.
                        </div>
                    </div>
                )}
                {/* Settings Modal placed so it renders properly in lobby and over everything */}
                {showSettings && <SettingsModal onClose={() => setShowSettings(false)} devices={devices} selectedDevices={selectedDevices} onDeviceChange={changeDevice} />}
            </div>
        );
    }
`;


const newActiveJSX = `    // ====== ACTIVE INTERVIEW PHASE ======
    return (
        <div className="fixed inset-0 z-[200] bg-slate-50 flex flex-col overflow-hidden text-slate-900 font-sans">
            {/* Top Bar matching Image 4 & 5 */}
            <header className="h-[60px] shrink-0 border-b border-slate-200 bg-white px-6 flex items-center justify-between z-20">
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-[#1e3a8a] flex items-center justify-center shadow-sm">
                        <Video className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex flex-col justify-center border-l border-slate-200 pl-4 h-8">
                        <div className="flex items-center gap-2">
                             <span className="text-sm font-bold text-slate-800 tracking-tight">Canlı Mülakat:</span>
                             <span className="text-sm font-bold text-[#1e3a8a] tracking-tight">{candidateData?.matchedPositionTitle || candidateData?.position || 'Aday'}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-red-600 font-black text-[10px] tracking-widest border border-red-100 uppercase shadow-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                        CANLI KAYIT
                    </div>
                    {isRecruiter && (
                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-widest hidden md:flex">
                            <div className="flex -space-x-2">
                                <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center overflow-hidden"><User className="w-3 h-3 text-slate-400"/></div>
                                <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center overflow-hidden"><User className="w-3 h-3 text-slate-400"/></div>
                            </div>
                            Gözlemci (2)
                        </div>
                    )}
                    <button
                        onClick={handleFinishInterview}
                        className="px-6 py-2 rounded-lg bg-[#ef4444] text-white hover:bg-[#dc2626] font-bold text-[11px] tracking-widest uppercase transition-colors shadow-md shadow-red-500/20"
                    >
                        Mülakatı Bitir
                    </button>
                    <button onClick={() => setShowSettings(true)} className="text-slate-400 hover:text-slate-600 transition-colors"><Settings className="w-5 h-5"/></button>
                </div>
            </header>

            {/* Main Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Main View: Large Video */}
                <div className="flex-1 bg-slate-100 relative flex flex-col p-4 md:p-6">
                     <div className="flex-1 bg-slate-900 rounded-[2rem] relative overflow-hidden border border-slate-400 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.3)] flex flex-col group/video">
                         {/* Main Video Source (If recruiter, show candidate. If candidate, show recruiter.) 
                             Here we use local stream as a placeholder for both for demo purposes, but applying styles. */}
                         <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
                             {(stream || !isRecruiter) ? (
                                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                             ) : (
                                <User className="w-32 h-32 text-slate-700" />
                             )}
                         </div>
                         
                         {/* Top Branding / Mülakat adı Candidate View */}
                         {!isRecruiter && (
                              <div className="absolute top-6 left-6 flex items-center gap-3 z-20">
                                   <div className="bg-white/10 backdrop-blur-md border border-white/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-emerald-400" />
                                        <span className="text-[11px] font-black text-white tracking-widest uppercase">Cognitive Slate</span>
                                   </div>
                              </div>
                         )}

                         {/* Picture-in-picture local view */}
                         <div className="absolute top-6 right-6 w-32 md:w-48 aspect-video rounded-xl bg-slate-800 border-2 border-white/10 overflow-hidden shadow-2xl z-20 group">
                              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                              <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[9px] font-bold text-white uppercase tracking-wider">Siz</div>
                         </div>

                         {/* Name Tag Bottom Left */}
                         <div className="absolute bottom-6 md:bottom-24 left-6 z-20">
                              <div className="bg-black/80 backdrop-blur-xl px-4 py-2.5 rounded-xl border border-white/10 flex items-center gap-3 w-fit shadow-xl">
                                   <span className="text-[13px] font-bold text-white tracking-wide">{isRecruiter ? (candidateData?.name || 'Sarah Jenkins') : 'Zeynep Aydın'}</span>
                                   <span className={\`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded \${isRecruiter ? 'text-emerald-400 bg-emerald-400/10' : 'text-blue-400 bg-blue-400/10'}\`}>
                                        {isRecruiter ? 'ADAY' : 'IK YÖNETİCİSİ'}
                                   </span>
                              </div>
                         </div>

                         {/* Current Question overlay (Candidate View) */}
                         {!isRecruiter && questions.length > 0 && (
                              <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 bg-white/95 backdrop-blur-lg border border-slate-200 rounded-[1.5rem] p-4 shadow-2xl max-w-lg w-full transform transition-all">
                                   <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1 block">Şu Anki Soru</span>
                                   <p className="text-sm font-bold text-slate-800 leading-snug">{questions[currentQuestionIndex]?.text}</p>
                              </div>
                         )}

                         {/* Overlaid Controls at Bottom Middle */}
                         <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-30 opacity-0 group-hover/video:opacity-100 transition-opacity duration-300">
                             <button onClick={() => setIsMicOn(!isMicOn)} className={\`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all bg-[#0f172a]/90 backdrop-blur-md border hover:bg-[#1e293b] \${isMicOn ? 'text-white border-slate-700 hover:border-slate-500' : 'text-red-500 border-red-500/50 hover:bg-red-500/10'}\`}>
                                 {isMicOn ? <Mic className="w-5 h-5"/> : <MicOff className="w-5 h-5"/>}
                             </button>
                             <button onClick={() => setIsVideoOn(!isVideoOn)} className={\`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all bg-[#0f172a]/90 backdrop-blur-md border hover:bg-[#1e293b] \${isVideoOn ? 'text-white border-slate-700 hover:border-slate-500' : 'text-red-500 border-red-500/50 hover:bg-red-500/10'}\`}>
                                 {isVideoOn ? <Video className="w-5 h-5"/> : <VideoOff className="w-5 h-5"/>}
                             </button>
                             <button onClick={handleFinishInterview} className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all bg-[#ef4444] hover:bg-[#dc2626] border border-[#f87171] text-white shadow-[0_0_20px_rgba(220,38,38,0.4)]">
                                 <X className="w-5 h-5"/>
                             </button>
                             {isRecruiter && (
                                 <button className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all bg-[#0f172a]/90 backdrop-blur-md border border-slate-700 hover:border-slate-500 text-white hover:bg-[#1e293b]">
                                     <Monitor className="w-5 h-5" />
                                 </button>
                             )}
                         </div>
                     </div>

                     {/* Very Bottom Bar inside gray container */}
                     <div className="h-4 mt-4 shrink-0 flex items-center justify-between text-[10px] font-bold text-slate-400 px-4">
                          <div className="flex items-center gap-6 uppercase tracking-widest">
                              <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Gecikme: 24ms</span>
                              <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> REC 00:12:44</span>
                          </div>
                     </div>
                </div>

                {/* Right Sidebar: Switch between Recruiter AI and Candidate Notes depending on role */}
                {isRecruiter ? (
                    <div className="w-[380px] lg:w-[440px] bg-white border-l border-slate-200 flex flex-col shrink-0 z-30 shadow-[-10px_0_30px_rgba(0,0,0,0.02)]">
                        {/* Live Tracking Header (Recruiter) */}
                        <div className="p-6 border-b border-slate-100 bg-[#f8fafc]">
                            <div className="flex items-center justify-between mb-6">
                                 <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                      <Activity className="w-4 h-4 text-[#1e3a8a]" /> Canlı Yetkinlik Takibi
                                 </h3>
                                 <div className="bg-[#10b981]/10 text-[#059669] px-2.5 py-1 rounded text-[9px] font-bold tracking-widest uppercase border border-[#10b981]/20 flex items-center gap-1.5">
                                      <div className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse" /> AI Analiz Ediyor
                                 </div>
                            </div>
                            <div className="space-y-4">
                                {[
                                    { label: 'Sistem Düşüncesi', value: 84, color: 'bg-[#1e3a8a]', tcolor: 'text-[#1e3a8a]' },
                                    { label: 'İletişim Netliği', value: 92, color: 'bg-[#0369a1]', tcolor: 'text-[#0369a1]' },
                                    { label: 'Görsel Tasarım', value: 68, color: 'bg-[#10b981]', tcolor: 'text-[#10b981]' }
                                ].map(item => (
                                    <div key={item.label}>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[11px] font-bold text-slate-600">{item.label}</span>
                                            <span className={\`text-[11px] font-bold \${item.tcolor}\`}>{item.value}%</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                             <div className={\`h-full \${item.color} transition-all duration-1000\`} style={{width: \`\${item.value}%\`}} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Transcript List */}
                        <div className="flex-1 overflow-y-auto p-6 bg-white flex flex-col">
                            <div className="flex items-center justify-between mb-5">
                                 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Kayıt (Tüm Mülakat)</h3>
                                 <span className="text-[10px] font-bold text-[#1e3a8a] bg-blue-50 px-2 py-1 rounded cursor-pointer hover:bg-blue-100 transition-colors uppercase tracking-widest">Otomatik Görünüm</span>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-5 pr-2 custom-scrollbar" ref={transcriptRef}>
                                 {transcript.slice(-10).filter(t => t.role !== 'SYSTEM').map((line, idx) => {
                                     const isMe = line.role === 'YÖNETİCİ';
                                     return (
                                         <div key={idx} className="flex items-start gap-3">
                                             <div className={\`w-7 h-7 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0 \${isMe ? 'bg-[#1e3a8a] text-white' : 'bg-[#e2e8f0] text-slate-600'}\`}>
                                                 {isMe ? 'M' : 'S'}
                                             </div>
                                             <div className={\`p-3 rounded-2xl \${isMe ? 'bg-[#f1f5f9] border border-slate-200 rounded-tl-sm' : 'bg-white border border-slate-200 shadow-sm rounded-tl-sm'}\`}>
                                                 <p className="text-xs font-bold text-slate-800 leading-relaxed">
                                                      <span className={\`text-[10px] uppercase tracking-widest block mb-1 \${isMe ? 'text-slate-500' : 'text-[#1e3a8a]'}\`}>{isMe ? 'Siz' : (candidateData?.name || 'Aday')}</span>
                                                      "{line.text}"
                                                 </p>
                                                 <span className="text-[9px] font-bold text-slate-400 block mt-2">{line.time}</span>
                                             </div>
                                         </div>
                                     )
                                 })}
                            </div>
                        </div>

                        {/* AI Suggestions (Bottom of sidebar) */}
                        <div className="p-6 bg-[#f8fafc] border-t border-slate-200 shrink-0">
                             <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-2">
                                      <Sparkles className="w-4 h-4 text-[#10b981]" />
                                      <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">AI Önerileri</h3>
                                  </div>
                                  <button onClick={triggerNextSim} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 uppercase tracking-widest">Simüle Et</button>
                             </div>
                             <div className="space-y-3">
                                 {/* Mock Suggestions based on Image 4 */}
                                 <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm cursor-pointer hover:border-blue-300 transition-colors group/sug">
                                      <p className="text-[11px] font-bold text-slate-700 mb-2.5 leading-snug group-hover/sug:text-slate-900">"Yerelleştirme başarısı için takip ettiğiniz spesifik metrikler hakkında detay verebilir misiniz?"</p>
                                      <div className="flex items-center gap-2">
                                           <span className="text-[9px] font-black text-[#10b981] bg-[#10b981]/10 px-1.5 py-0.5 rounded uppercase tracking-widest">Takip Sorusu</span>
                                           <span className="text-[9px] font-black text-[#1e3a8a] bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-widest">Metrik Odaklı</span>
                                      </div>
                                 </div>
                                 <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm cursor-pointer hover:border-blue-300 transition-colors group/sug">
                                      <p className="text-[11px] font-bold text-slate-700 mb-2.5 leading-snug group-hover/sug:text-slate-900">"Bu projede teknik kısıtlamalar ile tasarım vizyonunu nasıl dengelediniz?"</p>
                                      <div className="flex items-center gap-2">
                                           <span className="text-[9px] font-black text-[#f59e0b] bg-[#fef3c7] px-1.5 py-0.5 rounded uppercase tracking-widest">Strateji</span>
                                           <span className="text-[9px] font-black text-[#1e3a8a] bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-widest">İş Birliği</span>
                                      </div>
                                 </div>
                             </div>
                        </div>
                    </div>
                ) : (
                    // Candidate Sidebar (Image 5 view)
                    <div className="w-[380px] lg:w-[440px] bg-slate-50 border-l border-slate-200 flex flex-col shrink-0 z-30">
                         {/* Candidate Notes Tabs */}
                         <div className="flex border-b border-slate-200 px-6 pt-6">
                              <button className="pb-3 border-b-2 border-[#1e3a8a] text-sm font-bold text-[#1e3a8a] px-4">Aday Notları</button>
                              <button className="pb-3 border-b-2 border-transparent text-sm font-bold text-slate-400 px-4 hover:text-slate-600">Dosyalar</button>
                         </div>
                         <div className="p-6 space-y-6 overflow-y-auto">
                              {/* Bilişsel Analiz */}
                              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                                   <div className="flex items-center gap-2 mb-3">
                                        <Sparkles className="w-4 h-4 text-emerald-500" />
                                        <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Bilişsel Analiz</h4>
                                   </div>
                                   <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                                        Aday problem çözme yaklaşımlarını değerlendirirken sistematik bir çerçeve kullanıyor. 
                                        Kariyer gelişimi konusunda tutkulu ancak daha derinlemesine takım liderliği sorgulanmalı.
                                   </p>
                              </div>

                              {/* Soru İlerlemesi */}
                              <div>
                                   <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Soru İlerlemesi</h4>
                                   <div className="space-y-3">
                                        {questions.map((q, i) => (
                                             <div key={i} className={\`p-4 rounded-xl border \${i === currentQuestionIndex ? 'bg-blue-50 border-blue-200 shadow-sm' : i < currentQuestionIndex ? 'bg-emerald-50 border-emerald-100 opacity-70' : 'bg-white border-slate-200 opacity-60'}\`}>
                                                  <div className="flex items-start gap-3">
                                                       <div className={\`w-6 h-6 rounded-full flex items-center justify-center shrink-0 \${i === currentQuestionIndex ? 'bg-blue-500 text-white' : i < currentQuestionIndex ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}\`}>
                                                            {i < currentQuestionIndex ? <Check className="w-3 h-3" /> : <span className="text-[10px] font-black">{i+1}</span>}
                                                       </div>
                                                       <p className={\`text-xs font-bold mt-0.5 \${i === currentQuestionIndex ? 'text-slate-800' : 'text-slate-600'}\`}>{q.text}</p>
                                                  </div>
                                             </div>
                                        ))}
                                   </div>
                              </div>
                         </div>
                    </div>
                )}
            </div>
            {/* Show Settings outside the flex wrappers */}
            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} devices={devices} selectedDevices={selectedDevices} onDeviceChange={changeDevice} />}
        </div>
    );
}`;

const finalContent = topContent + newLobbyJSX + `\n\n` + settingsToActiveContent + newActiveJSX + endContent;

fs.writeFileSync(filePath, finalContent, 'utf8');
console.log("Rewrite completed carefully preserving SettingsModal!");
