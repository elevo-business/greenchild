(function () {
  var API_TOKEN = '9fae1a7473002abdf89ade65319dc14a1c828a28';
  var BASE = 'https://api.pipedrive.com/v1';

  var INTERESSE_LABELS = {
    baumbesitzer: 'Baumbesitzer werden',
    info: 'Mehr erfahren',
    besuch: 'Plantage besuchen',
    partner: 'Partnerschaft',
    sonstiges: 'Sonstiges'
  };

  var form = document.querySelector('form[action*="web3forms"]');
  if (!form) return;

  var submitBtn = form.querySelector('button[type="submit"]');
  var originalText = submitBtn ? submitBtn.textContent : '';

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (form.querySelector('[name="botcheck"]').checked) return;

    var vorname = form.querySelector('[name="vorname"]').value.trim();
    var nachname = form.querySelector('[name="nachname"]').value.trim();
    var email = form.querySelector('[name="email"]').value.trim();
    var interesse = form.querySelector('[name="interesse"]').value;
    var nachricht = form.querySelector('[name="nachricht"]').value.trim();

    if (!vorname || !nachname || !email) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '...';
    }

    var personData = {
      name: vorname + ' ' + nachname,
      email: [{ value: email, primary: true, label: 'work' }]
    };

    fetch(BASE + '/persons?api_token=' + API_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(personData)
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.success) throw new Error('Person creation failed');

        var personId = res.data.id;
        var title = 'Anfrage: ' + vorname + ' ' + nachname;
        if (interesse && INTERESSE_LABELS[interesse]) {
          title += ' — ' + INTERESSE_LABELS[interesse];
        }

        var note = '';
        if (interesse) note += 'Interesse: ' + (INTERESSE_LABELS[interesse] || interesse) + '\n';
        if (nachricht) note += 'Nachricht: ' + nachricht;

        var leadData = {
          title: title,
          person_id: personId
        };

        var promises = [
          fetch(BASE + '/leads?api_token=' + API_TOKEN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(leadData)
          })
        ];

        if (note) {
          promises.push(
            fetch(BASE + '/notes?api_token=' + API_TOKEN, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: note, person_id: personId })
            })
          );
        }

        return Promise.all(promises);
      })
      .then(function () {
        showResult(true);
        form.reset();
      })
      .catch(function () {
        showResult(false);
      });
  });

  function showResult(success) {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }

    var existing = form.querySelector('.form-result');
    if (existing) existing.remove();

    var msg = document.createElement('div');
    msg.className = 'form-result';
    msg.style.cssText = 'margin-top:16px;padding:14px 18px;border-radius:10px;font-size:14px;font-weight:500;';

    if (success) {
      msg.style.background = 'var(--green-soft, #e6f5ec)';
      msg.style.color = 'var(--green, #00A86B)';
      msg.textContent = document.documentElement.lang === 'en'
        ? 'Thank you! We will get back to you within 24 hours.'
        : document.documentElement.lang === 'sq'
          ? 'Faleminderit! Do t\'ju kontaktojm\u00eb brenda 24 or\u00ebve.'
          : 'Vielen Dank! Wir melden uns innerhalb von 24 Stunden.';
    } else {
      msg.style.background = '#fef2f2';
      msg.style.color = '#dc2626';
      msg.textContent = document.documentElement.lang === 'en'
        ? 'Something went wrong. Please try again or email us directly.'
        : document.documentElement.lang === 'sq'
          ? 'Di\u00e7ka shkoi keq. Ju lutemi provoni p\u00ebs\u00ebri ose na shkruani direkt.'
          : 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut oder schreiben Sie uns direkt.';
    }

    form.appendChild(msg);
    setTimeout(function () { if (msg.parentNode) msg.remove(); }, 8000);
  }
})();
