// test-gemini-connection.mjs
import fs from 'fs';
import path from 'path';

// .env dosyasından API anahtarını oku
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const apiKeyMatch = envContent.match(/VITE_GEMINI_API_KEY=(.*)/);
const API_KEY = apiKeyMatch ? apiKeyMatch[1].trim() : null;

if (!API_KEY) {
    console.error("❌ HATA: .env dosyasında VITE_GEMINI_API_KEY bulunamadı!");
    process.exit(1);
}

console.log(`🔑 API Key Okundu: ${API_KEY.substring(0, 8)}...`);

// Basit bir REST çağrısı ile modeli test et (Google Generative AI SDK yerine direkt fetch kullanarak bağımlılıkları azaltıyoruz)
const MODEL_NAME = "gemini-pro";
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

const payload = {
    contents: [{
        parts: [{ text: "Hello Gemini! Respond with 'System Operational' if you can read this." }]
    }]
};

console.log("📡 Gemini API'ye bağlanılıyor...");

try {
    const response = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Hatası: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;

    console.log("\n✅ BAŞARILI! Gemini Yanıtı:");
    console.log("------------------------------------------------");
    console.log(answer);
    console.log("------------------------------------------------");
    console.log("✅ AI Motoru entegrasyonu sağlam görünüyor.");

} catch (error) {
    console.error("\n❌ BAĞLANTI HATASI:");
    console.error(error.message);

    if (error.message.includes("404")) {
        console.error("⚠️ İpucu: Model adı yanlış olabilir veya API henüz bu modeli desteklemiyor.");
    } else if (error.message.includes("400")) {
        console.error("⚠️ İpucu: API Key geçersiz veya yetkisiz.");
    }
}
