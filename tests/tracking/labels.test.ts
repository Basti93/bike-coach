import { equipmentSuffix } from '../../src/tracking/ui/labels';
import { expect, it } from 'vitest';

it('skips the equipment label when the title already names it', () => {
  expect(equipmentSuffix('Seitheben am Kabel (Kabel)', 'machine')).toBe('');
  expect(equipmentSuffix('curl mit KURZHANTEL', 'dumbbell')).toBe('');
  expect(equipmentSuffix('Seitheben', 'dumbbell')).toBe('Kurzhantel');
});
