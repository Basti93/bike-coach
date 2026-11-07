/** Superset groups in a list of exercises: members of a group sit next to each other (Hevy needs it), a group has two members at least. */
type Grouped = { supersetId: number | null };

/** Later members of a group move behind its first member; everything else keeps its order. Same list back when nothing moves. */
export function contiguousGroups<T extends Grouped>(xs: readonly T[]): T[] {
  const out: T[] = [];
  const seen = new Set<number>();
  for (const x of xs) {
    if (x.supersetId === null) { out.push(x); continue; }
    if (seen.has(x.supersetId)) continue;
    seen.add(x.supersetId);
    out.push(...xs.filter((y) => y.supersetId === x.supersetId));
  }
  return out.every((x, i) => x === xs[i]) ? (xs as T[]) : out;
}

/** A group left with one member is no group: that member is let go. */
export function dissolveSingles<T extends Grouped>(xs: readonly T[]): T[] {
  const lone = (x: T) => x.supersetId !== null && xs.filter((y) => y.supersetId === x.supersetId).length < 2;
  return xs.some(lone) ? xs.map((x) => (lone(x) ? { ...x, supersetId: null } : x)) : (xs as T[]);
}

/** Groups tidy: contiguous, none with one member. */
export const tidyGroups = <T extends Grouped>(xs: readonly T[]): T[] => contiguousGroups(dissolveSingles(xs));
