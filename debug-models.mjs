import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const apiKeyMatch = envContent.match(/VITE_GEMINI_API_KEY=(.*)/);
const API_KEY = apiKeyMatch ? apiKeyMatch[1].trim() : null;

const LIST_URL = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

fetch(LIST_URL)
    .then(r => r.json())
    .then(data => {
        fs.writeFileSync('available_models.json', JSON.stringify(data, null, 2));
        console.log('Available models written to available_models.json');
    })
    .catch(e => console.error(e));
