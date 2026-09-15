# Android-APK bauen und installieren

Eine Release-APK startet ohne Metro oder Expo Go. Beim ersten Start kann Todo
lokal verwendet oder per QR-Code mit einem Server verbunden werden. Das
öffentliche Android-Paket heißt `com.todoapp.mobile`.

Fertige Downloads: [GitHub-Releases](https://github.com/vounder/todo-public/releases/latest).
Version 1.2.0 verwendet Android versionCode 13. Für Updates dieselbe öffentliche
Signatur verwenden und einen höheren versionCode wählen. Die APK enthält
keine persönlichen Serveradressen oder Zugangsschlüssel.

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

Voraussetzungen: Node.js 24 LTS, installierte npm-Abhängigkeiten, Android SDK/NDK und Java 17
oder neuer. `JAVA_HOME` und `ANDROID_HOME` werden bei Bedarf auf die üblichen
Android-Studio-Verzeichnisse gesetzt.

Die private Signaturdatei liegt außerhalb des Repositories und enthält
`keystorePath`, `keyAlias`, `storePassword`, `keyPassword` sowie
`certificateSha256` (64 hexadezimale Zeichen, ohne Doppelpunkte). Für Updates
muss derselbe Schlüssel wie bei der zuvor installierten öffentlichen APK
verwendet werden.

```powershell
npm ci
# Nur beim ersten eigenen Build: privaten Schlüssel außerhalb des Repos anlegen.
./scripts/Create-SigningKey.ps1
npx expo prebuild --platform android --no-install
./scripts/Build-ReleaseApk.ps1 -CredentialsPath "$env:USERPROFILE/.android/todo-public-release/signing.json"
```

`Create-SigningKey.ps1` verweigert das Überschreiben vorhandener Schlüssel.
Das gesamte Schlüsselverzeichnis privat außerhalb des Rechners sichern. Ohne
diesen Schlüssel können bestehende Installationen nicht regulär aktualisiert
werden. Ein eigener Schlüssel erstellt einen eigenen Build; er kann die
offizielle öffentliche APK nicht als Update ersetzen.

Öffentlicher Zertifikatsfingerabdruck der offiziellen Version (SHA-256):

```text
3f87f2d3a4420389607284ddb8bac2ddee4dd6f61253c51f64108903a5c225d9
```

`artifacts/apk` enthält die APK und ihre SHA-256-Prüfsumme. Das Skript prüft
die APK-Signatur und den erwarteten Zertifikatsfingerabdruck. Versionsnummern
müssen bei weiteren Updates erhöht und mit dem eigenen EAS-Projekt abgestimmt
werden. Schlüssel und Passwörter dürfen weder committet noch hochgeladen werden.

## Server ebenfalls aktualisieren

Version 1.2.0 benötigt den Serverstand mit Zugangsschlüssel und dem neuen
Verbindungsprotokoll. Den Server über das Setup aktualisieren und die Geräte
mit der neuen Einrichtungskarte verbinden. Ein App-Update führt kein
automatisches Server-Deployment aus.
