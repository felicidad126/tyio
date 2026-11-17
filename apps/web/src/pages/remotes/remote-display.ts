import {
  canOpenModule,
  type RemoteStatus,
  type SessionUser,
  TIME_ZONES,
  type TimeZoneLabel,
  type TimeZoneName,
} from '@tyio/shared';

/** Kelas lencana status, ditulis utuh agar tidak terbuang saat build. */
export const STATUS_BADGE: Readonly<Record<RemoteStatus, string>> = {
  aktif: 'badge bg-success-subtle text-success-emphasis',
  nonaktif: 'badge bg-secondary-subtle text-secondary-emphasis',
  dibongkar: 'badge bg-danger-subtle text-danger-emphasis',
};

const ZONE_LABELS = Object.fromEntries(
  Object.entries(TIME_ZONES).map(([label, name]) => [name, label]),
) as Record<TimeZoneName, TimeZoneLabel>;

export function zoneLabel(zone: TimeZoneName): TimeZoneLabel {
  return ZONE_LABELS[zone];
}

/** YYYY-MM-DD → "31 Januari 2024". */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/**
 * Sama dengan aturan API untuk impor remote: modul Admin dan akses semua customer (K18, T34).
 * Hanya untuk menampilkan tombol; penegakannya di API.
 */
export function canManageRemotes(user: SessionUser | null): boolean {
  return !!user && canOpenModule(user.role, 'admin') && user.tenantScope.all;
}
