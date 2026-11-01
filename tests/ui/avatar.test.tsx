// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { parseProfile } from '../../src/shared/profiles';
import { ProfileSettingsView } from '../../src/ui/views/ProfileSettingsView';
import { ProfileView } from '../../src/ui/views/ProfileView';

afterEach(cleanup);
test('the picture is stored with the profile', () => {
  expect(parseProfile({ id: 'a', name: 'Max', ftpW: 150, avatar: '🐼' }).avatar).toBe('🐼');
});
test('the profile list shows the picture next to the name', () => {
  render(<ProfileView profiles={[{ id: 'a', name: 'Max', ftpW: 150, avatar: '🐼' }, { id: 'b', name: 'Lena', ftpW: 120 }]} onPick={() => {}} onAdd={() => {}} />);
  expect(screen.getByRole('button', { name: /Max/ }).textContent).toContain('🐼');
  expect(screen.getByRole('button', { name: /Lena/ }).textContent).toBe('Lena');
});
test('you pick your picture in the profile settings', () => {
  const sendRide = vi.fn();
  render(<ProfileSettingsView profile={{ id: 'a', name: 'Max', ftpW: 150 }} ftpW={150} coachConnected sendRide={sendRide} sendCoach={vi.fn()} onBack={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Profilbild'), { target: { value: '🐭' } });
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  expect(sendRide.mock.calls[0][0].profile.avatar).toBe('🐭');
});
