# AI Performance Tool

[Documentation](https://toberpaul.github.io/ai-performance/docs/)

Lokales Dashboard für KI-gestützte Arbeit. Tickets können Durchläufe mehrerer Tools enthalten. Arbeitszeit und Nacharbeit werden pro Ticket zusammengefasst. Verbrauch bleibt in der jeweiligen Einheit sichtbar.

## Start

Benötigt Node.js ab Version 22.13 und npm. Führe die Befehle in diesem Repository aus.

```powershell
npm ci
npm start
```

Öffne die ausgegebene Adresse mit `127.0.0.1`. Ohne Pfad wertet das Dashboard das aktuelle Verzeichnis aus. Übergib ein anderes Projekt mit `npm start -- "<Projektpfad>"`. **Refresh** liest die Daten erneut.

## Projektdaten und Migration

Die lokale Datenbank `.codex/performance.sqlite` enthält Tickets, Durchläufe, Verbrauch und Kontingentbeobachtungen. Beim ersten Öffnen übernimmt das Tool vorhandene Daten aus `context-packages.json`, `context-usage.jsonl` und `context-history/`. Mit `npm run record -- migrate` lässt sich die Migration vorab auslösen. Die alten Dateien bleiben als Ausgangssicherung erhalten. Verwende für die weitere Erfassung die aktualisierten Hooks und den Datenbankbefehl.

Sichere `.codex/performance.sqlite`, wenn keine Erfassung läuft. Die Datenbank und ihre SQLite-Nebendateien bleiben lokal und gehören in die Git-Ignore-Liste.

## Hooks

- **Codex:** Kopiere die Skripte aus `telemetry/.codex/hooks/` und ergänze die Hook-Einträge in der bestehenden `.codex/hooks.json`. Prüfe und bestätige sie in Codex unter **Settings → Hooks** oder mit `/hooks`. Die Hooks benötigen Git und Node.js 22.13 oder neuer im PATH.
- **Kiro:** Kopiere `telemetry/.kiro/hooks/` nach `.kiro/hooks/` sowie `telemetry/.codex/hooks/performance-store.cjs` nach `.codex/hooks/`. Der AgentStop-Hook erfasst lokale Durchläufe als Kiro. Ist `AI_PERFORMANCE_TICKET_ID` in der Kiro-Umgebung gesetzt, verwendet er diese Ticket-ID. Andernfalls erscheint der Durchlauf unter **Unassigned runs**. Credits und Dauer können aus einer geeigneten Quelle ergänzt werden.

## Tickets und Messwerte schreiben

Die Schreibbefehle `ticket`, `run` und `quota` akzeptieren eine JSON-Datei oder `-` für stdin. Übergib bei Bedarf nach der Datei den Pfad zum Zielprojekt.

```powershell
npm run record -- ticket ticket.json
npm run record -- list ticket
npm run record -- run run.json
npm run record -- quota quota.json
npm run record -- link "kiro/<run-id>" "<ticket-id>"
```

Ein Ticket hat mindestens `id`, `name` und `epic`. Dieselbe ID aktualisiert den Eintrag. Für Codex verknüpfen `sessionId` und `turnId` in `subtasks` die erfassten Modellaufrufe. Andere Integrationen können `ticketId` am Durchlauf angeben oder den Durchlauf später verknüpfen.

Ein Kiro-Durchlauf mit einem gemessenen Verbrauch:

```json
{
  "id": "review-123",
  "provider": "kiro",
  "ticketId": "P-001",
  "name": "Review implementation",
  "kind": "feedback",
  "workSeconds": 90,
  "metrics": [{ "unit": "credits", "value": 2.4 }]
}
```

Eine Kontingentbeobachtung enthält `id`, `provider`, `account`, `periodStart`, `periodEnd`, `observedAt`, `unit` und `used`. `limit` und `overage` sind optional. Die UI zeigt den neuesten Stand je Anbieter, Konto, Einheit und Zeitraum. Kontostände werden separat vom Ticketverbrauch angezeigt.

## Auswertung

The ticket overview groups unique tickets by epic and follows the dashboard's epic filter. Switch between ticket count, story points, recorded tokens and work time. Score distributions include unscored tickets, and the totals flag incomplete measurements.

The chat-context overview estimates starting context from input tokens divided by the model context window for the first recorded request in a ticket’s first implementation run. It includes that request’s prompt and compares completed tickets with the same starting model and story-point estimate. Switch between total tokens, work time and rework rounds. The dashboard suggests trying a fresh chat only when the below-25% baseline and two adjacent higher bands each have at least three token measurements and both higher medians exceed the baseline by at least 25%. This is a signal to test, and it does not start a new chat automatically.

Quota attribution coverage divides the measured quota use assigned to tickets by the highest observed account usage in each 5-hour window. The project total weights windows by their observed usage and stays the same when the epic filter changes. The remaining usage is split into measured runs without a ticket and usage without a matching measurement. Only snapshots available in the analysed Codex chats contribute. Windows where measured runs exceed observed account usage are flagged and excluded from the total.

Each measured window has its own quota bar. Hover or focus a segment for its share of that window’s full quota. Unused quota reflects the available snapshot. Zero-only snapshots can have a provisional reset and are excluded. The overall attribution score uses observed consumption as its denominator.

When a run has no direct quota association, its work interval places it in a window if it overlaps exactly one observed 5-hour window. Time-based placement leaves the run’s quota usage unknown.

Das Dashboard bewertet Tokenverbrauch und Arbeitsdauer getrennt. Für jede Kennzahl vergleicht es ein erledigtes Ticket mit mindestens zwei anderen erledigten Projekttickets derselben Story-Point-Stufe und vollständigen, positiven Messwerten. Die Formel pro Kennzahl lautet `100 × Median der Vergleichstickets / Messwert des Tickets`. Nacharbeit fließt über die jeweiligen Summen ein. Ab 110 ist die Bewertung grün, von 90 bis 109 gelb und unter 90 rot. Beide Bewertungen gelten für das gesamte Ticket und bleiben beim Epic-Filter und in geteilten 5-Stunden-Fenstern gleich.

Änderungen an React-Komponenten, CSS und der Datenaufbereitung laden den geöffneten Browser-Tab automatisch neu. Änderungen am Server-Einstiegspunkt `serve.mjs` erfordern einen Serverneustart.

Mit gespeicherten Kontingentmessungen gruppiert das Dashboard die Arbeitspakete nach dem Reset-Zeitpunkt des 5-Stunden-Kontingents. Ein Ticket mit Durchläufen in mehreren Fenstern erscheint anteilig in jedem Fenster. Die Summe berücksichtigt die gemessenen Durchläufe der angezeigten Tickets und folgt dem Epic-Filter. Durchläufe ohne zuordenbaren Reset bleiben separat sichtbar.

## Vorhandene Messwerte sichern

Führe `npm run import-history` im Tool-Projekt aus. Für ein anderes Projekt nutze `npm run import-history -- "<Projektpfad>"`. Der Import durchsucht aktive und archivierte Codex-Sitzungen der eingetragenen Tickets und schreibt die Messdaten in das jeweilige Projekt. Wiederholte Importe zählen dieselben Messwerte einmal. `npm start -- --codex-history` führt den Import vor dem Start aus.

Fehlende Messwerte aus bereits gelöschten Sitzungen lassen sich mit einem Backup des ursprünglichen Verlaufs oder Logs nachtragen.

Beispiel für ein Ticket mit einem zugeordneten Codex-Durchlauf:

```json
{
  "id": "P-001",
  "name": "Aktiven TOC-Eintrag sichtbar halten",
  "epic": "Documentation Navigation",
  "points": 2,
  "strategy": "fresh",
  "startedAt": "2026-11-05T10:00:00Z",
  "completedAt": "2026-11-05T10:05:00Z",
  "acceptedAt": "2026-11-05T10:20:00Z",
  "subtasks": [
    { "name": "TOC-Verhalten umsetzen", "kind": "implementation", "sessionId": "erste-session", "turnId": "umsetzung", "workSeconds": 100 },
    { "name": "Scrollgrenze korrigieren", "kind": "feedback", "sessionId": "fortsetzung", "turnId": "korrektur", "workSeconds": 45 }
  ]
}
```

Codex leitet `name` beim Erfassen aus dem Aufgabenziel ab. Bei älteren Einträgen ohne Namen zeigt das Dashboard die Paket-ID. Verwende `fresh` oder `continued` für den Start des Pakets. `acceptedAt` bleibt bis zur Abnahme `null`. Zähle Fehlversuche, Übergabe und Neustart zum Paket. Vergleiche bei gleichem Modell und ähnlichen Aufgaben die Tokens bis zur Abnahme innerhalb derselben Punktestufe. Zeit und Korrekturrunden bleiben separat. Die Hook-Zähler lassen sich nicht zuverlässig in Prozentpunkte des 5‑Stunden-Kontingents umrechnen.
