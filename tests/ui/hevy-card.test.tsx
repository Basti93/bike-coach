// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HevyCard } from '../../src/ui/views/HevyCard';

afterEach(cleanup);
const KEY = '11111111-2222-3333-4444-555555555555';
const card = (status: Parameters<typeof HevyCard>[0]['status']) => {
  const send = vi.fn();
  render(<HevyCard profileId="p" status={status} send={send} />);
  return send;
};

test('without a connection it stays small and optional', () => {
  card({ state: 'idle' });
  expect(screen.getByText('Hevy verbinden (optional)').closest('details')?.open).toBe(false);
});
test('explains where the key comes from', () => {
  card({ state: 'idle' });
  expect(screen.getByRole('link', { name: /hevy.com/ }).getAttribute('href')).toBe('https://hevy.com/settings?developer');
  expect(screen.getByText(/Hevy Pro/)).toBeTruthy();
});
test('sends the key, hides it while typing and clears the field', () => {
  const send = card({ state: 'idle' });
  const input = screen.getByLabelText(/API-Schlüssel/) as HTMLInputElement;
  expect(input.type).toBe('password');
  fireEvent.change(input, { target: { value: KEY } });
  fireEvent.click(screen.getByRole('button', { name: 'Verbinden' }));
  expect(send).toHaveBeenCalledWith({ type: 'hevy-connect', profileId: 'p', key: KEY });
  expect(input.value).toBe('');
});
test('an empty field sends nothing', () => {
  const send = card({ state: 'idle' });
  fireEvent.click(screen.getByRole('button', { name: 'Verbinden' }));
  expect(send).not.toHaveBeenCalled();
});
test('says when a key does not work, with the form open', () => {
  card({ state: 'failed', reason: 'invalid' });
  expect(screen.getByRole('alert').textContent).toContain('Schlüssel');
  expect((screen.getByLabelText(/API-Schlüssel/) as HTMLInputElement)).toBeTruthy();
  expect(screen.getByText('Hevy verbinden (optional)').closest('details')?.open).toBe(true);
});
test('an expired key asks to connect again', () => {
  card({ state: 'failed', reason: 'expired' });
  expect(screen.getByRole('alert').textContent).toContain('nicht mehr');
});
test('a network problem is not blamed on the key', () => {
  card({ state: 'failed', reason: 'failed' });
  expect(screen.getByRole('alert').textContent).toContain('später');
});
test('shows that it is connecting', () => {
  card({ state: 'connecting' });
  expect(screen.getByRole('status').textContent).toContain('verbunden');
});
test('when connected it shows the state and can be separated', () => {
  const send = card({ state: 'connected', workouts: 248, loading: false, lastSyncMs: Date.parse('2027-01-02T10:00:00Z') });
  expect(screen.getByText(/248 Workouts/)).toBeTruthy();
  expect(screen.queryByLabelText(/API-Schlüssel/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Trennen' }));
  expect(send).toHaveBeenCalledWith({ type: 'hevy-disconnect', profileId: 'p' });
});
test('says while the history is still loading', () => {
  card({ state: 'connected', workouts: 30, loading: true, lastSyncMs: null });
  expect(screen.getByText(/wird noch geladen/)).toBeTruthy();
});
