import type { AuditSource } from '@tyio/shared';
import type { DataSource, EntityManager } from 'typeorm';

/**
 * Siapa dan dari mana sebuah perubahan berasal. Dicatat trigger `audit` untuk setiap
 * baris yang berubah di dalam transaksinya (R-F, R-I).
 */
export interface AuditActor {
  source: AuditSource;
  /** Pengguna portal yang melakukan perubahan, bila ada. */
  userId?: string;
  /** Nama yang terbaca manusia: email pengguna, nama perintah CLI, atau nama operator. */
  label?: string;
  clientIp?: string;
}

/**
 * Satu-satunya cara menulis ke tabel yang diaudit. Database menolak perubahan tanpa
 * konteks ini, jadi jalur tulis yang lupa memakainya langsung gagal di uji.
 */
export function auditedTransaction<T>(
  dataSource: DataSource,
  actor: AuditActor,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction(async (manager) => {
    await applyAuditActor(manager, actor);
    return work(manager);
  });
}

/** Memasang konteks audit pada transaksi yang sedang berjalan (berlaku sampai transaksi selesai). */
export async function applyAuditActor(manager: EntityManager, actor: AuditActor): Promise<void> {
  if (!manager.queryRunner?.isTransactionActive) {
    throw new Error('Konteks audit hanya bisa dipasang di dalam transaksi.');
  }
  await manager.query(
    `SELECT set_config('tyio.source', $1, true),
            set_config('tyio.actor_user_id', $2, true),
            set_config('tyio.actor_label', $3, true),
            set_config('tyio.client_ip', $4, true)`,
    [actor.source, actor.userId ?? '', actor.label?.slice(0, 320) ?? '', actor.clientIp ?? ''],
  );
}
