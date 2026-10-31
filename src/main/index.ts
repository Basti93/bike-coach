import { app, BrowserWindow, dialog, powerSaveBlocker, utilityProcess, type UtilityProcess } from 'electron';
import path from 'node:path';
import { restartDelayMs } from './backoff';
import { openFilmWindow } from './film-window';

let blocker: number | null = null;
let riding = false;
let quitting = false;
const STABLE_RUN_MS = 60_000;

/** Fahrdienst und Coach laufen unabhängig von den Fenstern und voneinander, und jeder startet nach einem Absturz neu. */
const supervise = (file: string, onMessage?: (m: { riding?: boolean }) => void, failures = { count: 0 }): UtilityProcess => {
  const startedAt = Date.now();
  const child = utilityProcess.fork(path.join(__dirname, file), [], {
    env: { ...process.env, BIKE_DATA_DIR: path.join(app.getPath('userData'), 'rides'), BIKE_COACH_DIR: path.join(app.getPath('userData'), 'coach') },
    stdio: 'inherit',
  });
  if (onMessage) child.on('message', onMessage);
  child.on('exit', () => {
    if (quitting) return;
    failures.count = Date.now() - startedAt > STABLE_RUN_MS ? 0 : failures.count + 1;
    setTimeout(() => supervise(file, onMessage, failures), restartDelayMs(failures.count));
  });
  return child;
};

const onServiceMessage = (m: { riding?: boolean }): void => {
  if (typeof m.riding !== 'boolean') return;
  riding = m.riding;
  if (riding && blocker === null) blocker = powerSaveBlocker.start('prevent-display-sleep');
  if (!riding && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
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

// Zwei Instanzen würden in dieselbe Fahrt schreiben.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.focus(); else openMain();
});

void app.whenReady().then(() => {
  supervise('service.js', onServiceMessage);
  supervise('coach.js');
  openMain();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) openMain(); });
});
// Das Schließen der Fenster beendet weder Dienst noch App, damit eine laufende Fahrt weiterläuft.
app.on('window-all-closed', () => { if (!riding && process.platform !== 'darwin') app.quit(); });
app.on('before-quit', (e) => {
  if (riding) {
    e.preventDefault();
    dialog.showErrorBox('Fahrt läuft', 'Bitte beende zuerst die Fahrt. Sie bleibt gespeichert, auch wenn der Mac ausgeht.');
    return;
  }
  quitting = true;
});
