// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GarminProfileBanner, GarminProfileReview } from '../../src/ui/views/GarminProfileReview';
import type { GarminSuggestion } from '../../src/shared/garmin-profile';

afterEach(cleanup);
beforeEach(() => localStorage.clear());
const suggestion: GarminSuggestion = { birthDate: '1990-01-15', sex: 'male', heightCm: 178, weightKg: 72, activity: 3, run5kMin: null, ftp: { startW: 183, source: 'garmin' }, maxHrBpm: 190, missing: [] };
const profile = { id: 'p', name: 'S', ftpW: 150, weightKg: 70, ftpCapW: 170 };
const view = () => {
  const sendRide = vi.fn(); const sendCoach = vi.fn(); const onBack = vi.fn();
  render(<GarminProfileReview profile={profile} ftpW={150} suggestion={suggestion} sendRide={sendRide} sendCoach={sendCoach} onBack={onBack} />);
  return { sendRide, sendCoach, onBack };
};
const take = () => fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));

test('nothing is sent before you confirm, and each value shows its origin', () => {
  const { sendRide, sendCoach } = view();
  expect(sendRide).not.toHaveBeenCalled();
  expect(sendCoach).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Garmin: 72');
  expect(document.body.textContent).toContain('bei dir: 70');
});
test('empty fields are taken over, differing ones stay yours', () => {
  const { sendRide, sendCoach, onBack } = view();
  take();
  expect(sendRide).toHaveBeenCalledWith({ type: 'save-profile', profile: { ...profile, birthDate: '1990-01-15', sex: 'male', heightCm: 178 } });
  expect(sendCoach).not.toHaveBeenCalled();
  expect(onBack).toHaveBeenCalled();
});
test('a value you select and adjust is used', () => {
  const { sendRide } = view();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Gewicht übernehmen' }));
  fireEvent.change(screen.getByLabelText('Gewicht'), { target: { value: '65,5' } });
  take();
  expect(sendRide.mock.calls[0][0].profile.weightKg).toBe(65.5);
});
test('a selected FTP goes through the coach and removes the old limit', () => {
  const { sendRide, sendCoach } = view();
  fireEvent.click(screen.getByRole('checkbox', { name: 'FTP übernehmen' }));
  take();
  expect(sendCoach).toHaveBeenCalledWith({ type: 'set-ftp', profileId: 'p', ftpW: 183 });
  expect(sendRide.mock.calls[0][0].profile.ftpCapW).toBeUndefined();
});
test('an estimated FTP brings its own limit', () => {
  const sendRide = vi.fn();
  render(<GarminProfileReview profile={profile} ftpW={150} suggestion={{ ...suggestion, ftp: { startW: 140, source: 'estimate', capW: 183 } }} sendRide={sendRide} sendCoach={vi.fn()} onBack={vi.fn()} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'FTP übernehmen' }));
  take();
  expect(sendRide.mock.calls[0][0].profile.ftpCapW).toBe(183);
});
test('the banner appears only with something to review and stays away after later', () => {
  const onReview = vi.fn();
  const first = render(<GarminProfileBanner profile={profile} ftpW={150} suggestion={suggestion} onReview={onReview} />);
  fireEvent.click(screen.getByRole('button', { name: 'Werte aus Garmin prüfen' }));
  expect(onReview).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Später' }));
  expect(screen.queryByRole('button', { name: 'Werte aus Garmin prüfen' })).toBeNull();
  first.unmount();
  render(<GarminProfileBanner profile={profile} ftpW={150} suggestion={suggestion} onReview={onReview} />);
  expect(screen.queryByRole('button', { name: 'Werte aus Garmin prüfen' })).toBeNull();
  cleanup();
  render(<GarminProfileBanner profile={profile} ftpW={150} suggestion={{ ...suggestion, weightKg: 64 }} onReview={onReview} />);
  expect(screen.getByRole('button', { name: 'Werte aus Garmin prüfen' })).toBeTruthy();
});
test('no banner when everything already matches or there is no suggestion', () => {
  const same = { id: 'p', name: 'S', ftpW: 183, hrMaxBpm: 190, birthDate: '1990-01-15', sex: 'male' as const, heightCm: 178, weightKg: 72 };
  const { container, rerender } = render(<GarminProfileBanner profile={same} ftpW={183} suggestion={suggestion} onReview={vi.fn()} />);
  expect(container.textContent).toBe('');
  rerender(<GarminProfileBanner profile={same} ftpW={183} suggestion={null} onReview={vi.fn()} />);
  expect(container.textContent).toBe('');
});
test('an estimate is not presented as a value from Garmin, and the sex reads in German', () => {
  render(<GarminProfileReview profile={profile} ftpW={150} suggestion={{ ...suggestion, ftp: { startW: 140, source: 'estimate', capW: 183 } }} sendRide={vi.fn()} sendCoach={vi.fn()} onBack={vi.fn()} />);
  expect(document.body.textContent).toContain('Schätzung: 140');
  expect(document.body.textContent).not.toContain('Garmin: 140');
  expect((screen.getByLabelText('Geschlecht') as HTMLInputElement).value).toBe('Mann');
});
test('an invalid selected value blocks taking over, so nothing is half saved', () => {
  const { sendRide, sendCoach, onBack } = view();
  fireEvent.click(screen.getByRole('checkbox', { name: 'FTP übernehmen' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Gewicht übernehmen' }));
  fireEvent.change(screen.getByLabelText('Gewicht'), { target: { value: '70 kg' } });
  expect((screen.getByRole('button', { name: 'Übernehmen' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('Gewicht');
  take();
  expect(sendRide).not.toHaveBeenCalled();
  expect(sendCoach).not.toHaveBeenCalled();
  expect(onBack).not.toHaveBeenCalled();
});
test('an invalid value that is not selected does not block', () => {
  view();
  fireEvent.change(screen.getByLabelText('FTP'), { target: { value: '' } });
  expect((screen.getByRole('button', { name: 'Übernehmen' }) as HTMLButtonElement).disabled).toBe(false);
});
test('a wrong date and a too low FTP are refused', () => {
  view();
  fireEvent.change(screen.getByLabelText('Geburtsdatum'), { target: { value: 'gestern' } });
  expect(screen.getByRole('alert').textContent).toContain('Geburtsdatum');
  cleanup();
  view();
  fireEvent.click(screen.getByRole('checkbox', { name: 'FTP übernehmen' }));
  fireEvent.change(screen.getByLabelText('FTP'), { target: { value: '20' } });
  expect(screen.getByRole('alert').textContent).toContain('FTP');
});
test('after taking values the notice stays away, even for values you chose to keep', () => {
  view();
  take();
  cleanup();
  const saved = { ...profile, birthDate: '1990-01-15', sex: 'male' as const, heightCm: 178 };
  render(<GarminProfileBanner profile={saved} ftpW={150} suggestion={suggestion} onReview={vi.fn()} />);
  expect(screen.queryByText(/Garmin hat Werte/)).toBeNull();
});
test('the notice returns when Garmin delivers something new after taking values', () => {
  view();
  take();
  cleanup();
  const saved = { ...profile, birthDate: '1990-01-15', sex: 'male' as const, heightCm: 178 };
  render(<GarminProfileBanner profile={saved} ftpW={150} suggestion={{ ...suggestion, weightKg: 64 }} onReview={vi.fn()} />);
  expect(screen.getByText(/Garmin hat Werte/)).toBeTruthy();
});
