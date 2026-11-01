# Dutch on the bike

The goal is not a language course, but for the quiet minutes to yield something on the side. Ready-made components rather than building our own.

| Component | Source | State of the evidence |
|---|---|---|
| Review schedule | [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) (MIT), default parameters, target 90% retention | [Benchmark](https://github.com/open-spaced-repetition/srs-benchmark): predicts recall better than SM-2. Only read via secondary sources here, not verified, and it measures prediction, not learning success |
| Spaced rather than massed | Basic idea of FSRS | Kim & Webb 2022, meta-analysis on second languages, only seen [cited in another work](https://ir.lib.uwo.ca/etd/8600/), full text not read; studies mostly with flashcards |
| Recall first, then reveal | 6 seconds of thinking before the answer | Well-documented testing effect, here from background knowledge, not looked up in this research. The 6 seconds are an own setting |
| Learning during easy riding | Only up to 75% FTP or 3% grade, not above your own heart rate limit | Schmidt-Kassow 2013 and other small studies, [summarised in Amico & Schaefer 2020](https://www.frontiersin.org/article/10.3389/fpsyg.2020.00684/full): light to moderate cycling while learning helped. Few participants, no study of exactly this procedure |
| Most frequent words first | [FrequencyWords](https://github.com/hermitdave/FrequencyWords), subtitles, content CC-BY-SA-4.0 | Principle after Nation, from background knowledge, not looked up in this research |
| Translation and example sentence | Generated once by Claude (`scripts/build-dutch-words.ts`), 683 cards in `src/shared/dutch-words.json` | Sample of 44 cards without errors. **Not checked by a native speaker**, individual errors are possible |
| Listening | System voice `nl-NL`, speaks word and sentence | Not verified on the real Mac |

Own settings without evidence: at most 15 new words per day, "learned" from 7 days of stability, spacing of cards during the ride. Unanswered cards count neither as known nor as wrong.

Open: Repeating aloud is not checked; only understanding is tested, not active speaking. According to the spec, videos only come at a higher level.
