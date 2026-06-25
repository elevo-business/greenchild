<?php
/**
 * Server-seitiger Lead-Proxy für die Landingpages (Sachwert / Factsheet).
 *
 * Warum: Der Pipedrive-API-Token darf NICHT im öffentlichen JS stehen
 * (sonst kann jeder das CRM fluten/auslesen). Dieses PHP nimmt den Submit
 * vom Formular entgegen und ruft Pipedrive serverseitig auf – der Token
 * bleibt hier und wird nie an den Browser ausgeliefert.
 *
 * Läuft auf dem All-Inkl-Webspace (PHP) unter /api/lead.php, same-origin
 * für greenchild.eu und greenchild.at – daher kein CORS nötig.
 *
 * Token-Quelle (in dieser Reihenfolge):
 *   1) Umgebungsvariable PIPEDRIVE_API_TOKEN (empfohlen)
 *   2) Datei pipedrive-token.txt OBERHALB des Webroots (FTP-Home, nicht im Repo)
 *   3) Fallback-Konstante unten (bitte nach dem Deploy per Token-Rotation ersetzen)
 */

// Keine PHP-Warnungen in die JSON-Antwort lecken lassen (Shared-Hosting).
@ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function respond($ok, $msg = '') {
  http_response_code($ok ? 200 : 400);
  echo json_encode(array('success' => $ok, 'message' => $msg));
  exit;
}

// Nur POST zulassen (Ausnahme: Selbsttest per GET mit Schlüssel).
$SELFTEST_OK = (isset($_GET['selftest']) && $_GET['selftest'] === 'gc-diag-2026');
if ($_SERVER['REQUEST_METHOD'] !== 'POST' && !$SELFTEST_OK) {
  respond(false, 'Method not allowed');
}

/**
 * Liest eine Secret-Datei. Bevorzugt OBERHALB des Webroots (FTP-Home), damit
 * der Token niemals über die URL abrufbar ist; Doc-Root nur als Fallback
 * (zusätzlich per .htaccess gesperrt).
 */
function read_secret_file($filename) {
  $paths = array(
    __DIR__ . '/../../' . $filename,  // FTP-Home, oberhalb des Webroots → NICHT per URL erreichbar
    __DIR__ . '/../' . $filename,     // Dokument-Root (Fallback, per .htaccess gesperrt)
  );
  foreach ($paths as $p) {
    if (@is_readable($p)) { return trim(@file_get_contents($p)); }
  }
  return '';
}

// ---- Token laden (serverseitig) ----
$API_TOKEN = getenv('PIPEDRIVE_API_TOKEN');
if (!$API_TOKEN) { $API_TOKEN = read_secret_file('pipedrive-token.txt'); }
if (!$API_TOKEN) {
  // Fallback – nach Deploy bitte Token in Pipedrive rotieren und oben (ENV/Datei) hinterlegen.
  $API_TOKEN = '9fae1a7473002abdf89ade65319dc14a1c828a28';
}
$BASE = 'https://api.pipedrive.com/v1';

// ---- Meta Conversions API: Config laden (serverseitig) ----
// Pixel-ID darf öffentlich sein; der Access-Token NICHT → nur ENV/Datei hier.
$META_PIXEL_ID = getenv('META_PIXEL_ID');
$META_CAPI_TOKEN = getenv('META_CAPI_TOKEN');
if (!$META_CAPI_TOKEN) { $META_CAPI_TOKEN = read_secret_file('meta-capi-token.txt'); }
if (!$META_PIXEL_ID)  { $META_PIXEL_ID  = '1314610516838484'; }
$META_TEST_EVENT_CODE = getenv('META_TEST_EVENT_CODE'); // optional, nur zum Testen im Events Manager
if (!$META_TEST_EVENT_CODE) { $META_TEST_EVENT_CODE = read_secret_file('meta-test-code.txt'); }

// ---- Selbsttest (GET ?selftest=gc-diag-2026): Config-Status, KEINE Secrets ----
if ($SELFTEST_OK) {
  // CAPI live testen: ein harmloses 'SelfTest'-Event SENDEN (das tun wir ja auch real).
  // events_received => Token darf senden. Fehler => Token/Permission-Problem.
  $capiValid = null; $capiError = '';
  if ($META_CAPI_TOKEN !== '' && $META_PIXEL_ID !== '' && function_exists('curl_init')) {
    $u = 'https://graph.facebook.com/v19.0/' . $META_PIXEL_ID . '/events?access_token=' . urlencode($META_CAPI_TOKEN);
    $payload = array('data' => array(array(
      'event_name'    => 'SelfTest',
      'event_time'    => time(),
      'action_source' => 'website',
      'event_id'      => 'selftest_' . time(),
      'user_data'     => array(  // CAPI verlangt user_data bei JEDEM Event
        'client_ip_address' => isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0.0.0.0',
        'client_user_agent' => isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : 'selftest',
        'em'                => array(hash('sha256', 'selftest@greenchild.eu')),
      ),
    )));
    $ch = curl_init($u);
    curl_setopt_array($ch, array(
      CURLOPT_POST => true,
      CURLOPT_POSTFIELDS => json_encode($payload),
      CURLOPT_HTTPHEADER => array('Content-Type: application/json'),
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 10,
    ));
    $r = curl_exec($ch); curl_close($ch);
    $j = json_decode($r, true);
    if (is_array($j) && isset($j['events_received'])) { $capiValid = true; }
    else { $capiValid = false; $capiError = isset($j['error']['message']) ? $j['error']['message'] : 'unbekannte Antwort'; }
  }
  // Pipedrive-Token live testen (GET /users/me) → erkennt rotierten/ungültigen Token
  $pdValid = null; $pdError = '';
  if ($API_TOKEN !== '') {
    $pu = $BASE . '/users/me?api_token=' . urlencode($API_TOKEN);
    if (function_exists('curl_init')) {
      $ch2 = curl_init($pu);
      curl_setopt_array($ch2, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10));
      $pr = curl_exec($ch2); curl_close($ch2);
    } else { $pr = @file_get_contents($pu); }
    $pj = json_decode($pr, true);
    if (is_array($pj) && !empty($pj['success'])) { $pdValid = true; }
    else { $pdValid = false; $pdError = isset($pj['error']) ? $pj['error'] : 'ungültig/keine Antwort'; }
  }
  echo json_encode(array(
    'ok'                    => true,
    'pixel_id_set'          => $META_PIXEL_ID !== '',
    'capi_token_loaded'     => $META_CAPI_TOKEN !== '',
    'capi_token_valid'      => $capiValid,
    'capi_error'            => $capiError,
    'pipedrive_token'       => ($API_TOKEN === '9fae1a7473002abdf89ade65319dc14a1c828a28') ? 'fallback' : 'datei_oder_env',
    'pipedrive_token_valid' => $pdValid,
    'pipedrive_error'       => $pdError,
    'test_code_active'    => $META_TEST_EVENT_CODE !== '',
    'curl'                => function_exists('curl_init'),
    'allow_url_fopen'     => (bool) ini_get('allow_url_fopen'),
  ));
  exit;
}

// ---- Eingabe lesen (JSON-Body) ----
$raw = file_get_contents('php://input');
$in = json_decode($raw, true);
if (!is_array($in)) { $in = $_POST; }

function field($in, $name) {
  return isset($in[$name]) ? trim((string)$in[$name]) : '';
}

// Honeypot: echte Nutzer füllen dieses Feld nie aus.
if (field($in, 'botcheck') !== '') { respond(true, 'ok'); }

$vorname        = field($in, 'vorname');
$nachname       = field($in, 'nachname');
$email          = field($in, 'email');
$telefon        = field($in, 'telefon');
$erreichbarkeit = field($in, 'erreichbarkeit');
$budgetKey      = field($in, 'budget');
$source         = field($in, 'source');   // 'sachwert' | 'factsheet' | 'kontakt'
$variant        = field($in, 'variant');  // optional (A/B-Test)
$interesse      = field($in, 'interesse');  // nur Kontaktformular
$nachricht      = field($in, 'nachricht');  // nur Kontaktformular
$consent        = !empty($in['consent']);

// Meta Conversions API (Dedup + Matching)
$eventId        = field($in, 'event_id');
$eventSourceUrl = field($in, 'event_source_url');
$fbp            = field($in, 'fbp');
$fbc            = field($in, 'fbc');

$isKontakt = ($source === 'kontakt');

// ---- Validierung ----
// Telefon ist Pflicht für die Lead-Magnet-LPs, beim Kontaktformular optional.
if ($vorname === '' || $nachname === '' || $email === '' || (!$isKontakt && $telefon === '')) {
  respond(false, 'Pflichtfelder fehlen');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
  respond(false, 'E-Mail ungültig');
}
// Telefon muss eine gültige Nummer sein (gleiche Regel wie im LP-JS):
// nur Telefon-Zeichen, '+' nur am Anfang, 7–15 Ziffern. Beim Kontaktformular
// nur prüfen, wenn überhaupt eine Nummer angegeben wurde (dort optional).
if ($telefon !== '') {
  $phoneOk = true;
  if (preg_match('~[^0-9+()/.\-\s]~', $telefon)) { $phoneOk = false; }
  if (substr_count($telefon, '+') > 1) { $phoneOk = false; }
  if (strpos($telefon, '+') > 0) { $phoneOk = false; }
  $phoneDigits = preg_replace('/\D/', '', $telefon);
  $len = strlen($phoneDigits);
  if ($len < 7 || $len > 15) { $phoneOk = false; }
  if (!$phoneOk) {
    respond(false, 'Telefonnummer ungültig');
  }
}
// Consent-Checkbox haben nur die LP-Formulare; Kontaktformular hat sie nicht.
if (!$isKontakt && !$consent) {
  respond(false, 'Einwilligung fehlt');
}
// Einfache Spam-Heuristik: Namen mit URLs sind praktisch immer Bots.
if (preg_match('~https?://|www\.~i', $vorname . ' ' . $nachname)) {
  respond(true, 'ok'); // stillschweigend verwerfen
}

// ---- Budget-Stufen → Pipedrive-Mapping (serverseitig, damit nicht fälschbar) ----
$BUDGET_MAP = array(
  'info'        => array('label' => 'Erst einmal informieren', 'tag' => 'INFO',       'value' => 0),
  'bis-2500'    => array('label' => 'bis 2.500 €',             'tag' => '€ bis 2,5k',  'value' => 2500),
  '2500-10000'  => array('label' => '2.500 – 10.000 €',         'tag' => '€€ 2,5–10k',  'value' => 10000),
  '10000-25000' => array('label' => '10.000 – 25.000 €',        'tag' => '€€€ 10–25k',  'value' => 25000),
  '25000-plus'  => array('label' => 'über 25.000 €',            'tag' => '€€€€ 25k+',   'value' => 50000),
);
if (isset($BUDGET_MAP[$budgetKey])) {
  $budget = $BUDGET_MAP[$budgetKey];
} else {
  $budget = array('label' => '(nicht abgefragt)', 'tag' => '—', 'value' => 0);
}

$INTERESSE_MAP = array(
  'baumbesitzer' => 'Baumbesitzer werden',
  'info'         => 'Mehr erfahren',
  'besuch'       => 'Plantage besuchen',
  'partner'      => 'Partnerschaft',
  'sonstiges'    => 'Sonstiges',
);
$interesseLabel = isset($INTERESSE_MAP[$interesse]) ? $INTERESSE_MAP[$interesse] : $interesse;

if ($isKontakt) {
  $srcLabel = 'Kontaktformular (Website)';
} elseif ($source === 'factsheet') {
  $srcLabel = 'Messe-Landingpage (QR-Kärtchen) — Investoren-Factsheet';
} else {
  $srcLabel = 'Landingpage „Sachwert" — Sachwertvergleich 2026';
}

// ---- HTTP-Helfer (cURL, mit file_get_contents-Fallback) ----
function pd_post($url, $payload) {
  $body = json_encode($payload);
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
      CURLOPT_POST => true,
      CURLOPT_POSTFIELDS => $body,
      CURLOPT_HTTPHEADER => array('Content-Type: application/json'),
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 15,
    ));
    $res = curl_exec($ch);
    curl_close($ch);
    return json_decode($res, true);
  }
  $ctx = stream_context_create(array('http' => array(
    'method' => 'POST',
    'header' => "Content-Type: application/json\r\n",
    'content' => $body,
    'timeout' => 15,
  )));
  return json_decode(@file_get_contents($url, false, $ctx), true);
}

/**
 * Sendet das 'Lead'-Event an die Meta Conversions API (serverseitig).
 * E-Mail/Telefon werden SHA-256-gehasht (Meta-Pflicht). event_id sorgt für
 * Deduplizierung mit dem Browser-Pixel. Best-effort: Fehler brechen den
 * Lead-Flow nicht ab.
 */
function meta_send_lead($pixelId, $token, $version, $eventId, $sourceUrl, $email, $telefon, $vorname, $nachname, $fbp, $fbc, $customData, $testCode) {
  if (!$pixelId || !$token) { return; }

  $ud = array();
  if ($email !== '')   { $ud['em'] = array(hash('sha256', strtolower(trim($email)))); }
  if ($telefon !== '') {
    // Auf Ziffern reduzieren und grob nach E.164 (DE = +49) normalisieren.
    $d = preg_replace('/\D+/', '', $telefon);
    if (strpos($d, '00') === 0)      { $d = substr($d, 2); }
    elseif (strpos($d, '0') === 0)   { $d = '49' . substr($d, 1); }
    if ($d !== '') { $ud['ph'] = array(hash('sha256', $d)); }
  }
  if ($vorname !== '')  { $ud['fn'] = array(hash('sha256', strtolower(trim($vorname)))); }
  if ($nachname !== '') { $ud['ln'] = array(hash('sha256', strtolower(trim($nachname)))); }
  if ($fbp !== '') { $ud['fbp'] = $fbp; }
  if ($fbc !== '') { $ud['fbc'] = $fbc; }
  if (!empty($_SERVER['REMOTE_ADDR']))     { $ud['client_ip_address'] = $_SERVER['REMOTE_ADDR']; }
  if (!empty($_SERVER['HTTP_USER_AGENT']))  { $ud['client_user_agent'] = $_SERVER['HTTP_USER_AGENT']; }

  $event = array(
    'event_name'    => 'Lead',
    'event_time'    => time(),
    'action_source' => 'website',
    'user_data'     => $ud,
    'custom_data'   => $customData,
  );
  if ($eventId !== '')   { $event['event_id'] = $eventId; }
  if ($sourceUrl !== '') { $event['event_source_url'] = $sourceUrl; }

  $body = array('data' => array($event));
  if ($testCode) { $body['test_event_code'] = $testCode; }

  $url = 'https://graph.facebook.com/' . $version . '/' . $pixelId . '/events?access_token=' . urlencode($token);
  pd_post($url, $body);
}

// ---- 1) Person anlegen ----
$personData = array(
  'name'  => $vorname . ' ' . $nachname,
  'email' => array(array('value' => $email, 'primary' => true, 'label' => 'work')),
);
if ($telefon !== '') {
  $personData['phone'] = array(array('value' => $telefon, 'primary' => true, 'label' => 'work'));
}
$personRes = pd_post($BASE . '/persons?api_token=' . urlencode($API_TOKEN), $personData);
if (empty($personRes['success']) || empty($personRes['data']['id'])) {
  respond(false, 'CRM-Fehler');
}
$personId = $personRes['data']['id'];

// ---- 2) Lead anlegen (Tag im Titel + sortierbarer Value) ----
if ($isKontakt) {
  $title = 'Anfrage: ' . $vorname . ' ' . $nachname;
  if ($interesseLabel !== '') { $title .= ' — ' . $interesseLabel; }
} else {
  $title = '[' . $budget['tag'] . '] ' . (($source === 'factsheet') ? 'Factsheet' : 'Sachwertvergleich') . ' 2026 — ' . $vorname . ' ' . $nachname;
}
$leadData = array('title' => $title, 'person_id' => $personId);
if (!$isKontakt && $budget['value'] > 0) {
  $leadData['value'] = array('amount' => $budget['value'], 'currency' => 'EUR');
}
$leadRes = pd_post($BASE . '/leads?api_token=' . urlencode($API_TOKEN), $leadData);
$leadId = (!empty($leadRes['success']) && !empty($leadRes['data']['id'])) ? $leadRes['data']['id'] : null;

// ---- 3) Notiz mit allen Qualifizierungs-Daten ----
$noteLines = array('Quelle: ' . $srcLabel . '.');
if ($isKontakt) {
  if ($interesseLabel !== '') { $noteLines[] = 'Interesse: ' . $interesseLabel; }
  if ($nachricht !== '')      { $noteLines[] = 'Nachricht: ' . $nachricht; }
  if ($telefon !== '')        { $noteLines[] = 'Telefon: ' . $telefon; }
} else {
  $noteLines[] = 'Ziel: persönlichen Termin vereinbaren.';
  $noteLines[] = '— — —';
  $noteLines[] = 'Investitionsrahmen: ' . $budget['label'];
  if ($erreichbarkeit !== '') { $noteLines[] = 'Beste Erreichbarkeit: ' . $erreichbarkeit; }
  if ($telefon !== '') { $noteLines[] = 'Telefon: ' . $telefon; }
  if ($variant !== '')        { $noteLines[] = 'A/B-Variante: ' . $variant; }
}

$noteData = array('content' => implode("\n", $noteLines), 'person_id' => $personId);
if ($leadId) { $noteData['lead_id'] = $leadId; }  // an den Lead hängen → im Lead sichtbar
pd_post($BASE . '/notes?api_token=' . urlencode($API_TOKEN), $noteData);

// ---- 4) Meta Conversions API: 'Lead' serverseitig melden (Dedup via event_id) ----
$contentName = $isKontakt
  ? 'Kontaktanfrage'
  : (($source === 'factsheet') ? 'Investoren-Factsheet 2026' : 'Sachwertvergleich 2026');
$customData = array(
  'currency'     => 'EUR',
  'value'        => $isKontakt ? 0 : $budget['value'],
  'content_name' => $contentName,
  'lead_source'  => $source,
);
// Klick-ID (fbc) aus dem fbclid der Anzeigen-URL bauen, falls der Pixel
// geblockt war und kein _fbc-Cookie gesetzt wurde → sonst keine Ad-Zuordnung.
if ($fbc === '' && $eventSourceUrl !== '') {
  $q = parse_url($eventSourceUrl, PHP_URL_QUERY);
  if ($q) {
    parse_str($q, $qs);
    if (!empty($qs['fbclid'])) {
      $fbc = 'fb.1.' . round(microtime(true) * 1000) . '.' . $qs['fbclid'];
    }
  }
}

meta_send_lead($META_PIXEL_ID, $META_CAPI_TOKEN, 'v19.0', $eventId, $eventSourceUrl, $email, $telefon, $vorname, $nachname, $fbp, $fbc, $customData, $META_TEST_EVENT_CODE);

respond(true, 'ok');
