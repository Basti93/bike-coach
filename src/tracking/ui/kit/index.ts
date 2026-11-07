/**
 * The calm UI kit. Every screen builds from these few pieces; the CSS is the "Calm UI kit" block in ../tracking.css.
 *
 * Rows, not cards: a list item is a Row (title left, short muted value right, a chevron when it opens something) inside a RowList.
 *   Cards are for the one main thing on a screen or a group. Never a card inside a card (a nested .card is flattened by the CSS).
 * Buttons (plain <button> classes):
 *   (none) or "primary"  filled orange; at most one per screen or sheet, the next action.
 *   "secondary"          outline.
 *   "link" (or "ghost")  a text link, for the quiet third choice.
 *   "danger-link"        muted red text link for Löschen, Verwerfen, Entfernen. Use ConfirmLink; never next to the primary button.
 * Sheet: forms, pickers, chat and edit dialogs. Full screen, title, × top right, sticky action area, body behind stays put, Back or Escape closes.
 * Switch: a row with the label left and the switch right, the whole row taps. It replaces checkboxes.
 * ChoiceRow: "Label  Wert ›" that opens a small Sheet with the options. It replaces selects with more than a couple of options.
 * Details on demand: numbers, statistics, explanations and credits sit behind "Details" or in the opened row. Muted help text is one line.
 * Only one open: expandable rows pass `expanded`; the chevron turns, and the parent keeps a single open id.
 * Spacing is a 8 px grid (.5rem steps), headings are one title (.tk-title) and small section headings (.tk-section). Dates: ../../shared/dates.ts (de-DE).
 */
export { Row, RowList } from './Row';
export { Sheet } from './Sheet';
export { Switch } from './Switch';
export { ChoiceRow } from './ChoiceRow';
export { ConfirmLink } from './ConfirmLink';
