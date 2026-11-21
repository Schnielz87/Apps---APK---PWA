# 🎯 Darts Arena

Darts-Scorer, Trainings-App und Gegner in einem – mit Caller, CPU in 10 Stufen, Statistik und Motivationssystem.
Eine Oberfläche (`web/`) für beide Varianten: **PWA** im Browser und **Android-APK** (WebView-Hülle mit nativer
Sprachausgabe und Selbst-Update).

## Installation

➡️ Schritt-für-Schritt-Anleitung zum Weitergeben (inkl. iPhone): [`ANLEITUNG.md`](ANLEITUNG.md)

| Gerät | So geht's |
|---|---|
| 📱 Android | Unter [Releases](https://github.com/Schnielz87/Apps---APK---PWA/releases) `Darts-Arena.apk` laden und installieren („Unbekannte Quellen“ erlauben). |
| 🌐 iPhone, PC, jedes Handy | https://schnielz87.github.io/Apps---APK---PWA/darts/ öffnen → „Zum Startbildschirm“ / „App installieren“. Läuft danach offline. |
| 🛒 Google Play | `Darts-Arena-PlayStore.aab` in der Play Console hochladen (Variante ohne eigene Update-Funktion). |

## Funktionen

- **12 Spielmodi** – Match: X01 (101–1001, Double/Master/Single-Out, Double-/Master-In, Legs & Sets), Cricket
  (Standard, Cut-Throat, ohne Punkte), Shanghai, Halve-It, Killer, Baseball. Training: Around the Clock, Bob's 27,
  Checkout-Training, Scoring 99, Doppel-Training, 121-Checkout-Leiter.
- **CPU-Gegner in 10 Stufen** (Ø ca. 25 bis 115) – echtes Wurfmodell auf der Scheibe, kalibriert per Simulation
  (`tools/kalibrieren.mjs`), spielt Checkout-Wege wie ein Profi.
- **Caller:** The Showman (englisch, im Stil der TV-Referees), Der Kommentator, Die Schiedsrichterin, Lady Oche,
  Kneipen-Kalle, Robo-Caller 3000 – plus **eigenes Sound-Paket** (Aufnahmen per Mikrofon oder Audiodateien, z. B. ein
  lizenziertes Caller-Paket: `180.mp3`, `noscore.mp3`, `gameshot.mp3` …).
- **Eingabe:** Summe per Tastenfeld (schnell), Feld für Feld (S/D/T), oder direkt auf der Scheibe. Rückgängig jederzeit.
- **Checkout-Hilfe** für jeden Rest, inklusive Bogey-Warnung.
- **Motivation:** XP & Level mit Rängen, 29 Erfolge, Tages-Challenge, Tages-Serie, persönliche Rekorde.
- **Statistik:** Ø 3-Dart, First 9, Checkout-Quote, 180er/140+/100+, bestes Leg, Verlauf-Diagramm, Trefferbild (Heatmap).
- **📷 Kamera-Autoscore (Beta, zuschaltbar):** Handy auf Stativ, 4-Punkt-Kalibrierung, erkennt neue Darts per Bildvergleich
  und trägt sie ein (Korrektur jederzeit). Alles läuft auf dem Gerät (`web/js/cam.js`).
- **Menü-Musik** (eingebauter Loop oder eigener Song vom Gerät), Animationen, Soundeffekte, Vibration.
- Profile für mehrere Spieler, Spiel fortsetzen nach Neustart, Sicherung/Wiederherstellung, komplett offline.

## Updates (wie bei allen anderen Apps)

- Jeder Push auf `Darts/**` erzeugt Version **`1.0.<Laufnummer>`** von `.github/workflows/darts.yml`
  → Release `darts-v1.0.<Lauf>` mit `Darts-Arena.apk` (fester Name), versionierter APK, `Darts-Arena-PlayStore.aab`, `Darts-Arena-PWA.zip`.
- **APK:** prüft alle 24 h (abschaltbar, *Mehr → Updates*), zeigt „⬆ Update“, lädt die APK und öffnet den Installer.
  Nur Releases mit Präfix `darts-v` zählen – weitere Apps im Repo stören nicht.
- **PWA:** Service Worker mit Versions-Cache; neue Version → Hinweis → Antippen → aktualisiert.
- Daten (Profile, Statistik, Einstellungen) bleiben bei Updates erhalten – sofern die APK immer mit **demselben
  Schlüssel** signiert ist (Secrets `SIGNING_KEYSTORE_BASE64`, `SIGNING_STORE_PASSWORD`, `SIGNING_KEY_ALIAS`, `SIGNING_KEY_PASSWORD`).

## Entwicklung

```bash
node Darts/test/games.test.mjs                      # alle Spiele simulieren, Checkouts 2–170 prüfen
cd Darts/web && python3 -m http.server 8080         # PWA lokal testen
cd Darts/android && ./gradlew assembleGithubRelease # APK (braucht Android SDK)
NODE_PATH=$(npm root -g) node Darts/tools/logo.mjs  # Logo + alle Icons neu erzeugen
```
