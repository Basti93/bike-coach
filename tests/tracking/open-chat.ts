import { fireEvent, screen } from '@testing-library/react';

/** The Woche page has a row "Coach" that opens the chat sheet. */
export async function openChat(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: /^Coach/ }));
  return screen.findByRole('dialog', { name: 'Coach' });
}
