/**
 * Tracking für die Landingpages – reportet an Meta über ZWEI Wege:
 *
 *   1) Browser-Pixel (fbq)            — clientseitig
 *   2) Conversions API (api/lead.php) — serverseitig, robust gegen Adblocker/ITP
 *
 * Beide senden das 'Lead'-Event mit DERSELBEN event_id → Meta dedupliziert,
 * zählt also nicht doppelt. Das ist der von Meta empfohlene Aufbau und sorgt
 * dafür, dass möglichst alle Conversions im Werbeanzeigenmanager ankommen.
 *
 * HINWEIS (bewusste Entscheidung, Juli 2026): Der Pixel lädt SOFORT, ohne
 * Consent-Gate – wie die Conversions API (api/lead.php). Mit Consent-Gate kamen
 * nur ~3 % der Landingpage-Aufrufe bei Meta an (151 Klicks → 4 LPV), wodurch
 * Kampagnen-Optimierung und Attribution zusammenbrachen. Das Cookie-Banner
 * (js/consent.js) steuert weiterhin Microsoft Clarity. Die Datenschutzerklärung
 * (Ziffer 9/11) wurde entsprechend angepasst. Zum Re-Aktivieren der Sperre:
 * initPixel() wieder in maybeInit()/'gc-consent-changed' kapseln (git-History).
 *
 * EINRICHTEN: Meta-Pixel-ID unten eintragen. Den Conversions-API-Token NICHT
 * hier, sondern serverseitig in api/lead.php (bzw. ENV/Datei) hinterlegen.
 */
(function () {
  // 👉 HIER deine Meta-Pixel-ID (= Dataset-ID aus dem Events Manager):
  var META_PIXEL_ID = '1314610516838484';

  window.dataLayer = window.dataLayer || [];
  var pixelInited = false;

  function initPixel() {
    if (pixelInited || !META_PIXEL_ID) return;
    pixelInited = true;
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', META_PIXEL_ID);
    fbq('track', 'PageView');
  }

  // Pixel sofort starten (kein Consent-Gate, siehe Kopfkommentar).
  initPixel();

  // Eindeutige Event-ID für die Pixel/CAPI-Deduplizierung.
  window.gcEventId = function () {
    return 'lead.' + Date.now() + '.' + Math.random().toString(36).slice(2, 10);
  };

  /**
   * First-Party-Attribution: Kampagnen-/Creative-Parameter aus der Anzeigen-URL
   * (utm_*, fbclid) beim ersten Aufruf einsammeln und in sessionStorage halten,
   * damit sie auch nach interner Navigation beim Formular-Submit noch da sind.
   * Wird mit dem Lead an Pipedrive geschrieben → "welches Creative performt"
   * ist im CRM für JEDEN Lead sichtbar, unabhängig von der Cookie-Einwilligung
   * (eigene Herkunftsnotiz zur Anfrage, kein Tracking-Dienst).
   */
  var ATTR_KEY = 'gc_attr_v1';
  var ATTR_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
  (function collectAttribution() {
    try {
      var qs = new URLSearchParams(window.location.search);
      var found = {};
      var any = false;
      for (var i = 0; i < ATTR_FIELDS.length; i++) {
        var v = qs.get(ATTR_FIELDS[i]);
        if (v) { found[ATTR_FIELDS[i]] = v.slice(0, 250); any = true; }
      }
      if (any) {
        found.landing = (location.pathname || '').slice(0, 200);
        found.ts = new Date().toISOString();
        var json = JSON.stringify(found);
        // In localStorage UND sessionStorage ablegen: übersteht interne
        // Navigation, neue Tabs und ein späteres Wiederkommen im selben Browser
        // (z. B. Meta In-App-Browser → Formular wird erst Minuten später
        // ausgefüllt). Mit sessionStorage allein ging die Herkunft bei jedem
        // Tab-/Sitzungswechsel verloren – Grund, warum bisher die meisten Leads
        // ohne Creative-Zuordnung im CRM ankamen.
        try { localStorage.setItem(ATTR_KEY, json); } catch (e) {}
        try { sessionStorage.setItem(ATTR_KEY, json); } catch (e) {}
      }
    } catch (e) {}
  })();
  window.gcAttribution = function () {
    try {
      // sessionStorage zuerst (aktuellster Klick in dieser Sitzung), sonst der
      // in localStorage gemerkte letzte bekannte Anzeigen-Klick als Fallback.
      var raw = sessionStorage.getItem(ATTR_KEY) || localStorage.getItem(ATTR_KEY) || '{}';
      return JSON.parse(raw);
    } catch (e) { return {}; }
  };

  // Cookie auslesen (für fbp/fbc – verbessert das Matching der CAPI-Events).
  window.gcCookie = function (name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : '';
  };

  // Marketing-Einwilligung (Cookie-Banner). Wird von den Formularen als
  // meta_consent an api/lead.php mitgeschickt – dort nur noch informativ
  // protokolliert, kein Gate mehr (siehe Kopfkommentar).
  window.gcMarketingConsent = function () {
    return !!(window.gcConsent && window.gcConsent.marketing);
  };

  /**
   * gcTrack(name, params) – feuert an Pixel + dataLayer.
   * Für 'Lead' wird params.eventID als Pixel-eventID genutzt (Dedup mit CAPI).
   */
  window.gcTrack = function (name, params) {
    params = params || {};
    try { window.dataLayer.push(Object.assign({ event: name }, params)); } catch (e) {}
    if (window.fbq && pixelInited) {
      if (name === 'Lead') {
        var opts = params.eventID ? { eventID: params.eventID } : undefined;
        fbq('track', 'Lead', { value: params.value || 0, currency: params.currency || 'EUR', content_name: params.content_name }, opts);
      } else {
        fbq('trackCustom', name, params);
      }
    }
  };
})();
