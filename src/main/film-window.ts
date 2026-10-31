import { BrowserWindow } from 'electron';

let film: BrowserWindow | null = null;

export const openFilmWindow = (url: string): BrowserWindow => {
  if (film && !film.isDestroyed()) { film.focus(); return film; }
  const win = new BrowserWindow({ width: 320, height: 200, alwaysOnTop: true, resizable: true, title: 'Bike Coach Film-Modus' });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  void win.loadURL(url);
  win.on('closed', () => { film = null; });
  film = win;
  return win;
};
