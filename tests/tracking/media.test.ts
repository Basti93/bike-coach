import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXERCISE_IMAGES } from '../../src/shared/exercise-images';
import { exerciseImages, imageSrc, videoSearchUrl } from '../../src/tracking/media';

describe('exerciseImages', () => {
  it('gives the bundled pictures of an own exercise with their credits', () => {
    const imgs = exerciseImages('pf-bench-press');
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs[0]).toEqual(expect.objectContaining({ author: expect.any(String), licence: expect.stringMatching(/^(CC-BY-SA [34]\.0|CC0 1\.0)$/) }));
    expect(imgs[0]!.sourceUrl).toMatch(/^https:\/\/wger\.de\//);
  });

  it('gives nothing for an exercise without pictures', () => {
    expect(exerciseImages('pf-squat')).toEqual([]);
    expect(exerciseImages('hevy-unknown')).toEqual([]);
  });

  it('every listed picture exists, at most two per exercise, under 3 MB together', () => {
    let bytes = 0;
    for (const list of Object.values(EXERCISE_IMAGES)) {
      expect(list.length).toBeLessThanOrEqual(2);
      for (const img of list) {
        expect(img.licence).toMatch(/^(CC-BY-SA [34]\.0|CC0 1\.0)$/);
        bytes += fs.statSync(`src/web/public/${img.file}`).size;
      }
    }
    expect(bytes).toBeLessThan(3 * 1024 * 1024);
  });

  it('builds the image address from the app base', () => {
    expect(imageSrc('exercises/a.jpg')).toBe('/exercises/a.jpg');
  });
});

describe('videoSearchUrl', () => {
  it('searches YouTube for the English Hevy title', () => {
    expect(videoSearchUrl({ title: 'Kniebeuge', hevyTitle: 'Squat (Barbell)' }))
      .toBe('https://www.youtube.com/results?search_query=Squat%20(Barbell)%20exercise%20form');
  });

  it('uses the German title when there is no English one', () => {
    expect(videoSearchUrl({ title: 'Übung & mehr' })).toBe('https://www.youtube.com/results?search_query=%C3%9Cbung%20%26%20mehr%20exercise%20form');
  });
});
