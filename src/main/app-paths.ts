const EXTRA = (home: string): string[] => [`${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin'];

/** Python kann nicht in das App-Archiv schauen, die Skripte liegen entpackt daneben. */
export const unpacked = (file: string): string => file.replace('app.asar/', 'app.asar.unpacked/');

/** Aus dem Finder gestartete Apps bekommen nur einen sehr kurzen PATH und fänden claude sonst nicht. */
export const guiPath = (current: string, home: string): string =>
  [...new Set([...EXTRA(home), ...current.split(':').filter(Boolean)])].join(':');
