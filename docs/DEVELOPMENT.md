# Entwicklung

Voraussetzungen: **Node.js 24 LTS**, npm und Git. `.nvmrc`, `.node-version`,
Engines, CI und Produktionscontainer verwenden dieselbe Node-Hauptversion.

```sh
git clone https://github.com/vounder/todo-public.git
cd todo-public
```

Windows: `./setup.ps1 -Mode developer`.
Linux/macOS: `./setup.sh --mode developer`.

Dieser Weg installiert die App- und Servertest-Abhängigkeiten reproduzierbar
mit `npm ci`. Er startet keine Server und verlangt keine Deploymentdaten.

```sh
cd TodoApp
npm start
```

Die App verwendet Expo SDK 54. Zum Entwickeln eine dazu passende Expo-Go-Version
oder einen eigenen Development-Build verwenden. Für normale App-Nutzung die
fertige APK installieren. Einen eigenen Server über den getrennten Server-
Setupweg einrichten; anschließend dessen QR-Code oder URL/Zugangsschlüssel
in der App verwenden. Kein persönlicher Standardserver wird eingebaut.

## Tests

```sh
cd TodoApp
npm test
npm run typecheck
npx expo install --check
npx expo export --platform web --platform android --output-dir dist

cd ../server
npm test
npm audit --omit=dev
```

Die Serverprüfungen testen Authentifizierung, WebSocket-Datenfreigabe und den
idempotenten Setupassistenten. App-Tests prüfen unter anderem echte HTTP-/WS-
Verbindungstests gegen isolierte Testserver, QR-Validierung, Offline-Warteschlange
und lokale Konfiguration. GitHub CI baut zusätzlich Docker, führt das Setup
zweimal aus und prüft Healthchecks, authentifizierte API-/WS-Verbindungen sowie
das Erstellen und Löschen einer Testliste.

Der Produktionsserver benötigt `MONGODB_URI` und `TODO_ACCESS_KEY`; `.env` wird
durch Compose eingelesen. Ein direkt gestarteter Node-Prozess bekommt Werte
beispielsweise mit `node --env-file=<Private-Env-Datei> server.js`. Schlüssel
nicht als öffentliche Buildvariablen verwenden.

## Android-Build

[APK-Bauanleitung](../TodoApp/RELEASE_APK.md). Kamera- und SecureStore-Module
benötigen nach Änderungen einen neuen nativen Build. Android-Paket und Signatur
bei Updates beibehalten. Prüfartefakte, `.env`, Einrichtungskarten und echte
DeployDesk-Konfigurationen sind nicht Teil des öffentlichen Quellcodes.

## Abhängigkeitsstatus

Kompatible Updates wurden übernommen. Expo SDK 54 enthält weiterhin von
`npm audit` gemeldete transitive Abhängigkeiten, insbesondere im Buildwerkzeug
(Metro/Bildgrößenanalyse, PostCSS, Xcode/UUID) sowie in der Navigation.
Ein erzwungenes `npm audit fix --force` würde einen nicht kompatiblen SDK-
Wechsel durchführen und gehört nicht zum Installationssetup. Ein gesondertes
Expo-SDK-Upgrade benötigt erneute native und visuelle Prüfungen. Externe
Deep Links werden von Todo selbst begrenzt und validiert; NavigationContainer
aktiviert keine automatische Übernahme beliebiger Routing-Links.
