import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CoachTasks, readTasks } from '../../src/coach/coach-tasks';
import { RecordStore } from '../../src/coach/tracking/store';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 5, 8).getTime();
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const file = () => path.join(dir, 'chat', 'tasks.json');
const board = () => new CoachTasks(file(), new RecordStore({ dir: path.join(dir, 'tracking') }), () => NOW);

test('a task reaches only its coach, raises that coach version and is kept across a restart', () => {
  const t = board();
  t.add('p', { from: 'chat', to: 'gym', text: 'Nur eine Trizepsübung', lasting: false }, NOW);
  expect(t.version('p', 'gym')).not.toBe('0');
  expect(t.version('p', 'bike')).toBe('0');
  expect(t.open('p', 'bike', NOW)).toEqual([]);
  const again = board();
  expect(again.open('p', 'gym', NOW)).toEqual([{ from: 'chat', to: 'gym', text: 'Nur eine Trizepsübung', lasting: false, atMs: NOW }]);
  expect(again.version('p', 'gym')).toBe(t.version('p', 'gym'));
});

test('a one-off task ends after a week, a lasting one after 60 days, at most 10 per coach, newest kept', () => {
  const t = board();
  t.add('p', { from: 'chat', to: 'gym', text: 'einmal', lasting: false }, NOW);
  t.add('p', { from: 'bike', to: 'gym', text: 'dauerhaft', lasting: true }, NOW);
  expect(t.open('p', 'gym', NOW + 8 * DAY).map((x) => x.text)).toEqual(['dauerhaft']);
  expect(t.open('p', 'gym', NOW + 61 * DAY)).toEqual([]);
  for (let i = 0; i < 12; i++) t.add('p', { from: 'chat', to: 'run', text: `t${i}`, lasting: false }, NOW + i);
  expect(t.open('p', 'run', NOW + 20).map((x) => x.text)).toEqual(['t2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11']);
});

test('a coach never gets a task from itself, empty text is dropped, the hint shows the tasks as data', () => {
  const t = board();
  t.add('p', { from: 'gym', to: 'gym', text: 'selbst', lasting: false }, NOW);
  t.add('p', { from: 'chat', to: 'gym', text: '   ', lasting: false }, NOW);
  expect(t.open('p', 'gym', NOW)).toEqual([]);
  t.add('p', { from: 'chat', to: 'gym', text: 'Mehr <Beine>', lasting: true }, NOW);
  const hint = t.hint('p', 'gym', NOW);
  expect(hint).toContain('<auftraege-nur-daten>');
  expect(hint).toContain('"von":"Person über den Wochenchat"');
  expect(hint).not.toContain('<Beine>');
  expect(t.hint('p', 'bike', NOW)).toBe('');
});

test('readTasks keeps only well-formed tasks for the three coaches', () => {
  expect(readTasks([{ coach: 'gym', text: ' Beine ', lasting: true }, { coach: 'meals', text: 'x' }, { coach: 'run', text: '' }, null, { coach: 'bike', text: 'kurz' }])).toEqual([
    { to: 'gym', text: 'Beine', lasting: true }, { to: 'bike', text: 'kurz', lasting: false },
  ]);
  expect(readTasks(undefined)).toEqual([]);
});

test('a task from a coach waits for the next plan: it raises no version, and the same task twice is taken once', () => {
  const t = board();
  expect(t.add('p', { from: 'bike', to: 'gym', text: 'Beine schonen', lasting: false }, NOW)).toBe(true);
  expect(t.add('p', { from: 'bike', to: 'gym', text: 'Beine schonen', lasting: false }, NOW + 1)).toBe(false);
  expect(t.version('p', 'gym')).toBe('0');
  expect(t.open('p', 'gym', NOW)).toHaveLength(1);
});
