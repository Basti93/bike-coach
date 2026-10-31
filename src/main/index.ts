import { app, BrowserWindow, powerSaveBlocker, utilityProcess, type UtilityProcess } from 'electron';
import path from 'node:path';
import { openFilmWindow } from './film-window';

let blocker: number | null = null;
let riding = false;
let quitting = false;

/** Der Fahrdienst läuft unabhängig von den Fenstern und wird nach jedem Absturz sofort neu gestartet. */
export const startService = (): UtilityProcess => {
  const child = utilityProcess.fork(path.join(__dirname, 'service.js'), [], {
    env: { ...process.env, BIKE_DATA_DIR: path.join(app.getPath('userData'), 'rides') },
    stdio: 'inherit',
  });
  child.on('message', (m: { riding?: boolean }) => {
    if (typeof m.riding !== 'boolean') return;
    riding = m.riding;
    if (riding && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
    if (!riding && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
  });
  child.on('exit', () => { if (!quitting) startService(); });
  return child;
};

const openMain = (): void => {
  const win = new BrowserWindow({ width: 1200, height: 800, title: 'Bike Coach' });
  const url = process.env.ELECTRON_RENDERER_URL;
  if (url) void win.loadURL(url);
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.endsWith('#film')) { openFilmWindow(u); return { action: 'deny' }; }
    return { action: 'deny' };
  });
};

void app.whenReady().then(() => {
  startService();
  openMain();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) openMain(); });
});
// Das Schließen der Fenster beendet weder Dienst noch App, damit eine laufende Fahrt weiterläuft.
app.on('window-all-closed', () => { if (!riding && process.platform !== 'darwin') app.quit(); });
app.on('before-quit', (e) => {
  if (riding) { e.preventDefault(); return; }
  quitting = true;
});
