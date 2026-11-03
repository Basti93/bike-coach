// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useRide } from '../../src/ui/useRide';

class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket;
  readyState = 1;
  onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onclose: (() => void) | null = null;
  constructor() { FakeSocket.last = this; }
  send() {}
  close() {}
}

test('the ride state is unknown again after the socket closes, until a fresh one arrives', () => {
  vi.stubGlobal('WebSocket', FakeSocket);
  const { result } = renderHook(() => useRide());
  act(() => { FakeSocket.last.onopen?.(); FakeSocket.last.onmessage?.({ data: JSON.stringify({ type: 'state', profiles: [], engine: null, ride: null }) }); });
  expect(result.current.fresh).toBe(true);
  act(() => { FakeSocket.last.onclose?.(); });
  expect(result.current.fresh).toBe(false);
  expect(result.current.state).not.toBeNull(); // the ride screen keeps showing the last values
  vi.unstubAllGlobals();
});
