# Todo

Aufgaben, Einkaufslisten und Gerichte auf deinem Android-Gerät – auf Wunsch
mit mehreren Geräten synchronisiert. Der Essensplan ergänzt den Alltag, sobald
ein eigener Server verbunden ist.

## Android-App installieren

**[APK herunterladen](https://github.com/vounder/todo-public/releases/latest)**

1. Auf dem Android-Gerät die Datei **TodoApp-1.2.0.apk** herunterladen und öffnen.
2. Falls Android fragt: Die Installation für den verwendeten Browser oder
   Dateimanager erlauben und anschließend auf **Installieren** tippen.
3. Todo öffnen und **Lokal auf diesem Gerät starten** wählen. Fertig.

Du brauchst weder Konto noch Expo, Node.js oder einen Entwicklungsrechner.
Für die Synchronisation: **Mit eigenem Server verbinden → QR-Code scannen**
und die Einrichtungskarte deines Servers scannen. Alternativ Adresse und
Zugangsschlüssel eingeben. **Prüfen und verbinden** bestätigt Server,
Datenbank, Zugang und Live-Verbindung einzeln.

Später ändern: **Einstellungen → Server verbinden**. Lokale Daten bleiben
erhalten und werden beim Verbinden mit dem gewählten Server zusammengeführt.
Der Planer und „Für später“ benötigen einen Server; Aufgaben, Einkäufe und
Gerichte funktionieren lokal. Ohne Server gibt es keine geräteübergreifende
Sicherung – die App nicht deinstallieren, wenn lokale Daten erhalten bleiben sollen.

### Aktualisieren

Die neue APK herunterladen und über die vorhandene öffentliche App installieren.
**Nicht vorher deinstallieren.** Veröffentlichte Updates verwenden denselben
Signaturschlüssel. Die öffentliche App hat den Paketnamen `com.todoapp.mobile`;
sie ist eine eigene Installation neben anders benannten privaten Builds.

## Einrichtung

| Ich möchte … | Benötigt | Einstieg |
|---|---|---|
| Todo auf Android nutzen | Android 7 oder neuer | [APK herunterladen](https://github.com/vounder/todo-public/releases/latest) |
| Mehrere Geräte synchronisieren | Einen eigenen Rechner/Server mit Docker Compose | Anleitung unten |
| Am Quellcode arbeiten | Node.js 24 LTS, npm und Git | [Entwicklung](docs/DEVELOPMENT.md) |

## Eigenen Server einrichten

Voraussetzung: [Docker mit Compose](https://docs.docker.com/compose/install/).
**Node.js und npm sind auf dem Server nicht nötig.** Docker muss gestartet sein;
der Benutzer muss Docker verwenden dürfen. Nutze den Server im privaten
Netzwerk/VPN; für einen öffentlich erreichbaren Host ist HTTPS erforderlich.

```sh
git clone https://github.com/vounder/todo-public.git
cd todo-public
```

Windows PowerShell:

```powershell
./setup.ps1 -Mode server
```

Linux/macOS:

```sh
./setup.sh --mode server
```

Der Assistent fragt nach dem Zugriff (**Handy im privaten Netzwerk/VPN** oder
**nur dieser Rechner**), Port und Datenbankname. Für das Handy die private
Adresse des Serverrechners auswählen. Docker baut den Server, startet MongoDB
und wartet, bis beide bereit sind. Danach **setup-card.local.html** im Browser
öffnen und den QR-Code in Todo scannen. Die Karte bleibt eine lokale Datei;
sie enthält den Zugangsschlüssel und gehört nur in vertrauenswürdige Hände.

Vorhandene Konfiguration, Zugangsschlüssel und Daten bleiben bei erneutem Setup
erhalten. DeployDesk ist optional und wird nur mit `-DeployDesk` bzw.
`--deploydesk` eingerichtet. Details zu Netzwerken, Fehlern, Automatisierung,
Updates, Backups und DeployDesk: **[Server-Anleitung](docs/SERVER.md)**.

## Funktionen

- Aufgaben, mehrere Einkaufslisten, Gerichte, Kategorien und Sortierungen
- Rückgängig-Aktionen und sichtbare ausstehende Synchronisation
- Lokaler Einstieg und im Betrieb änderbare Serververbindung
- Einrichtungs-QR-Code und verständliche Verbindungstests
- Zugangsschlüssel für REST und WebSocket
- Essensplan und Vorratsideen mit Server
- Helle, dunkle und systemabhängige Darstellung

## Entwicklung, Builds und Sicherheit

- [Entwicklungsumgebung und Tests](docs/DEVELOPMENT.md)
- [Eigene APK bauen und Signaturschlüssel verwalten](TodoApp/RELEASE_APK.md)
- [Umgesetzte Installationsverbesserungen](INSTALLATION_REVIEW.md)
- [Sicherheitsgrenzen](SECURITY.md)
- [MIT-Lizenz](LICENSE)
