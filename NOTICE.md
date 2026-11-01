# Hinweise zu Fremdinhalten

Der eigene Code steht unter der MIT-Lizenz. Für Folgendes gelten andere Bedingungen.

## Wortliste: CC BY-SA 4.0

`src/shared/dutch-words.json` ist abgeleitet aus [FrequencyWords](https://github.com/hermitdave/FrequencyWords) von Hermit Dave, Inhalt unter [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Die Datei wurde gefiltert und ergänzt (`scripts/build-dutch-words.ts`) und steht ebenfalls unter CC BY-SA 4.0, nicht unter MIT.

## Garmin FIT SDK

`@garmin/fitsdk` wird nur als Abhängigkeit geladen und ist nicht Teil dieses Repos. Es gilt Garmins FIT-Lizenzvereinbarung, die jeder mit der Installation selbst annimmt. Sie schränkt die Weitergabe ein, deshalb gibt es hier keine fertig gebauten Apps, die das SDK enthalten.

## Garmin Connect

Die Anbindung nutzt den inoffiziellen Zugang über `python-garminconnect`. Sie kann jederzeit brechen, und ihre Nutzung liegt in deiner Verantwortung gegenüber Garmin. `python-garminconnect` wird nicht mitgeliefert.

## Weitere Abhängigkeiten

Alle übrigen Laufzeit-Abhängigkeiten stehen unter MIT, ISC, BSD, Apache-2.0 oder sind gemeinfrei. Maßgeblich sind die Lizenzdateien der Pakete.
