import { REMOTE_ZONE_IANA, REMOTE_ZONE_UTC_OFFSET, type RemoteZone } from '@npr/shared';

// Waktu tiket selalu ditulis dengan zona remote (T12, ATURAN.md §4): "21 Nov 2026 14:05 WITA".

const formatters = new Map<RemoteZone, Intl.DateTimeFormat>();

function formatter(zone: RemoteZone): Intl.DateTimeFormat {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: REMOTE_ZONE_IANA[zone],
    });
    formatters.set(zone, format);
  }
  return format;
}

/** "21 Nov 2026 14:05 WITA": jam dengan titik dua, bukan titik bawaan id-ID. */
export function formatZoned(iso: string, zone: RemoteZone): string {
  const parts = formatter(zone).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')} ${part('month')} ${part('year')} ${part('hour')}:${part('minute')} ${zone}`;
}

/** "22 Nov 14:05 WITA": tanpa tahun, untuk kolom sempit di daftar. */
export function formatZonedShort(iso: string, zone: RemoteZone): string {
  const parts = formatter(zone).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')} ${part('month')} ${part('hour')}:${part('minute')} ${zone}`;
}

/** Nilai `<input type="datetime-local">` (YYYY-MM-DDTHH:mm) untuk waktu `date` di zona remote. */
export function toZonedInput(date: Date, zone: RemoteZone): string {
  const shifted = new Date(date.getTime() + REMOTE_ZONE_UTC_OFFSET[zone] * 3_600_000);
  return shifted.toISOString().slice(0, 16);
}

/** Waktu ISO dengan zona tertulis dari nilai `datetime-local` di zona remote. */
export function fromZonedInput(value: string, zone: RemoteZone): string {
  return `${value}:00+${String(REMOTE_ZONE_UTC_OFFSET[zone]).padStart(2, '0')}:00`;
}

const dayFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Tanggal `YYYY-MM-DD` (hari menurut WIB, T109): "24 Nov 2026". */
export function formatDay(date: string): string {
  return dayFormat.format(new Date(`${date}T00:00:00Z`));
}

/** "11 Nov 2026 – 24 Nov 2026"; satu tanggal bila sama; "sejak …" / "sampai …" bila satu ujung. */
export function formatDayRange(from: string, to: string): string {
  if (from && to) return from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`;
  if (from) return `sejak ${formatDay(from)}`;
  return to ? `sampai ${formatDay(to)}` : '';
}
