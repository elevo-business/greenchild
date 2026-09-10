<?php
/**
 * Twilio Verify: SMS-Code an eine Telefonnummer senden. Schritt 1 der
 * Pflicht-Telefonverifizierung auf sachwert-c/sachwert-d - siehe
 * js/lp-realwert-form.js (window.GC_REQUIRE_PHONE_VERIFY), Schritt 2
 * api/verify-phone-check.php, durchgesetzt in api/lead.php.
 *
 * Rate-Limit pro Telefonnummer UND pro IP: der Endpunkt ist öffentlich/
 * unauthentifiziert erreichbar und jeder SMS-Versand kostet echtes Geld.
 *
 * Konfiguration (ENV → Secret-Datei OBERHALB des Webroots):
 *   TWILIO_ACCOUNT_SID        / twilio-account-sid.txt
 *   TWILIO_AUTH_TOKEN         / twilio-auth-token.txt
 *   TWILIO_VERIFY_SERVICE_SID / twilio-verify-sid.txt
 *
 * Diagnose ohne Serverzugang: ?debug=1&key=PHONE_VERIFY_SECRET&
 * (derselbe Secret wie für den Proof - siehe api/_phone-verify-common.php)
 */
@ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function respond($ok, $data = array()) {
  http_response_code($ok ? 200 : 400);
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

define('GC_VERIFY_INTERNAL', true);
require __DIR__ . '/_phone-verify-common.php';

$TWILIO_SID        = cfg('TWILIO_ACCOUNT_SID');
if ($TWILIO_SID === '') { $TWILIO_SID = read_secret_file('twilio-account-sid.txt'); }
$TWILIO_TOKEN      = cfg('TWILIO_AUTH_TOKEN');
if ($TWILIO_TOKEN === '') { $TWILIO_TOKEN = read_secret_file('twilio-auth-token.txt'); }
$TWILIO_VERIFY_SID = cfg('TWILIO_VERIFY_SERVICE_SID');
if ($TWILIO_VERIFY_SID === '') { $TWILIO_VERIFY_SID = read_secret_file('twilio-verify-sid.txt'); }
$PROOF_SECRET      = cfg('PHONE_VERIFY_SECRET');
if ($PROOF_SECRET === '') { $PROOF_SECRET = read_secret_file('phone-verify-secret.txt'); }

// ---- Diagnose: GET ?debug=1&key=SECRET& -> letzte Fehlversuche im Klartext ----
// "nicht konfiguriert" und "Zugang verweigert" bewusst UNTERSCHIEDEN (anders
// als sonst bei einer Zugangsprüfung üblich): dieser Zweig ist nur zur
// Diagnose da, und genau die Unterscheidung "Secret fehlt" vs. "falscher Key
// eingegeben" ist die Information, die man hier braucht - eine Sammelmeldung
// hätte hier (wie schon einmal) in die Irre geführt.
if (isset($_GET['debug'])) {
  if ($PROOF_SECRET === '') { respond(false, array('error' => 'Verifizierung ist derzeit nicht konfiguriert (fehlt: PHONE_VERIFY_SECRET).')); }
  $given = isset($_GET['key']) ? (string) $_GET['key'] : '';
  if (!hash_equals($PROOF_SECRET, $given)) {
    respond(false, array('error' => 'Zugang verweigert.'));
  }
  $f = null;
  foreach (array(__DIR__ . '/../../phone-verify-debug.log', __DIR__ . '/../phone-verify-debug.log') as $p) {
    if (@is_readable($p)) { $f = $p; break; }
  }
  header('Content-Type: text/plain; charset=utf-8');
  echo $f ? @file_get_contents($f) : 'Noch keine Fehlversuche protokolliert.';
  exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') { respond(false, array('error' => 'Method not allowed')); }

// Benennt fehlende Secrets statt nur "nicht konfiguriert" zu sagen - sonst
// bleibt unklar, welches der drei fehlt (Lehre aus der Purchase-Webhook-
// Diagnose: eine Sammelmeldung kostet eine ganze Debug-Runde extra).
$missingSecrets = array();
if ($TWILIO_SID === '')        { $missingSecrets[] = 'TWILIO_ACCOUNT_SID'; }
if ($TWILIO_TOKEN === '')      { $missingSecrets[] = 'TWILIO_AUTH_TOKEN'; }
if ($TWILIO_VERIFY_SID === '') { $missingSecrets[] = 'TWILIO_VERIFY_SERVICE_SID'; }
if ($missingSecrets) {
  respond(false, array('error' => 'Verifizierung ist derzeit nicht konfiguriert (fehlt: ' . implode(', ', $missingSecrets) . ').'));
}

// ---- Eingabe ----
$raw = file_get_contents('php://input');
$in = json_decode($raw, true);
if (!is_array($in)) { respond(false, array('error' => 'Ungültige Anfrage.')); }
$telRaw = isset($in['telefon']) ? trim((string) $in['telefon']) : '';
if ($telRaw === '') { respond(false, array('error' => 'Telefonnummer fehlt.')); }

// Gleiche Plausibilitätsprüfung wie js/lp-realwert-form.js (isValidPhone) und
// api/lead.php - damit keine Fantasienummern echte SMS-Kosten verursachen.
function phone_plausible($telefon) {
  if (preg_match('~[^0-9+()/.\-\s]~', $telefon)) { return false; }
  if (substr_count($telefon, '+') > 1) { return false; }
  if (strpos($telefon, '+') > 0) { return false; }
  $compact = preg_replace('~[()/.\-\s]~', '', $telefon);
  if (preg_match('~^\+0~', $compact)) { return false; }
  if (preg_match('~^(\+|00)(49|43|41)0~', $compact)) { return false; }
  $digits = preg_replace('/\D/', '', $telefon);
  $len = strlen($digits);
  if ($len < 8 || $len > 15) { return false; }
  if (preg_match('~^(\d)\1+$~', $digits)) { return false; }
  if (strlen($digits) >= 6 &&
      (strpos('01234567890', $digits) !== false || strpos('09876543210', $digits) !== false)) { return false; }
  return true;
}
if (!phone_plausible($telRaw)) { respond(false, array('error' => 'Telefonnummer ungültig.')); }

$e164 = gc_to_e164($telRaw);

// ---- Rate-Limiting: Datei außerhalb des Webroots, pro Nummer UND pro IP ----
function ratelimit_dir() {
  $dirs = array(__DIR__ . '/../../verify-ratelimit/', __DIR__ . '/../verify-ratelimit/');
  foreach ($dirs as $d) {
    if (!@is_dir($d)) { @mkdir($d, 0700, true); }
    if (@is_dir($d) && @is_writable($d)) { return $d; }
  }
  return '';
}
function ratelimit_ok($dir, $key, $max, $windowSec) {
  if ($dir === '') { return true; } // kein Schreibzugriff -> nicht blockieren, nur nicht zaehlen
  $f = $dir . hash('sha256', $key) . '.json';
  $now = time();
  $state = array('count' => 0, 'start' => $now);
  $d = @json_decode(@file_get_contents($f), true);
  if (is_array($d) && isset($d['count'], $d['start']) && ($now - $d['start']) <= $windowSec) { $state = $d; }
  $state['count']++;
  @file_put_contents($f, json_encode($state), LOCK_EX);
  return $state['count'] <= $max;
}
$rlDir = ratelimit_dir();
if (!ratelimit_ok($rlDir, 'phone:' . $e164, 5, 3600)) {
  respond(false, array('error' => 'Zu viele Versuche für diese Nummer. Bitte später erneut versuchen.'));
}
$ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
if ($ip !== '' && !ratelimit_ok($rlDir, 'ip:' . $ip, 20, 3600)) {
  respond(false, array('error' => 'Zu viele Versuche. Bitte später erneut versuchen.'));
}

// ---- Twilio Verify: Verification starten ----
$url = 'https://verify.twilio.com/v2/Services/' . rawurlencode($TWILIO_VERIFY_SID) . '/Verifications';
$ch = curl_init($url);
curl_setopt_array($ch, array(
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => http_build_query(array('To' => $e164, 'Channel' => 'sms')),
  CURLOPT_USERPWD => $TWILIO_SID . ':' . $TWILIO_TOKEN,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 15,
));
$res = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$json = json_decode($res, true);

if ($status >= 200 && $status < 300 && isset($json['status'])) {
  respond(true, array('status' => $json['status']));
}
$msg = is_array($json) && isset($json['message']) ? $json['message'] : ('HTTP ' . $status . ' – ' . substr((string) $res, 0, 150));
gc_verify_log('start', $status, $msg);
respond(false, array('error' => 'SMS konnte nicht gesendet werden. Bitte Nummer prüfen.'));
