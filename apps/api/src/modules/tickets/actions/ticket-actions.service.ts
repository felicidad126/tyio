import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  ATTACHMENT_MAX_BYTES,
  type AttachmentType,
  type TicketAction as TicketActionView,
  type TicketAttachment,
  type TicketDetail,
} from '@tyio/shared';
import { DataSource, type EntityManager, In } from 'typeorm';
import { type Actor, withActor } from '../../../common/audit/actor.js';
import type { TenantAccess } from '../../../common/tenant/tenant-access.js';
import { TenantScopedRepository } from '../../../common/tenant/tenant-scoped.repository.js';
import { UserEntity } from '../../users/user.entity.js';
import { assertTransition } from '../status/ticket-status.js';
import { invalid } from '../ticket-input.js';
import { type Ticket, TicketEntity } from '../ticket.entity.js';
import { TicketsService } from '../tickets.service.js';
import {
  type TicketAction,
  TicketActionEntity,
  type TicketAttachmentRow,
  TicketAttachmentEntity,
} from '../ticket-action.entity.js';
import type { ActionInput, UploadedFile } from './action-input.js';
import { AttachmentStorage, cleanFileName, detectAttachmentType } from './attachment-storage.js';

@Injectable()
export class TicketActionsService {
  private readonly attachments: TenantScopedRepository<TicketAttachmentRow>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly tickets: TicketsService,
    private readonly storage: AttachmentStorage,
  ) {
    this.attachments = new TenantScopedRepository(dataSource.getRepository(TicketAttachmentEntity), 'tenantId');
  }

  /** Linimasa satu tiket, terbaru di atas. 404 untuk tiket customer lain. */
  async list(access: TenantAccess, ticketId: string): Promise<TicketActionView[]> {
    const ticket = await this.findTicket(this.dataSource.manager, access, ticketId, false);
    const rows = await this.dataSource.getRepository(TicketActionEntity).find({
      where: { ticketId: ticket.id },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return toViews(this.dataSource.manager, rows);
  }

  /**
   * Menambah satu entri linimasa (tindakan, perubahan status, atau koreksi) dan lampirannya.
   * Baris tiket dikunci, sehingga perubahan status dari dua operator tidak saling menimpa.
   * Berkas ditulis lebih dulu dan dihapus lagi bila transaksi gagal.
   */
  async add(
    access: TenantAccess,
    userId: string,
    ticketId: string,
    input: ActionInput,
    files: UploadedFile[],
    actor: Actor,
  ): Promise<{ action: TicketActionView; ticket: TicketDetail }> {
    const uploads = files.map((file) => {
      const type = detectAttachmentType(file.buffer);
      if (!type) {
        throw invalid(`${cleanFileName(file.originalname)}: hanya gambar PNG, JPEG, WebP, atau PDF.`, 'lampiran');
      }
      if (file.size > ATTACHMENT_MAX_BYTES) {
        throw invalid(`${cleanFileName(file.originalname)} lebih dari 5 MB.`, 'lampiran');
      }
      return { file, type };
    });

    const stored: string[] = [];
    try {
      const saved: Array<{ storedName: string; sha256: string; type: AttachmentType; fileName: string; size: number }> = [];
      for (const { file, type } of uploads) {
        const result = await this.storage.save(file.buffer, type);
        stored.push(result.storedName);
        saved.push({ ...result, type, fileName: cleanFileName(file.originalname), size: file.size });
      }

      const actionId = await withActor(this.dataSource, actor, async (m) => {
        const ticket = await this.findTicket(m, access, ticketId, true);
        const actions = m.getRepository(TicketActionEntity);
        let entry: Partial<TicketAction>;
        if (input.kind === 'correction') {
          const target = await actions.findOneBy({ id: input.correctsId, ticketId: ticket.id });
          if (!target) throw invalid('Entri yang dikoreksi tidak ada di tiket ini.', 'correctsId');
          entry = { occurredAt: new Date(), note: input.note, correctsId: target.id };
        } else {
          entry = { occurredAt: input.occurredAt, note: input.note };
          if (input.status) {
            assertTransition(ticket.status, input.status.expected, input.status.to);
            entry = {
              ...entry,
              statusFrom: ticket.status,
              statusTo: input.status.to,
              pendingParty: input.status.pending?.party ?? null,
              pendingReason: input.status.pending?.reason ?? null,
            };
            await m.getRepository(TicketEntity).update(ticket.id, {
              status: input.status.to,
              pendingParty: input.status.pending?.party ?? null,
              pendingReason: input.status.pending?.reason ?? null,
            });
          }
        }
        const action = await actions.save({ ...entry, tenantId: ticket.tenantId, ticketId: ticket.id, createdById: userId });
        if (saved.length > 0) {
          await m.getRepository(TicketAttachmentEntity).insert(
            saved.map((s) => ({
              tenantId: ticket.tenantId,
              ticketId: ticket.id,
              actionId: action.id,
              fileName: s.fileName,
              storedName: s.storedName,
              contentType: s.type,
              sizeBytes: s.size,
              sha256: s.sha256,
            })),
          );
        }
        return action.id;
      });

      const action = await this.dataSource.getRepository(TicketActionEntity).findOneByOrFail({ id: actionId });
      const [view] = await toViews(this.dataSource.manager, [action]);
      return { action: view!, ticket: await this.tickets.get(access, ticketId) };
    } catch (error) {
      await Promise.all(stored.map((name) => this.storage.remove(name)));
      throw error;
    }
  }

  /** Mengganti nomor tiket customer; perubahannya juga dicatat di linimasa. */
  async setCustomerTicketNumber(
    access: TenantAccess,
    userId: string,
    ticketId: string,
    number: string | null,
    actor: Actor,
  ): Promise<TicketDetail> {
    await withActor(this.dataSource, actor, async (m) => {
      const ticket = await this.findTicket(m, access, ticketId, true);
      if (ticket.customerTicketNumber === number) return;
      await m.getRepository(TicketEntity).update(ticket.id, { customerTicketNumber: number });
      await m.getRepository(TicketActionEntity).save({
        tenantId: ticket.tenantId,
        ticketId: ticket.id,
        occurredAt: new Date(),
        note: number
          ? `Nomor tiket customer: ${number}`
          : `Nomor tiket customer dihapus (sebelumnya ${ticket.customerTicketNumber}).`,
        createdById: userId,
      });
    });
    return this.tickets.get(access, ticketId);
  }

  /** Lampiran untuk diunduh; 404 juga untuk lampiran customer lain. */
  async attachment(access: TenantAccess, id: string): Promise<TicketAttachmentRow> {
    const row = await this.attachments.query(access, 'a').andWhere('a.id = :id', { id }).getOne();
    if (!row) throw notFound('Lampiran tidak ditemukan.');
    return row;
  }

  openAttachment(row: TicketAttachmentRow) {
    return this.storage.open(row.storedName);
  }

  private async findTicket(m: EntityManager, access: TenantAccess, id: string, lock: boolean): Promise<Ticket> {
    const qb = new TenantScopedRepository(m.getRepository(TicketEntity), 'tenantId')
      .query(access, 't')
      .andWhere('t.id = :id', { id });
    if (lock) qb.setLock('pessimistic_write');
    const ticket = await qb.getOne();
    if (!ticket) throw notFound('Tiket tidak ditemukan.');
    return ticket;
  }
}

/** Entri linimasa beserta pembuat, lampiran, dan koreksinya, dalam tiga query untuk semua entri. */
async function toViews(m: EntityManager, rows: TicketAction[]): Promise<TicketActionView[]> {
  if (rows.length === 0) return [];
  const ticketIds = [...new Set(rows.map((r) => r.ticketId))];
  const [users, attachments, corrections] = await Promise.all([
    m.getRepository(UserEntity).findBy({ id: In([...new Set(rows.map((r) => r.createdById))]) }),
    m.getRepository(TicketAttachmentEntity).find({
      where: { actionId: In(rows.map((r) => r.id)) },
      order: { createdAt: 'ASC', id: 'ASC' },
    }),
    m.getRepository(TicketActionEntity).find({
      where: { ticketId: In(ticketIds), correctsId: In(rows.map((r) => r.id)) },
      order: { createdAt: 'ASC', id: 'ASC' },
    }),
  ]);
  const userById = new Map(users.map((u) => [u.id, { id: u.id, displayName: u.displayName }]));
  return rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurredAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    createdBy: userById.get(r.createdById)!,
    note: r.note,
    statusFrom: r.statusFrom,
    statusTo: r.statusTo,
    pending: r.pendingParty && r.pendingReason ? { party: r.pendingParty, reason: r.pendingReason } : null,
    correctsId: r.correctsId,
    correctedBy: corrections.filter((c) => c.correctsId === r.id).map((c) => c.id),
    attachments: attachments
      .filter((a) => a.actionId === r.id)
      .map(
        (a): TicketAttachment => ({ id: a.id, fileName: a.fileName, contentType: a.contentType, sizeBytes: a.sizeBytes }),
      ),
  }));
}

function notFound(message: string): NotFoundException {
  return new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, message });
}
