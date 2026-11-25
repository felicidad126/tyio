import type { AuditAction, AuditSource } from '@npr/shared';
import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Baris jejak audit. Hanya dibaca lewat entity ini; baris baru ditulis trigger `audit`
 * dan `AuditService.recordEvent`, dan database menolak UPDATE/DELETE.
 */
@Entity({ name: 'audit_log' })
export class AuditEntryRow {
  @PrimaryColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({ name: 'transaction_id', type: 'text' })
  transactionId: string;

  @Column({ type: 'text' })
  source: AuditSource;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ name: 'actor_label', type: 'text', nullable: true })
  actorLabel: string | null;

  @Column({ name: 'client_ip', type: 'text', nullable: true })
  clientIp: string | null;

  @Column({ type: 'text' })
  action: AuditAction;

  @Column({ name: 'table_name', type: 'text', nullable: true })
  tableName: string | null;

  @Column({ name: 'row_id', type: 'text', nullable: true })
  rowId: string | null;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  changes: unknown;
}
