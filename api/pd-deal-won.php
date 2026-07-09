<?php
/**
 * Pipedrive → Meta Conversions API: "Deal gewonnen" als Purchase melden.
 *
 * Zweck: Den Funnel schließen. Bisher meldet nur api/lead.php ein 'Lead'-Event
 * beim Formular-Submit. Dieser Endpunkt feuert ein serverseitiges 'Purchase'-
 * Event an Meta, sobald in Pipedrive ein Deal auf STATUS = "won" gesetzt wird –
 * mit dem DEAL-WERT als Conversion-Value. Damit optimiert Meta auf echten
 * Umsatz / kaufkräftige Lookalikes statt nur auf Formular-Klicker.
 *
 * Auslöser: Pipedrive-Automation "Deal gewonnen" → Webhook (POST) auf diese URL,
 * bzw. Pipedrive-Webhook auf deal.change. Der Webhook liefert nur die Deal-Daten
 * (inkl. person_id) – E-Mail/Telefon holen wir serverseitig aus Pipedrive und
 * hashen sie (Meta-Pflicht), sodass Meta das Event auf den ursprünglichen
 * Ad-Klick zurückmatchen kann.
 *
 * Schutz: Der Endpunkt akzeptiert nur Requests mit korrektem Secret
 * (?key=…  ODER HTTP-Basic-Passwort). Sonst könnte jeder Fake-Umsätze einschleusen.
 *
 * Konfiguration (ENV → Secret-Datei OBERHALB des Webroots → Fallback):
 *   PIPEDRIVE_API_TOKEN / pipedrive-token.txt   – wie lead.php (Person nachladen)
 *   META_PIXEL_ID / (Fallback unten)            – wie lead.php
 *   META_CAPI_TOKEN / meta-capi-token.txt       – wie lead.php
 *   META_TEST_EVENT_CODE / meta-test-code.txt   – optional, nur zum Testen
 *   PD_WEBHOOK_SECRET / pd-webhook-secret.txt   – PFLICHT: schützt diesen Endpunkt
 */

@ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function out($ok, $data = array(), $code = null) {
  if ($code === null) { $code = $ok ? 200 : 400; }
  http_response_code($code);
  echo json_encode(array_merge(array('ok' => $ok), $data));
  exit;
}
function read_secret_file($filename) {
  $paths = array(__DIR__ . '/../../' . $filename, __DIR__ . '/../' . $filename);
  foreach ($paths as $p) { if (@is_readable($p)) { return trim(@file_get_contents($p)); } }
  return '';
}
function cfg($env, $fallback = '') {
  $v = getenv($env);
  return ($v !== false && $v !== '') ? $v : $fallback;
}

// ---- Konfiguration ----
$PD_TOKEN = cfg('PIPEDRIVE_API_TOKEN');
if ($PD_TOKEN === '') { $PD_TOKEN = read_secret_file('pipedrive-token.txt'); }
if ($PD_TOKEN === '') { $PD_TOKEN = '9fae1a7473002abdf89ade65319dc14a1c828a28'; } // Fallback wie lead.php
$PD_BASE = 'https://api.pipedrive.com/v1';

$META_PIXEL_ID  = cfg('META_PIXEL_ID', '1314610516838484');
$META_CAPI_TOKEN = cfg('META_CAPI_TOKEN');
if ($META_CAPI_TOKEN === '') { $META_CAPI_TOKEN = read_secret_file('meta-capi-token.txt'); }
$META_TEST_CODE = cfg('META_TEST_EVENT_CODE');
if ($META_TEST_CODE === '') { $META_TEST_CODE = read_secret_file('meta-test-code.txt'); }

$SECRET = cfg('PD_WEBHOOK_SECRET');
if ($SECRET === '') { $SECRET = read_secret_file('pd-webhook-secret.txt'); }

// ---- HTTP-Helfer ----
function http_json($method, $url, $headers, $body) {
  $payload = ($body === null) ? null : json_encode($body);
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    $h = array_merge(array('Content-Type: application/json', 'Accept: application/json'), $headers);
    curl_setopt_array($ch, array(
      CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $h,
      CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20,
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
    'timeout' => 20, 'ignore_errors' => true,
  ));
  if ($payload !== null) { $opts['http']['content'] = $payload; }
  $res = @file_get_contents($url, false, stream_context_create($opts));
  return array('status' => 0, 'json' => json_decode($res, true), 'raw' => $res);
}
function pd_get($base, $token, $path) {
  $sep = (strpos($path, '?') !== false) ? '&' : '?';
  return http_json('GET', $base . $path . $sep . 'api_token=' . urlencode($token), array(), null);
}

/** E-Mail hashen (Meta): lowercase + trim + sha256. */
function hash_email($email) {
  $e = strtolower(trim((string) $email));
  return $e !== '' ? hash('sha256', $e) : '';
}
/** Telefon nach E.164-Ziffern (ohne +) normalisieren + sha256 (gleich wie lead.php). */
function hash_phone($tel) {
  $d = preg_replace('/\D+/', '', (string) $tel);
  if ($d === '') { return ''; }
  if (strpos($d, '00') === 0)     { $d = substr($d, 2); }
  elseif (strpos($d, '0') === 0)  { $d = '49' . substr($d, 1); }
  return hash('sha256', $d);
}
function hash_name($n) {
  $x = strtolower(trim((string) $n));
  return $x !== '' ? hash('sha256', $x) : '';
}

// ---- Zugangsschutz ----
if ($SECRET === '') {
  out(false, array('error' => 'Nicht konfiguriert: PD_WEBHOOK_SECRET fehlt (ENV oder pd-webhook-secret.txt).'), 503);
}
$given = isset($_GET['key']) ? (string) $_GET['key'] : '';
if ($given === '' && isset($_SERVER['PHP_AUTH_PW'])) { $given = (string) $_SERVER['PHP_AUTH_PW']; }
if (!hash_equals($SECRET, $given)) {
  out(false, array('error' => 'Zugang verweigert (Secret fehlt/falsch).'), 401);
}

// ---- Selbsttest: GET ?selftest=1&key=SECRET → Konfig-Status, sendet nichts ----
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && isset($_GET['selftest'])) {
  $pd = pd_get($PD_BASE, $PD_TOKEN, '/users/me');
  out(true, array(
    'pipedrive_valid'   => !empty($pd['json']['success']),
    'pixel_id_set'      => $META_PIXEL_ID !== '',
    'capi_token_loaded' => $META_CAPI_TOKEN !== '',
    'test_code_active'  => $META_TEST_CODE !== '',
    'curl'              => function_exists('curl_init'),
  ));
}

// ---- Webhook-Payload lesen ----
$raw = file_get_contents('php://input');
$in = json_decode($raw, true);
if (!is_array($in)) { out(false, array('error' => 'Kein JSON-Body.')); }

// Pipedrive-Webhook liefert die Deal-Daten je nach Version unter data/current.
// (v2.0: {meta, data, previous}; v1: {event, current, previous, meta})
$deal = null;
if (isset($in['data']) && is_array($in['data']))         { $deal = $in['data']; }
elseif (isset($in['current']) && is_array($in['current'])) { $deal = $in['current']; }
elseif (isset($in['id']) || isset($in['status']))         { $deal = $in; } // flacher Payload / manueller Test
if (!$deal) { out(false, array('error' => 'Keine Deal-Daten im Payload.')); }

$prev = isset($in['previous']) && is_array($in['previous']) ? $in['previous'] : array();

// Nur senden, wenn Deal jetzt WON ist und vorher NICHT schon won war (Dubletten vermeiden).
$status = isset($deal['status']) ? $deal['status'] : '';
if ($status !== 'won') {
  out(true, array('skipped' => 'Deal-Status ist nicht "won" (' . $status . ').'));
}
if (isset($prev['status']) && $prev['status'] === 'won') {
  out(true, array('skipped' => 'Deal war bereits "won" – kein erneutes Event.'));
}

// ---- Deal-Werte ----
$dealId   = isset($deal['id']) ? $deal['id'] : (isset($deal['deal_id']) ? $deal['deal_id'] : '');
$value    = isset($deal['value']) ? (float) $deal['value'] : 0.0;
$currency = isset($deal['currency']) && $deal['currency'] ? $deal['currency'] : 'EUR';

// person_id kann int oder Objekt {value:…} sein
$personId = isset($deal['person_id']) ? $deal['person_id'] : null;
if (is_array($personId)) { $personId = isset($personId['value']) ? $personId['value'] : null; }
if (!$personId) {
  out(true, array('skipped' => 'Deal ohne verknüpfte Person – kein Matching möglich.', 'deal_id' => $dealId));
}

// ---- Person nachladen (E-Mail/Telefon/Name) ----
$pr = pd_get($PD_BASE, $PD_TOKEN, '/persons/' . intval($personId));
$person = !empty($pr['json']['data']) ? $pr['json']['data'] : array();

$email = '';
if (!empty($person['email']) && is_array($person['email'])) {
  foreach ($person['email'] as $e) { if (!empty($e['value'])) { $email = $e['value']; if (!empty($e['primary'])) break; } }
}
$phone = '';
if (!empty($person['phone']) && is_array($person['phone'])) {
  foreach ($person['phone'] as $p) { if (!empty($p['value'])) { $phone = $p['value']; if (!empty($p['primary'])) break; } }
}
$first = isset($person['first_name']) ? $person['first_name'] : '';
$last  = isset($person['last_name'])  ? $person['last_name']  : '';

$ud = array();
$emH = hash_email($email); if ($emH) { $ud['em'] = array($emH); }
$phH = hash_phone($phone); if ($phH) { $ud['ph'] = array($phH); }
$fnH = hash_name($first);  if ($fnH) { $ud['fn'] = array($fnH); }
$lnH = hash_name($last);   if ($lnH) { $ud['ln'] = array($lnH); }
if (!$ud) {
  out(true, array('skipped' => 'Person ohne E-Mail/Telefon – kein Matching möglich.', 'deal_id' => $dealId));
}

if ($META_PIXEL_ID === '' || $META_CAPI_TOKEN === '') {
  out(false, array('error' => 'Meta nicht konfiguriert (META_PIXEL_ID/META_CAPI_TOKEN).'), 503);
}

// ---- Meta CAPI: Purchase feuern ----
// action_source = system_generated (CRM/offline, kein Browser). event_id = Deal-ID → Dedup.
$eventTime = time();
if (!empty($deal['won_time'])) { $t = strtotime($deal['won_time']); if ($t && $t > time() - 6 * 86400) { $eventTime = $t; } }

$event = array(
  'event_name'    => 'Purchase',
  'event_time'    => $eventTime,
  'action_source' => 'system_generated',
  'event_id'      => 'deal.won.' . $dealId,
  'user_data'     => $ud,
  'custom_data'   => array(
    'currency' => strtoupper($currency),
    'value'    => round($value, 2),
    'content_name' => 'Deal gewonnen',
  ),
);
$body = array('data' => array($event));
if ($META_TEST_CODE !== '') { $body['test_event_code'] = $META_TEST_CODE; }

$url = 'https://graph.facebook.com/v19.0/' . $META_PIXEL_ID . '/events?access_token=' . urlencode($META_CAPI_TOKEN);
$r = http_json('POST', $url, array(), $body);

if (isset($r['json']['events_received'])) {
  out(true, array('sent' => true, 'event' => 'Purchase', 'value' => round($value, 2), 'currency' => strtoupper($currency), 'deal_id' => $dealId));
}
$msg = isset($r['json']['error']['message']) ? $r['json']['error']['message'] : ('HTTP ' . $r['status']);
out(false, array('error' => 'Meta-Fehler: ' . $msg, 'deal_id' => $dealId), 502);
