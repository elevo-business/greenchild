(function () {
  var ENDPOINT = '/api/lead.php';

  var form = document.querySelector('form[action*="web3forms"]');
  if (!form) return;

  var submitBtn = form.querySelector('button[type="submit"]');
  var originalText = submitBtn ? submitBtn.textContent : '';

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var bot = form.querySelector('[name="botcheck"]');
    if (bot && bot.checked) return;

    var vorname = form.querySelector('[name="vorname"]').value.trim();
    var nachname = form.querySelector('[name="nachname"]').value.trim();
    var email = form.querySelector('[name="email"]').value.trim();
    var interesseEl = form.querySelector('[name="interesse"]');
    var nachrichtEl = form.querySelector('[name="nachricht"]');
    var interesse = interesseEl ? interesseEl.value : '';
    var nachricht = nachrichtEl ? nachrichtEl.value.trim() : '';

    if (!vorname || !nachname || !email) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '...';
    }

    function cookie(name) {
      var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
      return m ? m.pop() : '';
    }
    var eventId = 'lead.' + Date.now() + '.' + Math.random().toString(36).slice(2, 10);

    var payload = {
      source: 'kontakt',
      vorname: vorname, nachname: nachname, email: email,
      interesse: interesse, nachricht: nachricht, botcheck: '',
      event_id: eventId, event_source_url: location.href,
      fbp: cookie('_fbp'), fbc: cookie('_fbc'),
      // Serverseitige Meta-Meldung (CAPI) nur mit Marketing-Einwilligung:
      meta_consent: !!(window.gcConsent && window.gcConsent.marketing)
    };

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.success) throw new Error('lead');
        if (window.gcTrack) window.gcTrack('Lead', { source: 'kontakt', interesse: interesse, value: 0, eventID: eventId });
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
          ? 'Faleminderit! Do t\'ju kontaktojmë brenda 24 orëve.'
          : 'Vielen Dank! Wir melden uns innerhalb von 24 Stunden.';
    } else {
      msg.style.background = '#fef2f2';
      msg.style.color = '#dc2626';
      msg.textContent = document.documentElement.lang === 'en'
        ? 'Something went wrong. Please try again or email us directly.'
        : document.documentElement.lang === 'sq'
          ? 'Diçka shkoi keq. Ju lutemi provoni pësëri ose na shkruani direkt.'
          : 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut oder schreiben Sie uns direkt.';
    }

    form.appendChild(msg);
    setTimeout(function () { if (msg.parentNode) msg.remove(); }, 8000);
  }
})();
