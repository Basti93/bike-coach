import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';
import words from './dutch-words.json';

/** Words by frequency, repetition by FSRS. Background is in docs/language.md. */
export type Word = { nl: string; de: string; example: string; exampleDe: string };
export type WordProgress = Record<string, { card: Card; firstSeenMs: number }>;

export const DUTCH_WORDS = words as Word[];
const DAY = 86_400_000;
const NEW_PER_DAY = 15;     // Our own choice, so that the reviews stay manageable.
const LEARNED_STABILITY_DAYS = 7; // Our own choice for "learned".
const scheduler = fsrs();

export const nextWord = (list: Word[], progress: WordProgress, nowMs: number, last?: string): Word | null => {
  const usable = list.filter((w) => w.nl !== last);
  const dueAt = (w: Word) => new Date(progress[w.nl].card.due).getTime();
  const due = usable.filter((w) => progress[w.nl] && dueAt(w) <= nowMs).sort((a, b) => dueAt(a) - dueAt(b));
  if (due[0]) return due[0];
  const newToday = Object.values(progress).filter((p) => nowMs - p.firstSeenMs < DAY).length;
  return newToday < NEW_PER_DAY ? usable.find((w) => !progress[w.nl]) ?? null : null;
};

export const recordAnswer = (progress: WordProgress, nl: string, knew: boolean, nowMs: number): WordProgress => {
  const known = progress[nl];
  const now = new Date(nowMs);
  const { card } = scheduler.next(known?.card ?? createEmptyCard(now), now, knew ? Rating.Good : Rating.Again);
  return { ...progress, [nl]: { card, firstSeenMs: known?.firstSeenMs ?? nowMs } };
};

export const learnedCount = (progress: WordProgress): number =>
  Object.values(progress).filter((p) => p.card.stability >= LEARNED_STABILITY_DAYS).length;
