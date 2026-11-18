import { addDays, type ReportStatusFilter } from '@tyio/shared';

/** Saringan laporan di alamat halaman (nama parameter sama dengan halaman Tiket). */
export interface ReportFilters {
  dari: string;
  sampai: string;
  customer: string;
  kategori: string;
  jarkom: string;
  status: ReportStatusFilter;
}

export interface PeriodPreset {
  key: string;
  label: string;
  from: string;
  to: string;
}

/** Pilihan periode cepat dari hari ini (WIB): bulan ini, bulan lalu, tahun ini. */
export function periodPresets(today: string): PeriodPreset[] {
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  return [
    { key: 'bulan-ini', label: 'Bulan ini', from: monthStart, to: today },
    { key: 'bulan-lalu', label: 'Bulan lalu', from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd },
    { key: 'tahun-ini', label: 'Tahun ini', from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}

/**
 * Alamat daftar Tiket yang menghasilkan angka laporan yang sama: periode kejadian dan saringan
 * laporan, ditambah `extra` (mis. satu customer atau remote). Status laporan menjadi tampilan.
 */
export function ticketListQuery(
  f: ReportFilters,
  period: { from: string; to: string },
  extra: { status?: ReportStatusFilter; customer?: string; kategori?: string; remote?: string } = {},
): Record<string, string> {
  const status = extra.status ?? f.status;
  const query: Record<string, string> = status === 'aktif' ? {} : { tampilan: status };
  query.dari = period.from;
  query.sampai = period.to;
  const customer = extra.customer ?? f.customer;
  const kategori = extra.kategori ?? f.kategori;
  if (customer) query.customer = customer;
  if (kategori) query.kategori = kategori;
  if (f.jarkom) query.jarkom = f.jarkom;
  if (extra.remote) query.remote = extra.remote;
  return query;
}
