import type { AttachmentType, PendingParty, TicketActionType, TicketStatus } from '@tyio/shared';
import { EntitySchema } from 'typeorm';
import { UserEntity } from '../users/user.entity.js';
import { TicketEntity } from './ticket.entity.js';

const STATUSES = `('terbuka', 'dikerjakan', 'pending', 'eskalasi', 'selesai')`;

/**
 * Entri linimasa tiket. Hanya bisa ditambah (T10): trigger database menolak UPDATE dan
 * DELETE. Kesalahan diperbaiki dengan entri koreksi yang merujuk entri lama (`correctsId`).
 */
export interface TicketAction {
  id: string;
  tenantId: string;
  ticketId: string;
  /** Jenis tindakan (K32): catatan, cek lokasi, atau problem. */
  type: TicketActionType;
  /** Waktu tindakan, diisi operator (R-F). */
  occurredAt: Date;
  note: string | null;
  statusFrom: TicketStatus | null;
  statusTo: TicketStatus | null;
  pendingParty: PendingParty | null;
  pendingReason: string | null;
  correctsId: string | null;
  createdById: string;
  /** Waktu pencatatan, diisi sistem. */
  createdAt: Date;
}

export const TicketActionEntity = new EntitySchema<TicketAction>({
  name: 'TicketAction',
  tableName: 'ticket_actions',
  columns: {
    id: { type: 'uuid', primary: true, default: () => 'uuidv7()', primaryKeyConstraintName: 'ticket_actions_pkey' },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    ticketId: { name: 'ticket_id', type: 'uuid' },
    type: { name: 'action_type', type: 'varchar', length: 16, default: 'catatan' },
    occurredAt: { name: 'occurred_at', type: 'timestamptz' },
    note: { type: 'text', nullable: true },
    statusFrom: { name: 'status_from', type: 'varchar', length: 16, nullable: true },
    statusTo: { name: 'status_to', type: 'varchar', length: 16, nullable: true },
    pendingParty: { name: 'pending_party', type: 'varchar', length: 16, nullable: true },
    pendingReason: { name: 'pending_reason', type: 'varchar', length: 500, nullable: true },
    correctsId: { name: 'corrects_id', type: 'uuid', nullable: true },
    createdById: {
      name: 'created_by',
      type: 'uuid',
      foreignKey: { target: UserEntity, name: 'ticket_actions_created_by_fkey', onDelete: 'RESTRICT' },
    },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
  },
  foreignKeys: [
    {
      name: 'ticket_actions_ticket_fkey',
      target: TicketEntity,
      columnNames: ['ticketId', 'tenantId'],
      referencedColumnNames: ['id', 'tenantId'],
      onDelete: 'RESTRICT',
    },
    // Koreksi hanya bisa merujuk entri di tiket yang sama.
    {
      name: 'ticket_actions_corrects_fkey',
      target: 'TicketAction',
      columnNames: ['correctsId', 'ticketId'],
      referencedColumnNames: ['id', 'ticketId'],
      onDelete: 'RESTRICT',
    },
  ],
  uniques: [{ name: 'ticket_actions_id_ticket_key', columns: ['id', 'ticketId'] }],
  indices: [
    { name: 'ticket_actions_ticket_idx', columns: ['ticketId', 'createdAt'] },
    // "Milik saya" di daftar tiket: tiket yang pernah diberi tindakan oleh pengguna ini.
    { name: 'ticket_actions_created_by_idx', columns: ['createdById', 'ticketId'] },
  ],
  checks: [
    { name: 'ticket_actions_has_content', expression: 'note IS NOT NULL OR status_to IS NOT NULL' },
    {
      name: 'ticket_actions_type_valid',
      expression: `action_type IN ('catatan', 'cek_lokasi', 'problem', 'eskalasi_sd')`,
    },
    { name: 'ticket_actions_type_note', expression: `action_type = 'catatan' OR note IS NOT NULL` },
    { name: 'ticket_actions_note_length', expression: 'char_length(note) BETWEEN 1 AND 4000' },
    { name: 'ticket_actions_status_valid', expression: `status_from IN ${STATUSES} AND status_to IN ${STATUSES}` },
    {
      name: 'ticket_actions_pending',
      expression: `(status_to IS NOT DISTINCT FROM 'pending') = (pending_party IS NOT NULL AND pending_reason IS NOT NULL)`,
    },
    { name: 'ticket_actions_pending_party_valid', expression: `pending_party IN ('customer', 'tm')` },
    {
      name: 'ticket_actions_correction',
      expression: 'corrects_id IS NULL OR (note IS NOT NULL AND status_to IS NULL)',
    },
  ],
});

/** Berkas lampiran satu entri linimasa. Isinya di disk dengan nama acak (T8); hanya-tambah. */
export interface TicketAttachmentRow {
  id: string;
  tenantId: string;
  ticketId: string;
  actionId: string;
  fileName: string;
  storedName: string;
  contentType: AttachmentType;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
}

export const TicketAttachmentEntity = new EntitySchema<TicketAttachmentRow>({
  name: 'TicketAttachment',
  tableName: 'ticket_attachments',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      default: () => 'uuidv7()',
      primaryKeyConstraintName: 'ticket_attachments_pkey',
    },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    ticketId: { name: 'ticket_id', type: 'uuid' },
    actionId: { name: 'action_id', type: 'uuid' },
    fileName: { name: 'file_name', type: 'varchar', length: 200 },
    storedName: { name: 'stored_name', type: 'varchar', length: 80 },
    contentType: { name: 'content_type', type: 'varchar', length: 40 },
    sizeBytes: { name: 'size_bytes', type: 'integer' },
    sha256: { type: 'varchar', length: 64 },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
  },
  foreignKeys: [
    {
      name: 'ticket_attachments_ticket_fkey',
      target: TicketEntity,
      columnNames: ['ticketId', 'tenantId'],
      referencedColumnNames: ['id', 'tenantId'],
      onDelete: 'RESTRICT',
    },
    {
      name: 'ticket_attachments_action_fkey',
      target: TicketActionEntity,
      columnNames: ['actionId', 'ticketId'],
      referencedColumnNames: ['id', 'ticketId'],
      onDelete: 'RESTRICT',
    },
  ],
  uniques: [{ name: 'ticket_attachments_stored_name_key', columns: ['storedName'] }],
  indices: [{ name: 'ticket_attachments_action_idx', columns: ['actionId'] }],
  checks: [
    {
      name: 'ticket_attachments_type_valid',
      expression: `content_type IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')`,
    },
    { name: 'ticket_attachments_size', expression: 'size_bytes BETWEEN 1 AND 5242880' },
  ],
});
