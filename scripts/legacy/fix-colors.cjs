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

const files = walk(path.join(__dirname, 'src'));
files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');

    // Replace hardcoded colors with semantic colors 
    let replaced = content
        .replace(/\btext-white\b/g, 'text-text-primary')
        .replace(/\btext-gray-500\b/g, 'text-text-muted')
        .replace(/\btext-gray-[1234]00\b/g, 'text-text-muted')
        .replace(/\btext-gray-[89]00\b/g, 'text-text-primary')
        .replace(/\bbg-gray-800\b/g, 'bg-navy-800')
        .replace(/\bbg-gray-900\b/g, 'bg-navy-900');

    // Exceptions: buttons/badges with primary brand colors should KEEP text-white or similar 
    // This is a naive regex but good enough: if an element has bg-electric and text-text-primary, revert it to text-white.
    // Actually, bg-electric text-text-primary is fine, as in dark mode it is white and in light mode it's dark text on blue (which is readable but maybe ugly).
    // A better approach is matching standard Tailwind string replacements, and we can test it locally.

    if (content !== replaced) {
        fs.writeFileSync(f, replaced);
        console.log('Updated', f);
    }
});
