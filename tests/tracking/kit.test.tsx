// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { ChoiceRow, ConfirmLink, Row, RowList, Sheet, Switch } from '../../src/tracking/ui/kit';

afterEach(cleanup);

function Opener({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)}>Öffnen</button>{open && <Sheet title="Eintrag" onClose={() => { setOpen(false); onClose(); }} actions={<button type="button">Speichern</button>}><p>Inhalt</p></Sheet>}</>;
}

test('the sheet opens with focus on it, locks the page behind, and closes on × and on Escape', () => {
  const closed = vi.fn();
  render(<Opener onClose={closed} />);
  const opener = screen.getByRole('button', { name: 'Öffnen' });
  opener.focus();
  fireEvent.click(opener);
  const dialog = screen.getByRole('dialog', { name: 'Eintrag' });
  expect(document.activeElement).toBe(dialog);
  expect(document.body.style.overflow).toBe('hidden');
  expect(screen.getByRole('button', { name: 'Speichern' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.body.style.overflow).toBe('');
  expect(document.activeElement).toBe(opener);
  fireEvent.click(opener);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(closed).toHaveBeenCalledTimes(2);
});

test('the browser Back closes the sheet', async () => {
  render(<Opener />);
  fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  history.back();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('a switch row toggles from its label and states its hint', () => {
  const change = vi.fn();
  render(<Switch label="Benachrichtigungen" hint="Nur wenige." checked={false} onChange={change} />);
  const sw = screen.getByRole('switch', { name: 'Benachrichtigungen' });
  expect(sw.getAttribute('aria-describedby')).toBeTruthy();
  fireEvent.click(screen.getByText('Benachrichtigungen'));
  expect(change).toHaveBeenCalledWith(true);
});

test('the confirm link needs a second tap, and can be cancelled', () => {
  const go = vi.fn();
  render(<ConfirmLink label="Training löschen" onConfirm={go} />);
  fireEvent.click(screen.getByRole('button', { name: 'Training löschen' }));
  expect(go).not.toHaveBeenCalled();
  expect(screen.getByText('Wirklich löschen?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
  expect(screen.getByRole('button', { name: 'Training löschen' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Training löschen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ja' }));
  expect(go).toHaveBeenCalledTimes(1);
});

test('a choice row shows the value, opens the options in a sheet and closes after choosing', () => {
  const change = vi.fn();
  render(<ChoiceRow label="Uhrzeit" value={19} options={[{ value: 18, label: '18:00' }, { value: 19, label: '19:00' }]} onChange={change} />);
  fireEvent.click(screen.getByRole('button', { name: /Uhrzeit/ }));
  fireEvent.click(screen.getByRole('button', { name: '18:00' }));
  expect(change).toHaveBeenCalledWith(18);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('a row with onClick is a button with a chevron and shows its details only while expanded', () => {
  const { rerender } = render(<RowList><Row title="Bankdrücken" value="70 kg" onClick={() => {}} expanded={false}>Details</Row></RowList>);
  expect(screen.getByRole('button', { name: /Bankdrücken/ }).getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText('Details')).toBeNull();
  rerender(<RowList><Row title="Bankdrücken" value="70 kg" onClick={() => {}} expanded>Details</Row></RowList>);
  expect(screen.getByText('Details')).toBeTruthy();
});
