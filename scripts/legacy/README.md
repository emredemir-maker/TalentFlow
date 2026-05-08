# Legacy Scripts

Bu klasördeki dosyalar **bir kerelik** (one-off) migration / data-patch / fix scriptleridir. Çalışan kod yolundan **referans verilmiyor** — `package.json`, CI, `server.js` veya `src/` içinde import edilmiyorlar.

Tarihsel kayıt amacıyla saklanıyorlar; kod tabanında okunan/çağrılan değiller. Yeni özelliklerde bunlara dayanma. Birkaç sürüm sonra (örneğin v1.0 sonrası) tamamen silinebilirler.

## İçerik

| Dosya | Tahmini Amaç |
|---|---|
| `update_live_interview{,2,3,4,_final}.cjs` | LiveInterview Firestore doc'larında alan ekleme/güncelleme — 5 ardışık sürüm |
| `update_candidate_ui.cjs` | Aday UI alan migrasyonu |
| `add_delete_session.cjs` | Session doc silme yardımcısı |
| `fix.cjs`, `fix-colors.cjs` | Tek seferlik veri düzeltmeleri |
| `remove-watermark{,2}.cjs` | Asset watermark temizliği |

## Kullanım

Geçmişte nasıl çalıştırıldıkları belgelenmedi. Bir tanesini yeniden çalıştırmak gerekirse önce dosyayı okuyup Firestore proje ID'sini ve servis hesabı kimlik bilgilerini doğrula.
