<?php
/**
 * Sipgate Push-API  →  Pipedrive-Aktivität ("Anruf")
 *
 * Zweck: Anrufe, die per Click-to-Dial über Sipgate getätigt werden, werden in
 * Pipedrive NICHT automatisch protokolliert – Click-to-Dial wählt nur, sagt
 * Pipedrive aber nichts. Dieser Endpunkt schließt die Lücke: Sipgate schickt bei
 * jedem Anruf Webhooks (newCall → answer → hangup); wir matchen die Rufnummer auf
 * eine Pipedrive-Person und legen eine erledigte Anruf-Aktivität an – inkl.
 * Gesprächsdauer und Ergebnis ("verbunden" / "nicht erreicht: besetzt/keine
 * Antwort/…"). Damit lassen sich nicht erreichte Leads in Pipedrive sauber
 * filtern und erneut anwählen.
 *
 * Warum drei Events? hangup allein kennt keine Gesprächsdauer. Deshalb merken wir
 * uns Start (newCall) und Annahme (answer) in einer kurzlebigen Zustandsdatei und
 * werten beim hangup aus. Fehlt der Startdatensatz (z. B. verpasster newCall),
 * wird trotzdem protokolliert – nur ohne Dauer.
 *
 * ------------------------------------------------------------------------------
 * EINRICHTUNG (Sipgate):
 *   Sipgate-Account → Account/Einstellungen → Webhooks (Push-API)
 *     Outgoing-URL:  https://greenchild.eu/api/call-log.php?key=DEIN_SECRET
 *     (Incoming-URL optional – dieselbe URL; eingehende Anrufe werden mitgeloggt.)
 *   Voraussetzung: Tarif mit Push-API/Webhooks (sipgate team / trunking).
 *
 * KONFIGURATION (ENV → Secret-Datei OBERHALB des Webroots → Fallback):
 *   PIPEDRIVE_API_TOKEN / pipedrive-token.txt          – wie lead.php
 *   SIPGATE_WEBHOOK_SECRET / sipgate-webhook-secret.txt – PFLICHT: schützt URL
 *     (Fallback: pd-webhook-secret.txt, damit ein bestehendes Secret reicht.)
 *
 * TEST:  GET  https://greenchild.eu/api/call-log.php?selftest=1&key=SECRET
 *   → prüft Pipedrive-Token, curl und Schreibrechte, ohne etwas anzulegen.
 * Manueller Ende-zu-Ende-Test (legt eine echte Aktivität an, falls Nummer matcht):
 *   curl -s "…/call-log.php?key=SECRET" \
 *     -d "event=hangup&direction=out&callId=test123&from=+49151…&to=+49170…&cause=normalClearing"
 */

@ini_set('display_errors', '0');
header('X-Content-Type-Options: nosniff');

// ---- Antwort-Helfer -----------------------------------------------------------
// Sipgate erwartet 2xx, sonst wird der Webhook wiederholt. Bei Events, die wir
// nicht steuern wollen, genügt 204 (kein Body). Für Selbsttest/Fehler JSON.
function reply_204() { http_response_code(204); exit; }
function reply_json($ok, $data = array(), $code = null) {
  if ($code === null) { $code = $ok ? 200 : 400; }
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
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

// ---- Konfiguration ------------------------------------------------------------
$PD_TOKEN = cfg('PIPEDRIVE_API_TOKEN');
if ($PD_TOKEN === '') { $PD_TOKEN = read_secret_file('pipedrive-token.txt'); }
// Kein hartcodierter Token: PIPEDRIVE_API_TOKEN (ENV) oder pipedrive-token.txt setzen.
$PD_BASE = 'https://api.pipedrive.com/v1';

$SECRET = cfg('SIPGATE_WEBHOOK_SECRET');
if ($SECRET === '') { $SECRET = read_secret_file('sipgate-webhook-secret.txt'); }
if ($SECRET === '') { $SECRET = read_secret_file('pd-webhook-secret.txt'); } // Fallback: bestehendes Secret

// ---- HTTP-Helfer (identisch zu lead.php / pd-deal-won.php) ---------------------
function http_json($method, $url, $headers, $body) {
  $payload = ($body === null) ? null : json_encode($body);
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    $h = array_merge(array('Content-Type: application/json', 'Accept: application/json'), $headers);
    curl_setopt_array($ch, array(
      CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $h,
      CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
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
    'timeout' => 15, 'ignore_errors' => true,
  ));
  if ($payload !== null) { $opts['http']['content'] = $payload; }
  $res = @file_get_contents($url, false, stream_context_create($opts));
  return array('status' => 0, 'json' => json_decode($res, true), 'raw' => $res);
}
function pd_get($base, $token, $path) {
  $sep = (strpos($path, '?') !== false) ? '&' : '?';
  return http_json('GET', $base . $path . $sep . 'api_token=' . urlencode($token), array(), null);
}
function pd_post($base, $token, $path, $body) {
  $sep = (strpos($path, '?') !== false) ? '&' : '?';
  return http_json('POST', $base . $path . $sep . 'api_token=' . urlencode($token), array(), $body);
}

// ---- Zustandsspeicher (Start/Annahme je callId; im Temp-Verzeichnis, nicht im Web) ----
function store_dir() {
  $d = sys_get_temp_dir() . '/sipgate-calls';
  if (!is_dir($d)) { @mkdir($d, 0700, true); }
  return is_dir($d) ? $d : sys_get_temp_dir();
}
function store_path($callId, $suffix = '') {
  $safe = preg_replace('/[^A-Za-z0-9_.-]/', '', (string) $callId);
  if ($safe === '') { $safe = 'unknown'; }
  return store_dir() . '/call_' . $safe . $suffix . '.json';
}
function store_write($callId, $data) { @file_put_contents(store_path($callId), json_encode($data)); }
function store_read($callId) {
  $p = store_path($callId);
  if (@is_readable($p)) { $j = json_decode(@file_get_contents($p), true); return is_array($j) ? $j : array(); }
  return array();
}
function store_clear($callId) { @unlink(store_path($callId)); }
/** Alte Reste (>24h) aufräumen, damit sich nichts ansammelt. */
function store_gc() {
  foreach (glob(store_dir() . '/call_*.json') ?: array() as $f) {
    if (@filemtime($f) < time() - 86400) { @unlink($f); }
  }
}

// ---- Rufnummer normalisieren → Suchvarianten für Pipedrive --------------------
/** Liefert Suchbegriffe in Prioritätsreihenfolge (E.164-Ziffern, national, letzte 9). */
function number_variants($raw) {
  $d = preg_replace('/\D+/', '', (string) $raw);
  if ($d === '') { return array(); }
  if (strpos($d, '00') === 0) { $d = substr($d, 2); }      // 0049… → 49…
  $variants = array();
  $variants[] = $d;                                        // z. B. 4915112345678
  if (strpos($d, '49') === 0) { $variants[] = '0' . substr($d, 2); } // → 015112345678
  if (strlen($d) >= 9) { $variants[] = substr($d, -9); }  // Teilnehmer-Nr. (Format-agnostisch)
  return array_values(array_unique($variants));
}
/** Erste Pipedrive-Person, deren Telefonnummer zu einer der Varianten passt. */
function find_person_id($base, $token, $raw) {
  foreach (number_variants($raw) as $term) {
    $r = pd_get($base, $token, '/persons/search?term=' . urlencode($term) . '&fields=phone&exact_match=false&limit=5');
    if (!empty($r['json']['data']['items'][0]['item']['id'])) {
      return (int) $r['json']['data']['items'][0]['item']['id'];
    }
  }
  return 0;
}
/** Falls die Person genau EINEN offenen Deal hat, Aktivität daran hängen (Timeline). */
function single_open_deal_id($base, $token, $personId) {
  $r = pd_get($base, $token, '/persons/' . intval($personId) . '/deals?status=open&limit=2');
  $items = isset($r['json']['data']) && is_array($r['json']['data']) ? $r['json']['data'] : array();
  return (count($items) === 1 && !empty($items[0]['id'])) ? (int) $items[0]['id'] : 0;
}

// ---- Zugangsschutz ------------------------------------------------------------
if ($SECRET === '') {
  reply_json(false, array('error' => 'Nicht konfiguriert: SIPGATE_WEBHOOK_SECRET fehlt (ENV oder sipgate-webhook-secret.txt).'), 503);
}
$given = isset($_GET['key']) ? (string) $_GET['key'] : '';
if ($given === '' && isset($_SERVER['PHP_AUTH_PW'])) { $given = (string) $_SERVER['PHP_AUTH_PW']; }
if (!hash_equals($SECRET, $given)) {
  reply_json(false, array('error' => 'Zugang verweigert (Secret fehlt/falsch).'), 401);
}

// ---- Selbsttest ---------------------------------------------------------------
if (isset($_GET['selftest'])) {
  $pd = pd_get($PD_BASE, $PD_TOKEN, '/users/me');
  $dir = store_dir();
  reply_json(true, array(
    'pipedrive_valid' => !empty($pd['json']['success']),
    'curl'            => function_exists('curl_init'),
    'store_dir'       => $dir,
    'store_writable'  => is_writable($dir),
  ));
}

// Ab hier ist der Pipedrive-Token nötig.
if ($PD_TOKEN === '') {
  reply_json(false, array('error' => 'Nicht konfiguriert: PIPEDRIVE_API_TOKEN fehlt (ENV oder pipedrive-token.txt).'), 503);
}

// ---- Event lesen (Sipgate sendet form-urlencoded) -----------------------------
$data = $_POST;
if (empty($data)) { // Fallback, falls $_POST leer (je nach Serverkonfig)
  parse_str(file_get_contents('php://input'), $data);
}
$event     = isset($data['event'])     ? (string) $data['event']     : '';
$callId    = isset($data['callId'])    ? (string) $data['callId']    : '';
$direction = isset($data['direction']) ? (string) $data['direction'] : '';
$from      = isset($data['from'])      ? (string) $data['from']      : '';
$to        = isset($data['to'])        ? (string) $data['to']        : '';
$cause     = isset($data['cause'])     ? (string) $data['cause']     : '';

if ($event === '') { reply_json(false, array('error' => 'Kein Sipgate-Event (event fehlt).')); }

// Kundennummer = bei ausgehend die gewählte (to), bei eingehend die anrufende (from).
$customerNumber = ($direction === 'in') ? $from : $to;

// ---- newCall: Startzeitpunkt merken ------------------------------------------
if ($event === 'newCall') {
  store_write($callId, array('t' => time(), 'direction' => $direction, 'from' => $from, 'to' => $to, 'number' => $customerNumber));
  reply_204();
}

// ---- answer: Annahmezeitpunkt merken (für echte Gesprächsdauer) ---------------
if ($event === 'answer') {
  $s = store_read($callId);
  $s['answered_t'] = time();
  if (!isset($s['number']) && $customerNumber !== '') { $s['number'] = $customerNumber; }
  store_write($callId, $s);
  reply_204();
}

// ---- Andere Events (z. B. data) ignorieren wir still --------------------------
if ($event !== 'hangup') { reply_204(); }

// ================== hangup: Aktivität in Pipedrive anlegen =====================
store_gc();

// Doppelte hangup-Zustellung abfangen.
$doneMarker = store_path($callId, '_done');
if (@is_readable($doneMarker)) { reply_json(true, array('skipped' => 'hangup bereits verarbeitet.')); }

$s          = store_read($callId);
$startT     = isset($s['t']) ? (int) $s['t'] : time();
$answeredT  = isset($s['answered_t']) ? (int) $s['answered_t'] : 0;
if ($direction === '' && isset($s['direction'])) { $direction = $s['direction']; }
if ($customerNumber === '' && isset($s['number'])) { $customerNumber = $s['number']; }
if ($from === '' && isset($s['from'])) { $from = $s['from']; }
if ($to === '' && isset($s['to']))     { $to = $s['to']; }

$talkSecs = $answeredT > 0 ? max(0, time() - $answeredT) : 0;
$reached  = $answeredT > 0; // angenommen = erreicht

// Ergebnis-Text aus Sipgate-cause ableiten.
$causeMap = array(
  'normalClearing' => 'verbunden',
  'busy'           => 'besetzt',
  'cancel'         => 'abgebrochen',
  'noAnswer'       => 'keine Antwort',
  'congestion'     => 'nicht erreichbar',
  'notFound'       => 'Nummer ung&uuml;ltig',
  'forwarded'      => 'weitergeleitet',
);
$causeTxt = isset($causeMap[$cause]) ? $causeMap[$cause] : ($cause !== '' ? $cause : 'beendet');
if ($reached) {
  $ergebnis = 'verbunden';
} else {
  $ergebnis = 'nicht erreicht' . ($cause !== '' ? ' (' . $causeTxt . ')' : '');
}

$dirTxt   = ($direction === 'in') ? 'eingehend' : 'ausgehend';
$durMMSS  = sprintf('%02d:%02d', intdiv($talkSecs, 60), $talkSecs % 60);
$durHHMM  = sprintf('%02d:%02d', intdiv($talkSecs, 3600), intdiv($talkSecs % 3600, 60)); // Pipedrive-Format

// Marker früh setzen, damit ein zweiter hangup nicht dupliziert (auch bei PD-Fehler).
@file_put_contents($doneMarker, '1');

// Person finden.
$personId = $customerNumber !== '' ? find_person_id($PD_BASE, $PD_TOKEN, $customerNumber) : 0;
if ($personId === 0) {
  store_clear($callId);
  reply_json(true, array('skipped' => 'Keine Pipedrive-Person zur Nummer gefunden.', 'number' => $customerNumber, 'result' => $ergebnis));
}

$dealId = single_open_deal_id($PD_BASE, $PD_TOKEN, $personId);

// Aktivität zusammenbauen.
$icon    = $reached ? '&#9742;' : '&#9888;'; // ☎ / ⚠
$subject = 'Anruf ' . $dirTxt . ' &ndash; ' . $ergebnis . ($reached ? ' (' . $durMMSS . ')' : '');
$note    =
  'Sipgate-Anruf' . "\n" .
  'Richtung: ' . $dirTxt . "\n" .
  'Von: ' . $from . "\n" .
  'An: ' . $to . "\n" .
  'Ergebnis: ' . $ergebnis . "\n" .
  ($reached ? 'Gespr&auml;chsdauer: ' . $durMMSS . ' (' . $talkSecs . 's)' . "\n" : '') .
  'Call-ID: ' . $callId . "\n" .
  'Zeitpunkt: ' . date('Y-m-d H:i:s', $startT);

$activity = array(
  'subject'   => $subject,
  'type'      => 'call',
  'done'      => 1,
  'person_id' => $personId,
  'due_date'  => date('Y-m-d', $startT),
  'due_time'  => date('H:i', $startT),
  'duration'  => $durHHMM,
  'note'      => nl2br($note),
);
if ($dealId > 0) { $activity['deal_id'] = $dealId; }

$r = pd_post($PD_BASE, $PD_TOKEN, '/activities', $activity);
store_clear($callId);

if (!empty($r['json']['success'])) {
  reply_json(true, array(
    'logged'    => true,
    'person_id' => $personId,
    'deal_id'   => $dealId ?: null,
    'result'    => $ergebnis,
    'duration'  => $reached ? $durMMSS : null,
  ));
}
$msg = isset($r['json']['error']) ? $r['json']['error'] : ('HTTP ' . $r['status']);
reply_json(false, array('error' => 'Pipedrive-Fehler: ' . $msg, 'person_id' => $personId), 200); // 200: kein Sipgate-Retry
