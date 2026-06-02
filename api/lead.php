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
 *   2) Datei ../pipedrive-token.txt OBERHALB des Webroots (nicht im Repo)
 *   3) Fallback-Konstante unten (bitte nach dem Deploy per Token-Rotation ersetzen)
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function respond($ok, $msg = '') {
  http_response_code($ok ? 200 : 400);
  echo json_encode(array('success' => $ok, 'message' => $msg));
  exit;
}

// Nur POST zulassen.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  respond(false, 'Method not allowed');
}

// ---- Token laden (serverseitig) ----
$API_TOKEN = getenv('PIPEDRIVE_API_TOKEN');
if (!$API_TOKEN) {
  $tokenFile = __DIR__ . '/../pipedrive-token.txt';
  if (is_readable($tokenFile)) {
    $API_TOKEN = trim(file_get_contents($tokenFile));
  }
}
if (!$API_TOKEN) {
  // Fallback – nach Deploy bitte Token in Pipedrive rotieren und oben (ENV/Datei) hinterlegen.
  $API_TOKEN = '9fae1a7473002abdf89ade65319dc14a1c828a28';
}
$BASE = 'https://api.pipedrive.com/v1';

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

$isKontakt = ($source === 'kontakt');

// ---- Validierung ----
// Telefon ist Pflicht für die Lead-Magnet-LPs, beim Kontaktformular optional.
if ($vorname === '' || $nachname === '' || $email === '' || (!$isKontakt && $telefon === '')) {
  respond(false, 'Pflichtfelder fehlen');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
  respond(false, 'E-Mail ungültig');
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
pd_post($BASE . '/leads?api_token=' . urlencode($API_TOKEN), $leadData);

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
  $noteLines[] = 'Telefon: ' . $telefon;
  if ($variant !== '')        { $noteLines[] = 'A/B-Variante: ' . $variant; }
}

pd_post($BASE . '/notes?api_token=' . urlencode($API_TOKEN), array(
  'content'   => implode("\n", $noteLines),
  'person_id' => $personId,
));

respond(true, 'ok');
