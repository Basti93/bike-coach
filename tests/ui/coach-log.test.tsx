// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { CoachLog, coachLog } from '../../src/ui/views/CoachLog';

afterEach(cleanup);
const notes = [{ atMs: 10, text: 'Knie zwickt', reply: 'Danke, heute locker.' }, { atMs: 30, text: 'Lieber morgens' }];
const changes = [{ atMs: 20, text: 'Einheit kürzer.' }, { atMs: 40, text: 'Keine Änderung nötig.' }];

test('mixes what you said and what the coach did, newest first', () => {
  expect(coachLog(notes, changes).map((e) => e.text)).toEqual(['Lieber morgens', 'Einheit kürzer.', 'Knie zwickt']);
});
test('leaves out entries saying nothing changed', () => {
  expect(coachLog(notes, changes).some((e) => /Keine Änderung/.test(e.text))).toBe(false);
});
test('marks who said it and shows the reply', () => {
  render(<CoachLog notes={notes} changes={changes} />);
  expect(screen.getAllByText('Du').length).toBe(2);
  expect(screen.getAllByText('Coach').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText('Danke, heute locker.')).toBeTruthy();
});
test('stays folded into one line until you open it', () => {
  render(<CoachLog notes={notes} changes={changes} />);
  expect(screen.getByText('Knie zwickt').closest('details')?.open).toBe(false);
  expect(screen.getByText(/Bisheriges Gespräch \(3\)/)).toBeTruthy();
});
test('nothing said yet shows nothing', () => {
  const { container } = render(<CoachLog notes={[]} changes={[]} />);
  expect(container.innerHTML).toBe('');
});
