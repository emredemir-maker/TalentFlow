const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'LiveInterviewPage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const marker = 'if (candidatesLoading) {';
const startIndex = content.indexOf(marker);

if (startIndex === -1) {
    console.error("Marker not found!");
    process.exit(1);
}

const topContent = content.substring(0, startIndex);
const BT = '`'; // backtick

const lobbyPhaseJSX = `
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
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#1e3a8a] flex items-center justify-center">
                            <Video className="w-4 h-4 text-white" />
                        </div>
                        <h1 className="text-xl font-bold text-[#1e3a8a] tracking-tight italic">TalentFlow</h1>
                    </div>
                    <div className="flex items-center gap-5">
                       <button onClick={() => setShowSettings(true)} className="text-slate-300 hover:text-slate-600 transition-colors"><Settings className="w-5 h-5" /></button>
                       <div className="flex items-center gap-2 border-l border-slate-100 pl-5 ml-2">
                           <div className="w-8 h-8 rounded-full bg-slate-50 overflow-hidden border border-slate-200 flex items-center justify-center">
                               <User className="w-5 h-5 text-slate-300" />
                           </div>
                           <span className="text-xs font-black text-slate-700 uppercase tracking-tighter">{userProfile?.name?.split(' ')[0] || 'Kullanıcı'}</span>
                       </div>
                    </div>
                </header>

                <div className="flex-1 flex flex-col items-center p-6 md:p-8 overflow-y-auto w-full">
                    {isRecruiter ? (
                        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                            <div className="relative rounded-[3rem] bg-zinc-900 overflow-hidden shadow-2xl aspect-[4/3] border border-slate-100">
                                {isVideoOn && stream ? (
                                    <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                                        <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                                            <Camera className="w-12 h-12 text-white/10" />
                                        </div>
                                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Kamera Bekliyor</span>
                                    </div>
                                )}
                                <div className="absolute bottom-8 left-8 flex items-center gap-4">
                                    <button onClick={() => setIsVideoOn(!isVideoOn)} className={"w-14 h-14 rounded-2xl flex items-center justify-center backdrop-blur-xl transition-all " + (isVideoOn ? 'bg-white/10 text-white' : 'bg-red-500 text-white')}>
                                        {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                                    </button>
                                    <button onClick={() => setIsMicOn(!isMicOn)} className={"w-14 h-14 rounded-2xl flex items-center justify-center backdrop-blur-xl transition-all " + (isMicOn ? 'bg-white/10 text-white' : 'bg-red-500 text-white')}>
                                        {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-xl relative overflow-hidden">
                                    <div className="flex items-start justify-between mb-8 relative z-10">
                                        <div className="flex items-center gap-5">
                                            <div className="w-20 h-20 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-200">
                                                <User className="w-10 h-10 text-slate-300" />
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-black text-slate-900 tracking-tighter italic uppercase">{candidateData?.name || 'Aday Adı'}</h2>
                                                <p className="text-xs font-black text-[#1e3a8a] uppercase tracking-widest mt-1 opacity-70">{candidateData?.matchedPositionTitle || 'Pozisyon'}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-slate-900 rounded-[2.5rem] p-8 space-y-6 shadow-2xl">
                                        <button 
                                            onClick={() => setPhase('active')}
                                            className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 italic"
                                        >
                                            ODAYA GİRİŞ <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-5xl w-full flex flex-col pt-10">
                            <h1 className="text-[56px] leading-tight tracking-tighter font-black text-slate-900 mb-6 italic uppercase text-center">Aday <span className="text-blue-600">Hazırlık Odası</span></h1>
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mt-10">
                                <div className="lg:col-span-7 space-y-8">
                                    <div className="relative rounded-[3.5rem] bg-slate-200 overflow-hidden shadow-2xl aspect-[16/10] border-4 border-white">
                                        {isVideoOn && stream ? (
                                            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-zinc-950">
                                                <Camera className="w-24 h-24 text-white/10" />
                                            </div>
                                        )}
                                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-3xl p-3 rounded-3xl flex items-center gap-3 shadow-2xl border border-white/10">
                                            <button onClick={() => setIsMicOn(!isMicOn)} className={"w-14 h-14 rounded-2xl flex items-center justify-center transition-all " + (isMicOn ? 'bg-white/10 text-white' : 'bg-red-500 text-white')}>
                                                {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                                            </button>
                                            <button onClick={() => setIsVideoOn(!isVideoOn)} className={"w-14 h-14 rounded-2xl flex items-center justify-center transition-all " + (isVideoOn ? 'bg-white/10 text-white' : 'bg-red-500 text-white')}>
                                                {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="lg:col-span-5 space-y-8">
                                    <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-2xl space-y-10">
                                        <div className="pt-8 border-t border-slate-100">
                                            <label className="flex items-center gap-4 cursor-pointer group p-4 bg-slate-50 rounded-2xl border border-slate-200 hover:bg-white hover:border-blue-200 transition-all">
                                                <input 
                                                    type="checkbox" 
                                                    checked={hasConsent}
                                                    onChange={(e) => setHasConsent(e.target.checked)}
                                                    className="w-6 h-6 rounded-lg border-2 border-slate-300 text-blue-600" 
                                                />
                                                <span className="text-[11px] font-black text-slate-600 uppercase tracking-tight italic">KVKK Onaylıyorum</span>
                                            </label>
                                        </div>
                                        <button 
                                            onClick={() => setPhase('active')}
                                            disabled={!hasConsent}
                                            className="w-full h-16 rounded-[1.5rem] bg-[#1e3a8a] text-white font-black text-base italic uppercase tracking-widest shadow-2xl hover:bg-blue-900 disabled:opacity-30 transition-all flex items-center justify-center gap-4"
                                        >
                                            Odaya Bağlan <ChevronRight className="w-6 h-6" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[200] bg-slate-50 flex flex-col overflow-hidden text-slate-900 font-sans italic">
            <header className="h-[64px] shrink-0 border-b border-slate-200 bg-white px-8 flex items-center justify-between z-20">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
                            <Video className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-[13px] font-black text-slate-900 uppercase tracking-tighter italic">Live Interview</h2>
                    </div>
                </div>
                <button
                    onClick={handleFinishInterview}
                    className="px-8 py-3 rounded-[1.2rem] bg-red-600 text-white hover:bg-red-700 font-black text-[11px] tracking-widest uppercase transition-all italic"
                >
                    Mülakatı Sonlandır
                </button>
            </header>
            <div className="flex-1 flex p-6 gap-6 overflow-hidden">
                <div className="flex-1 bg-slate-900 rounded-[3.5rem] relative overflow-hidden shadow-2xl border-[6px] border-white group/video transition-all">
                     <div className="absolute inset-0 bg-zinc-950">
                         {(stream || !isRecruiter) ? (
                            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                         ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                 <User className="w-40 h-40 text-white/5 blur-sm" />
                            </div>
                         )}
                     </div>
                     <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 z-30 opacity-0 group-hover/video:opacity-100 transition-all bg-black/40 backdrop-blur-3xl px-6 py-4 rounded-[2.5rem]">
                         <button onClick={() => setIsMicOn(!isMicOn)} className={"w-14 h-14 rounded-2xl flex items-center justify-center " + (isMicOn ? 'bg-white/10 text-white' : 'bg-red-600 text-white')}>
                             {isMicOn ? <Mic className="w-6 h-6"/> : <MicOff className="w-6 h-6"/>}
                         </button>
                         <button onClick={() => setIsVideoOn(!isVideoOn)} className={"w-14 h-14 rounded-2xl flex items-center justify-center " + (isVideoOn ? 'bg-white/10 text-white' : 'bg-red-600 text-white')}>
                             {isVideoOn ? <Video className="w-6 h-6"/> : <VideoOff className="w-6 h-6"/>}
                         </button>
                         <button onClick={handleFinishInterview} className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center">
                             <X className="w-6 h-6"/>
                         </button>
                     </div>
                </div>
                {isRecruiter ? (
                    <div className="w-[420px] flex flex-col gap-6 shrink-0 relative z-30">
                        <section className="bg-white rounded-[3rem] p-8 border border-slate-200 shadow-2xl flex-1 flex flex-col overflow-hidden">
                             <h3 className="text-[14px] font-black text-slate-900 uppercase italic tracking-tighter mb-4">Analytical Radar</h3>
                             <div className="flex-1 space-y-6">
                                 {Object.entries(starScores).map(([key, value]) => (
                                     <div key={key} className="space-y-2">
                                         <div className="flex items-center justify-between text-[11px] font-black text-slate-400">
                                             <span>{key}</span>
                                             <span className="text-blue-600">{value}%</span>
                                         </div>
                                         <div className="h-3 bg-slate-100 rounded-full overflow-hidden p-1 border border-slate-200">
                                              <div className="h-full rounded-full bg-blue-600" style={{width: value + '%' }} />
                                         </div>
                                     </div>
                                 ))}
                             </div>
                        </section>
                        <section className="bg-slate-900 rounded-[3rem] border border-white/10 h-[40%] flex flex-col overflow-hidden shadow-2xl p-8">
                             <h3 className="text-[12px] font-black text-white uppercase italic mb-4">AI Recruiter Assistant</h3>
                             <div className="flex-1 overflow-y-auto space-y-4" ref={transcriptRef}>
                                  {transcript.slice(-3).map((line, idx) => (
                                       <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/5">
                                            <p className="text-xs font-bold text-white/90 italic">"{line.text}"</p>
                                       </div>
                                  ))}
                             </div>
                        </section>
                    </div>
                ) : (
                    <div className="w-[420px] flex flex-col gap-6 shrink-0 relative z-30">
                        <section className="bg-white rounded-[3.5rem] border border-slate-200 flex-1 flex flex-col overflow-hidden shadow-2xl p-8">
                             <h3 className="text-[14px] font-black text-slate-900 uppercase italic tracking-tighter mb-4">Mülakat Akışı</h3>
                             <div className="flex-1 overflow-y-auto space-y-4">
                                  {questions.map((q, idx) => (
                                      <div key={idx} className={"p-5 rounded-3xl border " + (idx === currentQuestionIndex ? 'border-[#1e3a8a] bg-blue-50' : 'opacity-40')}>
                                           <p className="text-sm font-black italic tracking-tight leading-snug">"{q.text}"</p>
                                      </div>
                                  ))}
                             </div>
                        </section>
                    </div>
                )}
            </div>
            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} devices={devices} selectedDevices={selectedDevices} onDeviceChange={changeDevice} />}
            <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-blue-100/20 rounded-full blur-[180px] pointer-events-none -translate-y-1/2 translate-x-1/2" />
        </div>
    );
}

function SettingsModal({ onClose, devices, selectedDevices, onDeviceChange }) {
    return (
        <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-md flex items-center justify-center p-6 italic">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl p-10 space-y-10">
                <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-black text-slate-900 tracking-tighter italic uppercase">Ayarlar</h3>
                    <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="space-y-4">
                    <button onClick={onClose} className="w-full h-16 rounded-2xl bg-[#1e3a8a] text-white text-[11px] font-black uppercase tracking-widest italic">
                        Uygula ve Kapat
                    </button>
                </div>
            </div>
        </div>
    );
}
`;

const finalContent = topContent + lobbyPhaseJSX;
fs.writeFileSync(filePath, finalContent, 'utf8');
console.log("Rewrite completed successfully!");
