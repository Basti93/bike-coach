import { WebSocketServer } from 'ws';
import type { ClientMessage } from '../shared/protocol';
import { SERVICE_PORT } from '../shared/protocol';
import type { RideService } from './ride-service';

export const startWsServer = (service: RideService, port = SERVICE_PORT): WebSocketServer => {
  const wss = new WebSocketServer({ host: '127.0.0.1', port });
  wss.on('connection', (socket) => {
    const unsubscribe = service.subscribe((m) => socket.send(JSON.stringify(m)));
    socket.on('message', (raw) => {
      try { service.handle(JSON.parse(String(raw)) as ClientMessage); } catch { /* ungültige Nachricht ignorieren */ }
    });
    socket.on('close', unsubscribe);
    socket.on('error', unsubscribe);
  });
  return wss;
};
