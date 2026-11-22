import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  isTicketTransitionAllowed,
  PENDING_TICKET_STATUSES,
  type Role,
  TICKET_STARTED_CLOCK_SKEW_MINUTES,
  TICKET_STARTED_MAX_AGE_DAYS,
  TICKET_STATUS_LABELS,
  type TicketAction,
  type TicketActionKind,
  type TicketAttachment,
  type TicketStatus,
} from '@tyio/shared';
import type { DataSource } from 'typeorm';
import { type AuditActor, auditedTransaction } from '../../../common/audit/audit-context.js';
import { applyTenantScope, type TenantScope } from '../../../common/tenant/tenant-scope.js';
import { TICKET_NOT_FOUND_MESSAGE } from '../tickets.service.js';
import type { CheckedAttachment } from './attachment-file.js';

export const ATTACHMENT_NOT_FOUND_MESSAGE = 'Lampiran tidak ditemukan.';
export const CLOSE_NOT_YET_MESSAGE = 'Penutupan NPR belum tersedia; menyusul bersama aturan penutupan (langkah 1.6).';
export const REOPEN_ROLE_MESSAGE = 'Hanya L2 atau admin yang bisa membuka kembali NPR yang sudah ditutup.';
export const TICKET_CLOSED_MESSAGE = 'NPR ini sudah ditutup. L2 atau admin bisa membukanya kembali.';
export const ALREADY_ASSIGNEE_MESSAGE = 'Anda sudah penanggung NPR ini.';
export const CORRECTED_NOT_FOUND_MESSAGE = 'Entri yang dikoreksi tidak ditemukan di NPR ini.';

/** Masukan yang sudah dibaca controller. */
export interface AddActionInput {
  kind: Exclude<TicketActionKind, 'dibuat' | 'ambil'>;
  note: string;
  occurredAt: Date | null;
  statusTo: TicketStatus | null;
  statusFrom: TicketStatus | null;
  pendingReason: string | null;
  correctsId: string | null;
  startedAt: Date | null;
  customerTicketNumber: string | null;
  attachments: CheckedAttachment[];
}

interface ActionRow {
  id: string;
  kind: TicketActionKind;
  note: string;
  occurred_at: Date;
  created_at: Date;
  created_by: string;
  created_by_name: string;
  created_by_role: string;
  status_from: TicketStatus | null;
  status_to: TicketStatus | null;
  pending_reason: string | null;
  corrects_id: string | null;
  corrected_by_ids: string[];
  started_at_correction: Date | null;
  customer_ticket_number: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_from_id: string | null;
  assignee_from_name: string | null;
}

interface AttachmentRow {
  id: string;
  action_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
}

export interface AttachmentContent {
  fileName: string;
  contentType: string;
  content: Buffer;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * Linimasa NPR dan mesin status (langkah 1.4). Entri hanya ditambah (T10); status, mulai
 * gangguan, dan nomor tiket customer berubah lewat entri (trigger `apply_ticket_action`).
 * Aturan yang bergantung pada peran (buka kembali hanya L2/admin, T66) dan penutupan yang
 * menyusul di 1.6 (T69) dijaga di sini; perpindahan yang sah dijaga juga oleh database.
 */
@Injectable()
export class TicketActionsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async add(scope: TenantScope, actor: AuditActor, role: Role, ticketId: string, input: AddActionInput): Promise<void> {
    await auditedTransaction(this.dataSource, actor, async (manager) => {
      const ticket = await applyTenantScope(
        manager
          .createQueryBuilder()
          .from('tickets', 'tk')
          .select(['tk.id AS id', 'tk.tenant_id AS tenant_id', 'tk.status AS status', 'tk.created_at AS created_at'])
          .where('tk.id = :ticketId', { ticketId })
          .setLock('pessimistic_write', undefined, ['tk']),
        scope,
        'tk.tenant_id',
      ).getRawOne<{ id: string; tenant_id: string; status: TicketStatus; created_at: Date }>();
      if (!ticket) throw new NotFoundException(TICKET_NOT_FOUND_MESSAGE);

      if (input.statusTo) {
        if (input.statusTo === 'ditutup') throw new BadRequestException(CLOSE_NOT_YET_MESSAGE);
        if (input.statusFrom !== ticket.status) {
          throw new ConflictException(
            `Status NPR sudah berubah menjadi ${TICKET_STATUS_LABELS[ticket.status]}. Muat ulang, lalu periksa lagi tindakan Anda.`,
          );
        }
        if (ticket.status === 'ditutup' && role === 'l1') throw new ForbiddenException(REOPEN_ROLE_MESSAGE);
        if (!isTicketTransitionAllowed(ticket.status, input.statusTo)) {
          throw new BadRequestException(
            `Status ${TICKET_STATUS_LABELS[ticket.status]} tidak bisa dipindah ke ${TICKET_STATUS_LABELS[input.statusTo]}.`,
          );
        }
      } else if (ticket.status === 'ditutup') {
        throw new BadRequestException(TICKET_CLOSED_MESSAGE);
      }

      if (input.correctsId) {
        const [corrected] = (await manager.query('SELECT 1 FROM ticket_actions WHERE id = $1 AND ticket_id = $2', [
          input.correctsId,
          ticket.id,
        ])) as unknown[];
        if (!corrected) throw new BadRequestException(CORRECTED_NOT_FOUND_MESSAGE);
      }

      const [{ now }] = (await manager.query('SELECT now() AS now')) as [{ now: Date }];
      if (input.occurredAt) {
        if (input.occurredAt.getTime() > now.getTime() + TICKET_STARTED_CLOCK_SKEW_MINUTES * MINUTE) {
          throw new BadRequestException('Waktu kejadian tidak boleh di masa depan.');
        }
        if (input.occurredAt.getTime() < now.getTime() - TICKET_STARTED_MAX_AGE_DAYS * DAY) {
          throw new BadRequestException(`Waktu kejadian paling lama ${TICKET_STARTED_MAX_AGE_DAYS} hari yang lalu.`);
        }
      }
      if (input.startedAt) {
        if (input.startedAt.getTime() > ticket.created_at.getTime()) {
          throw new BadRequestException('Mulai gangguan tidak boleh sesudah NPR dibuat.');
        }
        if (input.startedAt.getTime() < ticket.created_at.getTime() - TICKET_STARTED_MAX_AGE_DAYS * DAY) {
          throw new BadRequestException(
            `Mulai gangguan paling lama ${TICKET_STARTED_MAX_AGE_DAYS} hari sebelum NPR dibuat.`,
          );
        }
      }

      const [action] = (await manager.query(
        `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to,
                                     pending_reason, corrects_id, started_at_correction, customer_ticket_number, created_by)
         VALUES ($1, $2, $3, $4, LEAST(coalesce($5::timestamptz, now()), now()), $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          ticket.tenant_id,
          ticket.id,
          input.kind,
          input.note,
          input.occurredAt?.toISOString() ?? null,
          input.statusTo ? ticket.status : null,
          input.statusTo,
          input.pendingReason,
          input.correctsId,
          input.startedAt?.toISOString() ?? null,
          input.customerTicketNumber,
          actor.userId,
        ],
      )) as Array<{ id: string }>;
      if (!action) throw new Error('Tindakan gagal disimpan.');

      for (const file of input.attachments) {
        await manager.query(
          `INSERT INTO ticket_attachments (tenant_id, ticket_id, action_id, file_name, content_type, size_bytes,
                                           sha256, content, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            ticket.tenant_id,
            ticket.id,
            action.id,
            file.fileName,
            file.contentType,
            file.sizeBytes,
            file.sha256,
            file.content,
            actor.userId,
          ],
        );
      }
    });
  }

  /**
   * "Ambil" (T81): pengguna menjadi penanggung NPR. `expectedAssigneeId` = penanggung yang
   * terlihat di layar; bila sudah berganti, 409 (sama dengan tabrakan status, T73). NPR yang
   * masih Terbuka sekaligus menjadi Dikerjakan (T85). Penanggung sebelumnya dicatat database.
   */
  async take(scope: TenantScope, actor: AuditActor, ticketId: string, expectedAssigneeId: string | null): Promise<void> {
    await auditedTransaction(this.dataSource, actor, async (manager) => {
      const ticket = await applyTenantScope(
        manager
          .createQueryBuilder()
          .from('tickets', 'tk')
          .leftJoin('users', 'asg', 'asg.id = tk.assignee_id')
          .select([
            'tk.id AS id',
            'tk.tenant_id AS tenant_id',
            'tk.status AS status',
            'tk.assignee_id AS assignee_id',
            'asg.name AS assignee_name',
          ])
          .where('tk.id = :ticketId', { ticketId })
          .setLock('pessimistic_write', undefined, ['tk']),
        scope,
        'tk.tenant_id',
      ).getRawOne<{ id: string; tenant_id: string; status: TicketStatus; assignee_id: string | null; assignee_name: string | null }>();
      if (!ticket) throw new NotFoundException(TICKET_NOT_FOUND_MESSAGE);
      if (ticket.status === 'ditutup') throw new BadRequestException(TICKET_CLOSED_MESSAGE);
      if (ticket.assignee_id === actor.userId) throw new BadRequestException(ALREADY_ASSIGNEE_MESSAGE);
      if (ticket.assignee_id !== expectedAssigneeId) {
        throw new ConflictException(
          ticket.assignee_id
            ? `NPR ini sudah diambil ${ticket.assignee_name ?? 'pengguna lain'}. Muat ulang, lalu putuskan apakah tetap mengambil alih.`
            : 'Penanggung NPR ini sudah dilepas. Muat ulang, lalu coba lagi.',
        );
      }
      const note = ticket.assignee_id
        ? `Mengambil alih NPR dari ${ticket.assignee_name ?? 'penanggung sebelumnya'}.`
        : 'Mengambil NPR.';
      const startsWork = ticket.status === 'terbuka';
      await manager.query(
        `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to,
                                     assignee_id, created_by)
         VALUES ($1, $2, 'ambil', $3, now(), $4, $5, $6, $6)`,
        [
          ticket.tenant_id,
          ticket.id,
          note,
          startsWork ? 'terbuka' : null,
          startsWork ? 'dikerjakan' : null,
          actor.userId,
        ],
      );
    });
  }

  /** Linimasa NPR, terbaru di atas; `null` bila NPR tidak ada dalam cakupan. */
  async list(scope: TenantScope, ticketId: string): Promise<TicketAction[] | null> {
    const ticket = await applyTenantScope(
      this.dataSource.createQueryBuilder().from('tickets', 'tk').select('tk.id AS id').where('tk.id = :ticketId', {
        ticketId,
      }),
      scope,
      'tk.tenant_id',
    ).getRawOne<{ id: string }>();
    if (!ticket) return null;

    const rows = (await this.dataSource.query(
      `SELECT a.id, a.kind, a.note, a.occurred_at, a.created_at, a.created_by, u.name AS created_by_name,
              u.role AS created_by_role, a.status_from, a.status_to, a.pending_reason, a.corrects_id,
              a.started_at_correction, a.customer_ticket_number,
              a.assignee_id, asg.name AS assignee_name, a.assignee_from_id, prev.name AS assignee_from_name,
              coalesce((SELECT array_agg(c.id ORDER BY c.created_at, c.seq) FROM ticket_actions c
                         WHERE c.corrects_id = a.id), '{}') AS corrected_by_ids
         FROM ticket_actions a JOIN users u ON u.id = a.created_by
         LEFT JOIN users asg ON asg.id = a.assignee_id
         LEFT JOIN users prev ON prev.id = a.assignee_from_id
        WHERE a.ticket_id = $1
        ORDER BY a.created_at DESC, a.seq DESC`,
      [ticket.id],
    )) as ActionRow[];
    const attachments = (await this.dataSource.query(
      `SELECT id, action_id, file_name, content_type, size_bytes FROM ticket_attachments
        WHERE ticket_id = $1 ORDER BY created_at, file_name, id`,
      [ticket.id],
    )) as AttachmentRow[];

    const byAction = new Map<string, TicketAttachment[]>();
    for (const row of attachments) {
      const list = byAction.get(row.action_id) ?? [];
      list.push({
        id: row.id,
        fileName: row.file_name,
        contentType: row.content_type,
        sizeBytes: row.size_bytes,
        url: `/api/tickets/${ticket.id}/attachments/${row.id}`,
      });
      byAction.set(row.action_id, list);
    }

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      note: row.note,
      occurredAt: row.occurred_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      createdBy: { id: row.created_by, name: row.created_by_name, role: row.created_by_role },
      statusChange: row.status_to ? { from: row.status_from, to: row.status_to } : null,
      pendingReason: row.pending_reason,
      correctsId: row.corrects_id,
      correctedByIds: row.corrected_by_ids,
      startedAtCorrection: row.started_at_correction?.toISOString() ?? null,
      customerTicketNumber: row.customer_ticket_number,
      assignee: row.assignee_id ? { id: row.assignee_id, name: row.assignee_name ?? '' } : null,
      assigneeFrom: row.assignee_from_id ? { id: row.assignee_from_id, name: row.assignee_from_name ?? '' } : null,
      attachments: byAction.get(row.id) ?? [],
    }));
  }

  /** Isi satu lampiran; `null` bila NPR atau lampirannya tidak ada dalam cakupan. */
  async attachment(scope: TenantScope, ticketId: string, attachmentId: string): Promise<AttachmentContent | null> {
    const row = await applyTenantScope(
      this.dataSource
        .createQueryBuilder()
        .from('ticket_attachments', 'f')
        .select(['f.file_name AS file_name', 'f.content_type AS content_type', 'f.content AS content'])
        .where('f.id = :attachmentId AND f.ticket_id = :ticketId', { attachmentId, ticketId }),
      scope,
      'f.tenant_id',
    ).getRawOne<{ file_name: string; content_type: string; content: Buffer }>();
    if (!row) return null;
    return { fileName: row.file_name, contentType: row.content_type, content: row.content };
  }
}

export function isPendingStatus(status: TicketStatus | null): boolean {
  return status !== null && PENDING_TICKET_STATUSES.includes(status);
}
