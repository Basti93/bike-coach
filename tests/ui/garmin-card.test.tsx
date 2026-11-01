// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GarminCard } from '../../src/ui/views/GarminCard';

afterEach(cleanup);
test('sends email and password and clears the password right away', () => {
  const send = vi.fn();
  render(<GarminCard profileId="p" status={{ state: 'idle' }} send={send} />);
  fireEvent.change(screen.getByLabelText('E-Mail'), { target: { value: 'a@b.de' } });
  const pw = screen.getByLabelText('Passwort') as HTMLInputElement;
  expect(pw.type).toBe('password');
  fireEvent.change(pw, { target: { value: 'geheim' } });
  fireEvent.click(screen.getByRole('button', { name: 'Mit Garmin verbinden' }));
  expect(send).toHaveBeenCalledWith({ type: 'garmin-login', profileId: 'p', email: 'a@b.de', password: 'geheim' });
  expect(pw.value).toBe('');
});
test('asks for the two-factor code when needed', () => {
  const send = vi.fn();
  render(<GarminCard profileId="p" status={{ state: 'needs-mfa' }} send={send} />);
  fireEvent.change(screen.getByLabelText('Zwei-Faktor-Code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Code senden' }));
  expect(send).toHaveBeenCalledWith({ type: 'garmin-mfa', profileId: 'p', code: '123456' });
});
test('warns against retrying after a rate limit', () => {
  render(<GarminCard profileId="p" status={{ state: 'failed', reason: 'rate-limit' }} send={vi.fn()} />);
  expect(screen.getByRole('alert').textContent).toContain('später');
});
test('offers to disconnect once connected', () => {
  const send = vi.fn();
  render(<GarminCard profileId="p" status={{ state: 'connected' }} send={send} />);
  fireEvent.click(screen.getByRole('button', { name: 'Trennen' }));
  expect(send).toHaveBeenCalledWith({ type: 'garmin-disconnect', profileId: 'p' });
});
test('shows when the data was last updated and that the history is still loading', () => {
  render(<GarminCard profileId="p" status={{ state: 'connected' }} send={vi.fn()} sync={{ running: false, lastRunMs: new Date(2026, 10, 1, 9, 5).getTime(), complete: false, problem: null }} />);
  expect(screen.getByRole('status').textContent).toContain('Verlauf wird noch geladen');
  expect(screen.getByRole('status').textContent).toContain('09:05');
});
test('asks to sign in again when the login expired', () => {
  render(<GarminCard profileId="p" status={{ state: 'connected' }} send={vi.fn()} sync={{ running: false, lastRunMs: 1, complete: true, problem: 'reauth' }} />);
  expect(screen.getByRole('alert').textContent).toContain('erneut anmelden');
  expect(screen.getByRole('button', { name: 'Mit Garmin verbinden' })).toBeTruthy();
});
test('explains a pause after a rate limit', () => {
  render(<GarminCard profileId="p" status={{ state: 'connected' }} send={vi.fn()} sync={{ running: false, lastRunMs: 1, complete: false, problem: 'rate-limit' }} />);
  expect(screen.getByRole('status').textContent).toContain('pausiert');
});
