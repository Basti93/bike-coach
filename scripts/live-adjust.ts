import { sendToService } from './live-client';

const deltaPct = Number(process.argv[2]);
if (!Number.isFinite(deltaPct)) throw new Error('Aufruf: npm run live:adjust -- <deltaPct>');
sendToService({ type: 'adjust', deltaPct });
