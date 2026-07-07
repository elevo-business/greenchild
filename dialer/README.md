# Greenchild Power-Dialer (Pipedrive ↔ sipgate)

Eine schlanke Web-Konsole, die offene Leads aus Pipedrive („Neu" + „Nicht erreicht")
in eine Warteschlange holt und einen nach dem anderen über **sipgate Click-to-Dial**
anwählt. Nach jedem Gespräch hältst du das Ergebnis per Klick fest – die Konsole
schreibt es zurück nach Pipedrive (Lead-Label + Anruf-Aktivität + optionale Notiz)
und springt automatisch zum nächsten Lead.

> **Wichtig – kein Roboter-Dialer.** sipgate wählt nicht autonom. Die API klingelt
> zuerst **dein** Telefon (das konfigurierte Gerät) und verbindet dich erst nach dem
> Abheben mit dem Lead. Das ist gewollt und in DE auch rechtlich der einzige zulässige
> Weg für Outbound. Die Konsole macht daraus einen **Power-Dialer**: Queue laden,
> Lead für Lead automatisch anwählen, Ergebnis erfassen, weiter.

---

## Bestandteile

| Datei | Zweck |
|---|---|
| `dialer/index.html` | Konsole (Login + Dialer-Oberfläche) |
| `dialer/dialer.js` | Frontend-Logik (Warteschlange, Auto-Weiter, Ergebnis-Erfassung) |
| `dialer/dialer.css` | Styling |
| `api/dialer.php` | Backend-Proxy: hält Tokens serverseitig, spricht Pipedrive + sipgate |

Aufruf im Browser: **`https://<deine-domain>/dialer/`**

---

## Einrichtung (5 Minuten)

### 1) sipgate Personal Access Token anlegen
1. In sipgate einloggen → **Web-App → Persönliche Einstellungen → Personal Access Token**.
2. Neues Token mit den Scopes **`sessions:calls:write`** (Anrufe auslösen) und
   **`devices:read`** anlegen. Optional `history:read`.
3. Du bekommst eine **Token-ID** (`tok-…`) und ein **Token** (Secret).

### 2) sipgate-Gerät bestimmen (welches Telefon klingeln soll)
- Standard ist **`e0`** = dein erstes Gerät (VoIP-Telefon / sipgate-App / Softphone).
- Andere Geräte-IDs findest du über die sipgate-API `GET /v2/<userId>/devices` oder in
  der Web-App. Wichtig: Das Gerät muss **erreichbar/eingeloggt** sein, sonst klingelt nichts.

### 3) Secrets auf dem All-Inkl-Webspace hinterlegen
Wie bei `api/lead.php` gilt: **niemals im Repo**, am besten **oberhalb des Webroots**
(FTP-Home), sonst im Doc-Root (dort per `.htaccess` gesperrt). Zwei Wege:

**A) Umgebungsvariablen** (falls im Hosting-Panel möglich):
```
SIPGATE_TOKEN_ID=tok-xxxxxxxx
SIPGATE_TOKEN=<dein-secret>
SIPGATE_DEVICE_ID=e0
SIPGATE_CALLER_ID=+49XXXXXXXXXX     # optional: angezeigte Rufnummer
DIALER_PASSCODE=<geheimer-code>
```

**B) Secret-Dateien** (empfohlen bei All-Inkl, im FTP-Home eine Ebene über dem Webroot):
```
sipgate-token.txt      →  Inhalt: tok-xxxxxxxx:<dein-secret>      (eine Zeile, mit Doppelpunkt)
dialer-passcode.txt    →  Inhalt: <geheimer-code>
```
Der Pipedrive-Token wird aus derselben Quelle gelesen wie bei `lead.php`
(`PIPEDRIVE_API_TOKEN` bzw. `pipedrive-token.txt`) – nichts doppelt zu pflegen.

> Die `.htaccess` sperrt `sipgate-token.txt` und `dialer-passcode.txt` bereits, falls sie
> versehentlich im Webroot landen. Sicherer Ablageort bleibt trotzdem oberhalb des Webroots.

### 4) Lead-Labels in Pipedrive
Die Konsole steuert Leads über Labels. Die Standard-Namen sind:

| Zustand | Default-Label | Farbe |
|---|---|---|
| Neuer Lead (noch nicht angerufen) | **Neu** | blau |
| Erfolglos angerufen | **Nicht erreicht** | gelb |
| Gesprochen | **Erreicht** | grün |
| Rückruf terminiert | **Rückruf vereinbart** | lila |

- **Fehlende Labels werden beim ersten Queue-Aufruf automatisch angelegt** – kein manuelles Setup nötig.
- Andere Namen? Per ENV überschreiben:
  `DIALER_LABEL_NEU`, `DIALER_LABEL_NICHT_ERREICHT`, `DIALER_LABEL_ERREICHT`, `DIALER_LABEL_RUECKRUF`.
- Damit ein Lead in der Warteschlange auftaucht, muss er das Label **Neu** oder
  **Nicht erreicht** tragen. Neu eingehende Website-Leads (`api/lead.php`) kannst du
  z. B. über einen Pipedrive-Workflow automatisch mit **Neu** labeln.

---

## Bedienung

1. `https://<domain>/dialer/` öffnen → Zugangscode eingeben.
2. Die Warteschlange lädt: **neue Leads zuerst** (Speed-to-Lead), danach die am
   längsten offenen „Nicht erreicht"-Leads.
3. **📞 Anrufen** → dein Telefon klingelt → abheben → sipgate verbindet mit dem Lead.
4. Ergebnis wählen:
   - **✓ Erreicht** → Label „Erreicht", Anruf-Aktivität (erledigt).
   - **✗ Nicht erreicht** → Label bleibt „Nicht erreicht" (kommt wieder dran).
   - **↩ Rückruf** → Termin wählen → offene Rückruf-Aktivität wird angelegt, Label „Rückruf vereinbart".
   - **⌀ Falsche Nummer / 🚫 Nicht kontaktieren** → Lead wird archiviert.
   - Optionale **Notiz** landet am Lead in Pipedrive.
5. **Auto-Weiter** (oben, standardmäßig an): nach dem Ergebnis lädt der nächste Lead und
   wird nach 6 s automatisch angewählt – Countdown jederzeit stoppbar.

### Konfigurierbare Feinheiten (ENV)
| Variable | Default | Wirkung |
|---|---|---|
| `DIALER_RETRY_COOLDOWN_H` | `0` | Stunden Sperre, bevor „Nicht erreicht" erneut in die Queue kommt |
| `DIALER_QUEUE_MAX` | `75` | Max. Leads pro Warteschlangen-Ladung |

---

## Selbsttest / Diagnose
`POST /api/dialer.php` mit Body `{"action":"selftest","passcode":"<code>"}` liefert
den Konfig-Status (Token gültig? sipgate erreichbar? Labels aufgelöst?) – **ohne**
Secrets auszugeben. Praktisch nach dem Deploy oder bei Token-Rotation.

## Sicherheit
- Alle Endpunkte erfordern den `DIALER_PASSCODE` (serverseitig geprüft, `hash_equals`).
- Tokens verlassen den Server nie; das Frontend sieht nur Namen/Nummern der Leads.
- `noindex, nofollow` auf der Konsole; zusätzlich empfiehlt sich Basic-Auth via `.htaccess`
  auf `/dialer/`, wenn die Seite öffentlich erreichbar ist.
