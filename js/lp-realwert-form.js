(function () {
  var API_TOKEN = '9fae1a7473002abdf89ade65319dc14a1c828a28';
  var BASE = 'https://api.pipedrive.com/v1';
  var PDF_URL = '/assets/downloads/sachwertvergleich-2026.pdf';

  var form = document.getElementById('realwertForm');
  if (!form) return;

  var submitBtn = form.querySelector('button[type="submit"]');
  var originalText = submitBtn ? submitBtn.textContent : '';

  // Budget-Stufen → Pipedrive-Mapping.
  // tag = sichtbarer Prioritäts-Marker im Lead-Titel, value = sortierbarer Lead-Wert (€).
  var BUDGET_MAP = {
    'info':        { label: 'Erst einmal informieren', tag: 'INFO',        value: 0 },
    'bis-2500':    { label: 'bis 2.500 €',             tag: '€ bis 2,5k',  value: 2500 },
    '2500-10000':  { label: '2.500 – 10.000 €',         tag: '€€ 2,5–10k',  value: 10000 },
    '10000-25000': { label: '10.000 – 25.000 €',        tag: '€€€ 10–25k',  value: 25000 },
    '25000-plus':  { label: 'über 25.000 €',            tag: '€€€€ 25k+',   value: 50000 }
  };

  function val(name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? el.value.trim() : '';
  }

  /* ---------- Schritt-Navigation ---------- */
  var step1 = form.querySelector('[data-step="1"]');
  var step2 = form.querySelector('[data-step="2"]');
  var dots = form.querySelectorAll('.step-dot');
  var toStep2 = document.getElementById('toStep2');
  var backStep1 = document.getElementById('backStep1');

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
      var firstInput = step2.querySelector('input,select');
      if (firstInput) firstInput.focus();
    });
  }
  if (backStep1) {
    backStep1.addEventListener('click', function () { setStep(1); });
  }

  /* ---------- Erfolg / Fehler ---------- */
  function startDownload() {
    var a = document.createElement('a');
    a.href = PDF_URL;
    a.setAttribute('download', '');
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
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
    msg.style.background = '#fef2f2';
    msg.style.color = '#dc2626';
    msg.textContent = 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut oder schreiben Sie uns an info@greenchild.eu.';
    form.appendChild(msg);
  }

  /* ---------- Absenden ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var bot = form.querySelector('[name="botcheck"]');
    if (bot && bot.checked) return;

    var budgetEl = form.querySelector('[name="budget"]:checked');
    if (!budgetEl) { setStep(1); return; }
    var budget = BUDGET_MAP[budgetEl.value] || { label: budgetEl.value, tag: '?', value: 0 };

    var vorname = val('vorname');
    var nachname = val('nachname');
    var email = val('email');
    var telefon = val('telefon');
    var erreichbarkeit = val('erreichbarkeit');
    var consent = form.querySelector('[name="consent"]');

    if (!vorname || !nachname || !email || !telefon || !erreichbarkeit) return;
    if (consent && !consent.checked) { consent.focus(); return; }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Wird gesendet …'; }

    var personData = {
      name: vorname + ' ' + nachname,
      email: [{ value: email, primary: true, label: 'work' }]
    };
    if (telefon) personData.phone = [{ value: telefon, primary: true, label: 'work' }];

    fetch(BASE + '/persons?api_token=' + API_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(personData)
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.success) throw new Error('person');
        var personId = res.data.id;

        // Tag im Titel → Vertrieb sieht die Priorität sofort in der Lead-Inbox.
        var leadData = {
          title: '[' + budget.tag + '] Sachwertvergleich 2026 — ' + vorname + ' ' + nachname,
          person_id: personId
        };
        // Lead-Value → in Pipedrive sortier-/filterbar (heiße Leads zuerst).
        if (budget.value > 0) {
          leadData.value = { amount: budget.value, currency: 'EUR' };
        }

        var note =
          'Quelle: Landingpage „Sachwert" — Sachwertvergleich 2026 angefordert.\n' +
          'Ziel: persönlichen Termin vereinbaren.\n' +
          '— — —\n' +
          'Investitionsrahmen: ' + budget.label + '\n' +
          'Beste Erreichbarkeit: ' + erreichbarkeit + '\n' +
          'Telefon: ' + telefon;

        return Promise.all([
          fetch(BASE + '/leads?api_token=' + API_TOKEN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(leadData)
          }),
          fetch(BASE + '/notes?api_token=' + API_TOKEN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: note, person_id: personId })
          })
        ]);
      })
      .then(function () { showSuccess(); })
      .catch(function () { showError(); });
  });
})();
