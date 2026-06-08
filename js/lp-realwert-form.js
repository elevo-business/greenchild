(function () {
  var ENDPOINT = '/api/lead.php';
  var SOURCE = 'sachwert';
  var PDF_URL = '/assets/downloads/sachwertvergleich-2026.pdf';

  var form = document.getElementById('realwertForm');
  if (!form) return;

  var submitBtn = form.querySelector('button[type="submit"]');
  var originalText = submitBtn ? submitBtn.textContent : '';

  function val(name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? el.value.trim() : '';
  }
  function track(name, params) { if (window.gcTrack) window.gcTrack(name, params); }

  /* ---------- Schritt-Navigation ---------- */
  var step1 = form.querySelector('[data-step="1"]');
  var step2 = form.querySelector('[data-step="2"]');
  var dots = form.querySelectorAll('.step-dot');
  var toStep2 = document.getElementById('toStep2');
  var backStep1 = document.getElementById('backStep1');
  var startedTracked = false;

  function setStep(n) {
    step1.hidden = (n !== 1);
    step2.hidden = (n !== 2);
    dots.forEach(function (d) {
      d.classList.toggle('active', parseInt(d.getAttribute('data-dot'), 10) <= n);
    });
  }

  if (toStep2) {
    toStep2.addEventListener('click', function () {
      var budget = form.querySelector('[name="budget"]:checked');
      if (!budget) {
        var firstOpt = form.querySelector('.qual-opt');
        if (firstOpt) firstOpt.focus();
        return;
      }
      setStep(2);
      track('LP_Step2', { source: SOURCE, budget: budget.value });
      var firstInput = step2.querySelector('input,select');
      if (firstInput) firstInput.focus();
    });
  }
  if (backStep1) {
    backStep1.addEventListener('click', function () { setStep(1); });
  }
  form.addEventListener('change', function () {
    if (!startedTracked) { startedTracked = true; track('LP_Form_Start', { source: SOURCE }); }
  });

  /* ---------- Erfolg / Fehler ---------- */
  function startDownload() {
    var a = document.createElement('a');
    a.href = PDF_URL; a.setAttribute('download', ''); a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function showSuccess() {
    var inner = document.getElementById('formInner');
    if (!inner) return;
    inner.innerHTML =
      '<div class="lp-success">' +
        '<div class="succ-ic"><i data-lucide="check"></i></div>' +
        '<h3>Vielen Dank!</h3>' +
        '<p>Ihr Sachwertvergleich 2026 wird gerade heruntergeladen. <strong>Wir melden uns in Kürze telefonisch bei Ihnen, um Ihren persönlichen Termin abzustimmen.</strong></p>' +
        '<p style="font-size:13px;margin-bottom:14px;">Download nicht automatisch gestartet?</p>' +
        '<a href="' + PDF_URL + '" download target="_blank" rel="noopener" class="btn btn-primary btn-lg" style="justify-content:center;">PDF herunterladen</a>' +
      '</div>';
    if (window.lucide) lucide.createIcons();
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
    if (!budgetEl) { setStep(1); return; }

    var vorname = val('vorname'), nachname = val('nachname'),
        email = val('email'), telefon = val('telefon'),
        erreichbarkeit = val('erreichbarkeit');
    var consent = form.querySelector('[name="consent"]');

    if (!vorname || !nachname || !email || !telefon) return;
    if (consent && !consent.checked) { consent.focus(); return; }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Wird gesendet …'; }

    var eventId = window.gcEventId ? window.gcEventId() : ('lead.' + Date.now());
    var payload = {
      source: SOURCE,
      vorname: vorname, nachname: nachname, email: email, telefon: telefon,
      erreichbarkeit: erreichbarkeit, budget: budgetEl.value, consent: true,
      botcheck: '',
      // Meta Conversions API (serverseitig) – Dedup + besseres Matching:
      event_id: eventId,
      event_source_url: location.href,
      fbp: window.gcCookie ? window.gcCookie('_fbp') : '',
      fbc: window.gcCookie ? window.gcCookie('_fbc') : ''
    };

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.success) throw new Error('lead');
        track('Lead', { source: SOURCE, content_name: 'Sachwertvergleich 2026', budget: budgetEl.value, value: 0, eventID: eventId });
        showSuccess();
      })
      .catch(function () { showError(); });
  });
})();
