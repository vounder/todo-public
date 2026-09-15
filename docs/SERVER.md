# Server einrichten und betreiben

## Einrichtungswege

Das Setup läuft auf dem Rechner, auf dem der Server betrieben werden soll.
Unter Linux ggf. zuerst per SSH anmelden, dann das öffentliche Repository
klonen und `./setup.sh --mode server` ausführen. Unter Windows
`./setup.ps1 -Mode server` verwenden. Es werden nur Docker-Container gebaut;
App-Pakete und Node.js müssen auf diesem Rechner nicht installiert sein.

Das Setup prüft Docker und Compose, validiert Konfiguration und Portnummern,
erstellt `.env` und eine lokale Einrichtungskarte, startet den Server und wartet
bis zu 120 Sekunden auf die Healthchecks. Wenn der Port nicht gebunden werden
kann, meldet Docker den Konflikt. Der Assistent meldet dann keinen Erfolg.

Ohne Serverstart: `-NoStart` bzw. `--no-start`. Die Einrichtungskarte ist dann
vorbereitet, die App kann sich aber erst nach `docker compose up -d --wait`
verbinden.

## Handy erreichen lassen

**Privates Netzwerk:** Handy und Server müssen sich im selben vertrauenswürdigen
Netzwerk befinden. Im Assistenten „Handy im privaten Netzwerk/VPN“ wählen und
die private IPv4-Adresse des Rechners verwenden. Bei mehreren Netzwerkkarten
die Adresse des tatsächlich verwendeten Netzwerks wählen. Eine feste DHCP-
Zuweisung am Router verhindert spätere Adresswechsel. Docker-Zugriff in der
Windows-Firewall auf das private Netzwerk begrenzen. WLAN-Gastnetze blockieren
häufig die Kommunikation zwischen Geräten.

**VPN:** Beide Geräte mit demselben privaten VPN verbinden und dessen
IPv4-Adresse als Serveradresse wählen. Der Assistent akzeptiert auch Adressen
aus dem für solche Netze üblichen CGNAT-Bereich. Ob die VPN-Regeln Zugriff
erlauben, prüft die App beim Verbinden. VPN-Software und Zugriffsregeln werden
außerhalb dieser App eingerichtet.

**Nur dieser Rechner:** Der Standard `127.0.0.1` eignet sich für lokale Tests.
Er ist vom Handy nicht erreichbar. `localhost` in der Handy-App bezeichnet
das Handy selbst. Für einen späteren Wechsel `SERVER_BIND_ADDRESS` und
`TODO_PUBLIC_URL` in `.env` auf die private Serveradresse setzen und das Setup
erneut ausführen. Der Assistent überschreibt vorhandene Werte nicht.

**Öffentlicher Server:** Einen TLS-Reverse-Proxy mit HTTPS vor den lokal
gebundenen Dienst setzen. Der Proxy muss `/health`, `/api/*` und WebSocket-
Upgrades auf `/` weiterleiten und den Authorization-Header erhalten.
`TODO_PUBLIC_URL=https://sync.example.test` auf die tatsächliche HTTPS-Origin
setzen und die Einrichtungskarte neu erzeugen. Die Anmeldung übernimmt der
Todo-Zugangsschlüssel. Eine zusätzliche Browser-Login-Seite vor der API ist
mit der nativen App nicht kompatibel. Kein Portforwarding auf den unverschlüsselten
Dienst einrichten; HTTP im LAN verschlüsselt weder Zugangsschlüssel noch Daten.

## Automatisierung

Die Optionen entsprechen sich auf beiden Plattformen:

```powershell
./setup.ps1 -Mode server -NonInteractive
```

```sh
./setup.sh --mode server --non-interactive
```

Ohne weitere Angaben wird ausschließlich Loopback eingerichtet. Für ein Handy
`TODO_BIND_ADDRESS` vorab auf eine konkrete private Netzwerk-/VPN-Adresse setzen.
Weitere optionale Umgebungsvariablen:

| Variable | Standard / Zweck |
|---|---|
| `TODO_SERVER_PORT` | `8080`, veröffentlichter Hostport |
| `TODO_MONGO_DB_NAME` | `todoapp` |
| `TODO_PUBLIC_URL` | Aus Bindeadresse und Port; kann eine HTTPS-Origin sein |
| `TODO_CORS_ORIGINS` | Optionale Browser-Origins, kommasepariert |
| `TODO_NETWORK_ADDRESSES` | Optionale kommaseparierte Liste für den Dialog |

Im gespeicherten `.env` stehen die Compose-Werte `SERVER_BIND_ADDRESS`,
`SERVER_HOST_PORT`, `SERVER_CONTAINER_PORT`, `MONGO_DB_NAME`,
`COMPOSE_PROJECT_NAME`, `CORS_ORIGINS`, `TODO_PUBLIC_URL` und `TODO_ACCESS_KEY`.
Diese Datei verwendet unquotiertes `KEY=value` ohne Shell-Befehle. Den
Zugangsschlüssel erzeugt das Setup kryptografisch zufällig. Er wird nicht in
der Konsole ausgegeben. Die Vorlage `.env.example` enthält absichtlich keinen
funktionierenden Schlüssel; sie allein startet keinen Server.

Für einen Browser-Client kann `CORS_ORIGINS` dessen vollständige Origin enthalten,
mehrere getrennt durch Kommas. Native Android-Clients benötigen diese Einstellung
nicht. CORS ersetzt keine Authentifizierung.

## Updates und Daten

1. MongoDB sichern, beispielsweise durch einen administrierten `mongodump`-
   Backupjob. Das Volume `mongo_data` enthält die dauerhaften Daten; regelmäßige
   Backups außerhalb des Rechners und eine geprüfte Wiederherstellung einrichten.
2. `git pull --ff-only` ausführen und danach das Setup erneut starten.
3. Nach erfolgreicher Serverprüfung die aktuelle APK installieren.

Die Version 1.2.0 führt verpflichtende Zugangsschlüssel ein. Bei einem Update
von 1.1.0 erzeugt das Setup den fehlenden Schlüssel, ohne vorhandene Serverwerte
zu ändern. Geräte benötigen die neue App und die aktuelle Einrichtungskarte.
Alte Clients können sich danach nicht mehr anonym verbinden. Das App-Update
allein aktualisiert den Server nicht.

```sh
docker compose ps
docker compose logs --tail 50 server
docker compose up -d --wait
docker compose down
```

`down` stoppt die Container und erhält die Daten. **`down -v` löscht die
Datenbankvolumes** und gehört nicht zum normalen Update- oder Neustartablauf.

## Verbindungsprobleme

Falls Windows die Ausführung einer heruntergeladenen PowerShell-Datei blockiert,
kannst du nach Prüfung der Datei ausschließlich diesen Aufruf freigeben:
`powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1 -Mode server`.
Eine dauerhafte Änderung der systemweiten Ausführungsrichtlinie ist nicht nötig.

| Anzeige | Nächster Schritt |
|---|---|
| Docker fehlt / läuft nicht | Docker mit Compose installieren bzw. starten |
| Port bereits belegt | In `.env` einen freien `SERVER_HOST_PORT` und den dazugehörigen Port in `TODO_PUBLIC_URL` setzen; Setup erneut ausführen |
| Server nicht erreichbar | Adresse, VPN, WLAN-Isolation und Firewall prüfen; keine Handy-URL mit localhost verwenden |
| Kein kompatibler Todo-Server | Origin ohne `/api` verwenden; Server auf 1.2.0 aktualisieren |
| Datenbank nicht bereit | `docker compose ps` und `docker compose logs --tail 50 mongo` prüfen |
| Zugangsschlüssel stimmt nicht | Aktuelle Einrichtungskarte neu scannen |
| Live-Verbindung schlägt fehl | WebSocket-Upgrades im Proxy oder VPN-Regeln prüfen |

Einrichtungskarte verloren: Setup erneut ausführen. Der bestehende Schlüssel
bleibt erhalten. Zugriff widerrufen: `TODO_ACCESS_KEY` in `.env` durch einen
neuen zufälligen Schlüssel (mindestens 32 Zeichen) ersetzen, Setup erneut
starten und nur berechtigte Geräte mit der neuen Karte verbinden. Der
Containerneustart trennt bestehende Verbindungen.

## Optional: DeployDesk

Windows: `./setup.ps1 -Mode server -DeployDesk`.
Linux/macOS: `./setup.sh --mode server --deploydesk` erzeugt ebenfalls die
Konfigurationsdatei; der DeployDesk-Runner selbst läuft unter PowerShell.
Abgefragt werden Host, SSH-Benutzer und absoluter Remote-Projektpfad.
Nicht-interaktiv sind dafür `TODO_DEPLOY_HOST`, `TODO_DEPLOY_USER` und
`TODO_DEPLOY_REMOTE_PATH` erforderlich. Optional: `TODO_DEPLOY_PROJECT_ID`,
`TODO_DEPLOY_BRANCH` (main), `TODO_DEPLOY_SSH_PORT` (22),
`TODO_DEPLOY_HEALTH_PORT` (8080).

Auf dem entfernten Server muss einmalig das Server-Setup gelaufen sein. SSH,
Host-Key-Vertrauen, Docker-Berechtigungen und der saubere Git-Checkout müssen
vorhanden sein. Die lokale `.env` und Einrichtungskarte werden nicht vom
Runner hochgeladen. Importiere die erzeugte `todo-public.deploylink` in DeployDesk.

```powershell
./deploy/deploy.ps1 -DeployLinkPath ./todo-public.deploylink -ValidateOnly -NonInteractive
```

Die Prüfung verändert weder GitHub noch den Server. Ein echtes Deployment
ohne `-ValidateOnly` pusht und aktualisiert den konfigurierten Server gemäß
dem DeployDesk-Runner. Änderungen müssen vorher bewusst gestaged werden.
