# Mitmachen

Pull Requests sind willkommen, Issues sind bewusst abgeschaltet. Das Projekt wird in der Freizeit gepflegt, Antworten können dauern.

## Grundregeln

- **Eine Fahrt geht nie verloren.** Keine Änderung darf die Aufzeichnung gefährden. Die Fahrt hängt nie an Internet, Server, KI oder Oberfläche.
- **Test zuerst.** Neue Funktionen und Fehlerbehebungen kommen mit einem Test, der vorher fehlschlägt.
- **Ehrlich bleiben.** Schwellen ohne Beleg werden als eigene Setzung markiert, siehe `docs/hr-zones.md`.
- **Keine persönlichen Daten** in Code, Tests oder Dokumenten. Testdaten sind erfunden.

## Vor einem Pull Request

```bash
npm run typecheck
npm test
npm run test:chaos
npm run test:garmin
```

Ohne Rad testest du mit `npm run dev:sim`. Änderungen, die den Trainer steuern, bitte auch am echten Gerät prüfen und das im Pull Request sagen.

Beiträge stehen unter der MIT-Lizenz des Projekts. Oberfläche, Dokumente und Kommentare sind auf Deutsch.
