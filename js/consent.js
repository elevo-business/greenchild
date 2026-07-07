/**
 * Greenchild Cookie-/Einwilligungs-Banner (Consent Management, self-hosted).
 *
 * Zweck: Nicht notwendige Dienste dürfen nach § 25 Abs. 1 TDDDG und Art. 6 Abs. 1
 * lit. a DSGVO erst NACH aktiver Einwilligung geladen werden. Dieses Skript ersetzt
 * das früher fest im <head> eingebundene Microsoft-Clarity-Snippet und steuert
 * zusätzlich den Meta-Pixel (siehe js/lp-tracking.js).
 *
 * Kategorien:
 *   - notwendig  : immer aktiv, keine Einwilligung nötig (kein Tracking)
 *   - statistik  : Microsoft Clarity (Heatmaps/Session-Analyse)
 *   - marketing  : Meta-Pixel + Conversions API (Werbewirkungsmessung)
 *
 * Ablauf: Banner zeigt „Alle akzeptieren" und – gleichwertig – „Nur notwendige"
 * (Ablehnen muss so einfach sein wie Zustimmen). Feineinstellung optional.
 * Die Auswahl wird in localStorage gespeichert und ist über den dauerhaft
 * erreichbaren Link „Cookie-Einstellungen" jederzeit widerrufbar.
 */
(function () {
  'use strict';

  var CLARITY_ID = 'xfljij0bkr';       // Microsoft-Clarity-Projekt-ID
  var STORE_KEY  = 'gc_consent_v1';
  var VERSION    = 1;

  // Globaler Consent-Status, den andere Skripte (lp-tracking.js, Formulare) lesen.
  window.gcConsent = window.gcConsent || { necessary: true, statistik: false, marketing: false, set: false };

  // ---- i18n ----
  var lang = (document.documentElement.lang || 'de').slice(0, 2).toLowerCase();
  var T = {
    de: {
      title: 'Wir respektieren Ihre Privatsphäre',
      body: 'Wir verwenden notwendige Cookies für den Betrieb der Website. Mit Ihrer Einwilligung nutzen wir zusätzlich Statistik- (Microsoft Clarity) und Marketing-Dienste (Meta-Pixel), um unser Angebot und unsere Werbung zu verbessern. Sie können frei entscheiden und Ihre Auswahl jederzeit ändern.',
      acceptAll: 'Alle akzeptieren',
      necessary: 'Nur notwendige',
      settings: 'Einstellungen',
      save: 'Auswahl speichern',
      privacy: 'Datenschutzerklärung',
      cNecessary: 'Notwendig',
      cNecessaryD: 'Für den technischen Betrieb erforderlich. Immer aktiv.',
      cStat: 'Statistik',
      cStatD: 'Microsoft Clarity: pseudonyme Analyse der Website-Nutzung (Heatmaps, Sitzungen).',
      cMkt: 'Marketing',
      cMktD: 'Meta-Pixel & Conversions API: Messung und Optimierung unserer Werbeanzeigen.',
      reopen: 'Cookie-Einstellungen',
      always: 'Immer aktiv'
    },
    en: {
      title: 'We respect your privacy',
      body: 'We use necessary cookies to operate this website. With your consent we also use statistics (Microsoft Clarity) and marketing services (Meta Pixel) to improve our offering and advertising. You are free to decide and can change your choice at any time.',
      acceptAll: 'Accept all',
      necessary: 'Necessary only',
      settings: 'Settings',
      save: 'Save choice',
      privacy: 'Privacy Policy',
      cNecessary: 'Necessary',
      cNecessaryD: 'Required for technical operation. Always active.',
      cStat: 'Statistics',
      cStatD: 'Microsoft Clarity: pseudonymous analysis of website usage (heatmaps, sessions).',
      cMkt: 'Marketing',
      cMktD: 'Meta Pixel & Conversions API: measuring and optimising our ads.',
      reopen: 'Cookie settings',
      always: 'Always active'
    },
    sq: {
      title: 'Ne respektojmë privatësinë tuaj',
      body: 'Përdorim cookie të nevojshme për funksionimin e faqes. Me pëlqimin tuaj përdorim edhe shërbime statistikore (Microsoft Clarity) dhe marketingu (Meta Pixel) për të përmirësuar ofertën dhe reklamat tona. Ju vendosni lirisht dhe mund ta ndryshoni zgjedhjen në çdo kohë.',
      acceptAll: 'Prano të gjitha',
      necessary: 'Vetëm të nevojshme',
      settings: 'Cilësimet',
      save: 'Ruaj zgjedhjen',
      privacy: 'Politika e privatësisë',
      cNecessary: 'Të nevojshme',
      cNecessaryD: 'Të nevojshme për funksionimin teknik. Gjithmonë aktive.',
      cStat: 'Statistika',
      cStatD: 'Microsoft Clarity: analizë pseudonime e përdorimit të faqes.',
      cMkt: 'Marketing',
      cMktD: 'Meta Pixel & Conversions API: matja dhe optimizimi i reklamave tona.',
      reopen: 'Cilësimet e cookie-ve',
      always: 'Gjithmonë aktive'
    }
  };
  var t = T[lang] || T.de;

  // ---- Speicher ----
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || o.v !== VERSION) return null;
      return o;
    } catch (e) { return null; }
  }
  function save(statistik, marketing) {
    var o = { v: VERSION, statistik: !!statistik, marketing: !!marketing, ts: Date.now() };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) {}
    return o;
  }

  // ---- Dienste laden ----
  function loadClarity() {
    if (window.__gcClarityLoaded) return;
    window.__gcClarityLoaded = true;
    (function (c, l, a, r, i, t2, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t2 = l.createElement(r); t2.async = 1; t2.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t2, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }

  function apply(o) {
    window.gcConsent.statistik = !!o.statistik;
    window.gcConsent.marketing = !!o.marketing;
    window.gcConsent.set = true;
    if (o.statistik) loadClarity();
    // Marketing (Meta-Pixel) wird von lp-tracking.js über dieses Event initialisiert:
    try {
      window.dispatchEvent(new CustomEvent('gc-consent-changed', { detail: { statistik: !!o.statistik, marketing: !!o.marketing } }));
    } catch (e) {
      var ev = document.createEvent('CustomEvent');
      ev.initCustomEvent('gc-consent-changed', false, false, { statistik: !!o.statistik, marketing: !!o.marketing });
      window.dispatchEvent(ev);
    }
  }

  // ---- UI ----
  var CSS = '' +
    '#gccw *{box-sizing:border-box}' +
    '#gccw{position:fixed;inset:auto 0 0 0;z-index:99999;display:flex;justify-content:center;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
    '#gccw .gc-card{background:#fff;color:#1a2b22;max-width:560px;width:100%;border:1px solid #e3e8e4;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.18);padding:22px}' +
    '#gccw h2{font-size:17px;margin:0 0 8px}' +
    '#gccw p{font-size:13.5px;line-height:1.55;color:#4a554d;margin:0 0 16px}' +
    '#gccw a{color:#00A86B;text-decoration:underline}' +
    '#gccw .gc-btns{display:flex;gap:10px;flex-wrap:wrap}' +
    '#gccw button{flex:1 1 auto;min-width:130px;padding:12px 16px;font-size:14px;font-weight:600;border-radius:10px;cursor:pointer;border:1px solid #cfd8d1;background:#fff;color:#1a2b22}' +
    '#gccw button.gc-primary{background:#00A86B;border-color:#00A86B;color:#fff}' +
    '#gccw button.gc-primary:hover{background:#00875a}' +
    '#gccw button.gc-link{flex:0 0 100%;background:none;border:none;color:#647067;text-decoration:underline;font-weight:500;min-width:0;padding:4px}' +
    '#gccw .gc-opts{margin:4px 0 16px;border-top:1px solid #eef2ef;padding-top:12px}' +
    '#gccw .gc-opt{display:flex;gap:12px;align-items:flex-start;padding:9px 0;border-bottom:1px solid #f2f5f2}' +
    '#gccw .gc-opt:last-child{border-bottom:none}' +
    '#gccw .gc-opt .gc-txt{flex:1}' +
    '#gccw .gc-opt strong{display:block;font-size:13.5px;margin-bottom:2px}' +
    '#gccw .gc-opt span{font-size:12px;color:#647067;line-height:1.45}' +
    '#gccw .gc-opt input{width:18px;height:18px;margin-top:2px;accent-color:#00A86B}' +
    '#gccw .gc-opt .gc-fixed{font-size:11px;color:#9aa39c;white-space:nowrap;margin-top:3px}' +
    '#gc-reopen{position:fixed;left:14px;bottom:14px;z-index:99998;background:#fff;border:1px solid #e3e8e4;border-radius:999px;padding:8px 14px;font:500 12px/-apple-system,sans-serif;color:#647067;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.1)}' +
    '@media (prefers-color-scheme:dark){#gccw .gc-card{background:#1c2620;color:#eaf0ec;border-color:#2c3a32}#gccw p{color:#b6c1ba}#gccw button{background:#243029;color:#eaf0ec;border-color:#33443a}#gc-reopen{background:#1c2620;color:#b6c1ba;border-color:#2c3a32}}';

  function injectCSS() {
    if (document.getElementById('gc-consent-css')) return;
    var s = document.createElement('style');
    s.id = 'gc-consent-css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function privacyLink() {
    // Öffnet das vorhandene Datenschutz-Overlay, falls vorhanden; sonst Fallback-Anker.
    return '<a href="#" id="gc-privacy-link">' + t.privacy + '</a>';
  }

  function bindPrivacyLink(root) {
    var a = root.querySelector('#gc-privacy-link');
    if (!a) return;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var ov = document.getElementById('datenschutzOverlay');
      if (ov) { ov.classList.add('active'); }        // Overlay auf der Seite vorhanden
      else { window.location.href = '/' + lang + '/index.html#datenschutz'; } // sonst zur Startseite
    });
  }

  function removeBanner() {
    var w = document.getElementById('gccw');
    if (w) w.parentNode.removeChild(w);
  }

  function renderReopen() {
    if (document.getElementById('gc-reopen')) return;
    var b = document.createElement('button');
    b.id = 'gc-reopen';
    b.type = 'button';
    b.textContent = t.reopen;
    b.addEventListener('click', function () { showBanner(true); });
    document.body.appendChild(b);
  }

  function showBanner(expanded) {
    injectCSS();
    removeBanner();
    var saved = load();
    var wrap = document.createElement('div');
    wrap.id = 'gccw';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', t.title);

    var optsHtml =
      '<div class="gc-opts" ' + (expanded ? '' : 'style="display:none"') + ' id="gc-opts">' +
        '<div class="gc-opt"><div class="gc-txt"><strong>' + t.cNecessary + '</strong><span>' + t.cNecessaryD + '</span></div><div class="gc-fixed">' + t.always + '</div></div>' +
        '<div class="gc-opt"><div class="gc-txt"><strong>' + t.cStat + '</strong><span>' + t.cStatD + '</span></div><input type="checkbox" id="gc-c-stat" ' + (saved && saved.statistik ? 'checked' : '') + '></div>' +
        '<div class="gc-opt"><div class="gc-txt"><strong>' + t.cMkt + '</strong><span>' + t.cMktD + '</span></div><input type="checkbox" id="gc-c-mkt" ' + (saved && saved.marketing ? 'checked' : '') + '></div>' +
      '</div>';

    wrap.innerHTML =
      '<div class="gc-card">' +
        '<h2>' + t.title + '</h2>' +
        '<p>' + t.body + ' ' + privacyLink() + '.</p>' +
        optsHtml +
        '<div class="gc-btns">' +
          '<button class="gc-primary" id="gc-accept">' + t.acceptAll + '</button>' +
          '<button id="gc-necessary">' + t.necessary + '</button>' +
          '<button class="gc-link" id="gc-toggle">' + t.settings + '</button>' +
          '<button class="gc-link" id="gc-save" style="display:' + (expanded ? 'block' : 'none') + '">' + t.save + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(wrap);
    bindPrivacyLink(wrap);

    wrap.querySelector('#gc-accept').addEventListener('click', function () {
      apply(save(true, true)); removeBanner(); renderReopen();
    });
    wrap.querySelector('#gc-necessary').addEventListener('click', function () {
      apply(save(false, false)); removeBanner(); renderReopen();
    });
    wrap.querySelector('#gc-toggle').addEventListener('click', function () {
      var o = wrap.querySelector('#gc-opts');
      var sv = wrap.querySelector('#gc-save');
      var show = o.style.display === 'none';
      o.style.display = show ? 'block' : 'none';
      sv.style.display = show ? 'block' : 'none';
    });
    wrap.querySelector('#gc-save').addEventListener('click', function () {
      var st = wrap.querySelector('#gc-c-stat').checked;
      var mk = wrap.querySelector('#gc-c-mkt').checked;
      apply(save(st, mk)); removeBanner(); renderReopen();
    });
  }

  // Öffentliche API für den Footer-/Datenschutz-Link „Cookie-Einstellungen".
  window.gcOpenConsentSettings = function () { showBanner(true); };

  // ---- Start ----
  function init() {
    var saved = load();
    if (saved) {
      apply(saved);     // frühere Einwilligung anwenden (Clarity/Pixel ggf. laden)
      renderReopen();   // Widerruf jederzeit möglich
    } else {
      showBanner(false); // noch keine Entscheidung → Banner zeigen
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
