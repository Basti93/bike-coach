import { fireEvent, screen } from '@testing-library/react';

/** The Woche page has a row "Coach" that opens the chat sheet. */
export async function openChat(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: /^Coach/ }));
  return screen.findByRole('dialog', { name: 'Coach' });
}

/** Open proposals sit behind one slim strip above the chat input ("1 Vorschlag ›"); it opens them in a small sheet. */
export async function openProposals(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: /^\d Vorschl(ag|äge)/ }));
  return screen.findByRole('dialog', { name: /^Vorschl(ag|äge)$/ });
}
