import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecordStore } from '../../../src/coach/tracking/store';
import { mirrorExercises } from '../../../src/coach/tracking/mirror-exercises';
import type { TrackedRecord } from '../../../src/shared/records';

let dir: string;
let store: RecordStore;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-mirror-')); store = new RecordStore({ dir }); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const ex = (id: string, updatedMs: number, title = 'Cable fly', deleted = false): TrackedRecord => ({ kind: 'exercise', id, updatedMs, deleted, body: { id, title } });
const get = (p: string, id: string) => store.all(p, 'exercise').find((r) => r.id === id);

describe('mirrorExercises', () => {
  it('a record created in one profile appears in the other', () => {
    store.put('pa', ex('x1', 100));
    expect(mirrorExercises(store, ['pa', 'pb'])).toEqual(['pb']);
    expect(get('pb', 'x1')).toEqual(ex('x1', 100));
  });

  it('the newer edit wins in the other profile', () => {
    store.put('pa', ex('x1', 100, 'Old'));
    store.put('pb', ex('x1', 200, 'New'));
    expect(mirrorExercises(store, ['pa', 'pb'])).toEqual(['pa']);
    expect(get('pa', 'x1')?.body).toEqual({ id: 'x1', title: 'New' });
  });

  it('a deletion mirrors', () => {
    store.put('pa', ex('x1', 100));
    mirrorExercises(store, ['pa', 'pb']);
    store.put('pa', ex('x1', 300, 'Cable fly', true));
    expect(mirrorExercises(store, ['pa', 'pb'])).toEqual(['pb']);
    expect(get('pb', 'x1')?.deleted).toBe(true);
  });

  it('a second run changes nothing', () => {
    store.put('pa', ex('x1', 100));
    store.put('pb', ex('x2', 150));
    expect(mirrorExercises(store, ['pa', 'pb']).sort()).toEqual(['pa', 'pb']);
    expect(mirrorExercises(store, ['pa', 'pb'])).toEqual([]);
  });

  it('a single profile is a no-op', () => {
    store.put('pa', ex('x1', 100));
    expect(mirrorExercises(store, ['pa'])).toEqual([]);
  });

  it('leaves other kinds alone', () => {
    store.put('pa', { kind: 'workout', id: 'w1', updatedMs: 100, deleted: false, body: { id: 'w1' } });
    expect(mirrorExercises(store, ['pa', 'pb'])).toEqual([]);
    expect(store.all('pb')).toEqual([]);
  });
});
