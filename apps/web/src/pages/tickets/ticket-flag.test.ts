import { TICKET_FLAG_DAYS, ticketNeedsUpdate } from '@tyio/shared';
import { describe, expect, it } from 'vitest';

// Tanda "Down ≥ 7 hari" (K36): NPR aktif yang kejadiannya sudah seminggu atau lebih.
describe('tanda tiket perlu diperbarui', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  it('batasnya 7 hari', () => {
    expect(TICKET_FLAG_DAYS).toBe(7);
  });

  it.each([
    ['terbuka', 7, true],
    ['pending', 8, true],
    ['eskalasi', 30, true],
    ['dikerjakan', 6.99, false],
    ['terbuka', 0, false],
    // Tiket selesai tidak perlu diperbarui, berapa pun umurnya.
    ['selesai', 30, false],
  ] as const)('status %s, %s hari → %s', (status, days, expected) => {
    expect(ticketNeedsUpdate({ status, occurredAt: daysAgo(days) }, now)).toBe(expected);
  });
});
