// Rendert resources/icon.svg zu icon.png und icon.icns. Aufruf: npx electron scripts/icon/render.cjs
const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = path.join(__dirname, '..', '..', 'resources');
const SIZE = 1024;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: SIZE, height: SIZE, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  win.webContents.setZoomFactor(1);
  const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
  await win.loadURL(`data:text/html;base64,${Buffer.from(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;width:${SIZE}px;height:${SIZE}px}</style>${svg}`).toString('base64')}`);
  await new Promise((r) => setTimeout(r, 500));
  const image = await win.webContents.capturePage();
  const png = path.join(dir, 'icon.png');
  fs.writeFileSync(png, image.resize({ width: SIZE, height: SIZE }).toPNG());
  const set = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'icon-')), 'icon.iconset');
  fs.mkdirSync(set);
  for (const s of [16, 32, 128, 256, 512]) {
    execFileSync('/usr/bin/sips', ['-z', String(s), String(s), png, '--out', path.join(set, `icon_${s}x${s}.png`)], { stdio: 'ignore' });
    execFileSync('/usr/bin/sips', ['-z', String(s * 2), String(s * 2), png, '--out', path.join(set, `icon_${s}x${s}@2x.png`)], { stdio: 'ignore' });
  }
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', set, '-o', path.join(dir, 'icon.icns')]);
  app.exit(0);
});
