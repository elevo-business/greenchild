<?php
/**
 * Gemeinsame Hilfsfunktionen für die Pflicht-Telefonverifizierung (Twilio
 * Verify) auf sachwert-c/sachwert-d. Eingebunden von api/verify-phone-start.php,
 * api/verify-phone-check.php und api/lead.php.
 *
 * Bewusst ausgelagert statt wie sonst in diesem Projekt pro Datei dupliziert:
 * Sende-Endpunkt, Prüf-Endpunkt und Lead-Annahme müssen bei der Telefonnummer-
 * Normalisierung und beim Proof-Abgleich BYTEGLEICH rechnen. Ein Unterschied
 * hätte den Proof-Abgleich lautlos scheitern lassen - keine der drei Seiten
 * hätte einen Fehler geworfen, es hätte einfach nie funktioniert (siehe die
 * Purchase-Webhook-Diagnose vom Vortag: genau solche stillen Diskrepanzen
 * sind am teuersten zu finden).
 *
 * Reine Funktionsbibliothek, keine eigene Route - direkter Aufruf gesperrt.
 */
if (!defined('GC_VERIFY_INTERNAL')) { http_response_code(404); exit; }

/**
 * Telefonnummer nach E.164 normalisieren (Twilio verlangt dieses Format).
 * Nimmt an: deutsche Nummern ohne Ländervorwahl (führende 0) sowie
 * internationale Nummern mit + oder 00 - gleiche Grundregel wie hash_phone()
 * in api/pd-deal-won.php, hier zusätzlich mit "+"-Präfix statt Hash.
 */
function gc_to_e164($tel) {
  $s = trim((string) $tel);
  $hasPlus = (strpos($s, '+') === 0);
  $d = preg_replace('/\D/', '', $s);
  if (!$hasPlus && strpos($d, '00') === 0) { $d = substr($d, 2); }
  elseif (!$hasPlus && strpos($d, '0') === 0) { $d = '49' . substr($d, 1); }
  return '+' . $d;
}

/**
 * Kurzzeit-Nachweis nach erfolgreicher Twilio-Verifizierung: signiert die
 * (normalisierte) Telefonnummer + Ablaufzeit, damit api/lead.php prüfen kann,
 * dass GENAU DIESE Nummer gerade per SMS bestätigt wurde - ohne eigenen
 * Server-Session-Speicher (Shared Hosting, zustandslos zwischen Requests).
 */
function gc_make_phone_proof($e164, $secret, $ttlSeconds = 900) {
  $exp = time() + $ttlSeconds;
  $sig = hash_hmac('sha256', $e164 . '|' . $exp, $secret);
  return $exp . '.' . $sig;
}

/** Gegenstück: prüft Signatur, Ablauf und dass die Nummer übereinstimmt. */
function gc_check_phone_proof($proof, $telefon, $secret) {
  if ($secret === '' || !is_string($proof) || strpos($proof, '.') === false) { return false; }
  list($exp, $sig) = explode('.', $proof, 2);
  if (!ctype_digit($exp) || (int) $exp < time()) { return false; } // fehlt oder abgelaufen
  $e164 = gc_to_e164($telefon);
  $expect = hash_hmac('sha256', $e164 . '|' . $exp, $secret);
  return hash_equals($expect, (string) $sig);
}

/**
 * Minimales Fehlerprotokoll für die Twilio-Anbindung selbst (nicht für
 * einzelne Nutzer-Fehleingaben wie einen falschen Code). Nur bei technischen
 * Fehlern - eine Fehlkonfiguration (falscher SID/Token, falsche Verify-
 * Service-ID) muss ohne Serverzugang erkennbar sein.
 */
function gc_verify_log($step, $httpStatus, $message) {
  $dirs = array(__DIR__ . '/../../', __DIR__ . '/../');
  foreach ($dirs as $d) {
    if (@is_dir($d) && @is_writable($d)) {
      $f = $d . 'phone-verify-debug.log';
      $line = sprintf("%s  %s  HTTP %d  %s\n", gmdate('Y-m-d H:i:s'), $step, (int) $httpStatus, substr((string) $message, 0, 200));
      @file_put_contents($f, $line, FILE_APPEND | LOCK_EX);
      $c = @file($f);
      if (is_array($c) && count($c) > 40) { @file_put_contents($f, implode('', array_slice($c, -40)), LOCK_EX); }
      return;
    }
  }
}
