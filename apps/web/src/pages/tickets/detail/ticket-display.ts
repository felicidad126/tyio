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
