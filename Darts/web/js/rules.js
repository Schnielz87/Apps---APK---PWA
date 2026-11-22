// Kurze Spielregeln (Hilfe-Seite und Info-Knopf im Spiel).
export const RULES = {
  x01: `Jeder startet mit derselben Punktzahl (z. B. 501) und zieht seine Aufnahmen ab. Gewonnen hat, wer genau auf 0 kommt.
• Double-Out: der letzte Dart muss ein Doppel (oder Bull) sein. Master-Out: Doppel oder Triple. Single-Out: beliebig.
• Überworfen (Rest unter 0, Rest 1 bei Double-Out oder 0 ohne Doppel): die Aufnahme zählt nicht.
• Double-In/Master-In: Punkte zählen erst nach dem ersten Doppel (bzw. Triple).
• Eingabe per Tastatur (Summe der Aufnahme) oder Dart für Dart. Beim Finish fragt die App, mit dem wievielten Dart gecheckt wurde.`,
  cricket: `Gespielt wird auf 15–20 und Bull. Ein Feld ist „geschlossen“, wenn es 3 Marks hat (Single = 1, Double = 2, Triple = 3).
• Standard: Treffer auf eigene geschlossene Felder bringen Punkte, solange ein Gegner dort noch offen ist. Sieger: alles zu und mindestens gleich viele Punkte.
• Cut-Throat: Punkte gehen an die Gegner – wenig Punkte sind gut.
• Ohne Punkte: wer zuerst alles schließt, gewinnt.`,
  atc: `Treffe nacheinander 1 bis 20 (und optional Bull). Gezählt werden die Darts – je weniger, desto besser.
• Variante „nur Double/Triple“ für Fortgeschrittene, „springt weiter“: ein Double zählt zwei Felder.`,
  bobs27: `Start mit 27 Punkten. In jeder Runde 3 Darts auf ein Doppel (D1, D2 … D20, Bull).
• Jeder Treffer bringt den Wert des Doppels.
• Kein Treffer in der Runde: der Doppel-Wert wird abgezogen. Unter 0 = ausgeschieden (Profi-Regel).`,
  checkout: `Die App stellt eine zufällige Restzahl. Checke sie mit Double-Out in der vorgegebenen Dart-Anzahl.
• Der empfohlene Weg wird angezeigt. Überworfen = zurück auf den Rest zu Beginn der Aufnahme.`,
  scoring: `Feste Anzahl Aufnahmen auf ein Ziel (z. B. T20). Alle Punkte zählen – perfekt, um den Schnitt zu steigern.`,
  doubles: `Pro Doppel drei Darts. Gezählt werden die Treffer – mit Trefferquote.`,
  121: `Checke 121 mit maximal 9 Darts (Double-Out). Geschafft: nächstes Ziel 122. Verpasst: ein Ziel zurück (nie unter 121).`,
  shanghai: `Runde 1 = Zahl 1, Runde 2 = Zahl 2 usw. Nur die Zahl der Runde zählt (Single/Double/Triple).
• Single, Double UND Triple der Zahl in einer Aufnahme = Shanghai = sofortiger Sieg.`,
  halveit: `Neun Ziele nacheinander: 15, 16, beliebiges Doppel, 17, 18, beliebiges Triple, 19, 20, Bull. Start mit 40 Punkten.
• Treffer aufs Ziel zählen. Wird das Ziel in einer Aufnahme komplett verfehlt, halbieren sich deine Punkte.`,
  killer: `Jeder bekommt zufällig eine Zahl. Triff das Doppel deiner Zahl, um „Killer“ zu werden.
• Als Killer nimmst du Gegnern mit Treffern auf ihr Doppel ein Leben. Eigenes Doppel als Killer kostet dich ein Leben.
• Wer zuletzt noch Leben hat, gewinnt.`,
  elimination: `Alle starten bei 0 und zählen ihre Punkte nach oben – Ziel ist genau 301 (bzw. 501).
• Jeder einzelne Pfeil zählt: Erreichst du – auch schon mit dem 1. oder 2. Dart – genau den Punktestand eines Gegners, muss dieser sofort zurück auf 0 („eliminiert“). Die Reihenfolge deiner Würfe ist also entscheidend!
• Wird die Aufnahme danach überworfen, bleibt die Eliminierung trotzdem bestehen.
• Über das Ziel geworfen = überworfen, die Aufnahme zählt nicht. Bei Double-Out muss der letzte Dart ein Doppel sein.
• Wer zuerst genau das Ziel erreicht, gewinnt. Die App zeigt dir, mit welcher Punktzahl du gerade jemanden eliminieren kannst.`,
  baseball: `9 Innings. Im Inning n zählt nur die Zahl n: Single = 1 Run, Double = 2, Triple = 3. Im 7. Inning zählt Bull doppelt. Die meisten Runs gewinnen.`,
};

export const TIPS = [
  'Gleicher Stand, gleicher Griff, gleicher Ablauf – Konstanz schlägt Kraft.',
  'Ellbogen ruhig halten: der Wurf kommt aus dem Unterarm, nicht aus der Schulter.',
  'Lieblingsdoppel D16: Daneben bleibt D8, dann D4 – drei Chancen.',
  'Bei 6 Rest lieber D3 als S2-D2: ein Dart weniger ist ein Dart mehr auf Doppel.',
  'Trefferbild wandert nach links? Prüfe, ob du den Arm beim Abwurf drehst.',
  "Bob's 27 zweimal pro Woche verbessert die Doppelquote messbar.",
  'T19 ist die beste Ausweichzahl, wenn die T20 zugestellt ist.',
  'Nach dem Wurf den Arm „nachschwingen“ lassen – wie beim Basketball.',
  'Bogey-Zahlen bei Double-Out: 169, 168, 166, 165, 163, 162, 159 – die solltest du nie stehen lassen.',
  'Atme vor dem Checkout bewusst aus. Puls runter, Fokus hoch.',
  '10 Minuten tägliches Training bringen mehr als 2 Stunden einmal pro Woche.',
  'Around the Clock nur auf Doppel ist das härteste Aufwärmprogramm der Profis.',
];
