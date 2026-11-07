import { describe, expect, it } from 'vitest';
import { mediaPlan } from '../../scripts/fedb-media-plan';

describe('mediaPlan', () => {
  it('maps source pictures to numbered app files', () => {
    expect(mediaPlan([{ id: 'fedb-a-b', images: ['A_B/0.jpg', 'A_B/1.jpg'] }, { id: 'fedb-c' }])).toEqual([
      { from: 'A_B/0.jpg', to: 'exercises/fedb/fedb-a-b-1.jpg' },
      { from: 'A_B/1.jpg', to: 'exercises/fedb/fedb-a-b-2.jpg' },
    ]);
  });
});
