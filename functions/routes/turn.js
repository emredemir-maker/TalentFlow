// TURN KİMLİK BİLGİSİ ÜRETİMİ
//
// ── NEDEN SUNUCU TARAFINDA ─────────────────────────────────────────────────
// Cloudflare TURN anahtarı UZUN ÖMÜRLÜ bir sırdır. Tarayıcıya inerse
// başkaları o anahtarla sınırsız bağlantı açıp hesabın bant genişliğini
// harcayabilir. Anahtar burada kalır; tarayıcıya yalnızca birkaç saatlik,
// tek kullanımlık bir kullanıcı adı/parola iner.
//
// ── NEDEN GEREKLİ ─────────────────────────────────────────────────────────
// Görüntülü görüşmede ses ve görüntü normalde iki tarayıcı arasında
// DOĞRUDAN gider. Şirket ağları, VPN'ler ve bazı mobil operatörler buna
// izin vermiyor. O durumda araya bir aktarma sunucusu (TURN) girmesi
// gerekiyor. Bugüne kadar yalnızca STUN tanımlıydı; bu ağlardaki adaylar
// görüşmeye HİÇ bağlanamıyor ve ekranda bunu söyleyen bir şey de yoktu.
//
// ── YAPILANDIRILMAMIŞSA NE OLUR ───────────────────────────────────────────
// Anahtar yoksa bu uç 501 döner ve istemci yalnızca STUN ile devam eder —
// yani bugünkü davranış. Sessizce bozulmaz: istemci "aktarma sunucusu
// tanımlı değil" bilgisini alır ve bağlantı kurulamazsa bunu söyleyebilir.

import { Router } from 'express';
import { sessionLimiter } from '../middleware/rateLimit.js';
import { childLogger } from '../services/logger.js';

const log = childLogger('turn');

const router = Router();

/** Tarayıcıya inen kimlik bilgisinin ömrü. Görüşme süresinden uzun, gün değil. */
const CREDENTIAL_TTL_SECONDS = 4 * 60 * 60;

router.get('/api/turn-credentials', sessionLimiter, async (req, res) => {
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;

    // Yapılandırılmamışsa bunu AÇIKÇA söyle. Boş bir liste dönmek, istemcinin
    // "aktarma sunucum var ama çalışmıyor" sanmasına yol açardı.
    if (!keyId || !apiToken) {
        return res.status(501).json({
            configured: false,
            error: 'TURN yapılandırılmamış — CLOUDFLARE_TURN_KEY_ID ve CLOUDFLARE_TURN_API_TOKEN tanımlı değil.',
        });
    }

    try {
        const response = await fetch(
            `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
            }
        );

        if (!response.ok) {
            const detail = await response.text();
            log.warn({ status: response.status, detail: detail.slice(0, 300) }, '[turn] Cloudflare reddetti');
            return res.status(502).json({
                configured: true,
                error: `Aktarma sunucusu kimlik bilgisi alınamadı (HTTP ${response.status}).`,
            });
        }

        const data = await response.json();
        // Cloudflare `{ iceServers: {...} }` ya da `{ iceServers: [...] }` dönebiliyor;
        // istemci her zaman DİZİ bekliyor.
        const raw = data?.iceServers;
        const iceServers = Array.isArray(raw) ? raw : raw ? [raw] : [];

        if (iceServers.length === 0) {
            return res.status(502).json({ configured: true, error: 'Cloudflare boş sunucu listesi döndü.' });
        }

        return res.json({ configured: true, iceServers });
    } catch (err) {
        log.error({ err: err.message }, '[turn] kimlik bilgisi üretilemedi');
        return res.status(502).json({ configured: true, error: 'Aktarma sunucusuna ulaşılamadı.' });
    }
});

export default router;
