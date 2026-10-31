import { useEffect, useRef, useState } from 'react';
import type { CoachState } from '../coach/state';
import type { Together } from '../coach/together';
import { COACH_PORT, type CoachClientMessage, type RideDetail } from '../shared/coach-protocol';

export const useCoach = (profileId: string | null) => {
  const [state, setState] = useState<CoachState | null>(null);
  const [thinking, setThinking] = useState(false);
  const [detail, setDetail] = useState<RideDetail | null>(null);
  const [together, setTogether] = useState<Together | null>(null);
  const [connected, setConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    setState(null);
    if (!profileId) return undefined;
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    const open = () => {
      const ws = new WebSocket(`ws://127.0.0.1:${COACH_PORT}`);
      socket.current = ws;
      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ type: 'subscribe', profileId }));
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data));
        if (m.type === 'ride-detail') setDetail(m.detail);
        if (m.type === 'coach-state') { setState(m.state); setThinking(m.thinking); setTogether(m.together ?? null); }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = setTimeout(open, 1000);
      };
    };
    open();
    return () => { closed = true; clearTimeout(timer); socket.current?.close(); };
  }, [profileId]);

  const send = (m: CoachClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(m));
  };
  return { detail, state, together, thinking, connected, send };
};
