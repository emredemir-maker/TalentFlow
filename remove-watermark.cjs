const fs = require('fs');
const path = require('path');
function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.jsx')) {
                results.push(file);
            }
        }
    });
    return results;
}
const files = walk('d:/TAlentFlow/TalentFlow/src');
files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    let replaced = content.replace(/\{\/\* Logo Background \*\/\}\s*<div className="fixed inset-0 -z-50 opacity-\[0\.03\] pointer-events-none flex items-center justify-center overflow-hidden mix-blend-overlay">\s*<img src="\/logo\.png" alt="Logo" className="w-\[150%\] h-\[150%\] object-contain grayscale" \/>\s*<\/div>/g, '');
    if (content !== replaced) {
        fs.writeFileSync(f, replaced);
        console.log('Updated ' + f);
    }
});
