import { describe, expect, it } from 'vitest';
import { formatDuration } from './ticket-display';

// Lama gangguan di halaman tiket dan riwayat remote (1.6): dua satuan terbesar, dibulatkan ke bawah.
describe('lama gangguan', () => {
  const from = '2026-11-01T00:00:00Z';
  const after = (minutes: number) => new Date(Date.parse(from) + minutes * 60_000).toISOString();

  it.each([
    [0, 'kurang dari 1 menit'],
    [0.5, 'kurang dari 1 menit'],
    [1, '1 menit'],
    [45, '45 menit'],
    [60, '1 jam'],
    [200, '3 jam 20 menit'],
    [24 * 60, '1 hari'],
    [2 * 24 * 60 + 3 * 60 + 59, '2 hari 3 jam'],
    [-5, 'kurang dari 1 menit'],
  ])('%s menit → %s', (minutes, expected) => {
    expect(formatDuration(from, after(minutes))).toBe(expected);
  });

  it('mengikuti menit yang tampil di layar: 12.19.40 → 14.19.00 = 2 jam', () => {
    expect(formatDuration('2026-11-18T05:19:40Z', '2026-11-18T07:19:00Z')).toBe('2 jam');
    expect(formatDuration('2026-11-18T05:19:59Z', '2026-11-18T05:20:00Z')).toBe('1 menit');
  });
});
