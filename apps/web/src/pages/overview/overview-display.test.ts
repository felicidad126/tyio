import { describe, expect, it } from 'vitest';
import { formatDay, formatDayRange, linkFilterChips } from './overview-display';

// Label tanggal dan chip saringan dari Overview (2.1): tanggal WIB ditampilkan apa adanya.
describe('tampilan Overview', () => {
  it('tanggal dan rentang', () => {
    expect(formatDay('2026-11-17')).toBe('17 Nov 2026');
    expect(formatDay('2026-11-01', false)).toBe('1 Nov');
    expect(formatDayRange('2026-11-17', '2026-11-17')).toBe('17 Nov 2026');
    expect(formatDayRange('2026-10-20', '2026-11-18')).toBe('20 Okt – 18 Nov 2026');
    expect(formatDayRange('2025-12-20', '2026-01-02')).toBe('20 Des 2025 – 2 Jan 2026');
  });

  it('chip saringan; satu chip per rentang, bisa satu ujung saja', () => {
    expect(
      linkFilterChips(
        { status: 'terbuka', dari: '2026-11-17', sampai: '2026-11-17', ditutupDari: '2026-11-01', remote: 'x', lama: '7' },
        'MRS-001 · ATM Uji',
      ),
    ).toEqual([
      { keys: ['status'], label: 'Status Terbuka' },
      { keys: ['dari', 'sampai'], label: 'Kejadian 17 Nov 2026' },
      { keys: ['ditutupDari', 'ditutupSampai'], label: 'Online kembali sejak 1 Nov 2026' },
      { keys: ['remote'], label: 'Remote MRS-001 · ATM Uji' },
      { keys: ['lama'], label: 'Down ≥ 7 hari' },
    ]);
    expect(linkFilterChips({}, '')).toEqual([]);
  });
});
