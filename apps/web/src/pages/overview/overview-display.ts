import { TICKET_FLAG_DAYS, TICKET_STATUS_LABELS, type TicketStatus } from '@tyio/shared';

/** "17 Nov 2026" dari tanggal YYYY-MM-DD (tanggal WIB, tanpa geser zona). */
export function formatDay(date: string, withYear = true): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/** "17 Nov 2026", atau "19 Okt – 17 Nov 2026" untuk rentang. */
export function formatDayRange(from: string, to: string): string {
  if (from === to) return formatDay(from);
  return `${formatDay(from, from.slice(0, 4) !== to.slice(0, 4))} – ${formatDay(to)}`;
}

/** Saringan daftar Tiket yang bisa datang dari tautan Overview (nama parameter di alamat). */
export interface ListLinkFilters {
  status?: TicketStatus;
  dari?: string;
  sampai?: string;
  ditutupDari?: string;
  ditutupSampai?: string;
  remote?: string;
  lama?: string;
}

/** Label chip untuk saringan dari Overview yang tidak punya kolom sendiri di halaman Tiket. */
export function linkFilterChips(f: ListLinkFilters, remoteLabel: string): Array<{ keys: Array<keyof ListLinkFilters>; label: string }> {
  const chips: Array<{ keys: Array<keyof ListLinkFilters>; label: string }> = [];
  if (f.status) chips.push({ keys: ['status'], label: `Status ${TICKET_STATUS_LABELS[f.status]}` });
  if (f.dari || f.sampai) {
    chips.push({ keys: ['dari', 'sampai'], label: `Kejadian ${rangeLabel(f.dari, f.sampai)}` });
  }
  if (f.ditutupDari || f.ditutupSampai) {
    chips.push({ keys: ['ditutupDari', 'ditutupSampai'], label: `Online kembali ${rangeLabel(f.ditutupDari, f.ditutupSampai)}` });
  }
  if (f.remote) chips.push({ keys: ['remote'], label: `Remote ${remoteLabel}` });
  if (f.lama) chips.push({ keys: ['lama'], label: `Down ≥ ${TICKET_FLAG_DAYS} hari` });
  return chips;
}

function rangeLabel(from?: string, to?: string): string {
  if (from && to) return formatDayRange(from, to);
  return from ? `sejak ${formatDay(from)}` : `sampai ${formatDay(to!)}`;
}
