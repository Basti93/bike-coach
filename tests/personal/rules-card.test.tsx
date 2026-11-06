// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { goalRecord, ruleRecord } from '../../src/shared/personal';
import type { TrackedRecord } from '../../src/shared/records';
import { CoachScreen } from '../../src/tracking/ui/CoachScreen';
import { fakePort } from '../tracking/fake-port';

afterEach(cleanup);
const NOW = new Date(2026, 10, 4, 18).getTime();
let n = 0;
const env = { now: () => NOW, newId: () => `id${++n}` };
const body = (map: Map<string, TrackedRecord>, key: string) => map.get(key)!.body as Record<string, unknown>;
const seed = (): TrackedRecord[] => [
  ruleRecord('rule-a', { kind: 'wish', text: 'Lieber kurze Pausen', sport: 'gym' }, 'active', 'person', 1000),
  ruleRecord('rule-b', { kind: 'exclude', text: 'Ohne Übung X', sport: 'gym', exerciseIds: ['pf-squat'] }, 'paused', 'person', 2000),
  ruleRecord('rule-c', { kind: 'wish', text: 'Vorgeschlagen', sport: 'bike' }, 'proposed', 'chat', 3000),
];
const card = async () => within(await screen.findByRole('region', { name: 'Meine Regeln und Ziele' }));

test('lists active and paused rules, not proposed ones', async () => {
  const { port } = fakePort(seed());
  render(<CoachScreen port={port} {...env} />);
  const c = await card();
  expect(await c.findByText(/Lieber kurze Pausen/)).toBeTruthy();
  expect(c.getByText(/Ohne Übung X/)).toBeTruthy();
  expect(c.queryByText(/Vorgeschlagen/)).toBeNull();
});

test('pause, continue and delete write the right records', async () => {
  const { port, map } = fakePort(seed());
  render(<CoachScreen port={port} {...env} />);
  const c = await card();
  fireEvent.click(await c.findByRole('button', { name: 'Pausieren Lieber kurze Pausen' }));
  await waitFor(() => expect(body(map, 'rule:rule-a').state).toBe('paused'));
  fireEvent.click(await c.findByRole('button', { name: 'Fortsetzen Ohne Übung X' }));
  await waitFor(() => expect(body(map, 'rule:rule-b').state).toBe('active'));
  fireEvent.click(c.getByRole('button', { name: 'Löschen Lieber kurze Pausen' }));
  await waitFor(() => expect(map.get('rule:rule-a')!.deleted).toBe(true));
  await waitFor(() => expect(c.queryByText(/Lieber kurze Pausen/)).toBeNull());
});

test('a written wish and an excluded exercise from the picker', async () => {
  const { port, map } = fakePort();
  render(<CoachScreen port={port} {...env} />);
  const c = await card();
  fireEvent.change(c.getByLabelText('Neue Regel'), { target: { value: 'Keine Sprünge' } });
  fireEvent.click(c.getByRole('button', { name: 'Regel hinzufügen' }));
  await waitFor(() => expect([...map.values()].find((r) => r.kind === 'rule' && body(map, `rule:${r.id}`).text === 'Keine Sprünge')).toBeTruthy());
  const wish = [...map.values()].find((r) => r.kind === 'rule')!;
  expect(wish.body).toMatchObject({ kind: 'wish', state: 'active', source: 'person', sport: 'all' });

  fireEvent.click(c.getByRole('button', { name: 'Übung ausschließen' }));
  fireEvent.change(await screen.findByLabelText('Suchen'), { target: { value: 'Kniebeuge' } });
  fireEvent.click((await screen.findAllByRole('button', { name: /^Kniebeuge/ }))[0]!);
  await waitFor(() => expect([...map.values()].some((r) => r.kind === 'rule' && body(map, `rule:${r.id}`).kind === 'exclude')).toBe(true));
  const ex = [...map.values()].find((r) => r.kind === 'rule' && (r.body as { kind: string }).kind === 'exclude')!;
  expect(ex.body).toMatchObject({ state: 'active', source: 'person', sport: 'gym' });
  expect((ex.body as { exerciseIds: string[] }).exerciseIds).toHaveLength(1);
});

test('the goal selects write the goal record, stamped above the stored one', async () => {
  const { port, map } = fakePort([goalRecord({ strength: 'muscle', focus: [], sports: {} }, NOW + 5000)]);
  render(<CoachScreen port={port} {...env} />);
  const c = await card();
  fireEvent.change(c.getByLabelText('Ziel'), { target: { value: 'strength' } });
  await waitFor(() => expect(body(map, 'goal:goal').strength).toBe('strength'));
  expect(map.get('goal:goal')!.updatedMs).toBeGreaterThan(NOW + 5000);
  fireEvent.change(c.getByLabelText('Rad'), { target: { value: 'keep' } });
  await waitFor(() => expect(body(map, 'goal:goal').sports).toEqual({ bike: 'keep' }));
  expect(body(map, 'goal:goal').strength).toBe('strength');
});

test('at most three focus muscles', async () => {
  const { port, map } = fakePort();
  render(<CoachScreen port={port} {...env} />);
  const c = await card();
  expect(c.getByText('Schwerpunkt: keiner')).toBeTruthy();
  expect(c.queryByRole('button', { name: 'Brust' })).toBeNull();
  fireEvent.click(c.getByRole('button', { name: 'ändern' }));
  for (const g of ['Brust', 'Rücken', 'Bizeps']) fireEvent.click(await c.findByRole('button', { name: g }));
  await waitFor(() => expect((body(map, 'goal:goal').focus as string[]).length).toBe(3));
  expect(c.getByText(/Schwerpunkt: Brust, Rücken, Bizeps/)).toBeTruthy();
  expect(c.queryByRole('button', { name: 'Trizeps' })).toBeNull(); // collapsed again after the third
  fireEvent.click(c.getByRole('button', { name: 'ändern' }));
  expect((c.getByRole('button', { name: 'Trizeps' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(c.getByRole('button', { name: 'Brust' }));
  await waitFor(() => expect((body(map, 'goal:goal').focus as string[]).length).toBe(2));
});
