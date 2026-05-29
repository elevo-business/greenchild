(function () {
  var API_TOKEN = '9fae1a7473002abdf89ade65319dc14a1c828a28';
  var BASE = 'https://api.pipedrive.com/v1';
  var PDF_URL = '/assets/downloads/realwert-vergleich-2026.pdf';

  var form = document.getElementById('realwertForm');
  if (!form) return;

  var submitBtn = form.querySelector('button[type="submit"]');
  var originalText = submitBtn ? submitBtn.textContent : '';

  function val(name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? el.value.trim() : '';
  }

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
        '<p>Ihr Realwert-Vergleich 2026 wird heruntergeladen. Sollte der Download nicht automatisch starten, klicken Sie hier:</p>' +
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

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var bot = form.querySelector('[name="botcheck"]');
    if (bot && bot.checked) return;

    var vorname = val('vorname');
    var nachname = val('nachname');
    var email = val('email');
    var telefon = val('telefon');
    var consent = form.querySelector('[name="consent"]');

    if (!vorname || !nachname || !email) return;
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

        var leadData = {
          title: 'Lead-Magnet: Realwert-Vergleich 2026 — ' + vorname + ' ' + nachname,
          person_id: personId
        };
        var note = 'Quelle: Landingpage „Sachwert" — Realwert-Vergleich 2026 angefordert.';
        if (telefon) note += '\nTelefon: ' + telefon;

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
