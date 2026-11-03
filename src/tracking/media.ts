import { EXERCISE_IMAGES, type ExerciseImage } from '../shared/exercise-images';

/** The bundled wger pictures of an own exercise, with their credits. None for Hevy ids or exercises without pictures. */
export const exerciseImages = (exerciseId: string): ExerciseImage[] => EXERCISE_IMAGES[exerciseId] ?? [];

/** The picture's address: from the site root on the web, next to index.html in the Mac app (file://, base "./"). */
export const imageSrc = (file: string): string => `${import.meta.env.BASE_URL ?? '/'}${file}`;

/** A YouTube search for the exercise, opened only when tapped: the English Hevy name finds more, else the German one. */
export const videoSearchUrl = (e: { title: string; hevyTitle?: string }): string =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${e.hevyTitle ?? e.title} exercise form`)}`;
