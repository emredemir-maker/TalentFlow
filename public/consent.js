// Clyro sitelerinde ziyaret istatistiği onayı (clyrolabs.com, Hub, CX). Aynı dosya: apps/site/consent.js,
// apps/web/public/consent.js ve CX-Inn'de artifacts/cx-platform/public/consent.js; birini değiştirirken öbürlerini de.
// Onay yoksa clyro.js hiç yüklenmez: ne betik isteği ne olay gider, tarayıcıya yalnız "hayır" tercihi yazılır.
// Tercih bu alan adının localStorage'ında ("clyro-consent": granted | denied); alt alan adları ayrı sorar.
// data-clyro-consent özniteliği olan her bağlantı ya da window.clyroConsent.open() şeridi yeniden açar.
(function () {
  var KEY = 'clyro-consent';
  var SITE_KEY = 'clyro_pk_02a612cce8a1eb03a3491d1e2853bd27f8fee5e2143b94b1';
  var SRC = 'https://cx.clyrolabs.com/clyro.js';
  var KVKK = 'https://clyrolabs.com/kvkk';
  var bar = null;
  // data-skip="/yol1/,/yol2/": bu yollarla başlayan sayfalarda (ör. CX'in müşterinin müşterisine açılan anket bağlantısı)
  // ne sorulur ne takip edilir; o ziyaretçi bizim değil, kendi firmasının ziyaretçisidir.
  var me = document.currentScript;
  var skip = ((me && me.getAttribute('data-skip')) || '').split(',').filter(Boolean);

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* gizli pencere: yalnız bu sayfa için geçerli */ } }

  function load() {
    if (document.querySelector('script[data-key="' + SITE_KEY + '"]')) {
      if (window.clyro && window.clyro.consent) window.clyro.consent(true);
      return;
    }
    var s = document.createElement('script');
    s.src = SRC;
    s.defer = true;
    s.setAttribute('data-key', SITE_KEY);
    s.setAttribute('data-consent', 'granted');
    document.head.appendChild(s);
  }

  function choose(granted) {
    set(granted ? 'granted' : 'denied');
    close();
    if (granted) load();
    // Geri alınınca betik tarayıcıda tuttuklarını (anonim kimlik, oturum) siler ve bir daha göndermez.
    else if (window.clyro && window.clyro.consent) window.clyro.consent(false);
  }

  function close() { if (bar) { bar.remove(); bar = null; } }

  function style() {
    if (document.getElementById('clyro-consent-style')) return;
    var st = document.createElement('style');
    st.id = 'clyro-consent-style';
    st.textContent =
      '.clyro-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:560px;margin-inline:auto;' +
      'background:#fff;color:#111312;border:1px solid #dfe3e1;border-radius:14px;box-shadow:0 10px 30px rgba(17,19,18,.14);' +
      'padding:16px 18px;font:400 14px/1.5 Outfit,system-ui,sans-serif}' +
      '.clyro-consent p{margin:0 0 12px}.clyro-consent a{color:#296de1}' +
      '.clyro-consent .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.clyro-consent button{font:600 14px/1 Outfit,system-ui,sans-serif;padding:10px 16px;border-radius:10px;cursor:pointer;' +
      'border:1px solid #296de1;background:#fff;color:#296de1}' +
      '.clyro-consent button.yes{background:#296de1;color:#fff}' +
      '.clyro-consent button:focus-visible{outline:2px solid #111312;outline-offset:2px}' +
      '.clyro-consent .more{margin-left:auto;font-size:13px}';
    document.head.appendChild(st);
  }

  function open() {
    if (bar) return;
    style();
    bar = document.createElement('div');
    bar.className = 'clyro-consent';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Ziyaret istatistiği tercihi');
    bar.innerHTML =
      '<p>Siteyi nasıl kullandığını anlamak için ziyaret istatistiği tutmak istiyoruz: hangi sayfalara baktığın, ' +
      'nereden geldiğin (ör. Google ya da bir kampanya) ve cihazın türü. Adını, e-postanı ya da yazdıklarını toplamayız; ' +
      'reklam için de kullanmayız.</p>' +
      '<div class="row"><button type="button" class="yes">Kabul et</button>' +
      '<button type="button" class="no">Hayır, teşekkürler</button>' +
      '<a class="more" href="' + KVKK + '">Ayrıntılar</a></div>';
    bar.querySelector('.yes').addEventListener('click', function () { choose(true); });
    bar.querySelector('.no').addEventListener('click', function () { choose(false); });
    document.body.appendChild(bar);
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-clyro-consent]') : null;
    if (!t) return;
    e.preventDefault();
    open();
  });

  window.clyroConsent = { open: open };

  function start() {
    // Başka bir sayfanın içine gömülüyken (ör. CX'in Zoho Desk kartı) ne sorulur ne takip edilir.
    if (window.top !== window.self) return;
    for (var i = 0; i < skip.length; i++) if (location.pathname.indexOf(skip[i]) === 0) return;
    var v = get();
    if (v === 'granted') load();
    else if (v !== 'denied') open();
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
