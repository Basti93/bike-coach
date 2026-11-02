// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CoachState } from '../../src/coach/state';
import type { RideSummary } from '../../src/coach/metrics';
import { FeedbackView } from '../../src/ui/views/FeedbackView';
import { FilmView } from '../../src/ui/views/FilmView';
import { GarminCard } from '../../src/ui/views/GarminCard';
import { GarminUploadButton } from '../../src/ui/views/GarminUploadButton';
import { HistoryView } from '../../src/ui/views/HistoryView';

afterEach(cleanup);
const up = (status: 'uploading' | 'uploaded' | 'failed', reason?: string) => ({ status, atMs: 1, ...(reason ? { reason } : {}) });
const button = (status?: ReturnType<typeof up>, connected = true) => {
  const onUpload = vi.fn();
  render(<GarminUploadButton status={status} connected={connected} onUpload={onUpload} />);
  return onUpload;
};

test('offers the upload', () => {
  const onUpload = button();
  fireEvent.click(screen.getByRole('button', { name: 'Zu Garmin hochladen' }));
  expect(onUpload).toHaveBeenCalled();
});
test('shows that an upload is running and cannot be pressed twice', () => {
  button(up('uploading'));
  expect((screen.getByRole('button', { name: 'Wird hochgeladen …' }) as HTMLButtonElement).disabled).toBe(true);
});
test('shows that the ride is up', () => {
  button(up('uploaded'));
  expect((screen.getByRole('button', { name: 'Bei Garmin' }) as HTMLButtonElement).disabled).toBe(true);
});
test('a failed upload can be tried again and says why', () => {
  const onUpload = button(up('failed', 'reauth'));
  expect(screen.getByRole('alert').textContent).toContain('neu anmelden');
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
  expect(onUpload).toHaveBeenCalled();
});
test('no button without a Garmin connection', () => {
  button(undefined, false);
  expect(screen.queryByRole('button')).toBeNull();
});

const feedback = (mode: 'off' | 'ask' | 'auto', connected = true) => {
  const send = vi.fn();
  render(<FeedbackView profileId="p" rideId="r1" send={send} detail={null} garminConnected={connected} upload={{ mode, minMinutes: 10, enabledAtMs: null, rides: {} }} />);
  return send;
};
test('the feedback screen stays quiet while uploading is off', () => {
  feedback('off');
  expect(screen.queryByRole('button', { name: 'Zu Garmin hochladen' })).toBeNull();
});
test('the feedback screen offers the upload when asking is chosen', () => {
  const send = feedback('ask');
  fireEvent.click(screen.getByRole('button', { name: 'Zu Garmin hochladen' }));
  expect(send).toHaveBeenCalledWith({ type: 'garmin-upload', profileId: 'p', rideId: 'r1' });
});

const ride = { rideId: 'r1', startedAtMs: 1, status: 'finished', sessionId: 's', ftpW: 200, durationS: 1800, avgPowerW: 100, normalizedPowerW: 100, intensityFactor: 0.5, tss: 10, avgHrBpm: 100, maxHrBpm: 120, bestMinutePowerW: 120, completedFraction: 1 } as RideSummary;
test('the history offers the upload even while automatic uploading is off', () => {
  const send = vi.fn();
  const state = { profileId: 'p', summaries: [ride], feedback: {}, ftpW: 200 } as unknown as CoachState;
  render(<HistoryView state={state} detail={null} send={send} onBack={vi.fn()} garminConnected />);
  fireEvent.click(screen.getByRole('button', { expanded: false, name: /Min\./ }));
  fireEvent.click(screen.getByRole('button', { name: 'Zu Garmin hochladen' }));
  expect(send).toHaveBeenCalledWith({ type: 'garmin-upload', profileId: 'p', rideId: 'r1' });
});

const card = (upload?: Parameters<typeof GarminCard>[0]['upload']) => {
  const send = vi.fn();
  render(<GarminCard profileId="p" status={{ state: 'connected' }} send={send} upload={upload} />);
  return send;
};
test('uploading starts switched off', () => {
  card();
  expect((screen.getByLabelText('Aus') as HTMLInputElement).checked).toBe(true);
  expect(screen.queryByText(/doppelt/)).toBeNull();
});
test('choosing automatic is sent to the coach', () => {
  const send = card();
  fireEvent.click(screen.getByLabelText('Automatisch'));
  expect(send).toHaveBeenCalledWith({ type: 'garmin-upload-settings', profileId: 'p', mode: 'auto', minMinutes: 10 });
});
test('warns about duplicates once uploading is on, and the minimum is adjustable', () => {
  const send = card({ mode: 'auto', minMinutes: 10, enabledAtMs: 1, rides: {} });
  expect(screen.getByText(/steht sie danach doppelt in Garmin Connect/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/Mindestdauer/), { target: { value: '30' } });
  fireEvent.blur(screen.getByLabelText(/Mindestdauer/));
  expect(send).toHaveBeenCalledWith({ type: 'garmin-upload-settings', profileId: 'p', mode: 'auto', minMinutes: 30 });
});

test('after the ride the film window leads back to the main window', () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  render(<FilmView state={null} send={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Zum Hauptfenster' }));
  expect(open).toHaveBeenCalledWith('#main', 'main');
  open.mockRestore();
});
