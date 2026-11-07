// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EXERCISES } from '../../src/shared/exercises';
import { readRule, ruleRecord } from '../../src/shared/personal';
import type { TrackedRecord } from '../../src/shared/records';
import { CatalogScreen } from '../../src/tracking/ui/CatalogScreen';
import { fakePort } from './fake-port';

afterEach(cleanup);

const ids = { newId: () => 'new-id', now: () => 100_000 };
const rule = (id: string, text: string, extra: object, source: 'person' | 'chat' = 'person'): TrackedRecord =>
  ruleRecord(id, { kind: 'exclude', text, sport: 'gym', ...extra }, 'active', source, 1000);
const squat = EXERCISES.find((e) => e.id === 'pf-squat')!;
const bench = EXERCISES.find((e) => e.id === 'pf-bench-press')!;

async function open(seed: TrackedRecord[] = []) {
  const f = fakePort(seed);
  render(<CatalogScreen port={f.port} {...ids} />);
  await screen.findByRole('button', { name: /^Brust/ });
  return f;
}
const rules = (f: ReturnType<typeof fakePort>) => [...f.map.values()].filter((r) => r.kind === 'rule').map((r) => ({ r, c: readRule(r.id, r.body)! }));
const line = (title: string) => screen.getByRole('button', { name: new RegExp(`^${title}\\s*·`) });
const search = (v: string) => fireEvent.change(screen.getByLabelText('Übung suchen'), { target: { value: v } });

describe('catalog page', () => {
  test('groups are collapsed with a count; a tap opens one', async () => {
    await open();
    expect(screen.queryByRole('button', { name: new RegExp(`^${bench.title}\\s*·`) })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Brust/ }));
    expect(line(bench.title)).toBeTruthy();
  });

  test('search filters and shows the hits without opening a group', async () => {
    await open();
    search(bench.title);
    expect(line(bench.title)).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(`^${squat.title}\\s*·`) })).toBeNull();
    search('qqqqzzz');
    expect(screen.getByText('Nichts gefunden.')).toBeTruthy();
  });

  test('"Ausschließen" writes a person rule for the exercise', async () => {
    const f = await open();
    search(bench.title);
    fireEvent.click(line(bench.title));
    fireEvent.click(screen.getByRole('button', { name: 'Ausschließen' }));
    await waitFor(() => expect(rules(f)).toHaveLength(1));
    expect(rules(f)[0].c).toMatchObject({ kind: 'exclude', source: 'person', state: 'active', exerciseIds: [bench.id] });
  });

  test('"Alle Varianten ausschließen" writes a family rule', async () => {
    const f = await open();
    search(squat.title);
    fireEvent.click(line(squat.title));
    fireEvent.click(screen.getByRole('button', { name: 'Alle Varianten ausschließen' }));
    await waitFor(() => expect(rules(f)).toHaveLength(1));
    expect(rules(f)[0].c).toMatchObject({ source: 'person', families: ['squat'] });
    expect(rules(f)[0].c.exerciseIds).toBeUndefined();
  });

  test('an excluded exercise carries the mark, also through a family rule', async () => {
    await open([rule('rule-a', 'Ohne alle Varianten: Kniebeuge', { families: ['squat'] })]);
    search(squat.title);
    expect(screen.getByRole('button', { name: new RegExp(`^${squat.title}\\s*·.*ausgeschlossen`) })).toBeTruthy();
    search(bench.title);
    expect(screen.queryByText(/ausgeschlossen/)).toBeNull();
  });

  test('"Wieder erlauben" pauses the person rule', async () => {
    const f = await open([rule('rule-a', `Ohne ${bench.title}`, { exerciseIds: [bench.id] })]);
    search(bench.title);
    fireEvent.click(line(bench.title));
    expect(screen.queryByRole('button', { name: 'Ausschließen' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Wieder erlauben' }));
    await waitFor(() => expect(rules(f)[0].c.state).toBe('paused'));
    await waitFor(() => expect(screen.queryByText(/ausgeschlossen/)).toBeNull());
  });

  test('a rule from the chat is named, not changed', async () => {
    const f = await open([rule('rule-c', 'Keine Kniebeugen mehr', { families: ['squat'] }, 'chat')]);
    search(squat.title);
    fireEvent.click(line(squat.title));
    expect(screen.getByText(/Keine Kniebeugen mehr/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Wieder erlauben' })).toBeNull();
    expect(rules(f)[0].c.state).toBe('active');
  });
});
