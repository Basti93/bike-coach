import { describe, expect, it } from 'vitest';
import { opensExternally } from '../../src/main/external-links';

describe('opensExternally', () => {
  it('opens Hevy, wger and a YouTube search in the browser', () => {
    expect(opensExternally('https://hevy.com/settings?developer')).toBe(true);
    expect(opensExternally('https://wger.de/en/exercise/73/view/')).toBe(true);
    expect(opensExternally('https://www.youtube.com/results?search_query=Squat%20exercise%20form')).toBe(true);
  });
  it('opens nothing else', () => {
    expect(opensExternally('https://www.youtube.com/watch?v=x')).toBe(false);
    expect(opensExternally('http://wger.de/')).toBe(false);
    expect(opensExternally('https://wger.de.evil.example/')).toBe(false);
    expect(opensExternally('https://evil.example/https://hevy.com/')).toBe(false);
    expect(opensExternally('file:///etc/passwd')).toBe(false);
    expect(opensExternally('not a url')).toBe(false);
  });
});
