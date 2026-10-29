// Güvenlik kuralı testleri — ayrı yapılandırma.
//
// Bu testler çalışan bir Firestore + Storage emülatörü ister; `npm test`
// (emülatörsüz birim testleri) bunları dışarıda bırakır. Çalıştırma:
//   npm run test:rules
// Komut emülatörleri `firebase emulators:exec` ile açar, testler bitince kapatır.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: false,
        include: ['tests/rules/**/*.test.js'],
        // Tüm dosyalar aynı emülatörü ve aynı proje kimliğini paylaşıyor; her
        // dosya başında veri temizleniyor. Paralel çalışırsa bir dosyanın
        // temizliği ötekinin tohumunu siler.
        fileParallelism: false,
        // Emülatöre her istek bir ağ turu; ilk kural değerlendirmesi birkaç
        // saniye sürebiliyor.
        testTimeout: 20_000,
        hookTimeout: 60_000,
    },
});
