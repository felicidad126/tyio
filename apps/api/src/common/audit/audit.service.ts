import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AuditEntry, AuditPage } from '@npr/shared';
import { DataSource, type Repository } from 'typeorm';
import { applyTenantScope, type TenantScope } from '../tenant/tenant-scope.js';
import type { AuditActor } from './audit-context.js';
import { AuditEntryRow } from './audit-entry.entity.js';

export type AuditEvent = 'login' | 'login_failed' | 'logout';

export interface AuditQuery {
  limit: number;
  /** Hanya catatan dengan id lebih kecil (halaman berikutnya). */
  before?: string;
  tenantId?: string;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AuditEntryRow) private readonly entries: Repository<AuditEntryRow>,
  ) {}

  /**
   * Peristiwa yang bukan perubahan baris data (login, logout). Perubahan data dicatat
   * otomatis oleh trigger `audit`, tidak lewat sini.
   */
  async recordEvent(
    action: AuditEvent,
    actor: AuditActor,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO audit_log (source, actor_user_id, actor_label, client_ip, action, changes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        actor.source,
        actor.userId ?? null,
        actor.label?.slice(0, 320) ?? null,
        actor.clientIp ?? null,
        action,
        details === undefined ? null : JSON.stringify(details),
      ],
    );
  }

  /**
   * Catatan terbaru lebih dulu, dalam cakupan customer pengguna. Catatan tanpa customer
   * (login, data pengguna) hanya terlihat oleh cakupan "semua customer".
   */
  async list(scope: TenantScope, query: AuditQuery): Promise<AuditPage> {
    const builder = applyTenantScope(
      this.entries.createQueryBuilder('entry'),
      scope,
      'entry.tenantId',
    )
      .orderBy('entry.id', 'DESC')
      .limit(query.limit + 1);
    if (query.before !== undefined) builder.andWhere('entry.id < :before', { before: query.before });
    if (query.tenantId !== undefined) {
      builder.andWhere('entry.tenantId = :tenantId', { tenantId: query.tenantId });
    }

    const rows = await builder.getMany();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      entries: page.map(toAuditEntry),
      nextBefore: rows.length > query.limit && last ? last.id : null,
    };
  }
}

function toAuditEntry(row: AuditEntryRow): AuditEntry {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    transactionId: row.transactionId,
    source: row.source,
    actorUserId: row.actorUserId,
    actorLabel: row.actorLabel,
    clientIp: row.clientIp,
    action: row.action,
    tableName: row.tableName,
    rowId: row.rowId,
    tenantId: row.tenantId,
    changes: row.changes,
  };
}
