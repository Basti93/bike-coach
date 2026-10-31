import { BrowserWindow } from 'electron';

export const openFilmWindow = (url: string): BrowserWindow => {
  const win = new BrowserWindow({ width: 320, height: 200, alwaysOnTop: true, resizable: true, title: 'Bike Coach Film-Modus' });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  void win.loadURL(url);
  return win;
};
