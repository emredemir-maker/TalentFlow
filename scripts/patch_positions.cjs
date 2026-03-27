// patch_positions.js — replaces the screening/app-card block in PositionsPage.jsx
const fs = require('fs');
const code = fs.readFileSync('src/pages/PositionsPage.jsx', 'utf8');

// ── MARKER START AND END (unique text anchors inside the file)
const START_MARKER = '                                {/* Screening Score Filter */}';
const END_MARKER   = '                                })()}\n';

const si = code.indexOf(START_MARKER);
if (si === -1) { console.error('Start marker not found'); process.exit(1); }

// Find the END_MARKER *after* the START_MARKER
let ei = code.indexOf(END_MARKER, si);
if (ei === -1) { console.error('End marker not found'); process.exit(1); }
ei += END_MARKER.length;

const NEW_BLOCK = `                                {/* Screening Score Filter + Bulk Select */}
                                {(() => {
                                    const getScreeningLevel = (app) => {
                                        if (app.screeningLevel) {
                                            const map = {
                                                '\u00c7ok \u0130yi':    { key: 'best',   label: '\u00c7ok \u0130yi',    cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
                                                '\u0130yi':        { key: 'good',   label: '\u0130yi',        cls: 'bg-blue-50 text-blue-600 border-blue-200' },
                                                'Fena De\u011fil': { key: 'medium', label: 'Fena De\u011fil', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
                                                'Yetersiz':   { key: 'weak',   label: 'Yetersiz',   cls: 'bg-red-50 text-red-500 border-red-200' },
                                            };
                                            return map[app.screeningLevel] || { key: 'none', label: 'Taranmad\u0131', cls: 'bg-slate-100 text-slate-400 border-slate-200' };
                                        }
                                        const score = app.screeningScore;
                                        if (score == null) return { key: 'none', label: 'Taranmad\u0131', cls: 'bg-slate-100 text-slate-400 border-slate-200' };
                                        if (score >= 75) return { key: 'best',   label: '\u00c7ok \u0130yi',    cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' };
                                        if (score >= 50) return { key: 'good',   label: '\u0130yi',        cls: 'bg-blue-50 text-blue-600 border-blue-200' };
                                        if (score >= 25) return { key: 'medium', label: 'Fena De\u011fil', cls: 'bg-amber-50 text-amber-600 border-amber-200' };
                                        return { key: 'weak', label: 'Yetersiz', cls: 'bg-red-50 text-red-500 border-red-200' };
                                    };
                                    const FILTER_OPTS = [
                                        { key: 'all',    label: 'T\u00fcm\u00fc' },
                                        { key: 'best',   label: '\u00c7ok \u0130yi' },
                                        { key: 'good',   label: '\u0130yi' },
                                        { key: 'medium', label: 'Fena De\u011fil' },
                                        { key: 'weak',   label: 'Yetersiz' },
                                        { key: 'none',   label: 'Taranmad\u0131' },
                                    ];
                                    const filteredApps = screeningFilter === 'all'
                                        ? applications
                                        : applications.filter(a => getScreeningLevel(a).key === screeningFilter);
                                    const allSelected = filteredApps.length > 0 && filteredApps.every(a => selectedAppIds.has(a.id));
                                    const toggleAll = () => {
                                        if (allSelected) setSelectedAppIds(new Set());
                                        else setSelectedAppIds(new Set(filteredApps.map(a => a.id)));
                                    };
                                    return (<>
                                        <div className="flex gap-1.5 flex-wrap mb-3 pt-1">
                                            {FILTER_OPTS.map(o => (
                                                <button
                                                    key={o.key}
                                                    onClick={() => setScreeningFilter(o.key)}
                                                    className={\`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wide transition-all \${screeningFilter === o.key ? 'bg-violet-500 text-white border-violet-500' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}\`}
                                                >
                                                    {o.label}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Bulk action bar */}
                                        {selectedAppIds.size > 0 && (
                                            <div className="flex items-center gap-3 mb-3 px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-xl">
                                                <span className="text-[11px] font-black text-violet-700 flex-1">{selectedAppIds.size} ba\u015fvuru se\u00e7ildi</span>
                                                <select
                                                    value={shortlistDept}
                                                    onChange={e => setShortlistDept(e.target.value)}
                                                    className="text-[10px] font-semibold border border-violet-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none"
                                                >
                                                    <option value="">Departman se\u00e7 (opsiyonel)</option>
                                                    {departments.map(d => (
                                                        <option key={d.id} value={d.id}>{d.name}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    onClick={handleBulkShortlist}
                                                    disabled={shortlisting}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black bg-violet-500 text-white hover:bg-violet-600 transition-colors disabled:opacity-50"
                                                >
                                                    {shortlisting ? <Loader2 size={11} className="animate-spin" /> : <Users size={11} />}
                                                    K\u0131sa Listeye Ekle
                                                </button>
                                                <button
                                                    onClick={() => setSelectedAppIds(new Set())}
                                                    className="p-1 rounded text-slate-400 hover:text-slate-600"
                                                >
                                                    <X size={13} />
                                                </button>
                                            </div>
                                        )}

                                        {/* Select all checkbox row */}
                                        {filteredApps.length > 0 && (
                                            <label className="flex items-center gap-2 mb-2 cursor-pointer text-[10px] text-slate-400 font-semibold">
                                                <input
                                                    type="checkbox"
                                                    checked={allSelected}
                                                    onChange={toggleAll}
                                                    className="accent-violet-500 w-3.5 h-3.5"
                                                />
                                                T\u00fcm\u00fcn\u00fc Se\u00e7
                                            </label>
                                        )}

                                        {filteredApps.map(app => {
                                            const sc = getSourceColor(app.source);
                                            const stCfg = APP_STATUS_CONFIG[app.status] || APP_STATUS_CONFIG.new;
                                            const scoreColor = app.aiScore >= 75 ? 'text-emerald-500' : app.aiScore >= 50 ? 'text-amber-500' : 'text-red-400';
                                            const slv = getScreeningLevel(app);
                                            const isSelected = selectedAppIds.has(app.id);
                                            const toggleSelect = () => setSelectedAppIds(prev => {
                                                const next = new Set(prev);
                                                if (next.has(app.id)) next.delete(app.id);
                                                else next.add(app.id);
                                                return next;
                                            });
                                            return (
                                        <div key={app.id} className={\`bg-white border rounded-2xl p-4 hover:border-violet-200 transition-colors \${isSelected ? 'border-violet-400 bg-violet-50/30' : 'border-slate-200'}\`}>
                                            <div className="flex items-start gap-3">
                                                <div className="flex flex-col items-center gap-2 shrink-0">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={toggleSelect}
                                                        className="accent-violet-500 w-3.5 h-3.5 mt-0.5 cursor-pointer"
                                                    />
                                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-white text-xs font-black">
                                                        {app.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??'}
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-[13px] font-black text-slate-800 truncate">{app.name}</span>
                                                        <span className={\`inline-flex px-2 py-0.5 rounded-full border text-[9px] font-black \${sc.bg} \${sc.text} \${sc.border}\`}>{app.source}</span>
                                                    </div>
                                                    <div className="text-[11px] text-slate-400 truncate">{app.email}</div>
                                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                        <span className={\`inline-flex px-2.5 py-0.5 rounded-full border text-[9px] font-black \${stCfg.pill}\`}>{stCfg.label}</span>
                                                        {(app.screeningLevel || app.screeningScore != null) && (
                                                            <span className={\`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black \${slv.cls}\`}>
                                                                {slv.label}
                                                            </span>
                                                        )}
                                                        {syncedAppIds.has(app.id) && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black bg-emerald-50 text-emerald-600 border-emerald-200">
                                                                <Check size={9} /> K\u0131sa listede
                                                            </span>
                                                        )}
                                                        {app.cvFileName && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                                                                <FileText size={10} />{app.cvFileName}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right flex flex-col items-end gap-2">
                                                    <div className={\`text-[18px] font-black leading-none \${scoreColor}\`}>{app.aiScore || 0}%</div>
                                                    <div className="text-[8px] text-slate-300 uppercase tracking-widest">AI Uyum</div>
                                                    <div className="h-1 w-12 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className={\`h-full rounded-full \${app.aiScore >= 75 ? 'bg-emerald-400' : app.aiScore >= 50 ? 'bg-amber-400' : 'bg-red-400'}\`} style={{ width: \`\${app.aiScore || 0}%\` }} />
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteApp(app.id)}
                                                        disabled={deletingAppId === app.id}
                                                        className="mt-1 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all disabled:opacity-40"
                                                        title="Ba\u015fvuruyu sil"
                                                    >
                                                        {deletingAppId === app.id
                                                            ? <Loader2 size={12} className="animate-spin" />
                                                            : <Trash2 size={12} />
                                                        }
                                                    </button>
                                                </div>
                                            </div>
                                            {/* Status changer */}
                                            <div className="flex gap-1.5 mt-3 pt-3 border-t border-slate-100">
                                                {Object.entries(APP_STATUS_CONFIG).map(([st, cfg]) => (
                                                    <button
                                                        key={st}
                                                        onClick={() => updateApplicationStatus(app.id, st)}
                                                        className={\`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wide border transition-all \${app.status === st ? cfg.pill : 'bg-slate-50 text-slate-300 border-slate-100 hover:border-slate-200'}\`}
                                                    >
                                                        {cfg.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                            );
                                        })}
                                    </>);
                                })()}
`;

const patched = code.slice(0, si) + NEW_BLOCK + code.slice(ei);
fs.writeFileSync('src/pages/PositionsPage.jsx', patched);
console.log('Patched successfully.');
