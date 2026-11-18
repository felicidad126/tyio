import { ConflictException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  canOpenTroubleTicket,
  type OpenTroubleTicketRequest,
  TICKET_STATUS_LABELS,
  type TicketDetail,
  type TroubleTicketSummaryResponse,
} from '@tyio/shared';
import { DataSource, type EntityManager, QueryFailedError } from 'typeorm';
import { type Actor, withActor } from '../../common/audit/actor.js';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { TenantScopedRepository } from '../../common/tenant/tenant-scoped.repository.js';
import { JarkomEntity } from '../master/master.entities.js';
import { recordNotification } from '../notifications/notification-record.js';
import { RemoteEntity } from '../remotes/remote.entity.js';
import { TenantEntity } from '../tenants/tenant.entity.js';
import { TicketActionEntity } from '../tickets/ticket-action.entity.js';
import { invalid } from '../tickets/ticket-input.js';
import { formatTicketNumber, ticketPeriod } from '../tickets/ticket-number.js';
import { type Ticket, TicketEntity } from '../tickets/ticket.entity.js';
import { nextSequence, TicketsService } from '../tickets/tickets.service.js';
import { UserEntity } from '../users/user.entity.js';
import { TroubleTicketEntity } from './trouble-ticket.entity.js';
import { troubleTicketSummary } from './tt-summary.js';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class TroubleTicketsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tickets: TicketsService,
  ) {}

  /**
   * "Eskalasi To SD": membuka TT untuk NPR yang boleh dilihat pengguna (K27, T69). Dalam satu
   * transaksi: tiket dikunci (dua Helpdesk bersamaan → satu TT), nomor TT dari penghitung jenis
   * TT, status menjadi Eskalasi, dan entri linimasa "Eskalasi To SD" dicatat.
   */
  async open(
    access: TenantAccess,
    ticketId: string,
    userId: string,
    input: OpenTroubleTicketRequest,
    actor: Actor,
  ): Promise<TicketDetail> {
    try {
      await withActor(this.dataSource, actor, async (m) => {
        const ticket = await findTicket(m, access, ticketId, true);
        const existing = await m.getRepository(TroubleTicketEntity).findOneBy({ ticketId: ticket.id });
        if (existing) throw alreadyHasTt(existing.number);
        if (ticket.status !== input.expectedStatus) {
          throw new ConflictException({
            statusCode: HttpStatus.CONFLICT,
            message: `Status tiket sudah berubah menjadi ${TICKET_STATUS_LABELS[ticket.status]}. Muat ulang tiket, lalu ulangi.`,
            currentStatus: ticket.status,
          });
        }
        if (!canOpenTroubleTicket(ticket.status)) {
          throw invalid('Tiket sudah Selesai. Ubah ke Dikerjakan dulu bila masih perlu kunjungan teknisi.', 'expectedStatus');
        }
        const remote = await m.getRepository(RemoteEntity).findOneByOrFail({ id: ticket.remoteId });
        const [tenant, jarkom] = await Promise.all([
          m.getRepository(TenantEntity).findOneByOrFail({ id: ticket.tenantId }),
          m.getRepository(JarkomEntity).findOneByOrFail({ id: remote.jarkomId }),
        ]);
        const period = ticketPeriod(new Date());
        const number = formatTicketNumber('TT', jarkom.code, tenant.code, period, await nextSequence(m, 'TT', tenant.id, jarkom.id, period));
        await m.getRepository(TroubleTicketEntity).insert({
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          number,
          problem: input.problem,
          createdById: userId,
        });
        // Tiket Eskalasi lama (sebelum TT ada) tidak berpindah status; hanya entri TT-nya.
        const changes = ticket.status !== 'eskalasi';
        await m.getRepository(TicketEntity).update(ticket.id, { status: 'eskalasi', pendingParty: null, pendingReason: null });
        await m.getRepository(TicketActionEntity).insert({
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          type: 'eskalasi_sd',
          occurredAt: new Date(),
          note: `${number}: ${input.problem}`,
          statusFrom: changes ? ticket.status : null,
          statusTo: changes ? 'eskalasi' : null,
          createdById: userId,
        });
        // TT dikirim otomatis ke grup Service Delivery (K23, K25).
        await recordNotification(m, { type: 'tt_dibuka', ticketId: ticket.id });
      });
    } catch (error) {
      if (isUniqueViolation(error, 'trouble_tickets_ticket_key')) throw alreadyHasTt();
      throw error;
    }
    return this.tickets.get(access, ticketId);
  }

  /** Teks ringkasan TT untuk dikirim ke SD; setiap penyalinan tercatat di linimasa NPR (K25). */
  async summary(access: TenantAccess, ticketId: string, userId: string, actor: Actor): Promise<TroubleTicketSummaryResponse> {
    return withActor(this.dataSource, actor, async (m) => {
      const ticket = await findTicket(m, access, ticketId, false);
      const tt = await m.getRepository(TroubleTicketEntity).findOneBy({ ticketId: ticket.id });
      if (!tt) {
        throw new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, message: 'NPR ini belum punya TT.' });
      }
      const remote = await m.getRepository(RemoteEntity).findOneByOrFail({ id: ticket.remoteId });
      const [tenant, jarkom, opener] = await Promise.all([
        m.getRepository(TenantEntity).findOneByOrFail({ id: ticket.tenantId }),
        m.getRepository(JarkomEntity).findOneByOrFail({ id: remote.jarkomId }),
        m.getRepository(UserEntity).findOneByOrFail({ id: tt.createdById }),
      ]);
      const text = troubleTicketSummary({
        ttNumber: tt.number,
        ticketNumber: ticket.number,
        customerTicketNumber: ticket.customerTicketNumber,
        tenantName: tenant.name,
        remote,
        jarkomName: jarkom.name,
        problem: tt.problem,
        openedAt: tt.createdAt,
        openedBy: opener.displayName,
      });
      await m.getRepository(TicketActionEntity).insert({
        tenantId: ticket.tenantId,
        ticketId: ticket.id,
        occurredAt: new Date(),
        note: `Ringkasan ${tt.number} disalin untuk dikirim ke SD.`,
        createdById: userId,
      });
      return { text };
    });
  }
}

/** 404 juga untuk tiket customer lain (T27). */
async function findTicket(m: EntityManager, access: TenantAccess, id: string, lock: boolean): Promise<Ticket> {
  const qb = new TenantScopedRepository(m.getRepository(TicketEntity), 'tenantId').query(access, 't').andWhere('t.id = :id', { id });
  if (lock) qb.setLock('pessimistic_write');
  const ticket = await qb.getOne();
  if (!ticket) throw new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, message: 'Tiket tidak ditemukan.' });
  return ticket;
}

function alreadyHasTt(number?: string): ConflictException {
  return new ConflictException({
    statusCode: HttpStatus.CONFLICT,
    message: `NPR ini sudah punya TT${number ? ` ${number}` : ''}. Satu NPR paling banyak satu TT.`,
  });
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driver = error.driverError as { code?: string; constraint?: string };
  return driver.code === UNIQUE_VIOLATION && driver.constraint === constraint;
}
