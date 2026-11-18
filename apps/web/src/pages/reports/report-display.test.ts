import { describe, expect, it } from 'vitest';
import { periodPresets, type ReportFilters, ticketListQuery } from './report-display';

describe('periode cepat', () => {
  it('bulan ini, bulan lalu (termasuk pergantian tahun dan Februari), tahun ini', () => {
    expect(periodPresets('2026-11-18').map((p) => [p.key, p.from, p.to])).toEqual([
      ['bulan-ini', '2026-11-01', '2026-11-18'],
      ['bulan-lalu', '2026-10-01', '2026-10-31'],
      ['tahun-ini', '2026-01-01', '2026-11-18'],
    ]);
    expect(periodPresets('2027-01-05')[1]).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
    expect(periodPresets('2028-03-01')[1]).toMatchObject({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('tautan ke daftar Tiket', () => {
  const f: ReportFilters = { dari: '', sampai: '', customer: '', kategori: 'k1', jarkom: 'j1', status: 'semua' };
  const period = { from: '2026-10-01', to: '2026-10-31' };

  it('status laporan menjadi tampilan daftar; periode dan saringan ikut', () => {
    expect(ticketListQuery(f, period)).toEqual({ tampilan: 'semua', dari: '2026-10-01', sampai: '2026-10-31', kategori: 'k1', jarkom: 'j1' });
    expect(ticketListQuery({ ...f, status: 'aktif' }, period)).not.toHaveProperty('tampilan');
    expect(ticketListQuery(f, period, { status: 'selesai' }).tampilan).toBe('selesai');
  });

  it('baris per customer, kategori, atau remote menimpa saringan yang sama', () => {
    expect(ticketListQuery(f, period, { customer: 'c2', kategori: 'k2', remote: 'r1' })).toMatchObject({
      customer: 'c2',
      kategori: 'k2',
      remote: 'r1',
    });
  });
});
