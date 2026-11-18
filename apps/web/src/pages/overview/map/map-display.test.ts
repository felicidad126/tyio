import { describe, expect, it } from 'vitest';
import { worstState } from './map-display';

// Kelompok titik di peta (2.3) berwarna kondisi terparah di dalamnya.
describe('kondisi kelompok titik', () => {
  it.each([
    [['normal', 'gangguan', 'pending'], 'gangguan'],
    [['normal', 'pending'], 'pending'],
    [['nonaktif', 'normal'], 'normal'],
    [['nonaktif'], 'nonaktif'],
    [[], 'nonaktif'],
  ] as const)('%j → %s', (states, expected) => {
    expect(worstState(states)).toBe(expected);
  });
});
