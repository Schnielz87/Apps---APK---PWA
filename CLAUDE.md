# Apps – APK & PWA – Hinweise für Claude

- Je App ein Ordner (z. B. `Darts/`) mit `web/` (gemeinsame Oberfläche = PWA) und `android/` (WebView-Hülle, lädt `web/` als Assets).
  Funktionen immer in `web/` bauen – dann haben PWA und APK automatisch denselben Stand. Natives nur über die Brücke
  (`web/js/native.js` ↔ `android/.../NativeBridge.kt`).
- **Versionen & Updates (Schema wie PowerIPTV):** Version = `1.0.<Laufnummer>` des App-Workflows (`.github/workflows/darts.yml`).
  Workflow-Datei nie umbenennen/ersetzen (Zählung + Update-Funktion). Tags je App mit eigenem Präfix (`darts-v`),
  feste Dateinamen (`Darts-Arena.apk`) nie ändern – `UpdateManager.TAG_PREFIX/APK_NAME` suchen danach.
- Keine Actions-Artifacts (Speicherlimit) – Dateien direkt ans Release hängen. PWA landet im Branch `gh-pages` (Ordner je App).
- Neue Dateien in `web/` auch in die Liste `FILES` in `web/sw.js` eintragen (Offline-Cache).
- Keine urheberrechtlich geschützten Inhalte (Musik, echte Caller-Stimmen, fremde Logos) einbauen – Nutzer können eigene
  Dateien lokal laden (Sound-Paket, Menü-Musik).
- Keine Schlüssel/Tokens ins Repo; Signatur nur über GitHub-Secrets.
- Online-Modus (`Darts/web/js/online.js`): direkt Gerät zu Gerät per PeerJS (Vermittler `0.peerjs.com`, TURN von PeerJS).
  Online-Eingaben laufen über `localThrow`/`submitVisit`/`undo` in `app.js` – neue Eingabearten dort ebenfalls weitergeben.
  Protokoll-Version `PROTO` erhöhen, wenn sich Nachrichten ändern.
- Prüfen: `node Darts/test/games.test.mjs`; APK: `cd Darts/android && ./gradlew assembleGithubRelease`.
- README der App (`Darts/README.md`) und Spielregeln (`web/js/rules.js`) bei Änderungen mitpflegen.
