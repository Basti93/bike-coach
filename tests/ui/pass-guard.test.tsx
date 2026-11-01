// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PassGuard } from '../../src/ui/pass/PassGuard';

const Broken = (): never => { throw new Error('broken mountain'); };

describe('PassGuard', () => {
  it('keeps the ride screen alive when the mountain fails', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<main><PassGuard><Broken /></PassGuard><b>200 W</b></main>);
    expect(screen.getByText('200 W')).toBeTruthy();
    quiet.mockRestore();
    cleanup();
  });
});
