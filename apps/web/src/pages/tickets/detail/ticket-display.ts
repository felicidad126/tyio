import type { TicketStatus } from '@tyio/shared';

/** Kelas lencana status, ditulis utuh agar tidak terbuang saat build. */
export const TICKET_STATUS_BADGE: Readonly<Record<TicketStatus, string>> = {
  terbuka: 'badge bg-primary-subtle text-primary-emphasis',
  dikerjakan: 'badge bg-info-subtle text-info-emphasis',
  pending: 'badge bg-warning-subtle text-warning-emphasis',
  eskalasi: 'badge bg-danger-subtle text-danger-emphasis',
  selesai: 'badge bg-success-subtle text-success-emphasis',
};

export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Lama gangguan dari kejadian sampai online kembali: "2 hari 3 jam", "3 jam 20 menit",
 * "45 menit", "kurang dari 1 menit". Dihitung dari menit yang tampil di layar (detik
 * diabaikan), agar 12.19 → 14.19 terbaca "2 jam", bukan "1 jam 59 menit".
 */
export function formatDuration(fromIso: string, toIso: string): string {
  const minute = (iso: string) => Math.floor(new Date(iso).getTime() / 60_000);
  const minutes = Math.max(0, minute(toIso) - minute(fromIso));
  if (minutes < 1) return 'kurang dari 1 menit';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} hari ${hours} jam` : `${days} hari`;
  if (hours > 0) return rest > 0 ? `${hours} jam ${rest} menit` : `${hours} jam`;
  return `${rest} menit`;
}
