// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Encouragement, MotivationCard } from '../../src/ui/views/MotivationCard';

afterEach(cleanup);
const base = { profileId: 'p', summaries: [], motives: [], complaints: [], encouragement: 'Schön, dass du da bist.' };
const view = (over = {}) => { const send = vi.fn(); render(<MotivationCard state={{ ...base, ...over } as never} send={send} />); return send; };

test('kind words stand on their own, above the next ride', () => {
  render(<Encouragement state={base as never} />);
  expect(screen.getByText('Schön, dass du da bist.')).toBeTruthy();
});
test('nothing to ask or report leaves no empty card', () => {
  const { container } = render(<MotivationCard state={{ ...base, lastQuestionMs: Date.now() } as never} send={vi.fn()} />);
  expect(container.innerHTML).toBe('');
});
test('shows the first question', () => {
  view();
  expect(screen.getByRole('textbox', { name: /Antwort/ })).toBeTruthy();
});
test('sends an answer in your own words', () => {
  const send = view();
  fireEvent.change(screen.getByRole('textbox', { name: /Antwort/ }), { target: { value: 'Für meine Kinder' } });
  fireEvent.click(screen.getByRole('button', { name: 'Antworten' }));
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'answer-question', profileId: 'p', text: 'Für meine Kinder' }));
});
test('a question can always be skipped', () => {
  const send = view();
  fireEvent.click(screen.getByRole('button', { name: 'Heute nicht' }));
  expect(send).toHaveBeenCalledWith({ type: 'skip-question', profileId: 'p' });
});
test('an open complaint asks how it is and can be closed', () => {
  const send = view({ complaints: [{ id: 'c1', text: 'Knie zwickt', status: 'active', startedMs: 1, updatedMs: 1 }] });
  expect(screen.getByText(/Knie zwickt/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Wieder gut' }));
  expect(send).toHaveBeenCalledWith({ type: 'complaint-update', profileId: 'p', id: 'c1', status: 'over' });
});
test('a closed complaint is not shown', () => {
  view({ complaints: [{ id: 'c1', text: 'Knie zwickt', status: 'over', startedMs: 1, updatedMs: 1 }] });
  expect(screen.queryByText(/Knie zwickt/)).toBeNull();
});
test('what you told the coach is visible and can be removed', () => {
  const send = view({ motives: [{ atMs: 5, questionId: 'wozu', text: 'Für meine Kinder' }] });
  expect(screen.getByText(/Für meine Kinder/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /entfernen/ }));
  expect(send).toHaveBeenCalledWith({ type: 'remove-motive', profileId: 'p', atMs: 5 });
});
test('the kind words are marked as coming from your coach', () => {
  render(<Encouragement state={base as never} />);
  expect(screen.getByText('Dein Coach')).toBeTruthy();
});
