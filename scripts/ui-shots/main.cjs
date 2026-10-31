// Minimales Electron-Hauptprogramm für Screenshots: nur die Oberfläche, ohne Fahrdienst und Coach.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.setPath('userData', path.join(app.getPath('temp'), 'bike-coach-ui-shots'));
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: false, webPreferences: { backgroundThrottling: false } });
  win.loadFile(path.join(__dirname, '../../out/renderer/index.html'));
});
