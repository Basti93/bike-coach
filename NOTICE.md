# Third-party notices

The project's own code is under the MIT licence. Different terms apply to the following.

## Word list: CC BY-SA 4.0

`src/shared/dutch-words.json` is derived from [FrequencyWords](https://github.com/hermitdave/FrequencyWords) by Hermit Dave, content under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The file was filtered and extended (`scripts/build-dutch-words.ts`) and is also under CC BY-SA 4.0, not MIT.

## Exercise descriptions: CC BY-SA 4.0

`src/shared/exercise-descriptions.ts` holds short descriptions of the exercises. Entries with a `wger` source are adapted (shortened and lightly edited) from the exercise database of [wger Workout Manager](https://wger.de), exercise data by the wger contributors. Each such entry records the wger exercise id (`https://wger.de/exercise/<id>/view/`), its author and its original licence (CC BY-SA 4.0, CC BY-SA 3.0 or CC0 1.0), and the app shows "Quelle: wger.de, author, licence" under it. Entries marked `own` were written for this project. The whole file is under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), not MIT. `scripts/wger-matches.json` records which wger exercise each entry comes from; `scripts/wger-descriptions.ts` downloads the wger data and checks the sources.

## Exercise pictures: CC BY-SA and CC0

The pictures in `src/web/public/exercises/` come from the exercise database of [wger Workout Manager](https://wger.de). Only images that wger lists under CC BY-SA (3.0 or 4.0) or CC0 1.0 were taken, and only the drawings by Everkinetic (single user uploads were left out); they were scaled down and saved as JPEG (`scripts/wger-images.mjs`). `src/shared/exercise-images.ts` records the author, licence and wger source page of each picture, and the app shows them under it. Each picture keeps its own licence; the CC BY-SA ones are shared under the same licence.

## Garmin FIT SDK

`@garmin/fitsdk` is only loaded as a dependency and is not part of this repo. Garmin's FIT licence agreement applies, which everyone accepts themselves on installation. It restricts redistribution, which is why there are no prebuilt apps here that contain the SDK.

## Garmin Connect

The integration uses unofficial access through `python-garminconnect`. It can break at any time, and using it is your responsibility towards Garmin. `python-garminconnect` is not included.

## Mountain profiles

`src/shared/passes-data.json` holds height profiles of real climbs. The routes come from BRouter on OpenStreetMap data (© OpenStreetMap contributors, ODbL), the heights from there and from the AWS terrain tiles. The ODbL also applies to this file.

## Other dependencies

All other runtime dependencies are under MIT, ISC, BSD or Apache-2.0, or are in the public domain. The packages' licence files are authoritative.
