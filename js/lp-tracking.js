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
 * WICHTIG (Datenschutz): Der Pixel wird NICHT automatisch geladen. Er startet
 * erst, wenn die Marketing-Einwilligung erteilt ist (js/consent.js →
 * window.gcConsent.marketing bzw. Event 'gc-consent-changed'). Ohne Einwilligung
 * bleiben Pixel und – über den an api/lead.php gesendeten Consent-Flag – auch
 * die Conversions API inaktiv.
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

  // Marketing-Einwilligung vorhanden? Dann Pixel sofort starten.
  function maybeInit() {
    if (window.gcConsent && window.gcConsent.marketing) initPixel();
  }
  maybeInit();
  // ... sonst auf die Consent-Entscheidung warten.
  window.addEventListener('gc-consent-changed', maybeInit);

  // Eindeutige Event-ID für die Pixel/CAPI-Deduplizierung.
  window.gcEventId = function () {
    return 'lead.' + Date.now() + '.' + Math.random().toString(36).slice(2, 10);
  };

  // Cookie auslesen (für fbp/fbc – verbessert das Matching der CAPI-Events).
  window.gcCookie = function (name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : '';
  };

  // Hat der Nutzer in Marketing eingewilligt? (Formulare fragen das ab, um
  // den Consent-Flag an api/lead.php zu übergeben → server-seitige CAPI-Gate.)
  window.gcMarketingConsent = function () {
    return !!(window.gcConsent && window.gcConsent.marketing);
  };

  /**
   * gcTrack(name, params) – feuert an Pixel (falls eingewilligt+aktiv) + dataLayer.
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
