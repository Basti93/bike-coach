import { useEffect, useRef, useState } from 'react';
import { SERVICE_PORT, type ClientMessage, type RecoveryOffer, type StateMessage } from '../shared/protocol';

export const useRide = () => {
  const [state, setState] = useState<StateMessage | null>(null);
  const [offer, setOffer] = useState<RecoveryOffer | null>(null);
  const [connected, setConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    const open = () => {
      const ws = new WebSocket(`ws://127.0.0.1:${SERVICE_PORT}`);
      socket.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data));
        if (m.type === 'state') setState(m);
        if (m.type === 'recovery-offer') setOffer(m);
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = setTimeout(open, 500);
      };
    };
    open();
    return () => { closed = true; clearTimeout(timer); socket.current?.close(); };
  }, []);

  const send = (m: ClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(m));
  };
  return { state, offer, clearOffer: () => setOffer(null), connected, send };
};
