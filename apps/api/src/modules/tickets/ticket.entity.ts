import type { PendingParty, TicketStatus } from '@tyio/shared';
import { EntitySchema } from 'typeorm';
import { SystemEntity, TicketCategoryEntity } from '../master/master.entities.js';
import { RemoteEntity } from '../remotes/remote.entity.js';
import { TenantEntity } from '../tenants/tenant.entity.js';
import { UserEntity } from '../users/user.entity.js';

/** Tiket NPR: satu gangguan pada satu remote (R-E: selalu satu remote dan satu customer). */
export interface Ticket {
  id: string;
  /** Selalu sama dengan customer remote-nya; dijaga foreign key gabungan. */
  tenantId: string;
  remoteId: string;
  number: string;
  categoryId: string;
  systemId: string | null;
  status: TicketStatus;
  /** Waktu kejadian, diisi operator (R-F). */
  occurredAt: Date;
  problem: string;
  createdById: string;
  /** Nomor tiket di sistem customer (diisi operator). */
  customerTicketNumber: string | null;
  /** Terisi hanya saat status pending; riwayatnya ada di linimasa. */
  pendingParty: PendingParty | null;
  pendingReason: string | null;
  /** Kosong = tiket masih terbuka. Diisi saat ditutup (langkah 1.6). */
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const TicketEntity = new EntitySchema<Ticket>({
  name: 'Ticket',
  tableName: 'tickets',
  columns: {
    id: { type: 'uuid', primary: true, default: () => 'uuidv7()', primaryKeyConstraintName: 'tickets_pkey' },
    tenantId: {
      name: 'tenant_id',
      type: 'uuid',
      foreignKey: { target: TenantEntity, name: 'tickets_tenant_id_fkey', onDelete: 'RESTRICT' },
    },
    remoteId: { name: 'remote_id', type: 'uuid' },
    number: { type: 'varchar', length: 64 },
    categoryId: {
      name: 'category_id',
      type: 'uuid',
      foreignKey: { target: TicketCategoryEntity, name: 'tickets_category_id_fkey', onDelete: 'RESTRICT' },
    },
    systemId: {
      name: 'system_id',
      type: 'uuid',
      nullable: true,
      foreignKey: { target: SystemEntity, name: 'tickets_system_id_fkey', onDelete: 'RESTRICT' },
    },
    status: { type: 'varchar', length: 16, default: 'terbuka' },
    occurredAt: { name: 'occurred_at', type: 'timestamptz' },
    problem: { type: 'text' },
    createdById: {
      name: 'created_by',
      type: 'uuid',
      foreignKey: { target: UserEntity, name: 'tickets_created_by_fkey', onDelete: 'RESTRICT' },
    },
    customerTicketNumber: { name: 'customer_ticket_number', type: 'varchar', length: 64, nullable: true },
    pendingParty: { name: 'pending_party', type: 'varchar', length: 16, nullable: true },
    pendingReason: { name: 'pending_reason', type: 'varchar', length: 500, nullable: true },
    closedAt: { name: 'closed_at', type: 'timestamptz', nullable: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
  // Remote dan customer dirujuk bersama: tiket tidak mungkin berbeda customer dengan remote-nya.
  foreignKeys: [
    {
      name: 'tickets_remote_fkey',
      target: RemoteEntity,
      columnNames: ['remoteId', 'tenantId'],
      referencedColumnNames: ['id', 'tenantId'],
      onDelete: 'RESTRICT',
    },
  ],
  uniques: [
    { name: 'tickets_number_key', columns: ['number'] },
    // Sasaran foreign key gabungan dari linimasa dan lampiran (tiket dan customer-nya bersama).
    { name: 'tickets_id_tenant_key', columns: ['id', 'tenantId'] },
  ],
  indices: [
    // Pemeriksaan "remote masih punya tiket terbuka" saat membuat tiket.
    { name: 'tickets_remote_open_idx', columns: ['remoteId'], where: 'closed_at IS NULL' },
    { name: 'tickets_category_id_idx', columns: ['categoryId'] },
    { name: 'tickets_system_id_idx', columns: ['systemId'] },
  ],
  checks: [
    {
      name: 'tickets_status_valid',
      expression: `status IN ('terbuka', 'dikerjakan', 'pending', 'eskalasi', 'selesai')`,
    },
    {
      name: 'tickets_pending',
      expression: `(status = 'pending') = (pending_party IS NOT NULL AND pending_reason IS NOT NULL)`,
    },
    { name: 'tickets_pending_party_valid', expression: `pending_party IN ('customer', 'tm')` },
    { name: 'tickets_problem_length', expression: 'char_length(problem) BETWEEN 3 AND 4000' },
  ],
});

/**
 * Penghitung nomor tiket per jenis, customer, jarkom, dan bulan. Baris dikunci saat dinaikkan
 * di transaksi yang sama dengan pembuatan tiket, sehingga dua operator tidak pernah mendapat
 * nomor yang sama, dan nomor tidak terpakai bila pembuatan tiket batal.
 */
export interface TicketSequence {
  kind: string;
  tenantId: string;
  jarkomId: string;
  /** YYYY-MM menurut WIB. */
  period: string;
  lastValue: number;
}

export const TicketSequenceEntity = new EntitySchema<TicketSequence>({
  name: 'TicketSequence',
  tableName: 'ticket_sequences',
  columns: {
    kind: { type: 'varchar', length: 8, primary: true, primaryKeyConstraintName: 'ticket_sequences_pkey' },
    tenantId: {
      name: 'tenant_id',
      type: 'uuid',
      primary: true,
      primaryKeyConstraintName: 'ticket_sequences_pkey',
      foreignKey: { target: TenantEntity, name: 'ticket_sequences_tenant_id_fkey', onDelete: 'RESTRICT' },
    },
    jarkomId: {
      name: 'jarkom_id',
      type: 'uuid',
      primary: true,
      primaryKeyConstraintName: 'ticket_sequences_pkey',
      foreignKey: { target: 'Jarkom', name: 'ticket_sequences_jarkom_id_fkey', onDelete: 'RESTRICT' },
    },
    period: {
      type: 'varchar',
      length: 7,
      primary: true,
      primaryKeyConstraintName: 'ticket_sequences_pkey',
    },
    lastValue: { name: 'last_value', type: 'integer' },
  },
  checks: [{ name: 'ticket_sequences_period_format', expression: `period ~ '^[0-9]{4}-[0-9]{2}$'` }],
});
