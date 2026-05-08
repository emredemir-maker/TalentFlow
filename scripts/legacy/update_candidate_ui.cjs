const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'CandidateProcessPage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Rename button
content = content.replace(
    /onClick=\{\(\) => setSendModalPurpose\('general'\)\} className="(.*?)"(?:(?:.|\n|\r)*?)Akran Değerlendirmesi İste/g,
    `onClick={() => setSendModalPurpose('interview')} className="$1">\n                                Mülakat Planla`
);

// 2. Combine STAR Radar and Details
// Let's replace the grid layout for the overview tab
const overviewRegex = /<div className="grid grid-cols-1 xl:grid-cols-2 gap-6">([\s\S]*?)<\!-- RIGHT: Extra Links -->/g;

// Instead of complex regex, let's just find the beginning of the grid and replace the relevant parts.
// We will replace 'xl:grid-cols-2' with 'xl:grid-cols-3'
content = content.replace(
    /<div className="grid grid-cols-1 xl:grid-cols-2 gap-6">\s*\{\/\* LEFT: STAR Breakdown \*\/\}\s*<div className="space-y-6">/g,
    `<div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                                            {/* LEFT: Combined STAR Radar & Descriptions */}
                                            <div className="xl:col-span-2 space-y-5">`
);

// Remove the Detaylı STAR değerlendirmesi heading (it will be added below the radar)
content = content.replace(
    /<h3 className="text-\[11px\] font-bold text-slate-800 flex items-center gap-2">\s*<div className="w-1.5 h-1.5 rounded-full bg-\[#1e3a8a\]" \/> Detaylı STAR Değerlendirmesi\s*<\/h3>/g,
    ``
);

// Now wrap the Radar + Descriptions array in the new structure
// First, find the right side column definition and change it to col-span-1
content = content.replace(
    /\{\/\* RIGHT: Radar & Extra Links \*\/\}\s*<div className="space-y-5">/g,
    `{/* RIGHT: Extra Links & Process Flow */}
                                            <div className="xl:col-span-1 space-y-5">`
);

// Now, we need to extract the StarScoreCard component and put it at the very top of the LEFT side (col-span-2)
const radarRegex = /<div>\s*<h3 className="text-\[9px\] font-bold text-slate-400 uppercase tracking-widest mb-3">Yetkinlik Radarı<\/h3>\s*(<StarScoreCard[\s\S]*?\/>)\s*<\/div>/;
const radarMatch = content.match(radarRegex);

if (radarMatch) {
    const radarElement = radarMatch[1];
    
    // Remove the original radar rendering from right column
    content = content.replace(radarRegex, '');

    // Now insert the new combined container into the left column
    const leftColStart = `<!-- LEFT OVERRIDE -->`;
    // We will inject the Radar before the descriptions (which are the ['Situation', 'Task'...] mapping)
    // The `<div className="space-y-4 pl-3.5 border-l border-slate-100">` is what we want to replace with our new grid
    
    const descriptionsBlockRegex = /<div className="space-y-4 pl-3\.5 border-l border-slate-100">\s*\{(\['Situation', 'Task', 'Action', 'Result'\]\.map\([\s\S]*?\}\)\})\}\s*<\/div>/;
    const descMatch = content.match(descriptionsBlockRegex);
    if(descMatch) {
        const loopCode = descMatch[1];
        
        let newDescriptionsBlock = `
                                                <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col mb-4">
                                                    {/* Top Area: Radar */}
                                                    <div className="bg-slate-50/50 p-2 border-b border-slate-100 shrink-0">
                                                        ${radarElement}
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
        `;
        content = content.replace(descriptionsBlockRegex, newDescriptionsBlock);
    }
}


fs.writeFileSync(filePath, content, 'utf8');
console.log('Update finished.');
