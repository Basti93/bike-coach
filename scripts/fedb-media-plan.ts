import { fedbImageFile } from '../src/shared/fedb';

/** Where the pictures of a base-catalog entry come from and go to. Pure, so it is tested without copying anything. */
export type MediaEntry = { id: string; images?: string[] };
export type MediaCopy = { from: string; to: string };


/** Source path (relative to the clone's exercises/ folder) to app file, for every entry that has pictures. */
export const mediaPlan = (entries: MediaEntry[]): MediaCopy[] =>
  entries.flatMap((e) => (e.images ?? []).map((from, i) => ({ from, to: fedbImageFile(e.id, i + 1) })));
