import { describe, expect, it } from 'vitest';
import { addNote, capNotes, newestNotes, NOTES_PER_COACH, readNotes, type ChangeNote } from '../../src/shared/change-notes';
import { readStats } from '../../src/shared/stats';

const DAY = 86_400_000;
const NOW = 100 * DAY;
const note = (i: number, over: Partial<ChangeNote> = {}): ChangeNote => ({ atMs: NOW - i * DAY, coach: 'gym', text: `Note ${i}`, reason: 'weil', ...over });

describe('the caps', () => {
  it('keeps the newest 20 per coach', () => {
    let list: ChangeNote[] = [];
    for (let i = 25; i >= 1; i--) list = addNote(list, note(i / 10), NOW);
    expect(list).toHaveLength(NOTES_PER_COACH);
    expect(list.at(-1)!.text).toBe('Note 0.1');
    expect(list[0]!.text).toBe('Note 2');
  });
  it('drops notes older than 60 days', () => {
    expect(addNote([note(61), note(59)], note(1), NOW).map((n) => n.text)).toEqual(['Note 59', 'Note 1']);
    expect(capNotes([note(61), note(2)], NOW).map((n) => n.text)).toEqual(['Note 2']);
  });
  it('a note with the same key replaces its older one', () => {
    const a = { ...note(3), key: 'cp|w1' };
    const list = addNote([a], { ...note(1, { text: 'new' }), key: 'cp|w1' }, NOW);
    expect(list.map((n) => n.text)).toEqual(['new']);
  });
});

describe('the same note again', () => {
  it('keeps the old note and its time when key, text and reason are unchanged', () => {
    const a = { ...note(3), key: 'k' };
    expect(addNote([a], { ...note(0, { text: a.text }), key: 'k' }, NOW).map((n) => n.atMs)).toEqual([a.atMs]);
    expect(addNote([a], { ...note(0, { text: a.text }), key: 'k', reason: 'anders' }, NOW)[0]!.atMs).toBe(NOW);
  });
});

describe('published notes', () => {
  it('the newest 8 across the coaches, newest first', () => {
    const all = Array.from({ length: 12 }, (_, i) => note(i + 1, { coach: (['bike', 'gym', 'run'] as const)[i % 3] }));
    const out = newestNotes(all);
    expect(out).toHaveLength(8);
    expect(out.map((n) => n.text)).toEqual(Array.from({ length: 8 }, (_, i) => `Note ${i + 1}`));
  });
  it('a broken entry is dropped, never the list', () => {
    expect(readNotes([note(1), { ...note(2), coach: 'swim' }, 'junk', { ...note(3), text: '' }])).toEqual([note(1)]);
    const body = { type: 'stats', atMs: 1, goal: null, days: [], muscles: {} };
    expect(readStats({ ...body, changes: [note(1), 'junk'] })?.changes).toEqual([note(1)]);
    expect(readStats(body)?.changes).toBeUndefined();
    expect(readStats({ ...body, changes: 'x' })).not.toBeNull();
  });
});
