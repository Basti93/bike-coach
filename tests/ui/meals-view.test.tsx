// @vitest-environment jsdom
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MealCoach, type MealsView as MealsData } from '../../src/coach/meals/meal-coach';
import { MealsView } from '../../src/ui/views/MealsView';
import { MealSettingsCard } from '../../src/ui/views/MealSettingsCard';
import { App } from '../../src/ui/App';

afterEach(cleanup);
const h = vi.hoisted(() => ({ meals: null as unknown }));
vi.mock('../../src/ui/useCoach', () => ({ useCoach: () => ({ state: null, thinking: false, connected: true, statusArrived: true, send: () => {}, hevy: { state: 'idle' }, garmin: { state: 'idle' }, together: null, gym: null, meals: h.meals, gymPreview: null, gymPreviewFailed: false, gymConfirmResult: null, clearGym: () => {} }) }));
vi.mock('../../src/ui/useRide', () => ({ useRide: () => ({
  state: { type: 'state', ride: null, engine: null, devices: {}, latest: {}, storageError: false, recovered: false, profiles: [{ id: 'max', name: 'Max', ftpW: 200 }, { id: 'lena', name: 'Lena', ftpW: 200 }] },
  offer: null, clearOffer: () => {}, connected: true, send: () => {}, error: null,
}) }));

/** A real plan from the rule planner, on Tuesday 10 November 2026. */
const sample = async (): Promise<MealsData> => {
  const now = new Date(2026, 10, 10, 9).getTime();
  const c = new MealCoach({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'mv-')), nowMs: () => now, profiles: () => [{ id: 'max', name: 'Max' }, { id: 'lena', name: 'Lena' }], noOpenRide: () => true, random: () => 0.5 });
  c.setSettings('max', { on: true });
  c.setSettings('lena', { on: true });
  await c.replan('max', '2026-11-09');
  return JSON.parse(JSON.stringify(c.view('max'))) as MealsData;
};

test('the week grid: 7 days, 3 meals, today highlighted, a rest marked, a card opens its recipe', async () => {
  const meals = await sample();
  const send = vi.fn();
  render(<MealsView profileId="max" meals={meals} send={send} />);
  expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  expect(screen.getAllByRole('rowheader').map((x) => x.textContent)).toEqual([expect.stringContaining('Frühstück'), expect.stringContaining('Mittagessen'), expect.stringContaining('Abendessen')]);
  expect(screen.getAllByRole('columnheader')[1]!.textContent).toContain('Heute');
  expect(screen.getByRole('button', { name: /Mittwoch, Mittagessen/ }).textContent).toContain('reicht für Do');
  expect(screen.getByRole('button', { name: /Donnerstag, Mittagessen/ }).textContent).toContain('Rest von Mi');
  fireEvent.click(screen.getByRole('button', { name: /Mittwoch, Mittagessen/ }));
  const panel = screen.getByRole('dialog');
  expect(within(panel).getByText(/Zutaten für 4 Portionen/)).toBeTruthy();
  fireEvent.click(within(panel).getByRole('button', { name: /Lena/ }));
  expect(send).toHaveBeenCalledWith({ type: 'meals-eater', profileId: 'max', week: '2026-11-09', meal: '2-mittag', person: 'lena', on: false });
  fireEvent.click(within(panel).getByRole('button', { name: 'Tauschen' }));
  expect(send).toHaveBeenCalledWith({ type: 'meals-swap', profileId: 'max', week: '2026-11-09', meal: '2-mittag', ai: false });
  expect(JSON.stringify(document.body.textContent)).not.toMatch(/kcal|Kalorie|Gewicht/);
});

test('the shopping list: sections, ticks and "schon da" go to the coach', async () => {
  const meals = await sample();
  const send = vi.fn();
  render(<MealsView profileId="max" meals={meals} send={send} />);
  fireEvent.click(screen.getByRole('button', { name: 'Einkaufsliste' }));
  expect(screen.getByRole('heading', { name: 'Obst und Gemüse' })).toBeTruthy();
  const box = screen.getAllByRole('checkbox')[0]!;
  fireEvent.click(box);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'meals-item', week: '2026-11-09', state: 'gekauft' }));
  fireEvent.click(screen.getAllByRole('button', { name: /schon da$/ })[0]!);
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'meals-item', state: 'da' }));
});

test('with a ride open, planning and swapping wait', async () => {
  const meals = { ...(await sample()), canPlan: false };
  render(<MealsView profileId="max" meals={meals} send={() => {}} />);
  expect((screen.getByRole('button', { name: 'Neu planen' }) as HTMLButtonElement).disabled).toBe(true);
});

test('settings: off by default, turning on sends the profile settings, tags are added and removed', () => {
  const send = vi.fn();
  const { rerender } = render(<MealSettingsCard profileId="lena" settings={undefined} coachConnected send={send} />);
  expect(screen.getByRole('button', { name: 'Essensplan: aus' }).getAttribute('aria-pressed')).toBe('false');
  expect(screen.queryByLabelText('Abneigungen')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Essensplan: aus' }));
  expect(send).toHaveBeenLastCalledWith({ type: 'meals-settings', profileId: 'lena', settings: expect.objectContaining({ on: true, diet: 'vegetarisch', habits: { fruehstueck: 'zuhause', mittag: 'mitnehmen', abend: 'zuhause' } }) });
  rerender(<MealSettingsCard profileId="lena" settings={{ ...send.mock.lastCall![0].settings }} coachConnected send={send} />);
  fireEvent.change(screen.getByLabelText('Abneigungen'), { target: { value: 'Pilze' } });
  fireEvent.keyDown(screen.getByLabelText('Abneigungen'), { key: 'Enter' });
  expect(send.mock.lastCall![0].settings.dislikes).toEqual(['Pilze']);
  fireEvent.click(screen.getByRole('button', { name: 'Pilze entfernen' }));
  expect(send.mock.lastCall![0].settings.dislikes).toEqual([]);
});

test('the menu shows Essen only when the plan is on for this profile', async () => {
  h.meals = { ...(await sample()), settings: { on: false, diet: 'vegetarisch', dislikes: [], intolerances: [], habits: { fruehstueck: 'zuhause', mittag: 'mitnehmen', abend: 'zuhause' } }, weeks: [] };
  const { unmount } = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Max' }));
  expect(screen.queryByRole('button', { name: 'Essen' })).toBeNull();
  unmount();
  h.meals = await sample();
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Max' }));
  fireEvent.click(screen.getByRole('button', { name: 'Essen' }));
  expect(screen.getByRole('heading', { name: 'Essen' })).toBeTruthy();
});
