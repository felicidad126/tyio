// Waktu relatif singkat untuk antrean (ATURAN.md §4: "3 j 46 m", tanpa detik).

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Lama sejak `iso` sampai `now`: "12 m", "3 j 46 m", "2 h 5 j". */
export function durationLabel(iso: string, now: number): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} j ${Math.floor((ms % HOUR) / MINUTE)} m`;
  return `${Math.floor(ms / DAY)} h ${Math.floor((ms % DAY) / HOUR)} j`;
}

/** "baru saja", "12 m lalu", "3 j lalu", "2 h lalu". */
export function sinceLabel(iso: string, now: number): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  if (ms < MINUTE) return 'baru saja';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} m lalu`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} j lalu`;
  return `${Math.floor(ms / DAY)} h lalu`;
}
