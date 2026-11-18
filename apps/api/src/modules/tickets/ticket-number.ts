/** Selisih WIB dari UTC. Bulan pada nomor tiket mengikuti WIB saat tiket dibuat (T43). */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "2026-11": tahun dan bulan WIB dari sebuah waktu. */
export function ticketPeriod(at: Date): string {
  return new Date(at.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 7);
}

/** NPR/VSAT/MRS/2026/11/0001 — urut minimal empat digit. */
export function formatTicketNumber(
  kind: 'NPR' | 'TT',
  jarkomCode: string,
  tenantCode: string,
  period: string,
  sequence: number,
): string {
  return [kind, jarkomCode, tenantCode, period.replace('-', '/'), String(sequence).padStart(4, '0')].join('/');
}
