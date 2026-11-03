// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';

let crash = true;
vi.mock('../../src/tracking/ui', async (orig) => ({
  ...(await orig<typeof import('../../src/tracking/ui')>()),
  WorkoutScreen: () => { if (crash) throw new Error('boom'); return <p>Training läuft</p>; },
}));
import { App } from '../../src/web/App';

afterEach(cleanup);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('error boundary in the app', () => {
  it('the button on the broken Training page itself brings the page back once it works again', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = (async (url: string) => (url === '/me' ? json(200, { name: 'anna' }) : json(200, { records: [], cursor: 0, more: false, reset: false }))) as unknown as typeof fetch;
    const store = new Map<string, string>([['pandafit.account', 'anna']]);
    render(<App env={{ fetchFn, idbFactory: new IDBFactory(), now: () => 1, newId: () => 'x', storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); }, removeItem: (k) => { store.delete(k); } }, persist: async () => true, ua: '', standalone: false }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Training' }));
    expect(await screen.findByText(/lässt sich gerade nicht anzeigen/)).toBeTruthy();
    crash = false;
    fireEvent.click(screen.getByRole('button', { name: 'Zum Training' }));
    expect(await screen.findByText('Training läuft')).toBeTruthy();
    spy.mockRestore();
  });
});
