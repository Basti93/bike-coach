// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { ReadinessNote } from '../../src/ui/views/ReadinessNote';

afterEach(cleanup);
test('suggests taking it easy, with the reason, only when careful', () => {
  const { rerender, container } = render(<ReadinessNote readiness={{ level: 'careful', reasons: ['Ruhepuls seit 2 Tagen erhöht'] }} />);
  expect(screen.getByRole('status').textContent).toContain('Heute eher locker?');
  expect(screen.getByRole('status').textContent).toContain('Ruhepuls');
  rerender(<ReadinessNote readiness={{ level: 'normal', reasons: [] }} />);
  expect(container.textContent).toBe('');
  rerender(<ReadinessNote readiness={null} />);
  expect(container.textContent).toBe('');
});
