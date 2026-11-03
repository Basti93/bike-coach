// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrackedRecord } from '../../src/shared/records';
import { App, ErrorBoundary } from '../../src/web/App';
import { openIdb } from '../../src/web/idbStore';
import { mobilityToShow, shouldShowInstallHint } from '../../src/web/logic';

afterEach(cleanup);

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const plan = (atMs: number, mobility: unknown = null): TrackedRecord => ({
  kind: 'plan', id: 'current', updatedMs: atMs, deleted: false,
  body: { workout: { name: 'Beine A', exercises: [{ templateId: 'x', title: 'Kniebeuge', restS: 90, supersetId: null, notes: '', sets: [{ type: 'normal', weightKg: 40, reps: 8 }] }] }, reason: 'Beine sind dran', source: 'ai', note: 'Gut gemacht diese Woche', questions: [], atMs, mobility },
});
const session = (triggerMs: number) => ({ id: `mobility-bike-${triggerMs}`, forSession: 'bike', minutes: 8, exercises: [{ id: 'm1', title: 'Hüftbeuger dehnen', howTo: 'Ausfallschritt, ruhig atmen.', area: 'hueftbeuger' }], reason: 'Nach der Radfahrt tut das gut.' });

type Opts = { me?: number; hangMe?: boolean; noIdb?: 'null' | 'throws'; flags?: Record<string, string>; logoutFails?: boolean; loginStatus?: number; offline?: boolean; syncStatus?: number; seed?: TrackedRecord[]; account?: string; ua?: string; standalone?: boolean; persist?: boolean };
async function boot(o: Opts = {}) {
  const factory = new IDBFactory();
  if (o.seed) { const s = await openIdb('anna', factory); for (const r of o.seed) await s.put(r); s.close(); }
  const storage = new Map<string, string>([...(o.account ? [['pandafit.account', o.account] as [string, string]] : []), ...Object.entries(o.flags ?? {})]);
  const calls: string[] = [];
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    calls.push(`${init.method ?? 'GET'} ${url}`);
    if (o.offline) throw new TypeError('offline');
    if (url === '/me' && o.hangMe) return new Promise<Response>(() => {});
    if (url === '/logout' && o.logoutFails) throw new TypeError('offline');
    if (url === '/me') return o.me === 401 ? json(401, {}) : json(200, { name: 'anna' });
    if (url === '/login') return json(o.loginStatus ?? 200, { ok: true });
    if (url === '/logout') return json(200, { ok: true });
    if (o.syncStatus && o.syncStatus !== 200) return json(o.syncStatus, {});
    if (init.method === 'POST') return json(200, { accepted: 1, refused: [] });
    return json(200, { records: [], cursor: 0, more: false, reset: false });
  }) as unknown as typeof fetch;
  const persist = vi.fn(async () => o.persist ?? true);
  const onWorkoutOpen = vi.fn();
  const ui = render(<App env={{
    fetchFn, idbFactory: o.noIdb === 'null' ? null : o.noIdb === 'throws' ? ({ open: () => { throw new Error('denied'); } } as unknown as IDBFactory) : factory, now: () => NOW, newId: () => `id-${Math.random().toString(36).slice(2)}`,
    storage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); }, removeItem: (k: string) => { storage.delete(k); } },
    persist, ua: o.ua ?? 'Mozilla/5.0 Android', standalone: o.standalone ?? false, onWorkoutOpen,
  }} />);
  return { ...ui, factory, storage, calls, persist, onWorkoutOpen };
}

describe('web app', () => {
  it('login failure shows a calm message', async () => {
    await boot({ me: 401, loginStatus: 401 });
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'anna' } });
    fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'falsch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByText('Name oder Passwort stimmt nicht. Versuch es gern nochmal.')).toBeTruthy();
  });

  it('storage persistence is requested at login, and a refusal gets a single calm line', async () => {
    const a = await boot({ me: 401, persist: false });
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'anna' } });
    fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    await waitFor(() => expect(a.persist).toHaveBeenCalled());
    expect((await screen.findAllByText(/dauerhaften Speicher/)).length).toBe(1);
  });

  it('says nothing about storage when persistence is granted', async () => {
    const a = await boot({ seed: [], persist: true });
    await screen.findByRole('navigation');
    await waitFor(() => expect(a.persist).toHaveBeenCalled());
    expect(screen.queryByText(/dauerhaften Speicher/)).toBeNull();
  });

  it('offline after the first load the app and an open workout work', async () => {
    const a = await boot({ offline: true, account: 'anna', seed: [plan(NOW - 1000)] });
    expect(await screen.findByText('Beine A')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Training' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leeres Training starten' }));
    await waitFor(async () => {
      const s = await openIdb('anna', a.factory);
      expect((await s.list('workout')).length).toBe(1);
      s.close();
    });
    await waitFor(() => expect(a.onWorkoutOpen).toHaveBeenCalledWith('open'));
  });

  it('an expired login keeps unsent data and asks to log in again', async () => {
    const a = await boot({ syncStatus: 401, seed: [plan(NOW - 1000)] });
    expect(await screen.findByText(/Bitte melde dich neu an/)).toBeTruthy();
    expect(screen.getByText('Beine A')).toBeTruthy();
    expect(a.storage.get('pandafit.account')).toBe('anna');
  });

  it('the plan shows its date and says calmly when it is older than a week', async () => {
    await boot({ seed: [plan(NOW - 2 * DAY)] });
    expect(await screen.findByText(/^Plan vom /)).toBeTruthy();
    expect(screen.queryByText(/Mac macht einen neuen/)).toBeNull();
    cleanup();
    await boot({ seed: [plan(NOW - 9 * DAY)] });
    expect(await screen.findByText(/Mac macht einen neuen/)).toBeTruthy();
  });

  it('without a plan there is a calm note and a workout can still be started', async () => {
    await boot({ seed: [] });
    expect(await screen.findByText(/Noch kein Plan/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Training' }));
    expect(await screen.findByRole('button', { name: 'Leeres Training starten' })).toBeTruthy();
  });

  it('the mobility card comes from the plan and Gemacht writes the done record', async () => {
    const s = session(NOW - 3600_000);
    const a = await boot({ seed: [plan(NOW - 1000, s)] });
    expect(await screen.findByText('Hüftbeuger dehnen')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gemacht' }));
    await waitFor(async () => {
      const st = await openIdb('anna', a.factory);
      const m = (await st.list('mobility')).find((r) => r.id === s.id);
      expect(m?.body).toEqual({ doneMs: NOW, forSession: 'bike' });
      st.close();
    });
    await waitFor(() => expect(screen.queryByText('Hüftbeuger dehnen')).toBeNull());
  });

  it('open complaints can be added and closed', async () => {
    const a = await boot({ seed: [{ kind: 'complaint', id: 'c1', updatedMs: 5, deleted: false, body: { text: 'Knie links', status: 'active', atMs: 5 } }] });
    expect(await screen.findByText('Knie links')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Erledigt: Knie links' }));
    await waitFor(() => expect(screen.queryByText('Knie links')).toBeNull());
    fireEvent.change(screen.getByLabelText('Neue Beschwerde'), { target: { value: 'Schulter rechts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(await screen.findByText('Schulter rechts')).toBeTruthy();
    const st = await openIdb('anna', a.factory);
    const all = await st.list('complaint');
    expect(all.find((r) => r.id === 'c1')!.body).toMatchObject({ status: 'over' });
    expect(all.find((r) => r.id === 'c1')!.updatedMs).toBeGreaterThan(5);
    expect(all.length).toBe(2);
    st.close();
  });

  it('logging out asks when unsent records exist and keeps local data', async () => {
    const a = await boot({ offline: true, account: 'anna', seed: [plan(NOW - 1000)] });
    await screen.findByText('Beine A');
    fireEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(await screen.findByText(/noch nicht gesendet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Trotzdem abmelden' }));
    expect(await screen.findByLabelText('Name')).toBeTruthy();
    const st = await openIdb('anna', a.factory);
    expect((await st.list('plan')).length).toBe(1);
    st.close();
  });

  it('the install hint shows once on iPhone in the browser and never when installed', async () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Version/18 Mobile Safari/604';
    const a = await boot({ seed: [], ua: iphone });
    expect(await screen.findByText(/Zum Home-Bildschirm/)).toBeTruthy();
    expect(a.storage.get('pandafit.installHint')).toBe('1');
    cleanup();
    expect(shouldShowInstallHint({ ua: iphone, standalone: false, seen: true })).toBe(false);
    expect(shouldShowInstallHint({ ua: iphone, standalone: true, seen: false })).toBe(false);
    expect(shouldShowInstallHint({ ua: 'Mozilla/5.0 Android', standalone: false, seen: false })).toBe(false);
    expect(shouldShowInstallHint({ ua: iphone, standalone: false, seen: false })).toBe(true);
  });

  it('mobility is hidden when done or older than 24 hours', () => {
    const p = plan(NOW, session(NOW - 3600_000));
    expect(mobilityToShow(p, [], NOW)).not.toBeNull();
    expect(mobilityToShow(plan(NOW, session(NOW - 25 * 3600_000)), [], NOW)).toBeNull();
    const done: TrackedRecord = { kind: 'mobility', id: session(NOW - 3600_000).id, updatedMs: 1, deleted: false, body: { doneMs: NOW - 10, forSession: 'bike' } };
    expect(mobilityToShow(p, [done], NOW)).toBeNull();
    expect(mobilityToShow(plan(NOW, null), [], NOW)).toBeNull();
  });

  it('Hevy, Garmin and ride pages are not part of the web build', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const seen = new Set<string>();
    const bad: string[] = [];
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+'(\.[^']+)'|^\s*import\s+'(\.[^']+)'/gm)) {
        const spec = m[1] ?? m[2]!;
        const base = resolve(dirname(file), spec);
        const next = ['.ts', '.tsx', '/index.ts', ''].map((e) => base + e).find((p) => existsSync(p) && /\.(tsx?)$/.test(p));
        if (/\/src\/(service|main|ui|coach)\//.test(base)) bad.push(`${file} -> ${spec}`);
        if (next) walk(next);
      }
    };
    walk(resolve('src/web/main.tsx'));
    expect(bad).toEqual([]);
    expect(seen.size).toBeGreaterThan(5);
  });

  it('opens the last account at once; a 401 from /me keeps the app open with a login prompt and the open workout reachable', async () => {
    const open: TrackedRecord = { kind: 'workout', id: 'w-open', updatedMs: NOW - 60_000, deleted: false, body: { id: 'w-open', title: 'Offenes Training', startMs: NOW - 120_000, endMs: null, source: 'pandafit', exercises: [] } };
    await boot({ me: 401, account: 'anna', seed: [open], syncStatus: 401 });
    expect(await screen.findByText(/Bitte melde dich neu an/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Training' }));
    expect(await screen.findByText(/Training fortsetzen/)).toBeTruthy();
  });

  it('a hanging /me never blocks the UI', async () => {
    await boot({ hangMe: true, account: 'anna', seed: [plan(NOW - 1000)] });
    expect(await screen.findByText('Beine A')).toBeTruthy();
  });

  it('B logging in inside A\'s shell never lets A\'s records go out under B, nor B\'s into A\'s database', async () => {
    const factory = new IDBFactory();
    const sa = await openIdb('anna', factory);
    await sa.put({ kind: 'complaint', id: 'a-only', updatedMs: 5, deleted: false, body: { text: 'Nur Anna', status: 'active', atMs: 5 } });
    sa.close();
    let user: string | null = null; // whose cookie the "browser" currently holds
    const posts: { user: string | null; ids: string[] }[] = [];
    const fetchFn = (async (url: string, init: RequestInit = {}) => {
      if (url === '/login') { user = (JSON.parse(String(init.body)) as { name: string }).name; return json(200, { ok: true }); }
      if (url === '/me') return user ? json(200, { name: user }) : json(401, {});
      if (init.method === 'POST' && url === '/records') { posts.push({ user, ids: (JSON.parse(String(init.body)) as { records: { id: string }[] }).records.map((r) => r.id) }); return json(200, { accepted: 1, refused: [] }); }
      if (!user) return json(401, {});
      return json(200, { records: user === 'ben' ? [{ kind: 'complaint', id: 'b-only', updatedMs: 6, deleted: false, body: { text: 'Nur Ben', status: 'active', atMs: 6 } }] : [], cursor: 1, more: false, reset: false });
    }) as unknown as typeof fetch;
    const storage = new Map<string, string>([['pandafit.account', 'anna']]);
    render(<App env={{ fetchFn, idbFactory: factory, now: () => NOW, newId: () => 'x', storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => { storage.set(k, v); }, removeItem: (k) => { storage.delete(k); } }, persist: async () => true, ua: '', standalone: false }} />);
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'ben' } });
    fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    await waitFor(() => expect(storage.get('pandafit.account')).toBe('ben'));
    expect(await screen.findByText('Nur Ben')).toBeTruthy();
    expect(posts.filter((p) => p.user === 'ben' && p.ids.includes('a-only'))).toEqual([]);
    const a = await openIdb('anna', factory);
    expect((await a.list('complaint')).map((r) => r.id)).toEqual(['a-only']);
    a.close();
  });

  it('logging out clears the last account; offline it leaves a flag that blocks entry and retries /logout at the next start', async () => {
    const a = await boot({ account: 'anna', seed: [plan(NOW - 1000)], logoutFails: true });
    await screen.findByText('Beine A');
    await waitFor(() => expect(a.calls).toContain('GET /me'));
    fireEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    if (screen.queryByRole('button', { name: 'Trotzdem abmelden' })) fireEvent.click(screen.getByRole('button', { name: 'Trotzdem abmelden' }));
    expect(await screen.findByLabelText('Name')).toBeTruthy();
    expect(a.storage.get('pandafit.account')).toBeUndefined();
    expect(a.storage.get('pandafit.loggedOut')).toBe('1');
    cleanup();
    const b = await boot({ flags: { 'pandafit.loggedOut': '1' }, seed: [plan(NOW - 1000)] });
    expect(await screen.findByLabelText('Name')).toBeTruthy();
    expect(screen.queryByText('Beine A')).toBeNull();
    await waitFor(() => expect(b.calls).toContain('POST /logout'));
    await waitFor(() => expect(b.storage.get('pandafit.loggedOut')).toBeUndefined());
  });

  it('IndexedDB unavailable says so plainly, at startup and after login, and offers no workout screen', async () => {
    await boot({ noIdb: 'null', account: 'anna' });
    expect(await screen.findByText(/nicht gespeichert werden/)).toBeTruthy();
    expect(screen.queryByText(/Keine Verbindung/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Training' })).toBeNull();
    cleanup();
    await boot({ noIdb: 'throws', me: 401 });
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'anna' } });
    fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByText(/nicht gespeichert werden/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Leeres Training starten' })).toBeNull();
  });

  it('the persistence notice shows only once', async () => {
    await boot({ persist: false, seed: [] });
    expect(await screen.findByText(/dauerhaften Speicher/)).toBeTruthy();
    cleanup();
    const again = await boot({ persist: false, seed: [], flags: { 'pandafit.persistNote': '1' } });
    await screen.findByRole('navigation');
    await waitFor(() => expect(again.persist).toHaveBeenCalled());
    expect(screen.queryByText(/dauerhaften Speicher/)).toBeNull();
  });

  it('the workout state is unknown until read, open for a fresh open workout, and none for a stale one', async () => {
    const mk = (age: number): TrackedRecord => ({ kind: 'workout', id: 'w', updatedMs: NOW - age, deleted: false, body: { id: 'w', title: 'T', startMs: NOW - age, endMs: null, source: 'pandafit', exercises: [] } });
    const fresh = await boot({ seed: [mk(60_000)] });
    await waitFor(() => expect(fresh.onWorkoutOpen).toHaveBeenCalledWith('open'));
    expect(fresh.onWorkoutOpen).not.toHaveBeenCalledWith('none');
    cleanup();
    const stale = await boot({ seed: [mk(13 * 3600_000)] });
    await waitFor(() => expect(stale.onWorkoutOpen).toHaveBeenCalledWith('none'));
    expect(stale.onWorkoutOpen).not.toHaveBeenCalledWith('open');
  });

  it('a malformed plan record does not white-screen the page', async () => {
    await boot({ seed: [{ kind: 'plan', id: 'current', updatedMs: 1, deleted: false, body: { workout: { name: 'X', exercises: [{ title: 'Ohne Sätze' }] } } }, { kind: 'complaint', id: 'c', updatedMs: 1, deleted: false, body: null }] });
    expect(await screen.findByText(/Noch kein Plan/)).toBeTruthy();
  });

  it('an error boundary shows a calm message and still offers the workout page', () => {
    const Boom = () => { throw new Error('boom'); };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let went = 0;
    render(<ErrorBoundary onTraining={() => { went++; }}><Boom /></ErrorBoundary>);
    expect(screen.getByText(/lässt sich gerade nicht anzeigen/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zum Training' }));
    expect(went).toBe(1);
    spy.mockRestore();
  });
});
