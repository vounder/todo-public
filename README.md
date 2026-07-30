# Todo Public

Eine selbst gehostete React-Native-App für Todos, Einkaufslisten, Rezepte und
Essensplanung. Mehrere Geräte synchronisieren sich über ein Express-/WebSocket-
Backend mit MongoDB.

Dieses öffentliche Repository enthält bewusst keine persönlichen Serverdaten,
Zugangsdaten oder echte Deployment-Ziele. Laufzeit- und Deploymentwerte werden
lokal eingerichtet und von Git ignoriert.

## Funktionen

- Todo-Listen mit automatischer Bereinigung erledigter Einträge
- Einkaufslisten, Kategorien und eigene Sortierungen
- Rezepte, Essensplan und Vorratsliste
- Echtzeit-Synchronisation über WebSocket
- Hell-, Dunkel- und Systemdarstellung
- konfigurierbarer Synchronisationsserver
- Docker-Compose- und DeployDesk-Unterstützung

## Voraussetzungen

- Node.js 22.13 oder neuer (Produktionscontainer des Backends: gepinntes Node.js 20)
- npm
- Docker mit Docker Compose für das selbst gehostete Backend
- Expo Go oder eine lokale Expo-Build-Umgebung für die App
- optional: DeployDesk auf Windows sowie Git und OpenSSH

## Einrichtung

Repository klonen und das Setup im Projektordner starten:

```powershell
.\setup.ps1
```

oder auf Unix-Systemen:

```sh
./setup.sh
```

Das Setup:

1. installiert App- und Serverabhängigkeiten reproduzierbar aus den Lockfiles;
2. fragt die lokale Server- und Datenbankkonfiguration ab;
3. erzeugt eine nicht getrackte `.env`, ohne vorhandene Werte zu überschreiben;
4. kann eine lokale, ebenfalls ignorierte `todo-public.deploylink` erzeugen.

Die getrackten Dateien `.env.example` und
`todo-public.deploylink.example` sind ausschließlich neutrale Vorlagen. Echte
Werte gehören nie in einen Commit.

### Nicht-interaktives Setup

Automatisierung kann die folgenden Umgebungsvariablen setzen:

- `TODO_SERVER_PORT`
- `TODO_MONGO_DB_NAME`
- `TODO_CORS_ORIGINS` (optional, kommaseparierte HTTP(S)-Origins)
- `TODO_DEPLOY_PROJECT_ID`
- `TODO_DEPLOY_HOST`
- `TODO_DEPLOY_USER`
- `TODO_DEPLOY_SSH_PORT`
- `TODO_DEPLOY_REMOTE_PATH`
- `TODO_DEPLOY_BRANCH`
- `TODO_DEPLOY_HEALTH_PORT`
- `TODO_DEPLOY_HEALTH_PATH`

`setup.ps1 -NonInteractive` bricht bei fehlenden erforderlichen Deploymentwerten
ab. Das Shell-Setup lässt die DeployDesk-Datei aus, wenn nicht alle
`TODO_DEPLOY_*`-Werte gesetzt wurden.

## Backend starten

Nach dem Setup:

```sh
docker compose config
docker compose up -d --build
```

MongoDB bleibt ausschließlich im internen Compose-Netz. Der im Setup gewählte
App-Port wird standardmäßig nur an `127.0.0.1` gebunden. Der Endpunkt `/health`
liefert erst dann Erfolg, wenn die Datenbankverbindung bereit ist.

Wichtige lokale Compose-Werte:

| Variable | Zweck |
|---|---|
| `COMPOSE_PROJECT_NAME` | eindeutiger Name der lokalen Compose-Umgebung |
| `SERVER_BIND_ADDRESS` | Host-Bindeadresse; sicherer Standard: `127.0.0.1` |
| `SERVER_HOST_PORT` | veröffentlichter Port des Hosts |
| `SERVER_CONTAINER_PORT` | Port des Node-Servers im Container |
| `MONGO_DB_NAME` | Name der MongoDB-Datenbank |
| `CORS_ORIGINS` | optionale Browser-Origins |

Für Produktion muss externer Zugriff über einen authentifizierten
TLS-Reverse-Proxy erfolgen. Außerdem sollten restriktive Firewallregeln,
Backups und ein unprivilegierter Deploymentbenutzer verwendet werden.

## App starten

```sh
cd TodoApp
npm start
```

Beim ersten Start fragt die App nach der Basis-URL des eigenen Servers. Erlaubt
sind vollständige `http://`- oder `https://`-Origins ohne Pfad, Zugangsdaten,
Query oder Fragment. REST (`/api`) sowie WS/WSS werden daraus automatisch
abgeleitet.

Die URL lässt sich später unter **Einstellungen → Synchronisationsserver**
ändern oder auf den Build-Standard zurücksetzen.

Für verwaltete Builds kann ein neutraler Standard gesetzt werden:

```sh
EXPO_PUBLIC_SERVER_URL=https://sync.example.test npm start
```

Ein lokal gespeicherter Wert hat Vorrang vor diesem Build-Standard.

## DeployDesk

DeployDesk liest einen Schema-v2-Link und startet den repositoryeigenen Runner:

- Vorlage: `todo-public.deploylink.example`
- lokale Konfiguration: `todo-public.deploylink` (gitignored)
- Runner: `deploy/deploy.ps1`

Nach dem PowerShell-Setup kann die erzeugte `todo-public.deploylink` in
DeployDesk importiert werden. Vor dem ersten echten Einsatz empfiehlt sich die
nebenwirkungsfreie Prüfung:

```powershell
.\deploy\deploy.ps1 `
  -DeployLinkPath .\todo-public.deploylink `
  -ValidateOnly `
  -NonInteractive `
  -OutputFormat JsonLines
```

`ValidateOnly` führt weder Push noch SSH, Compose oder einen Netzwerk-
Healthcheck aus. Ein echtes Deployment:

1. validiert Link, Pfade, Branch und Werkzeuge erneut;
2. verlangt einen sauberen Arbeitsbaum; neue lokale Änderungen müssen bewusst
   vorab gestaged werden, bevor der Runner sie optional committet;
3. pusht den exakten lokalen Commit zum konfigurierten Remote/Branch;
4. verwendet SSH im Batch-Modus mit normaler Host-Key-Prüfung;
5. sperrt parallele Deployments und bindet den Server-Checkout exakt an den
   zuvor geprüften Commit;
6. verweigert unsaubere Server-Checkouts und aktualisiert nur per Fast Forward;
7. nutzt eine projektbezogene Compose-Umgebung, baut und startet die Container;
8. meldet erst nach erfolgreichem serverlokalem Healthcheck `completed`.

Der Runner führt kein privilegiertes Server-Provisioning aus. SSH-Schlüssel,
Registry-Zugang, Host-Key-Freigabe, Reverse Proxy, TLS, Firewall und Backups
müssen einmalig außerhalb des Repositories eingerichtet werden.

## Entwicklung und Prüfungen

```sh
cd TodoApp
npm ci
npm test
npm run typecheck

cd ../server
npm ci
npm test
```

Zusätzliche lokale Prüfungen:

```powershell
.\scripts\check-public-safety.ps1
.\deploy\deploy.ps1 -DeployLinkPath .\todo-public.deploylink.example -ValidateOnly
```

Die zweite Zeile prüft nur die neutrale Vorlage. Für DeployDesk selbst wird die
vom Setup erzeugte Datei mit der echten `.deploylink`-Endung importiert.

## Datenmigration

Das optionale Rezept-Migrationsskript benötigt eine bewusst gesetzte
Server-Origin und enthält keinen Standardserver:

```sh
TODO_SERVER_URL=https://sync.example.test node migrate-recipes.js
```

## Sicherheitsgrenzen und Wiederherstellung

- `.env`, echte `*.deploylink`, Schlüssel, Tokens und lokale Konfiguration sind
  ignoriert.
- Zielwerte werden nicht in Setup-Ausgaben wiederholt.
- Der DeployDesk-Vertrauenshash umfasst Link und Runner, nicht den gesamten
  Quellbaum oder externe Werkzeuge.
- Ein abgebrochener Runner kann bereits ausgeführte Remote-Schritte nicht
  zurückrollen.
- Vor Updates sollten MongoDB-Volumes gesichert werden. Eine Wiederherstellung
  erfolgt aus einem geprüften Datenbankbackup und einem bekannten Git-Commit.

Sicherheitslücken bitte ohne Hosts, Zugangsdaten, Logs oder Produktionsdaten
melden.

## Lizenz

[MIT](LICENSE) – Copyright Todo Contributors
