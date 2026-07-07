(function () {
  'use strict';

  var API = '/api/dialer.php';
  var PC_KEY = 'gc_dialer_pc';
  var AA_KEY = 'gc_dialer_autoadvance';
  var AUTO_DIAL_SECONDS = 6; // Countdown, bevor der nächste Lead automatisch gewählt wird

  var state = {
    passcode: '',
    queue: [],
    idx: 0,
    calling: false,
    countdownTimer: null
  };

  // ---- DOM helper ----
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var toastTimer = null;
  function toast(msg, isErr) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 3200);
  }

  // ---- API ----
  function api(action, extra) {
    var body = Object.assign({ action: action, passcode: state.passcode }, extra || {});
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, json: j }; });
    });
  }

  // ---- Login ----
  function doLogin(code) {
    $('loginErr').style.display = 'none';
    state.passcode = code;
    api('login').then(function (res) {
      if (res.json && res.json.ok) {
        try { sessionStorage.setItem(PC_KEY, code); } catch (e) {}
        if (!res.json.sipgate_configured) {
          toast('Achtung: sipgate ist noch nicht konfiguriert – Anrufe schlagen fehl.', true);
        }
        $('login').classList.add('hidden');
        $('app').classList.remove('hidden');
        loadQueue();
      } else {
        state.passcode = '';
        $('loginErr').style.display = 'block';
      }
    }).catch(function () {
      state.passcode = '';
      $('loginErr').style.display = 'block';
    });
  }

  function logout() {
    try { sessionStorage.removeItem(PC_KEY); } catch (e) {}
    state.passcode = '';
    state.queue = [];
    $('app').classList.add('hidden');
    $('login').classList.remove('hidden');
    $('pc').value = '';
  }

  // ---- Queue ----
  function loadQueue() {
    api('queue').then(function (res) {
      if (!res.json || !res.json.ok) {
        toast((res.json && res.json.error) || 'Fehler beim Laden.', true);
        return;
      }
      state.queue = res.json.queue || [];
      state.idx = 0;
      var c = res.json.counts || { new: 0, not_reached: 0 };
      $('cNew').textContent = 'Neu ' + c.new;
      $('cNr').textContent = 'Nicht erreicht ' + c.not_reached;
      renderQueue();
      renderCurrent();
    }).catch(function () { toast('Netzwerkfehler.', true); });
  }

  function current() { return state.queue[state.idx] || null; }

  function renderQueue() {
    var list = $('queueList');
    list.innerHTML = '';
    $('qCount').textContent = state.queue.length;
    if (!state.queue.length) {
      list.appendChild(el('div', 'empty', 'Leer 🎉'));
      return;
    }
    state.queue.forEach(function (lead, i) {
      var item = el('div', 'q-item' + (i === state.idx ? ' active' : ''));
      item.appendChild(el('span', 'q-name', esc(lead.person || lead.title || 'Lead #' + lead.lead_id)));
      item.appendChild(el('span', 'q-phone', esc(lead.phone || 'keine Nummer')));
      var tagLabel = lead.state === 'new' ? 'Neu' : 'Nicht erreicht';
      item.appendChild(el('span', 'q-tag ' + lead.state, tagLabel));
      item.addEventListener('click', function () {
        cancelCountdown();
        state.idx = i;
        state.calling = false;
        renderQueue();
        renderCurrent();
      });
      list.appendChild(item);
    });
  }

  // ---- Current lead card ----
  function renderCurrent() {
    var card = $('mainCard');
    var lead = current();
    card.innerHTML = '';

    if (!lead) {
      var done = el('div', 'empty');
      done.appendChild(el('div', 'big', '✅'));
      done.appendChild(el('div', null, '<strong>Warteschlange abgearbeitet.</strong>'));
      done.appendChild(el('div', null, '<span style="color:var(--muted)">Neu laden, um weitere Leads zu holen.</span>'));
      var rb = el('button', 'btn primary', 'Warteschlange neu laden');
      rb.style.marginTop = '18px';
      rb.addEventListener('click', loadQueue);
      done.appendChild(rb);
      card.appendChild(done);
      return;
    }

    var badge = el('span', 'lead-badge ' + lead.state, lead.state === 'new' ? 'Neuer Lead' : 'Nicht erreicht');
    card.appendChild(badge);
    card.appendChild(el('div', 'lead-name', esc(lead.person || 'Unbekannt')));
    card.appendChild(el('div', 'lead-title', esc(lead.title || '')));

    var hasPhone = lead.phone_e164 && lead.phone_e164.length > 3;
    if (hasPhone) {
      card.appendChild(el('div', 'lead-phone', esc(lead.phone)));
    } else {
      card.appendChild(el('div', 'lead-phone none', '⚠ Keine Telefonnummer hinterlegt'));
    }
    var meta = [];
    if (lead.value) meta.push('Wert: ' + esc(lead.value));
    if (lead.phone_e164 && lead.phone_e164 !== lead.phone) meta.push('Wählt: ' + esc(lead.phone_e164));
    if (meta.length) card.appendChild(el('div', 'lead-meta', meta.join(' · ')));

    if (state.calling) {
      renderCallingState(card, lead);
    } else {
      var callBtn = el('button', 'call-btn', '📞 Anrufen');
      callBtn.disabled = !hasPhone;
      callBtn.addEventListener('click', function () { startCall(lead); });
      card.appendChild(callBtn);

      var row = el('div', null);
      row.style.cssText = 'display:flex;gap:10px;margin-top:10px';
      var skip = el('button', 'btn ghost', 'Überspringen →');
      skip.style.flex = '1';
      skip.addEventListener('click', function () { advance(true); });
      row.appendChild(skip);
      if (!hasPhone) {
        var wrong = el('button', 'btn d-danger', 'Falsche Nummer');
        wrong.style.flex = '1';
        wrong.addEventListener('click', function () { sendDisposition('wrong_number', ''); });
        row.appendChild(wrong);
      }
      card.appendChild(row);
    }
  }

  function renderCallingState(card, lead) {
    var box = el('div', 'calling-state');
    box.appendChild(el('div', 'pulse', '📞'));
    box.appendChild(el('p', null, '<strong>Dein Telefon klingelt …</strong>'));
    box.appendChild(el('p', 'sub', 'Abnehmen – sipgate verbindet dann automatisch mit ' + esc(lead.person || 'dem Lead') + '.'));
    card.appendChild(box);

    card.appendChild(el('div', 'dispo-title', 'Ergebnis festhalten'));
    var grid = el('div', 'dispo-grid');

    grid.appendChild(dispoBtn('✓ Erreicht', 'btn d-reached', function () { sendDisposition('reached', getNote()); }));
    grid.appendChild(dispoBtn('✗ Nicht erreicht', 'btn d-nr', function () { sendDisposition('not_reached', getNote()); }));
    grid.appendChild(dispoBtn('↩ Rückruf', 'btn d-cb', function () { toggleCallback(); }));
    grid.appendChild(dispoBtn('⌀ Falsche Nummer', 'btn d-danger', function () { sendDisposition('wrong_number', getNote()); }));
    var dnc = dispoBtn('🚫 Nicht kontaktieren', 'btn d-danger full', function () { sendDisposition('do_not_call', getNote()); });
    grid.appendChild(dnc);
    card.appendChild(grid);

    // Callback datetime row
    var cbRow = el('div', 'callback-row');
    cbRow.id = 'cbRow';
    var cbInput = el('input', null);
    cbInput.type = 'datetime-local';
    cbInput.id = 'cbAt';
    cbRow.appendChild(cbInput);
    var cbConfirm = el('button', 'btn d-cb', 'Rückruf speichern');
    cbConfirm.addEventListener('click', function () {
      var v = $('cbAt').value;
      if (!v) { toast('Bitte Termin wählen.', true); return; }
      sendDisposition('callback', getNote(), v.replace('T', ' '));
    });
    cbRow.appendChild(cbConfirm);
    card.appendChild(cbRow);

    var note = el('textarea', 'note-field');
    note.id = 'noteField';
    note.placeholder = 'Notiz (optional) – wird an den Lead in Pipedrive gehängt';
    card.appendChild(note);

    var cancel = el('button', 'btn ghost', 'Anruf abbrechen / zurück');
    cancel.style.cssText = 'width:100%;margin-top:10px';
    cancel.addEventListener('click', function () {
      state.calling = false;
      renderCurrent();
    });
    card.appendChild(cancel);
  }

  function dispoBtn(label, cls, onClick) {
    var b = el('button', cls, label);
    b.addEventListener('click', onClick);
    return b;
  }
  function getNote() {
    var n = $('noteField');
    return n ? n.value.trim() : '';
  }
  function toggleCallback() {
    var row = $('cbRow');
    if (row) row.classList.toggle('show');
  }

  // ---- Call flow ----
  function startCall(lead) {
    if (!lead || state.calling) return;
    state.calling = true;
    renderCurrent();
    api('call', { lead_id: lead.lead_id, phone: lead.phone, person_id: lead.person_id })
      .then(function (res) {
        if (res.json && res.json.ok) {
          toast('Anruf gestartet – dein Telefon klingelt.');
        } else {
          state.calling = false;
          renderCurrent();
          toast((res.json && res.json.error) || 'Anruf fehlgeschlagen.', true);
        }
      }).catch(function () {
        state.calling = false;
        renderCurrent();
        toast('Netzwerkfehler beim Anruf.', true);
      });
  }

  function sendDisposition(result, note, callbackAt) {
    var lead = current();
    if (!lead) return;
    api('disposition', {
      lead_id: lead.lead_id,
      person_id: lead.person_id,
      result: result,
      note: note || '',
      callback_at: callbackAt || ''
    }).then(function (res) {
      if (res.json && res.json.ok) {
        var labels = {
          reached: 'Erreicht', not_reached: 'Nicht erreicht', callback: 'Rückruf',
          wrong_number: 'Falsche Nummer', do_not_call: 'Nicht kontaktieren'
        };
        toast('Gespeichert: ' + (labels[result] || result));
        removeCurrentAndAdvance();
      } else {
        toast((res.json && res.json.error) || 'Speichern fehlgeschlagen.', true);
      }
    }).catch(function () { toast('Netzwerkfehler.', true); });
  }

  function removeCurrentAndAdvance() {
    state.calling = false;
    state.queue.splice(state.idx, 1);
    if (state.idx >= state.queue.length) state.idx = state.queue.length; // may point past end → done screen
    renderQueue();
    if (autoAdvanceOn() && current()) {
      startCountdown();
    } else {
      renderCurrent();
    }
  }

  function advance(skip) {
    cancelCountdown();
    state.calling = false;
    if (skip) {
      state.idx++;
    }
    if (state.idx >= state.queue.length) state.idx = state.queue.length;
    renderQueue();
    renderCurrent();
  }

  // ---- Auto-advance countdown ----
  function autoAdvanceOn() { return $('autoAdvance').checked; }

  function startCountdown() {
    var lead = current();
    if (!lead) { renderCurrent(); return; }
    renderCurrent();
    var hasPhone = lead.phone_e164 && lead.phone_e164.length > 3;
    if (!hasPhone) { return; } // ohne Nummer nicht automatisch wählen

    var card = $('mainCard');
    var cd = el('div', 'countdown');
    card.appendChild(cd);
    var left = AUTO_DIAL_SECONDS;
    function tick() {
      cd.innerHTML = 'Nächster Anruf in <b>' + left + 's</b> · <span style="cursor:pointer;text-decoration:underline">Stopp</span>';
      cd.querySelector('span').addEventListener('click', cancelCountdown);
      if (left <= 0) {
        cancelCountdown();
        startCall(current());
        return;
      }
      left--;
    }
    tick();
    state.countdownTimer = setInterval(tick, 1000);
  }

  function cancelCountdown() {
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
      renderCurrent();
    }
  }

  // ---- Wiring ----
  $('loginBtn').addEventListener('click', function () { doLogin($('pc').value.trim()); });
  $('pc').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin($('pc').value.trim()); });
  $('logoutBtn').addEventListener('click', logout);
  $('refreshBtn').addEventListener('click', function () { cancelCountdown(); loadQueue(); });
  $('autoAdvance').addEventListener('change', function () {
    try { sessionStorage.setItem(AA_KEY, this.checked ? '1' : '0'); } catch (e) {}
  });

  // Restore auto-advance pref + session
  try {
    var aa = sessionStorage.getItem(AA_KEY);
    if (aa === '0') $('autoAdvance').checked = false;
    var saved = sessionStorage.getItem(PC_KEY);
    if (saved) doLogin(saved);
  } catch (e) {}
})();
