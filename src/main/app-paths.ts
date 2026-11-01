const EXTRA = (home: string): string[] => [`${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin'];

/** Python cannot look inside the app archive, so the scripts sit unpacked next to it. */
export const unpacked = (file: string): string => file.replace('app.asar/', 'app.asar.unpacked/');

/** Apps started from the Finder get only a very short PATH and would not find claude otherwise. */
export const guiPath = (current: string, home: string): string =>
  [...new Set([...EXTRA(home), ...current.split(':').filter(Boolean)])].join(':');
