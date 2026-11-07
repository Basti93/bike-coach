# UX review brief

You are an independent UX reviewer. You have not worked on this app. Judge only what you see, and the code when you need to understand behaviour.

## The product

PandaFit is a personal training coach PWA, used mostly on a phone. Gym training is logged live in the studio between sets, with one hand and a short attention span. There is also a week plan, runs, rides, meals, statistics, and a chat with an AI coach.

There are two users: a technical person and his girlfriend, who is not technical. Both use it daily.

## Product principles (from the owner)

- **Keep it light:**
  - no gamification;
  - no number walls; numbers only on demand;
  - plain German;
  - one line per item where possible.
- The owner says: "the screens are all very overloaded" and "the Woche page is broken by the endlessly long chat".

## Material

- **Screenshots:** full-page phone screenshots (390×844 @2x) in `/private/tmp/claude-501/web-shots-before/`. The index is `INDEX.md`, with what each shot is and how to reach it.
- **Slices:** tall pages are sliced into phone-screen-sized pieces in `/private/tmp/claude-501/web-shots-before/slices/<name>-NN.png`, in reading order. Read the slices, not the tall originals.
- **Capture artifact:** a fixed bottom bar appears once mid-image in tall shots. That is a capture artifact, not a bug.
- **Code:** the source is in `/Users/sbinder/Projects/bike-coach/src`. The web app is `src/web/App.tsx`, and the screens are in `src/tracking/ui/*.tsx`.

## Your output (final message, max ~70 lines, German)

For each screen or state in your scope:

1. **Note** (1–10) for:
   - Übersicht/Ruhe;
   - Klarheit der Hauptaufgabe;
   - Bedienbarkeit am Handy (thumb reach, tap targets, scrolling);
   - Konsistenz.
2. The three biggest problems, concrete, naming the element.
3. Concrete proposals: what to remove, merge, collapse behind a tap, move to another screen, or reorder. Name the target state ("above the fold: X, Y; everything else behind 'Mehr'").

Then give a short cross-screen list: recurring patterns that should change everywhere (for example button styles, card nesting, section headings, select-heavy forms).

- Be direct and specific.
- Prefer removing over adding.
- Do not propose gamification or new features.
- Do NOT edit any files.
