import { ConflictException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { MasterRef, OpenTicketsConflict, TenantRef, TicketDetail, TicketSummary } from '@tyio/shared';
import { DataSource, type EntityManager, In, IsNull } from 'typeorm';
import { type Actor, withActor } from '../../common/audit/actor.js';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { TenantScopedRepository } from '../../common/tenant/tenant-scoped.repository.js';
import { JarkomEntity, SystemEntity, TicketCategoryEntity } from '../master/master.entities.js';
import { RemoteEntity } from '../remotes/remote.entity.js';
import { TenantEntity } from '../tenants/tenant.entity.js';
import { UserEntity } from '../users/user.entity.js';
import { invalid, type CreateTicketInput } from './ticket-input.js';
import { formatTicketNumber, ticketPeriod } from './ticket-number.js';
import { TicketActionEntity } from './ticket-action.entity.js';
import { type Ticket, TicketEntity } from './ticket.entity.js';

@Injectable()
export class TicketsService {
  private readonly tickets: TenantScopedRepository<Ticket>;

  constructor(private readonly dataSource: DataSource) {
    this.tickets = new TenantScopedRepository(dataSource.getRepository(TicketEntity), 'tenantId');
  }

  /**
   * Membuat tiket NPR untuk remote yang boleh dilihat pengguna. Dalam satu transaksi:
   * baris remote dikunci (pembuatan tiket per remote berurutan, sehingga peringatan tiket
   * terbuka tidak bisa terlewat oleh dua operator bersamaan), lalu penghitung nomor dinaikkan
   * dan tiket disimpan. Bila apa pun gagal, nomor tidak terpakai.
   */
  async create(access: TenantAccess, userId: string, input: CreateTicketInput, actor: Actor): Promise<TicketDetail> {
    const category = await this.dataSource.getRepository(TicketCategoryEntity).findOneBy({ id: input.categoryId });
    if (!category) throw invalid('Kategori tidak ditemukan.', 'categoryId');
    if (!category.active) throw invalid(`Kategori ${category.code} nonaktif.`, 'categoryId');
    if (input.systemId) {
      const system = await this.dataSource.getRepository(SystemEntity).findOneBy({ id: input.systemId });
      if (!system) throw invalid('System tidak ditemukan.', 'systemId');
      if (!system.active) throw invalid(`System ${system.code} nonaktif.`, 'systemId');
    }

    const id = await withActor(this.dataSource, actor, async (m) => {
      const remote = await new TenantScopedRepository(m.getRepository(RemoteEntity), 'tenantId')
        .query(access, 'r')
        .andWhere('r.id = :id', { id: input.remoteId })
        .setLock('pessimistic_write')
        .getOne();
      if (!remote) throw notFound('Remote tidak ditemukan.');
      if (remote.status === 'dibongkar') {
        throw invalid(`Remote ${remote.siteId} sudah dibongkar; tiket tidak bisa dibuat.`, 'remoteId');
      }
      const tenant = await m.getRepository(TenantEntity).findOneByOrFail({ id: remote.tenantId });
      if (!tenant.active) throw invalid(`Customer ${tenant.name} nonaktif; tiket tidak bisa dibuat.`, 'remoteId');

      if (!input.confirmOpenTickets) {
        const open = await m.getRepository(TicketEntity).find({
          where: { remoteId: remote.id, closedAt: IsNull() },
          order: { createdAt: 'ASC' },
        });
        if (open.length > 0) {
          const body: OpenTicketsConflict = {
            statusCode: HttpStatus.CONFLICT,
            message: `Remote ini masih punya ${open.length} tiket terbuka. Periksa dulu, atau konfirmasi untuk tetap membuat tiket baru.`,
            openTickets: await summaries(m, open),
          };
          throw new ConflictException(body);
        }
      }

      const jarkom = await m.getRepository(JarkomEntity).findOneByOrFail({ id: remote.jarkomId });
      const period = ticketPeriod(new Date());
      const sequence = await nextSequence(m, tenant.id, jarkom.id, period);
      const saved = await m.getRepository(TicketEntity).save({
        tenantId: tenant.id,
        remoteId: remote.id,
        number: formatTicketNumber('NPR', jarkom.code, tenant.code, period, sequence),
        categoryId: category.id,
        systemId: input.systemId,
        occurredAt: input.occurredAt,
        problem: input.problem,
        createdById: userId,
      });
      // Entri pertama linimasa: tiket dibuat dengan status Terbuka.
      await m.getRepository(TicketActionEntity).save({
        tenantId: tenant.id,
        ticketId: saved.id,
        occurredAt: new Date(),
        statusTo: 'terbuka',
        createdById: userId,
      });
      return saved.id;
    });
    return this.get(access, id);
  }

  /** 404 juga untuk tiket customer lain (T27). */
  async get(access: TenantAccess, id: string): Promise<TicketDetail> {
    const ticket = await this.tickets.query(access, 't').andWhere('t.id = :id', { id }).getOne();
    if (!ticket) throw notFound('Tiket tidak ditemukan.');
    const m = this.dataSource.manager;
    const remote = await m.getRepository(RemoteEntity).findOneByOrFail({ id: ticket.remoteId });
    const [summary] = await summaries(m, [ticket]);
    const [jarkom, system, creator] = await Promise.all([
      m.getRepository(JarkomEntity).findOneByOrFail({ id: remote.jarkomId }),
      ticket.systemId ? m.getRepository(SystemEntity).findOneByOrFail({ id: ticket.systemId }) : null,
      m.getRepository(UserEntity).findOneByOrFail({ id: ticket.createdById }),
    ]);
    return {
      ...summary!,
      remote: {
        id: remote.id,
        siteId: remote.siteId,
        name: remote.name,
        city: remote.city,
        province: remote.province,
        timeZone: remote.timeZone,
        status: remote.status,
      },
      jarkom: ref(jarkom),
      system: system ? ref(system) : null,
      problem: ticket.problem,
      createdBy: { id: creator.id, displayName: creator.displayName },
      customerTicketNumber: ticket.customerTicketNumber,
      pending:
        ticket.pendingParty && ticket.pendingReason
          ? { party: ticket.pendingParty, reason: ticket.pendingReason }
          : null,
    };
  }

  /** Tiket yang belum ditutup pada satu remote, untuk peringatan di form "Buat tiket". */
  async openForRemote(access: TenantAccess, remoteId: string): Promise<TicketSummary[]> {
    const remote = await new TenantScopedRepository(this.dataSource.getRepository(RemoteEntity), 'tenantId')
      .query(access, 'r')
      .andWhere('r.id = :id', { id: remoteId })
      .getOne();
    if (!remote) throw notFound('Remote tidak ditemukan.');
    const open = await this.dataSource.getRepository(TicketEntity).find({
      where: { remoteId: remote.id, closedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
    return summaries(this.dataSource.manager, open);
  }
}

/**
 * Menaikkan penghitung nomor dan mengembalikan nilainya. SQL mentah karena ORM tidak bisa
 * menyatakan "tambah satu saat bentrok lalu kembalikan nilainya". INSERT ... ON CONFLICT
 * mengunci baris penghitung sampai transaksi selesai, jadi operator lain menunggu giliran.
 */
async function nextSequence(m: EntityManager, tenantId: string, jarkomId: string, period: string): Promise<number> {
  const rows: Array<{ last_value: number }> = await m.query(
    `INSERT INTO ticket_sequences (kind, tenant_id, jarkom_id, period, last_value)
     VALUES ('NPR', $1, $2, $3, 1)
     ON CONFLICT (kind, tenant_id, jarkom_id, period)
     DO UPDATE SET last_value = ticket_sequences.last_value + 1
     RETURNING last_value`,
    [tenantId, jarkomId, period],
  );
  return rows[0]!.last_value;
}

/** Ringkasan tiket dengan customer dan kategorinya, dalam dua query untuk semua tiket. */
async function summaries(m: EntityManager, tickets: Ticket[]): Promise<TicketSummary[]> {
  if (tickets.length === 0) return [];
  const [tenants, categories] = await Promise.all([
    m.getRepository(TenantEntity).findBy({ id: In([...new Set(tickets.map((t) => t.tenantId))]) }),
    m.getRepository(TicketCategoryEntity).findBy({ id: In([...new Set(tickets.map((t) => t.categoryId))]) }),
  ]);
  const tenantById = new Map<string, TenantRef>(tenants.map((t) => [t.id, ref(t)]));
  const categoryById = new Map<string, MasterRef>(categories.map((c) => [c.id, ref(c)]));
  return tickets.map((t) => ({
    id: t.id,
    number: t.number,
    status: t.status,
    tenant: tenantById.get(t.tenantId)!,
    category: categoryById.get(t.categoryId)!,
    occurredAt: t.occurredAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
  }));
}

function ref({ id, code, name }: { id: string; code: string; name: string }): MasterRef {
  return { id, code, name };
}

function notFound(message: string): NotFoundException {
  return new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, message });
}
