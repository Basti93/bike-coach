import type { Exercise } from './exercises';
import { EQUIPMENT, MUSCLES, TYPES } from './muscles';
import type { TrackedRecord } from './records';
import { isFamily } from './families';
import { isObj, linkOf, str, strings } from './exercise-links';

/**
 * The one exercise catalog: built-ins, then the base list (without entries a built-in names in `fedbId`), then the person's own exercises. An exercise record with
 * the id of a built-in/base entry is an overlay: it may add aliases and set the description, nothing else. A live link
 * record (`exercise-links.ts`) adds its title as an alias of its target, when the target exists. Records that are deleted, links,
 * carry a proposal (not an exercise yet) or are malformed are not entries.
 */
export function mergeCatalog(builtIns: Exercise[], base: Exercise[], records: TrackedRecord[]): Exercise[] {
  const covered = new Set(builtIns.flatMap((e) => (e.fedbId ? [e.fedbId] : [])));
  const out: Exercise[] = [...builtIns, ...base.filter((e) => !covered.has(e.id))].map((e) => ({ ...e }));
  const index = new Map(out.map((e, i) => [e.id, i]));
  const types = new Set([...Object.keys(TYPES), ...out.map((e) => e.type)]);
  for (const r of records) {
    if (r.deleted || !isObj(r.body) || r.body.proposal !== undefined || r.body.kind === 'link') continue;
    const b = r.body;
    const at = typeof b.id === 'string' ? index.get(b.id) : undefined;
    if (at !== undefined) {
      const e = out[at];
      const aliases = [...new Set([...(e.aliases ?? []), ...strings(b.aliases)])];
      if (aliases.length > 0) e.aliases = aliases;
      if (str(b.description)) {
        e.description = b.description;
        e.descriptionByUser = true;
      }
    } else if (str(b.id) && str(b.title) && str(b.primaryMuscle) && str(b.equipment) && str(b.type)) {
      index.set(b.id, out.length); // a later record with this id is only an overlay (aliases, description), never a replacement
      // A value outside the allowed ones does not make the record unreadable: the field falls back to "other" / the plain type.
      const e: Exercise = {
        id: b.id, title: b.title, primaryMuscle: Object.hasOwn(MUSCLES, b.primaryMuscle) ? b.primaryMuscle : 'other',
        equipment: Object.hasOwn(EQUIPMENT, b.equipment) ? b.equipment : 'other', type: types.has(b.type) ? b.type : 'weight_reps',
      };
      const aliases = strings(b.aliases);
      if (aliases.length > 0) e.aliases = aliases;
      const secondary = strings(b.secondaryMuscles).filter((m) => Object.hasOwn(MUSCLES, m));
      if (secondary.length > 0) e.secondaryMuscles = secondary;
      if (str(b.description)) e.description = b.description;
      if (str(b.hevyTitle)) e.hevyTitle = b.hevyTitle;
      if (isFamily(b.family) && b.family !== 'other') e.family = b.family;
      if (b.source === 'user' || b.source === 'ai') e.source = b.source;
      out.push(e);
    }
  }
  for (const r of records) {
    const l = linkOf(r);
    const at = l ? index.get(l.targetId) : undefined;
    if (l && at !== undefined) out[at].aliases = [...new Set([...(out[at].aliases ?? []), l.title])];
  }
  return out;
}
