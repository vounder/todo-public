UI/UX-Umsetzung · Android · 14.09.2026

Die vier Hauptbereiche wurden auf Grundlage der UI/UX-Analyse überarbeitet. Der linke Tab heißt jetzt „Aufgaben“ und verwendet einheitliche Listensymbole, ruhigere Karten, klare Fortschrittsangaben und sichtbare Aktionen. Die Navigation bietet ausreichend Platz für Symbole, Beschriftungen und den Android-Systembereich; ihre Höhe berücksichtigt die Systemschriftgröße.

| Bereich | Ergebnis |
| --- | --- |
| Aufgaben | Einheitliche Symbole und Karten, sichtbares Menü je Aufgabe/Liste, vollständiges Bearbeiten, offene/erledigte Gruppen, Rückgängig nach dem Entfernen einzelner Aufgaben, bestätigtes Löschen ganzer Listen. Die Android-Zurücktaste beendet zuerst eine aktive Mehrfachauswahl. |
| Einkaufen | Kleinere Kopfzeile, Kategorien als Filter bzw. Gruppen, getrennte erledigte Artikel, Bearbeiten von Artikeln, fortlaufende Eingabe mit geöffneter Tastatur. |
| Mehrere Einkaufslisten | Entfernen, Abhaken, Kategorien und Verschieben verwenden die tatsächliche Ursprungsliste. Verschieben in dieselbe Liste wird ausgeschlossen. Entfernen und Verschieben lassen sich rückgängig machen. |
| Automatisches Aufräumen | Für Einkaufsartikel abschaltbar. Ohne zuvor gespeicherte Einstellung standardmäßig aus; bisher ausdrücklich gespeicherte Stundenangaben werden übernommen. |
| Gerichte | Vollständiger Zutateneditor für Name, Menge, Einheit und Kategorien. Sichtbare Gerichtsaktionen, Löschbestätigung, Rückgängig für entfernte Zutaten. Neue Gerichte öffnen direkt die Zutatenansicht. |
| Einkauf aus Gerichten | Gemeinsamer Übertragungsdialog für einzelne Gerichte und Zufallsvorschläge. Zielliste immer sichtbar; identische offene Artikel werden angezeigt und auf Wunsch erneut hinzugefügt. Bereits erledigte Artikel verhindern einen neuen Einkauf nicht. Milch wird nicht mit Kokosmilch verwechselt. Unterschiedliche Mengen/Einheiten bleiben getrennt. |
| Für später | Das zusätzliche Merken eines Gerichts im Planer ist eine ausdrückliche Option. Die Einträge werden über die Server-API gespeichert. |
| Planer | Tagesübersicht mit einer Hinzufügen-Aktion pro Tag, Heute-Navigation, Kalender, direkte Gerichtsauswahl und einfacher Standarddialog. Alle sieben Tage der Mehrfachauswahl sind scrollbar erreichbar. |
| Fehler und Synchronisierung | Fehlerhafte Abrufe liefern keine leeren Ersatzlisten mehr. Gespeicherte Mahlzeiten/Ideen bleiben erhalten. Bei fehlgeschlagenen Änderungen bleibt der Dialog mit Eingabe und Fehlermeldung offen. Teilweise erfolgreiche Mehrfachplanungen nehmen bereits gespeicherte Ziele aus dem Wiederholungsversuch heraus. |
| Lokale Änderungen | Aufgaben, Gerichte, Einkaufslisten, Kategorien, Sortierungen und Zuordnungen erhalten eine dauerhafte lokale Sync-Warteschlange. Ausstehende Änderungen sind sichtbar; ein erneuter Versuch bzw. der nächste App-Start setzt die Synchronisierung fort. |
| Gemeinsame Bedienung | Größere Touchflächen, beschriftete Aktionen und Auswahlzustände, explizite Schließen-Aktion statt eines funktionslosen Ziehgriffs, gemeinsame Tastaturbehandlung sowie feststehende Hauptaktionen in langen Dialogen. Einstellungen sind aus allen Hauptbereichen erreichbar. |
| Lesbarkeit | Stärkere Kontraste in beiden Themes, auch für sehr helle Kategorien. Schriftgewichte werden auf die tatsächlich geladenen Inter-Dateien abgebildet, damit die Hierarchie auch unter Android sichtbar ist. |

Die zentralen Icon-Buttons und interaktiven Chips haben mindestens 48 × 48 Layoutpunkte. Das entspricht der [Android-Empfehlung für Touchziele](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views). Automatisiert geprüft wurden mindestens 4,5:1 für sekundäre Texte und Kategorie-Texte sowie 3:1 für Checkbox-Ränder auf den verwendeten hellen und dunklen Grundflächen.

Validierung des übernommenen Ausgangsstands (14.09.2026; keine Aussage über
einen Android-Build des öffentlichen Repositories):

- 18 Regressionstests mit „npm test“: Listenaktionen, Rückgängig, Zutatenabgleich, Offline-Cache, fehlgeschlagene Schreibvorgänge, dauerhafte Warteschlange über App-Neustart, verspätete Serverantworten, Änderungen während eines laufenden Abgleichs, Serverlöschungen und Kontraste.
- „npm run typecheck“: erfolgreich.
- Android-Debug-Build mit „gradlew.bat :app:assembleDebug“: erfolgreich.
- Android/Hermes-Bundle und Web-Bundle mit Expo: erfolgreich.
- Isolierte Browserprüfung mit Beispieldaten bei 320, 360 und 412 Pixeln Breite, hellem und dunklem Theme. Keine produktiven API-Aufrufe oder Schreibzugriffe.
- Bedienprüfung: Verschieben und Entfernen aus „Alle Listen“ samt Rückgängig; fortlaufende Artikel-/Aufgabeneingabe mit erhaltenem Fokus; Aufgaben-/Zutatenbearbeitung; Übertragen ohne automatische Planer-Erweiterung; bestätigtes Löschen eines Gerichts mit anschließendem erneuten Abruf.
- Offline-Prüfung: drei gespeicherte Mahlzeiten und zwei gemerkte Gerichte blieben erhalten. Ein fehlgeschlagener neuer Eintrag behielt seinen Text.
- Teilfehler-Prüfung: Samstag wurde angelegt, Sonntag schlug fehl. Erneutes Speichern legte nur Sonntag an.
- Die Hauptaktion langer Dialoge bleibt am unteren Rand erreichbar. Keine horizontalen Seitenüberläufe in der 320-Pixel-Ansicht und im Kalender.

Zum Ausliefern gehören die neuen Server-Routen DELETE /api/recipes/:id und DELETE /api/tags/:id. Die bisherigen Sync-Routen führten nur Upserts aus; gelöschte Datensätze kamen deshalb beim nächsten Abruf zurück. Die App hält Löschvorgänge so lange als ausstehend vor, bis der Server eine gültige Bestätigung liefert. Server und App wurden hier nicht produktiv ausgerollt.

Die visuellen und interaktiven Prüfungen erfolgten in der Web-Ausgabe derselben React-Native-Komponenten. Kein Android-Gerät war über ADB verbunden. TalkBack, echte Bildschirmtastatur, Systemschrift und Zurückgesten sollten vor der Veröffentlichung auf einem Gerät geprüft werden. Predictive Back bleibt bei der vorhandenen Expo-54-Konfiguration ausgeschaltet; es ist in dieser Version ein [gesondertes Opt-in](https://expo.dev/changelog/sdk-54). Die normale Zurückbehandlung und das Schließen der Dialoge wurden im Code angepasst.

Mahlzeiten und „Für später“ benötigen zum Speichern weiterhin eine Serververbindung. Bei Fehlern bleiben ihre Eingaben offen. Die lokale Warteschlange gilt für die oben genannten Listen-/Gerichtsdaten.

Optionale Produktideen aus dem Audit wie Portionsumrechnung und häufig gekaufte Artikel sind keine Bestandteile dieser Überarbeitung.
