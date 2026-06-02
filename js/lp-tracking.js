/**
 * Leichtgewichtiges Tracking für die Landingpages.
 *
 * Liefert die Daten, die du brauchst, um Formulare datenbasiert (nicht aus dem
 * Bauch) zu optimieren – und versorgt gleichzeitig die Meta-Kampagne mit den
 * Conversion-Events (Pflicht für Conversion-Optimierung + Retargeting).
 *
 * EINRICHTEN: Trage unten deine Meta-Pixel-ID ein. Solange leer, werden nur
 * dataLayer-Events gepusht (harmlos, kein externes Laden).
 */
(function () {
  // 👉 HIER deine Meta-Pixel-ID eintragen (aus dem Meta Events Manager):
  var META_PIXEL_ID = ''; // z. B. '1234567890987654'

  window.dataLayer = window.dataLayer || [];

  // Meta-Pixel-Basiscode (lädt nur, wenn eine ID gesetzt ist)
  if (META_PIXEL_ID) {
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

  /**
   * gcTrack(name, params) – feuert ein Event an Meta-Pixel (falls aktiv) und dataLayer.
   * 'Lead' wird als Meta-Standard-Event gesendet, alles andere als Custom-Event.
   */
  window.gcTrack = function (name, params) {
    params = params || {};
    try { window.dataLayer.push(Object.assign({ event: name }, params)); } catch (e) {}
    if (window.fbq) {
      if (name === 'Lead') { fbq('track', 'Lead', params); }
      else { fbq('trackCustom', name, params); }
    }
  };
})();
