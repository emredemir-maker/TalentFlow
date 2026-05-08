const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'CandidateProcessPage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const replacement = `                                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                                            {/* LEFT: Combined STAR Radar & Descriptions */}
                                            <div className="xl:col-span-2 space-y-5">
                                                
                                                <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col mb-4">
                                                    {/* Top Area: Radar */}
                                                    <div className="bg-slate-50/50 p-2 border-b border-slate-100 shrink-0">
                                                        <StarScoreCard
                                                            candidate={candidate}
                                                            onRefresh={handleRefreshAnalysis}
                                                            analysis={(() => {
                                                                if (candidate.aiAnalysis?.starAnalysis) {
                                                                    const star = candidate.aiAnalysis.starAnalysis;
                                                                    const getSafeScore = (val) => {
                                                                        if (typeof val === 'number') return val;
                                                                        if (typeof val === 'object' && val !== null && val.score !== undefined) return Number(val.score);
                                                                        return 0;
                                                                    };
                                                                    return {
                                                                        Summary: candidate.aiAnalysis.summary,
                                                                        Situation: getSafeScore(star.Situation),
                                                                        Task: getSafeScore(star.Task),
                                                                        Action: getSafeScore(star.Action),
                                                                        Result: getSafeScore(star.Result),
                                                                        Details: star
                                                                    };
                                                                }
                                                                const baseScore = candidate.matchScore ? candidate.matchScore / 10 : 0;
                                                                return {
                                                                    Summary: candidate.summary || "Analiz bekleniyor...",
                                                                    Situation: Math.round(baseScore), Task: Math.round(baseScore), Action: Math.round(baseScore), Result: Math.round(baseScore)
                                                                };
                                                            })()}
                                                        />
                                                    </div>

                                                    {/* Bottom Area: Descriptions */}
                                                    <div className="p-5">
                                                        <h3 className="text-[11px] font-bold text-slate-800 flex items-center gap-2 mb-4">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-[#1e3a8a]" /> Detaylı STAR Değerlendirmesi
                                                        </h3>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {['Situation', 'Task', 'Action', 'Result'].map((starKey) => {
                                                                const letter = starKey.charAt(0);
                                                                const mapping = { Situation: 'Durum', Task: 'Görev', Action: 'Eylem', Result: 'Sonuç' };
                                                                const data = candidate.aiAnalysis?.starAnalysis?.[starKey];
                                                                const text = (data && data.reason) || (starKey === 'Situation' ? candidate.summary : '');
                                                                
                                                                if (!text) return null;

                                                                const colorBgs = {
                                                                    'S': 'bg-blue-50/60 border-blue-100',
                                                                    'T': 'bg-indigo-50/60 border-indigo-100',
                                                                    'A': 'bg-emerald-50/60 border-emerald-100',
                                                                    'R': 'bg-amber-50/60 border-amber-100'
                                                                };

                                                                const textColors = {
                                                                    'S': 'text-blue-900',
                                                                    'T': 'text-indigo-900',
                                                                    'A': 'text-emerald-900',
                                                                    'R': 'text-amber-900'
                                                                };

                                                                return (
                                                                    <div key={starKey} className={\`relative p-4 rounded-xl border \${colorBgs[letter]}\`}>
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            <div className={\`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-black bg-white shadow-sm \${textColors[letter]}\`}>
                                                                                {letter}
                                                                            </div>
                                                                            <div className={\`font-bold text-[12px] \${textColors[letter]}\`}>
                                                                                {mapping[starKey]}
                                                                            </div>
                                                                        </div>
                                                                        <p className="text-slate-600 leading-relaxed text-[11px]">{text}</p>
                                                                        {letter === 'A' && candidate.aiAnalysis?.topSkills && (
                                                                            <div className="flex flex-wrap gap-1.5 mt-3">
                                                                                {candidate.aiAnalysis.topSkills.slice(0,3).map((s, i) => (
                                                                                    <span key={i} className="bg-white border text-emerald-700 border-emerald-100 font-bold px-2 py-0.5 rounded text-[9px] uppercase tracking-wider">{s.skill || s}</span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="pt-2">`;

// I'll regex from the start of the grid until `<div className="pt-2">` to replace with the new structure layout above.
const regex = /<div className="grid grid-cols-1 xl:grid-cols-3 gap-6">[\s\S]*?<div className="pt-2">/g;
content = content.replace(regex, replacement);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed successfully');
