(function () {
  var ENDPOINT = '/api/lead.php';
  var SOURCE = (typeof window !== 'undefined' && window.GC_LEAD_SOURCE) || 'sachwert';
  var PDF_URL = '/assets/downloads/sachwertvergleich-2026.pdf';
  // V2 des Sachwertvergleichs reduziert die erste Hürde auf Vorname + E-Mail.
  // Die bestehende Qualifizierungsstrecke bleibt für alle anderen LPs unverändert.
  var SIMPLE_LEAD = !!(typeof window !== 'undefined' && window.GC_SIMPLE_LEAD);

  var form = document.getElementById('realwertForm');
  if (!form) return;

  var submitBtn = form.querySelector('button[type="submit"]');
  var originalText = submitBtn ? submitBtn.textContent : '';

  function val(name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? el.value.trim() : '';
  }
  function track(name, params) { if (window.gcTrack) window.gcTrack(name, params); }

  /* ---------- Validierung: gültige Telefonnummer ---------- */
  // Lässt echte (auch internationale) Nummern durch, fängt aber die real
  // beobachteten Fake-/Tippfehler-Muster ab: Doppel-Vorwahl „+49 0…",
  // reine Ziffernfolgen (1234567), Wiederholungen (1111111), zu kurz/lang.
  // Exakt dieselbe Regel serverseitig in api/lead.php.
  function isSequentialPhone(d) {
    if (d.length < 6) return false;
    return ('01234567890').indexOf(d) !== -1 || ('09876543210').indexOf(d) !== -1;
  }
  function isValidPhone(s) {
    var raw = (s || '').trim();
    if (!raw) return false;
    if (/[^0-9+()\/.\-\s]/.test(raw)) return false;        // nur Telefon-Zeichen
    if ((raw.match(/\+/g) || []).length > 1) return false;  // max. ein '+'
    if (raw.indexOf('+') > 0) return false;                 // '+' nur am Anfang
    var compact = raw.replace(/[()\/.\-\s]/g, '');          // Trennzeichen entfernen
    if (/^\+0/.test(compact)) return false;                 // keine Ländervorwahl „+0"
    if (/^(\+|00)(49|43|41)0/.test(compact)) return false;  // Doppel-Vorwahl +49 0 / 0049 0 (DACH)
    var digits = raw.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return false;
    if (/^(\d)\1+$/.test(digits)) return false;             // 00000…, 11111…
    if (isSequentialPhone(digits)) return false;            // 1234567, 0123456789…
    return true;
  }

  function fieldError(name, message, noFocus) {
    var el = form.querySelector('[name="' + name + '"]');
    if (!el) return;
    el.setAttribute('aria-invalid', 'true');
    el.style.borderColor = '#dc2626';
    var grp = el.closest('.form-group') || el.parentNode;
    var err = grp.querySelector('.field-err');
    if (!err) {
      err = document.createElement('div');
      err.className = 'field-err';
      err.style.cssText = 'color:#dc2626;font-size:12.5px;margin-top:5px;';
      grp.appendChild(err);
    }
    err.textContent = message;
    if (!noFocus) el.focus();
  }

  function clearFieldError(name) {
    var el = form.querySelector('[name="' + name + '"]');
    if (!el) return;
    el.removeAttribute('aria-invalid');
    el.style.borderColor = '';
    var grp = el.closest('.form-group') || el.parentNode;
    var err = grp.querySelector('.field-err');
    if (err) err.remove();
  }

  var PHONE_MSG = 'Bitte eine gültige Telefonnummer mit Vorwahl eingeben – z. B. 0151 19133331 oder +49 151 19133331.';
  var telEl = form.querySelector('[name="telefon"]');
  if (telEl) {
    telEl.addEventListener('input', function () { clearFieldError('telefon'); });
    // Sofortiges Feedback, sobald der Nutzer das Feld verlässt (nicht erst beim Absenden):
    telEl.addEventListener('blur', function () {
      var v = telEl.value.trim();
      if (v && !isValidPhone(v)) fieldError('telefon', PHONE_MSG, true);
    });
  }

  /* ---------- Pflicht-Telefonverifizierung (Twilio Verify, SMS-Code) ----------
   * Nur aktiv, wenn die Seite window.GC_REQUIRE_PHONE_VERIFY = true setzt
   * (aktuell sachwert-c/sachwert-v2 und sachwert-d). Server-seitig hart
   * durchgesetzt in api/lead.php - dieser Block ist nur die Bedienung dazu;
   * ein Bypass hier (z. B. deaktiviertes JS) würde beim Absenden trotzdem
   * mit "Telefonnummer nicht bestätigt" abgelehnt.
   * Endpunkte: api/verify-phone-start.php (SMS senden), api/verify-phone-
   * check.php (Code prüfen, liefert den Proof für den Lead-Submit).
   */
  var REQUIRE_PHONE_VERIFY = !!(typeof window !== 'undefined' && window.GC_REQUIRE_PHONE_VERIFY);
  var phoneVerify = { proof: '', phone: '' };

  if (REQUIRE_PHONE_VERIFY && telEl) {
    var pvGrp = telEl.closest('.form-group') || telEl.parentNode;
    var pvBox = document.createElement('div');
    pvBox.className = 'pv-box';
    pvBox.style.marginTop = '10px';
    pvGrp.parentNode.insertBefore(pvBox, pvGrp.nextSibling);

    var pvState = 'idle'; // idle | sent | verified

    function pvStatus(msg, isError) {
      var s = pvBox.querySelector('.pv-status');
      if (s) { s.textContent = msg || ''; s.style.color = isError ? '#dc2626' : 'var(--text-muted,#6b7280)'; }
    }

    function pvRender() {
      if (pvState === 'verified') {
        pvBox.innerHTML =
          '<div style="display:flex;align-items:center;gap:8px;color:#128a5b;font-size:13.5px;font-weight:600;">' +
            '<i data-lucide="check-circle" style="width:18px;height:18px;"></i> Nummer bestätigt' +
          '</div>';
        if (window.lucide) lucide.createIcons();
        return;
      }
      if (pvState === 'sent') {
        pvBox.innerHTML =
          '<label class="form-label" style="font-size:13px;">Code aus der SMS *</label>' +
          '<div style="display:flex;gap:8px;">' +
            '<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8" class="form-input pv-code" placeholder="Code eingeben">' +
            '<button type="button" class="btn btn-secondary pv-confirm" style="white-space:nowrap;">Bestätigen</button>' +
          '</div>' +
          '<div class="pv-status" style="font-size:12.5px;margin-top:6px;color:var(--text-muted,#6b7280);">' +
            'Code per SMS gesendet. <a href="#" class="pv-resend">Erneut senden</a>' +
          '</div>';
        var codeEl = pvBox.querySelector('.pv-code');
        pvBox.querySelector('.pv-confirm').addEventListener('click', pvCheck);
        codeEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); pvCheck(); } });
        codeEl.addEventListener('input', function () { pvStatus(''); });
        pvBox.querySelector('.pv-resend').addEventListener('click', function (e) { e.preventDefault(); pvSend(); });
        codeEl.focus();
        return;
      }
      // idle
      pvBox.innerHTML =
        '<button type="button" class="btn btn-secondary pv-send" style="width:100%;justify-content:center;">Nummer per SMS bestätigen</button>' +
        '<div class="pv-status" style="font-size:12.5px;margin-top:6px;"></div>';
      pvBox.querySelector('.pv-send').addEventListener('click', pvSend);
    }

    function pvSend() {
      var phone = telEl.value.trim();
      if (!isValidPhone(phone)) { fieldError('telefon', PHONE_MSG); return; }
      clearFieldError('telefon');
      var btn = pvBox.querySelector('.pv-send') || pvBox.querySelector('.pv-resend');
      if (btn) { btn.style.pointerEvents = 'none'; btn.disabled = true; }
      pvStatus('Code wird gesendet …');
      fetch('/api/verify-phone-start.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefon: phone })
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res || !res.ok) {
            pvStatus((res && res.error) || 'Senden fehlgeschlagen.', true);
            if (btn) { btn.style.pointerEvents = ''; btn.disabled = false; }
            return;
          }
          pvState = 'sent'; pvRender();
          track('PhoneVerify_Sent', { source: SOURCE });
        })
        .catch(function () {
          pvStatus('Senden fehlgeschlagen. Bitte erneut versuchen.', true);
          if (btn) { btn.style.pointerEvents = ''; btn.disabled = false; }
        });
    }

    function pvCheck() {
      var phone = telEl.value.trim();
      var codeEl = pvBox.querySelector('.pv-code');
      var code = codeEl ? codeEl.value.trim() : '';
      if (!code) { pvStatus('Bitte den Code eingeben.', true); return; }
      var btn = pvBox.querySelector('.pv-confirm');
      if (btn) { btn.disabled = true; btn.textContent = 'Prüfe …'; }
      fetch('/api/verify-phone-check.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefon: phone, code: code })
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res || !res.ok) {
            pvStatus((res && res.error) || 'Code falsch oder abgelaufen.', true);
            if (btn) { btn.disabled = false; btn.textContent = 'Bestätigen'; }
            return;
          }
          phoneVerify.proof = res.proof; phoneVerify.phone = phone;
          pvState = 'verified'; pvRender();
          track('PhoneVerify_Confirmed', { source: SOURCE });
        })
        .catch(function () {
          pvStatus('Prüfung fehlgeschlagen. Bitte erneut versuchen.', true);
          if (btn) { btn.disabled = false; btn.textContent = 'Bestätigen'; }
        });
    }

    // Nummer geändert, nachdem sie bestätigt/angestoßen wurde -> Verifizierung verwerfen,
    // sonst könnte man Nummer A bestätigen und dann mit Nummer B absenden.
    telEl.addEventListener('input', function () {
      var v = telEl.value.trim();
      if ((phoneVerify.proof || pvState !== 'idle') && v !== phoneVerify.phone) {
        phoneVerify.proof = ''; phoneVerify.phone = '';
        pvState = 'idle'; pvRender();
      }
    });

    pvRender();
  }

  /* ---------- Schritt-Navigation (generisch, 2..n Schritte) ---------- */
  var steps = Array.prototype.slice.call(form.querySelectorAll('.lp-step'));
  var dots = form.querySelectorAll('.step-dot');
  var totalSteps = steps.length;
  var currentStep = 1;
  var startedTracked = false;

  function setStep(n) {
    currentStep = n;
    steps.forEach(function (s) {
      s.hidden = (parseInt(s.getAttribute('data-step'), 10) !== n);
    });
    dots.forEach(function (d) {
      d.classList.toggle('active', parseInt(d.getAttribute('data-dot'), 10) <= n);
    });
  }

  // Pflicht-Radios im aktuellen Schritt: jede Gruppe braucht eine Auswahl
  function validateStep(n) {
    var box = form.querySelector('[data-step="' + n + '"]');
    if (!box) return true;
    var radios = box.querySelectorAll('input[type="radio"]');
    var seen = {};
    for (var i = 0; i < radios.length; i++) {
      var name = radios[i].getAttribute('name');
      if (seen[name]) continue;
      seen[name] = true;
      if (!form.querySelector('[name="' + name + '"]:checked')) {
        var firstOpt = box.querySelector('.qual-opt');
        if (firstOpt) firstOpt.focus();
        return false;
      }
    }
    return true;
  }

  function goNext() {
    if (!validateStep(currentStep)) return;
    var next = currentStep + 1;
    if (next > totalSteps) return;
    setStep(next);
    track('LP_Step' + next, { source: SOURCE });
    var box = form.querySelector('[data-step="' + next + '"]');
    var f = box ? box.querySelector('input:not([type="radio"]),select') : null;
    if (f) f.focus();
  }
  function goBack() { if (currentStep > 1) setStep(currentStep - 1); }

  function bindAll(sel, fn) {
    var els = form.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) els[i].addEventListener('click', fn);
  }
  bindAll('.js-next', goNext);
  bindAll('.js-back', goBack);
  // Legacy-IDs der bestehenden LPs
  var toStep2 = document.getElementById('toStep2');
  if (toStep2 && !toStep2.classList.contains('js-next')) toStep2.addEventListener('click', goNext);
  var backStep1 = document.getElementById('backStep1');
  if (backStep1 && !backStep1.classList.contains('js-back')) backStep1.addEventListener('click', goBack);

  form.addEventListener('change', function (e) {
    if (!startedTracked) { startedTracked = true; track('LP_Form_Start', { source: SOURCE }); }
    if (e.target && e.target.name === 'lead_intent') {
      var intentGroup = e.target.closest('.form-group');
      var intentError = intentGroup && intentGroup.querySelector('.field-err');
      if (intentError) intentError.remove();
    }
  });

  /* ---------- Erfolg / Fehler ---------- */
  function startDownload() {
    var a = document.createElement('a');
    a.href = PDF_URL; a.setAttribute('download', ''); a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- Optionale Termin-Buchung (Pipedrive-Terminplaner) ---------- */
  // Zeigt nach dem Download eine dezente Box zum Buchen eines Telefontermins.
  // Erscheint nur, wenn window.GC_BOOKING_URL gesetzt ist (Buchungslink aus
  // Pipedrive). window.GC_BOOKING_MODE: 'button' (Link, Standard) oder 'embed' (iframe).
  function bookingBlock() {
    var url = (window.GC_BOOKING_URL || '').trim();
    if (!url) return '';
    var mode = (window.GC_BOOKING_MODE || 'button');
    var head =
      '<div class="lp-booking" style="margin-top:26px;padding-top:22px;border-top:1px solid #e3e8e4;text-align:center;">' +
        '<div style="font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#128a5b;margin-bottom:6px;">Optional · empfohlen</div>' +
        '<h4 style="font-size:20px;margin:0 0 8px;">Lieber gleich persönlich sprechen?</h4>' +
        '<p style="font-size:15px;margin:0 auto 16px;max-width:44ch;">Sichern Sie sich einen <strong>kostenlosen Telefontermin</strong> (ca. 20 Min., unverbindlich). Einfach einen freien Zeitpunkt wählen – wir rufen Sie dann an.</p>';
    if (mode === 'embed') {
      return head +
        '<div style="border:1px solid #e3e8e4;border-radius:12px;overflow:hidden;">' +
          '<iframe src="' + url + '" title="Telefontermin buchen" loading="lazy" style="width:100%;height:660px;border:0;"></iframe>' +
        '</div>' +
        '<p style="font-size:13px;margin-top:10px;">Kalender lädt nicht? <a class="js-booking" href="' + url + '" target="_blank" rel="noopener">Hier in neuem Tab öffnen</a></p>' +
      '</div>';
    }
    return head +
      '<a href="' + url + '" target="_blank" rel="noopener" class="btn btn-primary btn-lg js-booking" style="justify-content:center;">📞 Telefontermin auswählen</a>' +
    '</div>';
  }
  function wireBooking(inner) {
    var bk = inner.querySelector('.js-booking');
    if (bk) bk.addEventListener('click', function () { track('LP_Booking_Click', { source: SOURCE }); });
  }

  function showSuccess() {
    var inner = document.getElementById('formInner');
    if (!inner) return;
    if (window.GC_SUCCESS_MODE === 'callback') {
      inner.innerHTML =
        '<div class="lp-success">' +
          '<div class="succ-ic"><i data-lucide="phone-call"></i></div>' +
          '<h3>Eingetragen!</h3>' +
          '<p><strong>Geschafft! Wir melden uns zu Ihrer Wunschzeit persönlich bei Ihnen.</strong> Meist schon am selben Werktag.</p>' +
          '<p style="font-size:13px;color:var(--text-muted);">Das Gespräch dauert nur ein paar Minuten und ist völlig unverbindlich. Kleiner Tipp: Falls sich in den nächsten Tagen eine unbekannte Nummer meldet, sind wir das wahrscheinlich.</p>' +
          bookingBlock() +
        '</div>';
      if (window.lucide) lucide.createIcons();
      wireBooking(inner);
      return;
    }
    if (SIMPLE_LEAD) {
      inner.innerHTML =
        '<div class="lp-success">' +
          '<div class="succ-ic"><i data-lucide="check"></i></div>' +
          '<h3>Vielen Dank – Ihr Sachwertvergleich 2026 ist unterwegs.</h3>' +
          '<p>Der Download startet direkt. Falls nicht, können Sie das PDF hier sofort öffnen.</p>' +
          '<a href="' + PDF_URL + '" download target="_blank" rel="noopener" class="btn btn-primary btn-lg" style="justify-content:center;">PDF jetzt herunterladen</a>' +
          bookingBlock() +
        '</div>';
      if (window.lucide) lucide.createIcons();
      wireBooking(inner);
      startDownload();
      return;
    }
    inner.innerHTML =
      '<div class="lp-success">' +
        '<div class="succ-ic"><i data-lucide="check"></i></div>' +
        '<h3>Vielen Dank!</h3>' +
        '<p>Ihr Sachwertvergleich 2026 wird gerade heruntergeladen. <strong>Wir melden uns in Kürze telefonisch bei Ihnen, um Ihren persönlichen Termin abzustimmen.</strong></p>' +
        '<p style="font-size:13px;margin-bottom:14px;">Download nicht automatisch gestartet?</p>' +
        '<a href="' + PDF_URL + '" download target="_blank" rel="noopener" class="btn btn-primary btn-lg" style="justify-content:center;">PDF herunterladen</a>' +
        bookingBlock() +
      '</div>';
    if (window.lucide) lucide.createIcons();
    wireBooking(inner);
    startDownload();
  }

  function showError() {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
    var existing = form.querySelector('.lp-form-result');
    if (existing) existing.remove();
    var msg = document.createElement('div');
    msg.className = 'lp-form-result';
    msg.style.background = '#fef2f2'; msg.style.color = '#dc2626';
    msg.textContent = 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut oder schreiben Sie uns an info@greenchild.eu.';
    form.appendChild(msg);
  }

  /* ---------- Absenden ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var botEl = form.querySelector('[name="botcheck"]');
    if (botEl && botEl.checked) return;

    var budgetEl = form.querySelector('[name="budget"]:checked');
    if (!SIMPLE_LEAD && !budgetEl) { setStep(1); return; }

    var vorname = val('vorname'), nachname = val('nachname'),
        email = val('email'), telefon = val('telefon'),
        erreichbarkeit = val('erreichbarkeit');

    // Kombiniertes Namensfeld: Eine Landingpage kann statt zwei Feldern ein
    // einzelnes "Vor- und Nachname"-Feld anbieten. Wir teilen es hier auf,
    // damit Pipedrive (Personenname) und das Meta-Matching unveraendert
    // funktionieren - dort werden Vor- und Nachname getrennt gehasht.
    // Seiten ohne dieses Feld bleiben unberuehrt.
    var fullEl = form.querySelector('[name="fullname"]');
    if (fullEl) {
      var nameParts = (fullEl.value || '').trim().replace(/\s+/g, ' ').split(' ');
      vorname  = nameParts.shift() || '';
      nachname = nameParts.join(' ');
    }
    var leadIntentEl = form.querySelector('[name="lead_intent"]:checked');
    var consent = form.querySelector('[name="consent"]');

    if (SIMPLE_LEAD) {
      if (fullEl) {
        if (!vorname || !nachname) { fieldError('fullname', 'Bitte Vor- und Nachnamen eintragen.'); return; }
      } else if (!vorname) { fieldError('vorname', 'Bitte Ihren Vornamen eintragen.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fieldError('email', 'Bitte eine gültige E-Mail-Adresse eintragen.'); return; }
      if (!telefon) { fieldError('telefon', 'Bitte Ihre Telefonnummer eintragen.'); return; }
      if (!leadIntentEl) {
        var intentGroup = form.querySelector('[name="lead_intent"]');
        intentGroup = intentGroup && (intentGroup.closest('.form-group') || intentGroup.parentNode);
        if (intentGroup && !intentGroup.querySelector('.field-err')) {
          var intentError = document.createElement('div');
          intentError.className = 'field-err';
          intentError.style.cssText = 'color:#dc2626;font-size:12.5px;margin-top:7px;';
          intentError.textContent = 'Bitte wählen Sie eine der beiden Optionen.';
          intentGroup.appendChild(intentError);
        }
        return;
      }
    }
    if (!vorname || !email || !telefon || (!SIMPLE_LEAD && !nachname) || (SIMPLE_LEAD && !leadIntentEl)) return;
    if (telefon && !isValidPhone(telefon)) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
      fieldError('telefon', PHONE_MSG);
      return;
    }
    if (consent && !consent.checked) { consent.focus(); return; }

    // Pflicht-Telefonverifizierung: ohne bestätigten Proof für GENAU diese
    // Nummer nicht absenden (server-seitig ohnehin hart durchgesetzt, siehe
    // api/lead.php - das hier ist nur die frühere, freundlichere Rückmeldung).
    if (REQUIRE_PHONE_VERIFY && (!phoneVerify.proof || phoneVerify.phone !== telefon)) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
      var pvBoxEl = form.querySelector('.pv-box');
      if (pvBoxEl && pvBoxEl.scrollIntoView) { pvBoxEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      fieldError('telefon', 'Bitte bestätigen Sie zuerst Ihre Telefonnummer per SMS-Code.', true);
      return;
    }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Wird gesendet …'; }

    var eventId = window.gcEventId ? window.gcEventId() : ('lead.' + Date.now());
    var payload = {
      source: SOURCE,
      vorname: vorname, nachname: nachname, email: email, telefon: telefon,
      erreichbarkeit: erreichbarkeit, budget: budgetEl ? budgetEl.value : 'info', consent: true,
      lead_intent: leadIntentEl ? leadIntentEl.value : '',
      beruf: (form.querySelector('[name="beruf"]:checked') || {value:''}).value,
      botcheck: '',
      // Meta Conversions API (serverseitig) – Dedup + besseres Matching:
      event_id: eventId,
      event_source_url: location.href,
      fbp: window.gcCookie ? window.gcCookie('_fbp') : '',
      fbc: window.gcCookie ? window.gcCookie('_fbc') : '',
      // Nur mit Marketing-Einwilligung darf serverseitig an Meta (CAPI) gemeldet werden:
      meta_consent: window.gcMarketingConsent ? window.gcMarketingConsent() : false,
      // First-Party-Attribution (Kampagne/Creative aus der Anzeigen-URL) → Pipedrive-Notiz:
      attribution: window.gcAttribution ? window.gcAttribution() : {},
      // Nachweis der Telefonverifizierung (nur relevant, wenn REQUIRE_PHONE_VERIFY;
      // auf anderen Seiten leer und von api/lead.php dort ignoriert):
      phone_verify_proof: phoneVerify.proof
    };

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.success) {
          // Proof kurz nach der Bestätigung abgelaufen (>15 Min bis zum Absenden)
          // oder nachträglich manipuliert -> gezielt zur erneuten SMS-Bestätigung
          // zurückführen statt der generischen Fehlermeldung.
          if (res && res.message === 'Telefonnummer nicht bestätigt') {
            phoneVerify.proof = ''; phoneVerify.phone = '';
            if (telEl) { telEl.dispatchEvent(new Event('input')); }
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
            fieldError('telefon', 'Die Bestätigung ist abgelaufen. Bitte die Nummer erneut per SMS bestätigen.', true);
            return;
          }
          throw new Error('lead');
        }
        track('Lead', { source: SOURCE, content_name: 'Sachwertvergleich 2026', budget: budgetEl ? budgetEl.value : 'info', lead_intent: leadIntentEl ? leadIntentEl.value : '', value: 0, eventID: eventId });
        showSuccess();
      })
      .catch(function () { showError(); });
  });
})();
