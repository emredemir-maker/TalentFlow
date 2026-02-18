// find-working-model.mjs
import fs from 'fs';
import path from 'path';

// .env dosyasından API anahtarını oku
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const apiKeyMatch = envContent.match(/VITE_GEMINI_API_KEY=(.*)/);
const API_KEY = apiKeyMatch ? apiKeyMatch[1].trim() : null;

if (!API_KEY) {
    console.error("❌ HATA: API Key bulunamadı!");
    process.exit(1);
}

const LIST_URL = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
const GENERATE_URL_BASE = `https://generativelanguage.googleapis.com/v1beta/`;

console.log("🔍 Modeller taranıyor ve test ediliyor...\n");

try {
    // 1. Modelleri Listele
    const response = await fetch(LIST_URL);
    const data = await response.json();

    if (data.error) {
        console.error("❌ API Listeleme Hatası:", data.error.message);
        process.exit(1);
    }

    const models = data.models || [];

    // 'generateContent' destekleyen modelleri filtrele
    const chatModels = models
        .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
        .map(m => m.name.replace('models/', '')); // Sadece isimleri al

    // Öncelik sırasına göre test edilecek modeller
    const priorityList = [
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro-latest',
        'gemini-1.5-pro',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash',
        'gemini-1.0-pro',
        'gemini-pro'
    ];

    // Listede olan ama öncelik listesinde olmayanları sona ekle
    const otherModels = chatModels.filter(m => !priorityList.includes(m));
    const testList = [...priorityList, ...otherModels];

    console.log(`📋 Test Listesi (${testList.length} model):`, testList.slice(0, 5).join(', ') + '...');

    let workingModel = null;

    // 2. Sırayla Test Et
    for (const model of testList) {
        // Listede olmayan bir modeli test etme (eğer API listesinde yoksa)
        // Ama priorityList'tekileri zorla dene, belki listede görünmüyordur ama çalışıyordur.

        process.stdout.write(`⏳ Test ediliyor: ${model}... `);

        try {
            const url = `${GENERATE_URL_BASE}models/${model}:generateContent?key=${API_KEY}`;
            const payload = { contents: [{ parts: [{ text: "Hello" }] }] };

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                console.log("✅ ÇALIŞIYOR!");
                workingModel = model;
                break; // İlk çalışanı bul ve çık
            } else {
                const err = await res.json();
                const errMsg = err.error?.message || res.statusText;
                if (errMsg.includes("404")) console.log("❌ Bulunamadı (404)");
                else console.log(`❌ Hata: ${res.status}`);
            }
        } catch (e) {
            console.log(`❌ İstek Hatası: ${e.message}`);
        }
    }

    console.log("\n------------------------------------------------");
    if (workingModel) {
        console.log(`🎉 EN İYİ ÇALIŞAN MODEL: ${workingModel}`);
        console.log("⬇️ Lütfen bu modeli servisine tanımla.");
    } else {
        console.error("❌ Hiçbir model çalıştırılamadı. API Key veya erişim sorunu var.");
    }
    console.log("------------------------------------------------");

} catch (error) {
    console.error("❌ Genel Hata:", error.message);
}
