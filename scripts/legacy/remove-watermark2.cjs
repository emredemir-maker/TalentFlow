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
    let replaced = content.replace(/\s*\{\/\*\s*Logo Background\s*\*\/\}\s*<div[^>]*>\s*<img src="\/logo\.png"[^>]*\/>\s*<\/div>/g, '');
    if (content !== replaced) {
        fs.writeFileSync(f, replaced);
        console.log('Updated ' + f);
    }
});
