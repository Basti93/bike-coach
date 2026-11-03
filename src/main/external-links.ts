/** Links the app may open in the system browser: Hevy (API key), wger (picture and text sources) and a YouTube search. */
export function opensExternally(u: string): boolean {
  let url: URL;
  try { url = new URL(u); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  if (url.hostname === 'hevy.com' || url.hostname === 'wger.de') return true;
  return url.hostname === 'www.youtube.com' && url.pathname === '/results';
}
