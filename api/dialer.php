<?php
/**
 * Power-Dialer-Backend (Pipedrive ↔ sipgate).
 *
 * Warum serverseitig: Weder der Pipedrive-API-Token noch die sipgate-
 * Zugangsdaten dürfen im öffentlichen JS stehen. Dieses PHP nimmt die
 * Requests der Dialer-Konsole entgegen, ruft Pipedrive + sipgate serverseitig
 * auf und gibt nur das Nötige an den Browser zurück.
 *
 * Läuft auf dem All-Inkl-Webspace (PHP) unter /api/dialer.php, same-origin zur
 * Konsole unter /dialer/ – daher kein CORS nötig.
 *
 * sipgate macht KEINE autonome Roboter-Wahl. Die API (POST /v2/sessions/calls)
 * ist Click-to-Dial: sie klingelt zuerst das Telefon des Agenten (deviceId) und
 * verbindet dann automatisch mit dem Lead. Die Konsole reiht Leads auf und wählt
 * einen nach dem anderen an ("Power-Dialer").
 *
 * ── Konfiguration (Reihenfolge: ENV → Secret-Datei OBERHALB des Webroots → Fallback) ──
 *   PIPEDRIVE_API_TOKEN     Pipedrive Personal API Token (wie in lead.php)
 *   SIPGATE_TOKEN_ID        sipgate Personal-Access-Token: Token-ID (Format "tok-xxxx")
 *   SIPGATE_TOKEN           sipgate Personal-Access-Token: Secret
 *                           (Alternativ Datei sipgate-token.txt mit "TOKEN_ID:TOKEN")
 *   SIPGATE_DEVICE_ID       Gerät, das beim Agenten klingelt (Default "e0" = 1. Gerät)
 *   SIPGATE_CALLER_ID       Optional: nach außen angezeigte Rufnummer (E.164, z.B. +49…)
 *   DIALER_PASSCODE         Zugangscode für die Konsole (Pflicht!)
 *                           (Alternativ Datei dialer-passcode.txt)
 *   DIALER_LABEL_NEU / _NICHT_ERREICHT / _ERREICHT / _RUECKRUF
 *                           Namen der Pipedrive-Lead-Labels (Defaults s.u.)
 *   DIALER_RETRY_COOLDOWN_H Stunden Sperre, bevor "Nicht erreicht" erneut dran ist (Default 0)
 *   DIALER_QUEUE_MAX        Max. Leads in der Warteschlange (Default 75)
 */

@ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function out($ok, $data = array()) {
  http_response_code($ok ? 200 : 400);
  echo json_encode(array_merge(array('ok' => $ok), $data));
  exit;
}
function fail($msg, $code = 400) {
  http_response_code($code);
  echo json_encode(array('ok' => false, 'error' => $msg));
  exit;
}

/** Secret-Datei bevorzugt OBERHALB des Webroots lesen (nie per URL erreichbar). */
function read_secret_file($filename) {
  $paths = array(__DIR__ . '/../../' . $filename, __DIR__ . '/../' . $filename);
  foreach ($paths as $p) {
    if (@is_readable($p)) { return trim(@file_get_contents($p)); }
  }
  return '';
}
function cfg($env, $fallback = '') {
  $v = getenv($env);
  return ($v !== false && $v !== '') ? $v : $fallback;
}

// ---- Konfiguration laden ----
$PD_TOKEN = cfg('PIPEDRIVE_API_TOKEN');
if ($PD_TOKEN === '') { $PD_TOKEN = read_secret_file('pipedrive-token.txt'); }
if ($PD_TOKEN === '') { $PD_TOKEN = '9fae1a7473002abdf89ade65319dc14a1c828a28'; } // Fallback wie lead.php
$PD_BASE = 'https://api.pipedrive.com/v1';

$SG_TOKEN_ID = cfg('SIPGATE_TOKEN_ID');
$SG_TOKEN    = cfg('SIPGATE_TOKEN');
if ($SG_TOKEN_ID === '' || $SG_TOKEN === '') {
  $line = read_secret_file('sipgate-token.txt'); // Format "TOKEN_ID:TOKEN"
  if ($line !== '' && strpos($line, ':') !== false) {
    list($fid, $ftok) = explode(':', $line, 2);
    if ($SG_TOKEN_ID === '') { $SG_TOKEN_ID = trim($fid); }
    if ($SG_TOKEN === '')    { $SG_TOKEN    = trim($ftok); }
  }
}
$SG_DEVICE    = cfg('SIPGATE_DEVICE_ID', 'e0');
$SG_CALLER_ID = cfg('SIPGATE_CALLER_ID');

$PASSCODE = cfg('DIALER_PASSCODE');
if ($PASSCODE === '') { $PASSCODE = read_secret_file('dialer-passcode.txt'); }

$LABELS = array(
  'new'         => cfg('DIALER_LABEL_NEU',            'Neu'),
  'not_reached' => cfg('DIALER_LABEL_NICHT_ERREICHT', 'Nicht erreicht'),
  'reached'     => cfg('DIALER_LABEL_ERREICHT',       'Erreicht'),
  'callback'    => cfg('DIALER_LABEL_RUECKRUF',       'Rückruf vereinbart'),
);
$LABEL_COLORS = array('new' => 'blue', 'not_reached' => 'yellow', 'reached' => 'green', 'callback' => 'purple');

$COOLDOWN_H = (int) cfg('DIALER_RETRY_COOLDOWN_H', '0');
$QUEUE_MAX  = max(1, (int) cfg('DIALER_QUEUE_MAX', '75'));

// ---- HTTP-Helfer ----
function http_json($method, $url, $headers, $body) {
  $payload = ($body === null) ? null : json_encode($body);
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    $h = array('Content-Type: application/json', 'Accept: application/json');
    $h = array_merge($h, $headers);
    curl_setopt_array($ch, array(
      CURLOPT_CUSTOMREQUEST => $method,
      CURLOPT_HTTPHEADER => $h,
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 20,
    ));
    if ($payload !== null) { curl_setopt($ch, CURLOPT_POSTFIELDS, $payload); }
    $res = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return array('status' => $status, 'json' => json_decode($res, true), 'raw' => $res);
  }
  $opts = array('http' => array(
    'method' => $method,
    'header' => "Content-Type: application/json\r\nAccept: application/json\r\n" . implode("\r\n", $headers) . "\r\n",
    'timeout' => 20,
    'ignore_errors' => true,
  ));
  if ($payload !== null) { $opts['http']['content'] = $payload; }
  $res = @file_get_contents($url, false, stream_context_create($opts));
  $status = 0;
  if (isset($http_response_header[0]) && preg_match('~\s(\d{3})\s~', $http_response_header[0], $m)) { $status = (int) $m[1]; }
  return array('status' => $status, 'json' => json_decode($res, true), 'raw' => $res);
}

function pd_get($base, $token, $path) {
  $sep = (strpos($path, '?') !== false) ? '&' : '?';
  return http_json('GET', $base . $path . $sep . 'api_token=' . urlencode($token), array(), null);
}
function pd_send($method, $base, $token, $path, $body) {
  $sep = (strpos($path, '?') !== false) ? '&' : '?';
  return http_json($method, $base . $path . $sep . 'api_token=' . urlencode($token), array(), $body);
}
function sg_post($tokenId, $token, $path, $body) {
  $auth = 'Authorization: Basic ' . base64_encode($tokenId . ':' . $token);
  return http_json('POST', 'https://api.sipgate.com/v2' . $path, array($auth), $body);
}

/** Rufnummer grob nach E.164 normalisieren (Default-Land DE = +49). */
function to_e164($raw) {
  $d = preg_replace('/[^\d+]/', '', (string) $raw);
  if ($d === '') { return ''; }
  if ($d[0] === '+') { return $d; }
  if (strpos($d, '00') === 0) { return '+' . substr($d, 2); }
  if ($d[0] === '0') { return '+49' . substr($d, 1); }
  return '+' . $d;
}

/**
 * Lead-Labels aus Pipedrive holen und Name→ID auflösen. Fehlende Labels
 * werden EINMALIG automatisch angelegt (Zero-Touch-Setup). Ergebnis wird
 * innerhalb des Requests gecacht.
 */
function resolve_labels($base, $token, $labels, $colors, $createMissing) {
  static $cache = null;
  if ($cache !== null) { return $cache; }
  $res = pd_get($base, $token, '/leadLabels');
  $existing = array();
  if (!empty($res['json']['data'])) {
    foreach ($res['json']['data'] as $l) {
      $existing[mb_strtolower(trim($l['name']))] = $l['id'];
    }
  }
  $map = array();
  foreach ($labels as $key => $name) {
    $norm = mb_strtolower(trim($name));
    if (isset($existing[$norm])) {
      $map[$key] = $existing[$norm];
    } elseif ($createMissing) {
      $color = isset($colors[$key]) ? $colors[$key] : 'gray';
      $cr = pd_send('POST', $base, $token, '/leadLabels', array('name' => $name, 'color' => $color));
      if (!empty($cr['json']['data']['id'])) {
        $map[$key] = $cr['json']['data']['id'];
        $existing[$norm] = $map[$key];
      } else {
        $map[$key] = null;
      }
    } else {
      $map[$key] = null;
    }
  }
  $cache = $map;
  return $map;
}

// ================= Request-Routing =================
$raw = file_get_contents('php://input');
$in = json_decode($raw, true);
if (!is_array($in)) { $in = $_POST; }
$action = isset($in['action']) ? $in['action'] : (isset($_GET['action']) ? $_GET['action'] : '');

// ---- Zugangsschutz: jeder Request braucht den Passcode ----
if ($PASSCODE === '') {
  fail('Dialer nicht konfiguriert: DIALER_PASSCODE fehlt (ENV oder dialer-passcode.txt).', 503);
}
$given = isset($in['passcode']) ? (string) $in['passcode'] : '';
if (!hash_equals($PASSCODE, $given)) {
  fail('Zugang verweigert (falscher Passcode).', 401);
}

// ---- login: Passcode prüfen + Basis-Konfig zurückgeben ----
if ($action === 'login') {
  out(true, array(
    'labels'      => array_keys($LABELS),
    'label_names' => $LABELS,
    'device'      => $SG_DEVICE,
    'sipgate_configured' => ($SG_TOKEN_ID !== '' && $SG_TOKEN !== ''),
  ));
}

// ---- selftest: Konfiguration + Verbindungen prüfen (keine Secrets im Output) ----
if ($action === 'selftest') {
  $pd = pd_get($PD_BASE, $PD_TOKEN, '/users/me');
  $pdOk = !empty($pd['json']['success']);
  $labelMap = $pdOk ? resolve_labels($PD_BASE, $PD_TOKEN, $LABELS, $LABEL_COLORS, false) : array();
  $sgOk = null; $sgErr = '';
  if ($SG_TOKEN_ID !== '' && $SG_TOKEN !== '') {
    // Auth ohne Nebenwirkung prüfen: GET /authorization/userinfo
    $auth = 'Authorization: Basic ' . base64_encode($SG_TOKEN_ID . ':' . $SG_TOKEN);
    $sg = http_json('GET', 'https://api.sipgate.com/v2/authorization/userinfo', array($auth), null);
    $sgOk = ($sg['status'] === 200);
    if (!$sgOk) { $sgErr = 'HTTP ' . $sg['status']; }
  }
  out(true, array(
    'pipedrive_token'      => ($PD_TOKEN === '9fae1a7473002abdf89ade65319dc14a1c828a28') ? 'fallback' : 'datei_oder_env',
    'pipedrive_valid'      => $pdOk,
    'labels_resolved'      => $labelMap,
    'sipgate_configured'   => ($SG_TOKEN_ID !== '' && $SG_TOKEN !== ''),
    'sipgate_valid'        => $sgOk,
    'sipgate_error'        => $sgErr,
    'sipgate_device'       => $SG_DEVICE,
    'sipgate_caller_id_set'=> ($SG_CALLER_ID !== ''),
    'curl'                 => function_exists('curl_init'),
  ));
}

// ---- queue: offene Leads (neu + nicht erreicht) als Warteschlange ----
if ($action === 'queue') {
  $map = resolve_labels($PD_BASE, $PD_TOKEN, $LABELS, $LABEL_COLORS, true);
  $wanted = array();
  if ($map['new'])         { $wanted[$map['new']]         = 'new'; }
  if ($map['not_reached']) { $wanted[$map['not_reached']] = 'not_reached'; }
  if (!$wanted) { out(true, array('queue' => array(), 'counts' => array('new' => 0, 'not_reached' => 0), 'note' => 'Keine passenden Lead-Labels gefunden/anlegbar.')); }

  $res = pd_get($PD_BASE, $PD_TOKEN, '/leads?archived_status=not_archived&limit=500');
  $leads = !empty($res['json']['data']) ? $res['json']['data'] : array();

  $now = time();
  $cooldown = $GLOBALS['COOLDOWN_H'] * 3600;
  $picked = array();
  $countNew = 0; $countNR = 0;
  foreach ($leads as $ld) {
    $lblIds = isset($ld['label_ids']) && is_array($ld['label_ids']) ? $ld['label_ids'] : array();
    $state = null;
    foreach ($lblIds as $lid) {
      if (isset($wanted[$lid])) { $state = $wanted[$lid]; break; }
    }
    if ($state === null) { continue; }
    if ($state === 'new') { $countNew++; } else { $countNR++; }

    // Cooldown nur für Wiedervorlagen (nicht erreicht): update_time als Näherung
    if ($state === 'not_reached' && $cooldown > 0) {
      $ut = isset($ld['update_time']) ? strtotime($ld['update_time'] . ' UTC') : 0;
      if ($ut && ($now - $ut) < $cooldown) { continue; }
    }
    $picked[] = array('lead' => $ld, 'state' => $state);
  }

  // Sortierung: neue Leads zuerst (Speed-to-Lead, neueste oben),
  // danach "nicht erreicht" (am längsten nicht angefasst zuerst).
  usort($picked, function ($a, $b) {
    $pa = ($a['state'] === 'new') ? 0 : 1;
    $pb = ($b['state'] === 'new') ? 0 : 1;
    if ($pa !== $pb) { return $pa - $pb; }
    if ($pa === 0) { // new: add_time desc
      return strcmp((string)$b['lead']['add_time'], (string)$a['lead']['add_time']);
    }
    return strcmp((string)$a['lead']['update_time'], (string)$b['lead']['update_time']); // nr: update_time asc
  });

  $picked = array_slice($picked, 0, $GLOBALS['QUEUE_MAX']);

  // Telefonnummern der Personen nachladen (nur für die gekappte Menge)
  $personCache = array();
  $queue = array();
  foreach ($picked as $p) {
    $ld = $p['lead'];
    $pid = isset($ld['person_id']) ? $ld['person_id'] : null;
    if (is_array($pid)) { $pid = isset($pid['value']) ? $pid['value'] : null; }
    $phone = ''; $pname = '';
    if ($pid) {
      if (!isset($personCache[$pid])) {
        $pr = pd_get($PD_BASE, $PD_TOKEN, '/persons/' . intval($pid));
        $personCache[$pid] = !empty($pr['json']['data']) ? $pr['json']['data'] : array();
      }
      $person = $personCache[$pid];
      $pname = isset($person['name']) ? $person['name'] : '';
      if (!empty($person['phone']) && is_array($person['phone'])) {
        foreach ($person['phone'] as $ph) {
          if (!empty($ph['value'])) { $phone = $ph['value']; if (!empty($ph['primary'])) break; }
        }
      }
    }
    $val = '';
    if (!empty($ld['value']['amount'])) { $val = $ld['value']['amount'] . ' ' . (isset($ld['value']['currency']) ? $ld['value']['currency'] : ''); }
    $queue[] = array(
      'lead_id'    => $ld['id'],
      'title'      => isset($ld['title']) ? $ld['title'] : '',
      'person_id'  => $pid,
      'person'     => $pname,
      'phone'      => $phone,
      'phone_e164' => to_e164($phone),
      'state'      => $p['state'],
      'value'      => $val,
      'add_time'   => isset($ld['add_time']) ? $ld['add_time'] : '',
    );
  }
  out(true, array('queue' => $queue, 'counts' => array('new' => $countNew, 'not_reached' => $countNR)));
}

// ---- call: sipgate Click-to-Dial anstoßen ----
if ($action === 'call') {
  if ($SG_TOKEN_ID === '' || $SG_TOKEN === '') { fail('sipgate nicht konfiguriert (SIPGATE_TOKEN_ID/SIPGATE_TOKEN).', 503); }
  $callee = to_e164(isset($in['phone']) ? $in['phone'] : '');
  if ($callee === '') { fail('Keine Telefonnummer.'); }
  $body = array('deviceId' => $SG_DEVICE, 'caller' => $SG_DEVICE, 'callee' => $callee);
  if ($SG_CALLER_ID !== '') { $body['callerId'] = to_e164($SG_CALLER_ID); }
  $r = sg_post($SG_TOKEN_ID, $SG_TOKEN, '/sessions/calls', $body);
  if ($r['status'] === 200 || $r['status'] === 201) {
    $sid = isset($r['json']['sessionId']) ? $r['json']['sessionId'] : '';
    out(true, array('session_id' => $sid, 'callee' => $callee));
  }
  $msg = isset($r['json']['message']) ? $r['json']['message'] : ('HTTP ' . $r['status']);
  fail('sipgate-Fehler: ' . $msg, 502);
}

// ---- disposition: Ergebnis zurück nach Pipedrive schreiben ----
if ($action === 'disposition') {
  $leadId = isset($in['lead_id']) ? (string) $in['lead_id'] : '';
  $personId = isset($in['person_id']) ? intval($in['person_id']) : 0;
  $result = isset($in['result']) ? $in['result'] : '';
  $note = isset($in['note']) ? trim((string) $in['note']) : '';
  $callbackAt = isset($in['callback_at']) ? trim((string) $in['callback_at']) : ''; // "YYYY-MM-DD HH:MM"
  if ($leadId === '') { fail('lead_id fehlt.'); }

  $map = resolve_labels($PD_BASE, $PD_TOKEN, $LABELS, $LABEL_COLORS, true);

  $subjectMap = array(
    'reached'      => '☎ Erreicht (Power-Dialer)',
    'not_reached'  => '☎ Nicht erreicht (Power-Dialer)',
    'callback'     => '☎ Rückruf vereinbart (Power-Dialer)',
    'wrong_number' => '☎ Falsche Nummer (Power-Dialer)',
    'do_not_call'  => '☎ Nicht kontaktieren (Power-Dialer)',
  );
  if (!isset($subjectMap[$result])) { fail('Unbekanntes Ergebnis.'); }

  // 1) Lead-Label / Archiv-Status setzen (Zustände schließen sich aus → label_ids ersetzen)
  $patch = array();
  if ($result === 'reached' && $map['reached']) { $patch['label_ids'] = array($map['reached']); }
  elseif ($result === 'not_reached' && $map['not_reached']) { $patch['label_ids'] = array($map['not_reached']); }
  elseif ($result === 'callback' && $map['callback']) { $patch['label_ids'] = array($map['callback']); }
  elseif ($result === 'wrong_number' || $result === 'do_not_call') { $patch['is_archived'] = true; }
  if ($patch) { pd_send('PATCH', $PD_BASE, $PD_TOKEN, '/leads/' . rawurlencode($leadId), $patch); }

  // 2) Anruf-Aktivität protokollieren (erledigt)
  $activity = array(
    'subject'  => $subjectMap[$result],
    'type'     => 'call',
    'done'     => true,
    'lead_id'  => $leadId,
  );
  if ($personId) { $activity['participants'] = array(array('person_id' => $personId, 'primary_flag' => true)); }
  if ($result === 'callback' && $callbackAt !== '') {
    $ts = strtotime($callbackAt);
    if ($ts) {
      // Offene Folge-Aktivität für den Rückruf anlegen
      pd_send('POST', $PD_BASE, $PD_TOKEN, '/activities', array(
        'subject'  => 'Rückruf: ' . ($note !== '' ? $note : 'vereinbart'),
        'type'     => 'call',
        'due_date' => date('Y-m-d', $ts),
        'due_time' => date('H:i', $ts),
        'done'     => false,
        'lead_id'  => $leadId,
        'participants' => $personId ? array(array('person_id' => $personId, 'primary_flag' => true)) : array(),
      ));
    }
  }
  if ($note !== '') { $activity['note'] = $note; }
  pd_send('POST', $PD_BASE, $PD_TOKEN, '/activities', $activity);

  // 3) Optional Notiz an den Lead hängen (sichtbar im Lead-Verlauf)
  if ($note !== '') {
    pd_send('POST', $PD_BASE, $PD_TOKEN, '/notes', array('content' => 'Power-Dialer: ' . $note, 'lead_id' => $leadId));
  }

  out(true, array());
}

fail('Unbekannte Aktion.', 404);
