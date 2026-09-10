<?php
/**
 * Twilio Verify: SMS-Code prüfen. Schritt 2 der Pflicht-Telefonverifizierung
 * auf sachwert-c/sachwert-d - Schritt 1 ist api/verify-phone-start.php.
 *
 * Bei Erfolg wird ein signiertes Kurzzeit-Token ausgestellt (15 Min gültig),
 * das api/lead.php als Nachweis akzeptiert - siehe api/_phone-verify-common.php.
 * Ohne dieses Token lehnt lead.php den Lead für diese beiden Quellen hart ab,
 * auch wenn alle anderen Felder stimmen (Pflicht, keine stille Ausnahme).
 *
 * Konfiguration (ENV → Secret-Datei OBERHALB des Webroots):
 *   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE_SID
 *   PHONE_VERIFY_SECRET / phone-verify-secret.txt   – signiert den Nachweis
 */
@ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function respond($ok, $data = array()) {
  http_response_code($ok ? 200 : 400);
  echo json_encode(array_merge(array('ok' => $ok), $data));
  exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') { respond(false, array('error' => 'Method not allowed')); }

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

// Benennt fehlende Secrets statt nur "nicht konfiguriert" zu sagen - sonst
// bleibt unklar, welches der vier fehlt (Lehre aus der Purchase-Webhook-
// Diagnose: eine Sammelmeldung kostet eine ganze Debug-Runde extra).
$missingSecrets = array();
if ($TWILIO_SID === '')        { $missingSecrets[] = 'TWILIO_ACCOUNT_SID'; }
if ($TWILIO_TOKEN === '')      { $missingSecrets[] = 'TWILIO_AUTH_TOKEN'; }
if ($TWILIO_VERIFY_SID === '') { $missingSecrets[] = 'TWILIO_VERIFY_SERVICE_SID'; }
if ($PROOF_SECRET === '')      { $missingSecrets[] = 'PHONE_VERIFY_SECRET'; }
if ($missingSecrets) {
  respond(false, array('error' => 'Verifizierung ist derzeit nicht konfiguriert (fehlt: ' . implode(', ', $missingSecrets) . ').'));
}

// ---- Eingabe ----
$raw = file_get_contents('php://input');
$in = json_decode($raw, true);
if (!is_array($in)) { respond(false, array('error' => 'Ungültige Anfrage.')); }
$telRaw = isset($in['telefon']) ? trim((string) $in['telefon']) : '';
$code   = isset($in['code']) ? preg_replace('/\D/', '', (string) $in['code']) : '';
if ($telRaw === '' || $code === '') { respond(false, array('error' => 'Telefonnummer oder Code fehlt.')); }

$e164 = gc_to_e164($telRaw);

// ---- Twilio Verify: Code prüfen ----
$url = 'https://verify.twilio.com/v2/Services/' . rawurlencode($TWILIO_VERIFY_SID) . '/VerificationCheck';
$ch = curl_init($url);
curl_setopt_array($ch, array(
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => http_build_query(array('To' => $e164, 'Code' => $code)),
  CURLOPT_USERPWD => $TWILIO_SID . ':' . $TWILIO_TOKEN,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 15,
));
$res = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$json = json_decode($res, true);

if ($status >= 200 && $status < 300 && isset($json['status']) && $json['status'] === 'approved') {
  respond(true, array('proof' => gc_make_phone_proof($e164, $PROOF_SECRET)));
}
// Falscher/abgelaufener Code ist ein normaler Nutzer-Fall, kein Log-Eintrag.
// Nur echte Twilio-/Konfigurationsfehler (nicht "pending"/"canceled") protokollieren.
if (!(is_array($json) && isset($json['status']))) {
  $msg = is_array($json) && isset($json['message']) ? $json['message'] : ('HTTP ' . $status . ' – ' . substr((string) $res, 0, 150));
  gc_verify_log('check', $status, $msg);
}
respond(false, array('error' => 'Code falsch oder abgelaufen.'));
