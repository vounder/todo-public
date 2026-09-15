# Installationsanalyse – 15.09.2026

## Umsetzung in Version 1.2.0

Die nachfolgende ursprüngliche Analyse wurde umgesetzt:

- Getrennte Setupwege `app`, `server` und `developer` auf Windows und Unix.
  App-Nutzer benötigen keine Entwicklungswerkzeuge; Serverbetreiber nur Docker.
- DeployDesk ist ausdrücklich optional. Das nicht-interaktive lokale Setup
  funktioniert ohne SSH-/Deploymentangaben.
- Gemeinsamer Assistent für Port, Datenbank, privaten Netzwerk-/VPN-Zugang,
  wiederholbare Konfiguration und eine lokale QR-Einrichtungskarte.
- Zufälliger Zugangsschlüssel für REST und WebSocket. Vor der Anmeldung werden
  keine Nutzerdaten gesendet. Native Zugangsdaten liegen im sicheren Gerätespeicher.
- Die App bietet zuerst einen lokalen Einstieg. Verbindungstests prüfen HTTP,
  Datenbank, Anmeldung und WebSocket getrennt; nur eine erfolgreiche Verbindung
  wird gespeichert. QR-Codes und App-Links übernehmen die Verbindungsdaten.
- Node.js 24 LTS in Engines, Setup, Versionsdateien, CI und Container.
- Eigenständiger signierter APK-Build mit dokumentierter, stabiler öffentlicher
  Signatur; kein Expo- oder Entwicklungsserver für die Nutzung erforderlich.
- Die CI enthält einen echten Docker-Installationstest samt Wiederholung,
  Zugriffsschutz, API-Schreibtest und WebSocket-Anmeldung.

Die aktuelle Anleitung steht in [README.md](README.md). Die alte Bewertung
unten beschreibt den Ausgangszustand, nicht Version 1.2.0. Ein neuer messbarer
Usability-Wert benötigt Nutzertests; ein technischer Durchlauf allein ersetzt
diese nicht. VPN-/TLS-Betrieb, Backups und Firewallregeln bleiben Aufgaben des
Serverbetreibers und sind nun ausdrücklich erklärt.

## Ursprünglicher Befund vor der Umsetzung

## Einschätzung

Für Menschen ohne Entwicklungserfahrung ist die Einrichtung derzeit schwierig:
**3/10**. Für erfahrene Self-Hosting-Nutzer: **6/10**. Das sind Einschätzungen
aus Code, Dokumentation und technischen Prüfungen, keine Ergebnisse eines
Nutzertests. Die App setzt voraus, dass jemand einen erreichbaren Server
bereitstellt; App-Installation und Serverbetrieb sollten getrennte Wege sein.

Positiv: reproduzierbare npm-Installationen, persistente Docker-Daten,
Datenbank-Healthcheck, Schutz vorhandener Konfiguration und eine im Betrieb
änderbare Server-URL. Die öffentliche Variante benötigt keine fest eingebauten
persönlichen Serverdaten. Version 1.1.0 verbessert die Rückmeldung bei
ausstehenden Synchronisationen.

## Größte Hürden und Verbesserungen

| Priorität | Beobachtung | Auswirkung | Verbesserung |
|---|---|---|---|
| 1 | Im öffentlichen Repository gibt es zum Prüfzeitpunkt keine GitHub-Releases/APKs. | Nutzer brauchen Expo Go oder müssen selbst bauen. | Signierte öffentliche APK mit stabiler Update-Signatur veröffentlichen; Download-Link und kurze Android-Installationsanleitung an den Anfang der README. APK aus der öffentlichen Konfiguration bauen. |
| 1 | `setup.ps1` erzeugt einen DeployDesk-Link zwingend, falls noch keiner existiert. | Ein lokales Setup verlangt SSH-Host, Benutzer und Remote-Pfad; `-NonInteractive` scheitert ohne Host. | Auswahl „App / Server lokal / Server remote“; DeployDesk nur bei ausdrücklicher Auswahl konfigurieren. |
| 1 | Compose bindet standardmäßig an `127.0.0.1`; es fehlt ein vollständiger Handy-Verbindungsweg. | Das Smartphone erreicht den Rechner über diesen Loopback-Zugang nicht; `localhost` am Handy bezeichnet das Handy selbst. | Einen dokumentierten privaten Netzwerkzugang anbieten, Erreichbarkeit testen und die tatsächlich nutzbare URL bzw. einen Einrichtungs-QR-Code anzeigen. Den Serverzugang bewusst konfigurieren. |
| 1 | Das Backend besitzt keine Anwendungsanmeldung. Die Dokumentation setzt externe Zugriffskontrolle voraus. | VPN oder Proxy und TLS sind zusätzliche manuelle Einrichtung. Die App bietet kein Login und keine Eingabe von Proxy-Zugangsdaten. | Einen durchgängig geprüften Zugangsweg unterstützen: zunächst einen privaten Netzwerkzugang; für weitere Zielgruppen eine passende Anmeldung samt REST- und WebSocket-Authentifizierung. |
| 2 | Der Ersteinrichtungsbildschirm prüft die Schreibweise der URL und lässt dann weiter. | Eine nicht erreichbare Adresse wird akzeptiert; Hinweise erscheinen erst in der App. Ohne URL lässt sich die App nicht ausprobieren. | „Verbindung testen“ mit getrennten Ergebnissen für HTTP, Datenbankbereitschaft und WebSocket; konkrete Fehlertexte. Optionaler lokaler Einstieg, mit klarer Kennzeichnung der serverpflichtigen Planerfunktionen. |
| 2 | Beide Setups installieren immer App- und Serverpakete; Docker-Prüfung und Start gehören nicht zum Setup. | Auch reine Docker-Nutzer benötigen auf dem Host Node/npm und warten auf unnötige App-Pakete. | Komponenten getrennt installieren; Docker/Compose und Port vorab prüfen, optional starten und auf `/health` warten. |
| 2 | README und Skripte verlangen nur Node 20+, das installierte React Native jedoch mindestens 20.19.4. Container und CI verwenden Node 20. | Formal akzeptierte alte Versionen können scheitern; Node 20 ist inzwischen außer Wartung. | Eine unterstützte LTS-Version festlegen und README, Versionsprüfung, Engines, CI und Container gemeinsam darauf abstimmen. |
| 2 | PowerShell fragt Werte ab; `setup.sh` nutzt ohne Dialog Standardwerte. | Die allgemeine Beschreibung „Setup fragt Konfiguration ab“ gilt nicht auf allen Plattformen. Der Abschluss nennt keinen vollständigen nächsten Schritt. | Gleiches Setup-Verhalten oder eindeutig getrennte Anleitungen; Abschluss mit Startbefehl, URL und Prüfung. |

Die Node-Untergrenze ist in `TodoApp/node_modules/react-native/package.json`
aus der Lockfile-Installation nachvollziehbar; die
[Expo-SDK-54-Referenz](https://docs.expo.dev/versions/v54.0.0/) nennt Node
20.19.x. Der Wartungsstatus ist in der offiziellen
[Node.js-EOL-Übersicht](https://nodejs.org/en/about/eol) dokumentiert.

## Empfohlene Reihenfolge

1. **Einrichtungsblockaden beseitigen:** DeployDesk optional machen,
   unterstützte Node-Version prüfen, README um Klonbefehl und getrennte
   Nutzer-/Server-/Entwicklerpfade ergänzen. Netzwerkzugang verständlich erklären.
2. **Installation ohne Entwicklungsumgebung:** Öffentliche signierte APK
   anbieten. Zielablauf: herunterladen → installieren → Server verbinden.
   Update derselben App ohne Deinstallation auf einem Android-Gerät prüfen.
3. **Server verbinden vereinfachen:** Erreichbarkeit und WebSocket testen,
   verständliche Fehlermeldungen und QR-Einrichtung ergänzen. Zugriffskontrolle
   muss zum ausgewählten Netzwerkweg passen.

Erfolgskriterium für Endnutzer: Auf einem frischen Android-Gerät ohne Node,
Git oder Expo gelingt die Installation und Verbindung zu einem vorbereiteten
Server allein mit der kurzen Anleitung. Für Serverbetreiber: Ein sauberer
Rechner mit Docker erreicht nach dem gewählten Setup einen gesunden Server,
ohne unnötige App-Abhängigkeiten oder DeployDesk-Pflichtangaben.

## Prüfumfang und Abgrenzung

- App- und Serverabhängigkeiten wurden aus den Lockfiles installiert.
- 24 App-Tests und ein Server-Healthcheck-Test bestehen; die App-Tests umfassen
  auch Löschrouten, Offline-Warteschlange und die öffentliche Serverkonfiguration.
- Typprüfung und Expo-Abhängigkeitsprüfung bestehen. Die beim Abgleich
  aufgefallene Expo-Patchlücke und verwundbare Serverabhängigkeiten wurden
  aktualisiert; `npm audit --omit=dev` meldet serverseitig keine Schwachstellen.
- Android-Prebuild erzeugt die öffentliche Paketkonfiguration.
  Web- und Android/Hermes-Export wurden erfolgreich erstellt. Eine signierte
  öffentliche APK und ein echter Android-Installationstest gehören nicht zu
  diesem Quellcode-Abgleich.
- Der Windows-Setup-Abbruch wurde in einem isolierten Verzeichnis mit echtem
  Setupskript und simulierter npm-Installation reproduziert:
  `setup.ps1 -NonInteractive` → `Invalid DeployDesk host.`
- Die DeployDesk-Vorlage besteht `ValidateOnly`. Docker ist lokal nicht
  verfügbar; ein vollständiger Server-/Handy-Installationstest wurde hier
  nicht durchgeführt. Externe Zielsysteme wurden nicht verändert.

Die vorgeschlagenen Änderungen am Setup und Onboarding sind Empfehlungen für
den nächsten Arbeitsschritt. Der aktuelle Abgleich aktualisiert den App- und
Serverquellcode sowie die zugehörigen Build-Anweisungen.
