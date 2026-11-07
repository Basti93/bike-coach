import { EXERCISE_IMAGES, type ExerciseImage } from '../shared/exercise-images';
import { FEDB_EXERCISES, fedbImageFile } from '../shared/fedb';

const FEDB_IMAGE_COUNT = new Map(FEDB_EXERCISES.map((e) => [e.id, e.images?.length ?? 0]));
const FEDB_CREDIT = { author: 'free-exercise-db (gemeinfrei)', licence: 'Unlicense', sourceUrl: 'https://github.com/yuhonas/free-exercise-db' };

/**
 * The bundled pictures of an exercise, with their credits: wger drawings for own exercises, else the generated base-catalog
 * pictures (scripts/fedb-media.ts, not in git; a missing file hides itself in ExerciseInfo). None for Hevy ids or exercises without pictures.
 */
export const exerciseImages = (exerciseId: string): ExerciseImage[] => {
  const wger = EXERCISE_IMAGES[exerciseId];
  if (wger) return wger;
  const n = FEDB_IMAGE_COUNT.get(exerciseId) ?? 0;
  return Array.from({ length: n }, (_, i) => ({ file: fedbImageFile(exerciseId, i + 1), ...FEDB_CREDIT }));
};

/** The picture's address: from the site root on the web, next to index.html in the Mac app (file://, base "./"). */
export const imageSrc = (file: string): string => `${import.meta.env.BASE_URL ?? '/'}${file}`;

/** A YouTube search for the exercise, opened only when tapped: the English Hevy name finds more, else the German one. */
export const videoSearchUrl = (e: { title: string; hevyTitle?: string }): string =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${e.hevyTitle ?? e.title} exercise form`)}`;
