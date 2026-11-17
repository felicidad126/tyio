import { EntitySchema } from 'typeorm';

/** Nilai yang bisa disimpan di kolom jsonb. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/**
 * Satu catatan audit. Baris perubahan data ditulis oleh trigger database
 * (`insert`/`update`/`delete`/`truncate`); peristiwa aplikasi (`auth.*`) ditulis AuditService.
 * Tabel ini hanya-tambah: UPDATE, DELETE, dan TRUNCATE ditolak trigger.
 */
export interface AuditEntry {
  id: string;
  occurredAt: Date;
  actor: string;
  actorUserId: string | null;
  ip: string | null;
  userAgent: string | null;
  action: string;
  tableName: string | null;
  rowId: string | null;
  tenantId: string | null;
  /**
   * Tambah/hapus: isi baris. Ubah: hanya kolom yang berubah, `{ lama, baru }`.
   * Bertipe `object` (bukan Json rekursif) karena tipe insert TypeORM tidak sanggup
   * menelusuri tipe rekursif; isinya tetap Json.
   */
  data: object | null;
}

export const AuditEntryEntity = new EntitySchema<AuditEntry>({
  name: 'AuditEntry',
  tableName: 'audit_log',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      default: () => 'uuidv7()',
      primaryKeyConstraintName: 'audit_log_pkey',
    },
    occurredAt: { name: 'occurred_at', type: 'timestamptz', default: () => 'now()' },
    actor: { type: 'varchar', length: 120 },
    actorUserId: { name: 'actor_user_id', type: 'uuid', nullable: true },
    ip: { type: 'varchar', length: 64, nullable: true },
    userAgent: { name: 'user_agent', type: 'varchar', length: 512, nullable: true },
    action: { type: 'varchar', length: 40 },
    tableName: { name: 'table_name', type: 'varchar', length: 63, nullable: true },
    rowId: { name: 'row_id', type: 'varchar', length: 64, nullable: true },
    tenantId: { name: 'tenant_id', type: 'uuid', nullable: true },
    data: { type: 'jsonb', nullable: true },
  },
  indices: [
    { name: 'audit_log_tenant_idx', columns: ['tenantId', 'occurredAt'] },
    { name: 'audit_log_row_idx', columns: ['tableName', 'rowId'] },
    { name: 'audit_log_actor_idx', columns: ['actorUserId', 'occurredAt'] },
  ],
});
