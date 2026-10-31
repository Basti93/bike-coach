import { sendToService } from './live-client';

sendToService({ type: 'mark', note: process.argv.slice(2).join(' ') || undefined });
