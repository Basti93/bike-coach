# L Task 8: fixes after the second review (decided by Opus)

Source: `REVIEWS-AFTER.md` (same folder), plus the ledger notes in `progress.md`.

Same constraints as the plan:
- Behaviour stays.
- A workout is never lost.
- Tests move with the structure.
- `npm test` and `npm run typecheck` are green.
- Re-shoot what you touch with `npm run ui:web-shots -- /private/tmp/claude-501/web-shots-final <filter>`, slice it, and look at it.

## Package A: kit, global, Woche, Heute, Profil, Login

1. **Sheet swap bug (real bug):**
   - Closing one Sheet while another opens in the same commit lets the old sheet's async `history.back()` close the new one.
   - Fix it in `kit/Sheet.tsx`: use a sheet-stack counter or token, so a pending back only pops its own entry, or ignore popstate for sheets that are already closed.
   - Add a test that closes A and opens B in one handler: B stays open.
2. **Sheets cover everything:**
   - The page header, the round profile button and the live-workout rows must not show through or above a sheet (`kraft-training-active-uebung-hinzufuegen`, `kraft-training-beendet`).
   - Use a z-index above the app chrome and an opaque background; hide the profile button while a sheet is open.
3. **Small sheets:** add `size="small"` to `Sheet`, a bottom sheet of auto height (max 70 %) with a dimmed backdrop. Use it for option lists with up to about 6 entries:
   - studio, Anderes Training, Nicht mehr vorschlagen;
   - the workout header menu, the exercise menu;
   - Anders heute, ChoiceRow choices.
4. **Theme:**
   - The focus ring uses the theme accent (not system blue) for all inputs.
   - Text links and danger links get a min tap height of 44 px (padding, not a bigger font).
   - The switch off state is clearly off: a light knob on a muted track, plus a visible border.
   - The sheet side padding equals the page padding.
   - Section headings have more space above than below, the same everywhere.
5. **Page header block:**
   - title, then an optional muted subtitle, then 12–16 px space before the first card;
   - the right side reserves space for the profile button, so text never runs under it (`woche-01`, `heute-01`, `statistik` title/"Stand" overlap, `laufen-01` card touching the avatar).
   - The bottom nav is symmetric, with equal side padding.
6. **No empty placeholders:** remove "Kommt nach der Auswertung" / "Nächstes Mal: kommt nach der Auswertung" everywhere. Show nothing until there is content.
7. **Formats:**
   - durations are "35 Min" everywhere (no "Minuten", no "Min.");
   - decimals use a comma;
   - dates use one short style via `src/shared/dates.ts` ("Mo., 3. Nov.").
   - Fix "16 : 25.5" and the "ab 14. Sept." / "07.09." / "26.10. bis 1.11." mix.
8. **Chat (3/10 in the review):**
   - Pinned proposals no longer stack above the input. One slim strip above the input: "1 Vorschlag ›" / "3 Vorschläge ›". It opens a small sheet listing the open proposals with their take and decline buttons (same logic).
   - The conversation gets the full height.
   - The input focus ring is in the theme.
9. **Woche:**
   - When a proposal waits, the "Coach · Vorschlag wartet" row is the first row under the week card.
   - The complaint subtitle ("Der Coach nimmt Rücksicht auf …") moves into the Regeln sheet as a muted first line "Rücksicht: …".
   - Today in the week card is marked with a row background, not a half bracket.
   - Day text uses consistent separators ("Laufen · 35 Min · locker").
10. **Regeln sheet:**
    - The status word moves under the rule text, muted and small ("Wunsch", "pausiert", "für Kraft").
    - Replace "an Kraft-Coach" with "für Kraft".
    - One "+ Hinzufügen" opens a small sheet with "Regel schreiben" / "Übung ausschließen".
11. **Ziel sheet:**
    - It shows the goal choice, then a row "Schwerpunkt: Rücken, Schulter seitlich ›" that opens the muscle chips (with the duration); then the sport priorities and the planning rows.
    - Nothing peeks behind the Fertig bar: pad the scroll area by the bar height.
12. **Heute:**
    - "Anders heute? ›" is a full 48 px row that opens a small sheet with the minute chips. Remove the "Morgen: …" line.
    - When a workout is open, the today task shows as a row under the Weitermachen card, not as a second big card.
    - Mobility sheet: "Gemacht" (primary) and "Heute nicht" (secondary button).
13. **Profil:**
    - Order: the name + status row, then "Laufen planen", then "Benachrichtigungen" with the coach-timing switches indented as sub-rows (shown only when notifications are on, if that matches behaviour; else always), then "Abmelden".
    - The storage hint is one short sentence: "Dein Browser kann Daten löschen – sie sind aber auf dem Server gesichert."
14. **Login:** the block sits about a third from the top, with 16 px before the button.

## Package B: Kraft

1. **Live header:**
   - only the title and one "⋯";
   - the running time moves into the ⋯ sheet ("Läuft seit 39 Min");
   - the profile button is hidden during an active workout.
2. **Exercise menu:** a small sheet with Satz hinzufügen, Notiz, Tauschen, Pause ändern, and "Mehr ›".
   - Behind "Mehr" are: Aufwärmen hinzufügen, Sätze bearbeiten, Supersatz, Nach oben/unten, Ausführung, and the danger link Entfernen (with confirm).
3. **Set hints:**
   - under the next open set only "zuletzt 57,5 kg × 8";
   - the target range shows on tap of that line;
   - the plates line only for barbell exercises (already so; check).
4. **Counts and labels:**
   - "2/4" becomes "2 von 4" on collapsed rows;
   - "Superset · 2/3" becomes "mit <Partnertitel> · 2 von 3".
   - Prefill consistency: an open set shows the planned reps or "–" the same way for all open sets (check why set 3 showed "–" and set 4 "8").
5. **End of list:**
   - "Übung hinzufügen" is secondary; "Training beenden" is a text link under it;
   - the list has bottom padding of rest bar + nav height, so nothing hides behind the rest bar.
6. **Start:**
   - The studio shows as a small line inside the plan card ("Studio Nord ›"), only when more than one studio is known; otherwise it stays in the "Anderes Training" sheet area as "Studio".
   - "Anderes Training ›" stays as a row.
   - Open-workout card: "Weitermachen" (primary); "Beenden" (link); "Verwerfen" as a danger link placed apart (on its own line, with confirm).
7. **Summary:**
   - title "Gut gemacht · 4 Übungen · 39 Min" and one button "Fertig";
   - no placeholder;
   - while the summary shows, the "Training starten" section below is hidden.
8. **Routinen:**
   - The picker uses the same 8 display groups as the catalog (`catalogGroup`), one component and one grouping.
   - Editor rows: more space between "+" and "×"; "×" as a danger icon button at the far right with an aria-label.
   - Own exercise: equipment and type get defaults (Kurzhantel / Gewicht × Wdh or the closest existing defaults), so only the name and muscle are needed.
9. **Verlauf:**
   - The inner tab "Übungen" is renamed "Je Übung".
   - Edit mode uses the same white input set rows as the live workout (clearly editable), with a per-set remove in edit mode.
   - "Training löschen" stays a danger link at the end (fine).
10. **Catalog:**
    - An open group shows the built-in and used exercises first (source `pandafit`/own/ai, or any with history), then "Alle N anzeigen" for the base entries.
    - The info source credit appears once ("Bild und Text: free-exercise-db, gemeinfrei").
    - "Nicht mehr vorschlagen" uses the small sheet.

## Package C: Statistik, Laufen, Essen

1. **Statistik:**
   - **Top:**
     - the week sentence;
     - then the verdict sentence(s) ("Brust und Schulter vorn kommen zu kurz.");
     - then the row "Muskeln ›", which opens a sheet with the four-state list (one open, "3 von 12–18 Sätzen diese Woche");
     - then "Details ›".
   - Remove the repeated "Wenig" rows and the "Noch nichts: …" list from the top.
   - **Details:**
     - minutes per week with the chart in palette colours (accent/muted, not blue/yellow);
     - one progress sentence per lift without "(±0)" / "(+3,2)" / "~" (rewrite the text output in `progress.ts`, a presentation-only change, e.g. "Bankdrücken: etwa 73 kg, leicht gestiegen");
     - pair ratios in plain words or dropped ("Rücken bekommt mehr als Brust" – keep it only if it says something).
   - Remove "0 von 14 Muskelgruppen im Zielbereich".
2. **Laufen:**
   - Remove the duplicate sentences on the main page ("Zählt als lange Einheit.", the second pulse sentence). The plan card says it once.
   - The feel question shows as compact chips on the last-run row; "Überspringen" stays a link.
   - **Entwicklung:** keep the progress sentence and the km bars; remove "Ein einzelner Lauf sagt dazu nichts."; "Längster Lauf" and the weekly look-back go under "Mehr ›".
3. **Essen:**
   - **Open meal:**
     - the ingredients and steps;
     - the time, protein and shelf life on one muted line;
     - the person chips labeled "Isst mit:".
   - **Einkauf:**
     - no chevron per row;
     - "Haben wir" becomes a small text button at the right of each open row (min 44 px), replacing the hidden chevron action;
     - the "Eigenes" group comes first;
     - the "Hinzufügen" button is visible (secondary, not faded) and disabled only visually lighter.
