import { createServer, type Server } from 'node:http';
import { WebSocketServer } from 'ws';
import type { ClientMessage } from '../shared/protocol';
import { SERVICE_PORT } from '../shared/protocol';
import type { RideService } from './ride-service';

type Options = { port?: number; devOrigin?: string; retryMs?: number };

/**
 * Nur die eigene Oberfläche und lokale Skripte (ohne Origin) dürfen sprechen,
 * damit keine fremde Webseite eine laufende Fahrt beenden kann.
 * Ein belegter Port wird erneut versucht; die Aufzeichnung läuft auch ohne Oberfläche.
 */
export const startWsServer = (service: RideService, opts: Options = {}): Server => {
  const port = opts.port ?? SERVICE_PORT;
  const allowed = new Set([undefined, 'file://', 'null', opts.devOrigin]);
  const http = createServer();
  const wss = new WebSocketServer({ server: http, verifyClient: ({ origin }: { origin?: string }) => allowed.has(origin) });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listen = () => http.listen(port, '127.0.0.1');
  http.on('error', () => { timer = setTimeout(listen, opts.retryMs ?? 2000); });
  http.on('close', () => clearTimeout(timer));
  wss.on('error', () => {});
  wss.on('connection', (socket) => {
    const unsubscribe = service.subscribe((m) => socket.send(JSON.stringify(m)));
    socket.on('message', (raw) => {
      try { service.handle(JSON.parse(String(raw)) as ClientMessage); } catch { /* ungültige Nachricht ignorieren */ }
    });
    socket.on('close', unsubscribe);
    socket.on('error', unsubscribe);
  });
  listen();
  return http;
};
