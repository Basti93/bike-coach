import { readOutlook } from '../../src/shared/gym-outlook';

test('keeps clean sessions, drops odd exercises and sessions, caps the counts', () => {
  const o = readOutlook({
    direction: ' Mehr Beinbeuger. ',
    sessions: [
      { date: '2026-11-08', name: 'Beine', focus: 'Beinbeuger', exercises: [{ title: 'Beinbeugen sitzend', sets: 3 }, { title: '', sets: 3 }, { title: 'X', sets: 0 }, { title: 'RDL', sets: 3.4 }] },
      { date: 'Samstag', name: 'Oberkörper', focus: '', exercises: [{ title: 'Rudern', sets: 3 }] },
      { name: 'leer', exercises: [] },
      ...Array.from({ length: 5 }, (_, i) => ({ date: null, name: `S${i}`, focus: '', exercises: [{ title: 'A', sets: 2 }] })),
    ],
  })!;
  expect(o.direction).toBe('Mehr Beinbeuger.');
  expect(o.sessions[0]).toEqual({ date: '2026-11-08', name: 'Beine', focus: 'Beinbeuger', exercises: [{ title: 'Beinbeugen sitzend', sets: 3 }, { title: 'RDL', sets: 3 }] });
  expect(o.sessions[1]!.date).toBeNull();
  expect(o.sessions.map((s) => s.name)).toEqual(['Beine', 'Oberkörper', 'S0']);
  expect(readOutlook({ direction: '', sessions: [] })).toBeNull();
  expect(readOutlook('x')).toBeNull();
});
