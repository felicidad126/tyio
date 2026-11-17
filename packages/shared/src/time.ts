import { TIME_ZONES, type TimeZoneLabel, type TimeZoneName } from './remotes.js';

/** Selisih zona waktu Indonesia dari UTC, dalam menit. Indonesia tidak memakai waktu musim panas. */
export const TIME_ZONE_OFFSET_MINUTES: Readonly<Record<TimeZoneName, number>> = {
  'Asia/Jakarta': 7 * 60,
  'Asia/Makassar': 8 * 60,
  'Asia/Jayapura': 9 * 60,
};

const LABELS = Object.fromEntries(
  Object.entries(TIME_ZONES).map(([label, name]) => [name, label]),
) as Record<TimeZoneName, TimeZoneLabel>;

/** Asia/Makassar → WITA. */
export function timeZoneLabel(zone: TimeZoneName): TimeZoneLabel {
  return LABELS[zone];
}

/**
 * Isi kolom `datetime-local` ("2026-11-17T14:30") yang dibaca sebagai jam di zona `zone`,
 * menjadi waktu UTC ISO; null bila bentuknya salah.
 */
export function localInputToUtc(value: string, zone: TimeZoneName): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number) as [number, number, number, number, number];
  const utc = Date.UTC(year, month - 1, day, hour, minute) - TIME_ZONE_OFFSET_MINUTES[zone] * 60_000;
  const date = new Date(utc);
  // Tanggal yang tidak ada (mis. 31 November) bergeser saat dibuat; tolak.
  const back = new Date(utc + TIME_ZONE_OFFSET_MINUTES[zone] * 60_000);
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null;
  return date.toISOString();
}

/** Waktu UTC menjadi isi kolom `datetime-local` di zona `zone`. */
export function utcToLocalInput(iso: string | Date, zone: TimeZoneName): string {
  const shifted = new Date(new Date(iso).getTime() + TIME_ZONE_OFFSET_MINUTES[zone] * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** "17 Nov 2026 14.30 WITA": waktu ditampilkan di zona remote (R-H). */
export function formatInZone(iso: string | Date, zone: TimeZoneName): string {
  const text = new Intl.DateTimeFormat('id-ID', {
    timeZone: zone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
  return `${text} ${timeZoneLabel(zone)}`;
}
