// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProfileSettingsView } from '../../src/ui/views/ProfileSettingsView';
import { parseProfile, type Profile } from '../../src/shared/profiles';

afterEach(cleanup);
const base: Profile = { id: 'p', name: 'Max', ftpW: 150, ftpCapW: 180, maxHrBpm: 185, birthDate: '1990-01-15', sex: 'male', heightCm: 178, weightKg: 72 };
const view = (profile = base, ftpW = 200, coachConnected = true) => {
  const sendRide = vi.fn(); const sendCoach = vi.fn(); const onBack = vi.fn();
  render(<ProfileSettingsView profile={profile} ftpW={ftpW} coachConnected={coachConnected} sendRide={sendRide} sendCoach={sendCoach} onBack={onBack} />);
  return { sendRide, sendCoach, onBack };
};
const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

test('shows the current values, with the FTP from the coach', () => {
  view();
  expect(input('Name').value).toBe('Max');
  expect(input('FTP in Watt').value).toBe('200');
  expect(input('Pulsgrenze').value).toBe('185');
  expect(input('Geburtsdatum').value).toBe('1990-01-15');
  expect(input('Größe (cm)').value).toBe('170');
  expect(input('Gewicht (kg)').value).toBe('66');
  expect((screen.getByLabelText('Geschlecht') as HTMLSelectElement).value).toBe('male');
});
test('saving keeps the id and other fields and leaves the FTP alone when unchanged', () => {
  const { sendRide, sendCoach, onBack } = view();
  set('Gewicht (kg)', '67,5');
  save();
  expect(sendRide).toHaveBeenCalledWith({ type: 'save-profile', profile: { ...base, weightKg: 67.5 } });
  expect(sendCoach).not.toHaveBeenCalled();
  expect(onBack).toHaveBeenCalled();
});
test('a changed FTP goes to the coach and removes the estimate limit', () => {
  const { sendRide, sendCoach } = view();
  set('FTP in Watt', '210');
  expect(screen.getByRole('status').textContent).toContain('neu');
  save();
  expect(sendCoach).toHaveBeenCalledWith({ type: 'set-ftp', profileId: 'p', ftpW: 210 });
  const { profile } = sendRide.mock.calls[0][0];
  expect(profile.ftpW).toBe(210);
  expect(profile.ftpCapW).toBeUndefined();
});
test.each([
  ['Name', '', 'Name'],
  ['FTP in Watt', '40', 'FTP'],
  ['Größe (cm)', '50', 'Größe'],
  ['Gewicht (kg)', '500', 'Gewicht'],
  ['Geburtsdatum', '2099-01-01', 'Geburtsdatum'],
  ['Pulsgrenze', '50', 'Pulsgrenze'],
])('an invalid %s blocks saving and names the field', (label, value, named) => {
  const { sendRide } = view();
  set(label, value);
  expect((screen.getByRole('button', { name: 'Speichern' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain(named);
  save();
  expect(sendRide).not.toHaveBeenCalled();
});
test('someone younger than 14 cannot be saved', () => {
  view();
  set('Geburtsdatum', `${new Date().getFullYear() - 5}-01-01`);
  expect(screen.getByRole('alert').textContent).toContain('Geburtsdatum');
});
test('emptied optional fields are removed', () => {
  const { sendRide } = view();
  set('Pulsgrenze', ''); set('Gewicht (kg)', ''); set('Größe (cm)', ''); set('Geburtsdatum', '');
  fireEvent.change(screen.getByLabelText('Geschlecht'), { target: { value: 'unknown' } });
  save();
  expect(sendRide).toHaveBeenCalledWith({ type: 'save-profile', profile: { id: 'p', name: 'Max', ftpW: 150, ftpCapW: 180, sex: 'unknown' } });
});
test('the FTP cannot be changed while the coach is away', () => {
  view(base, 200, false);
  expect(input('FTP in Watt').disabled).toBe(true);
});
test('cancel goes back without sending', () => {
  const { sendRide, onBack } = view();
  set('Name', 'Neu');
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
  expect(sendRide).not.toHaveBeenCalled();
  expect(onBack).toHaveBeenCalled();
});
test('old profiles without the new fields stay valid and new fields survive parsing', () => {
  expect(parseProfile({ id: 'a', name: 'A', ftpW: 100 })).toEqual({ id: 'a', name: 'A', ftpW: 100 });
  expect(parseProfile(base)).toEqual(base);
});
