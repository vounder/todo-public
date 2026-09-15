# Android-APK bauen und installieren

Eine Release-APK startet ohne Metro oder Expo Go. Beim ersten Start wird der
eigene Synchronisationsserver eingerichtet; dessen URL bleibt in den
Einstellungen änderbar. Das öffentliche Android-Paket heißt `com.todoapp.mobile`.

## Build mit Expo EAS

Im Ordner `TodoApp` nach `npm ci`:

```sh
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
```

Dabei wird das eigene Expo-Projekt eingerichtet. Das öffentliche Repository
enthält keine vorgegebene Expo-Projekt-ID und keine Signaturzugangsdaten.
Die heruntergeladene APK auf das Android-Gerät übertragen und dort öffnen.
Android fragt gegebenenfalls nach der Installationsfreigabe für die verwendete
Download- oder Dateiverwaltungs-App.

## Lokaler Build unter Windows

Voraussetzungen: installierte npm-Abhängigkeiten, Android SDK/NDK und Java 17
oder neuer. `JAVA_HOME` und `ANDROID_HOME` werden bei Bedarf auf die üblichen
Android-Studio-Verzeichnisse gesetzt.

Die private Signaturdatei liegt außerhalb des Repositories und enthält
`keystorePath`, `keyAlias`, `storePassword`, `keyPassword` sowie
`certificateSha256` (64 hexadezimale Zeichen, ohne Doppelpunkte). Für Updates
muss derselbe Schlüssel wie bei der zuvor installierten öffentlichen APK
verwendet werden.

```powershell
npm ci
npx expo prebuild --platform android --no-install
./scripts/Build-ReleaseApk.ps1 -CredentialsPath <Private-Signaturdatei> -VersionName 1.1.0 -VersionCode 11
```

`artifacts/apk` enthält die APK und ihre SHA-256-Prüfsumme. Das Skript prüft
die APK-Signatur und den erwarteten Zertifikatsfingerabdruck. Versionsnummern
müssen bei weiteren Updates erhöht und mit dem eigenen EAS-Projekt abgestimmt
werden. Schlüssel und Passwörter dürfen weder committet noch hochgeladen werden.

## Server ebenfalls aktualisieren

Version 1.1.0 benötigt zusätzlich `DELETE /api/recipes/:id` und
`DELETE /api/tags/:id`. Beim Betrieb eines älteren Servers bleiben diese
Löschvorgänge als ausstehende Synchronisierung sichtbar. Ein App-Update führt
kein automatisches Server-Deployment aus.
