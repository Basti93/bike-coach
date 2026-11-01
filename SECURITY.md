# Sicherheit

Bitte Sicherheitslücken nicht als öffentliches Issue melden, sondern über [GitHubs private Meldung](https://github.com/Basti93/bike-coach/security/advisories/new).

## Was die App schützt

- Fahrdienst und Coach lauschen nur auf `127.0.0.1` und prüfen die Herkunft der Verbindung. Andere Programme auf demselben Mac können sie erreichen, wenn sie keine Herkunft mitschicken.
- Das Garmin-Passwort geht nur per Standardeingabe an das Hilfsprogramm und wird nicht gespeichert. Der Zugangstoken liegt unverschlüsselt im Datenordner.
- Fahrten, Gesundheits- und Garmin-Daten liegen unverschlüsselt im Datenordner. Der Coach gibt Trainingsdaten, Hinweise und Garmin-Werte an `claude` und damit an Anthropic weiter.
- Der optionale Sync-Server ist per Token geschützt und nur für ein privates Tailnet gedacht. Er ist nicht dafür gebaut, offen im Internet zu stehen.
