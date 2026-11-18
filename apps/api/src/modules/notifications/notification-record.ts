import type { NotificationEvent, ReplacedPart, TimeZoneName } from '@tyio/shared';
import type { EntityManager } from 'typeorm';
import { JarkomEntity, TicketCategoryEntity } from '../master/master.entities.js';
import { RemoteEntity } from '../remotes/remote.entity.js';
import { TenantEntity } from '../tenants/tenant.entity.js';
import { TicketActionEntity } from '../tickets/ticket-action.entity.js';
import { TicketEntity } from '../tickets/ticket.entity.js';
import { TroubleTicketEntity } from '../trouble-tickets/trouble-ticket.entity.js';
import { troubleTicketSummary } from '../trouble-tickets/tt-summary.js';
import { UserEntity } from '../users/user.entity.js';

/**
 * Potret data tiket saat kejadian, disimpan bersama kejadiannya. Pesan dibuat dari potret ini,
 * bukan dari data terkini, sehingga pesan yang dikirim ulang tetap menceritakan kejadian itu.
 */
export interface TicketNotificationPayload {
  ticketId: string;
  number: string;
  customerTicketNumber: string | null;
  tenant: string;
  siteId: string;
  remote: string;
  city: string;
  timeZone: TimeZoneName;
  category: string;
  occurredAt: string;
  problem: string;
  createdBy: string;
  ttNumber: string | null;
  /** tt_dibuka: ringkasan TT untuk Service Delivery (sama dengan "Salin ringkasan TT"). */
  summary?: string;
  /** npr_selesai dan npr_dibuka_lagi: tindakan yang memicunya. */
  action?: {
    at: string;
    by: string;
    note: string | null;
    closedAt: string | null;
    durationMinutes: number | null;
    replacedParts: ReplacedPart[] | null;
  };
}

export interface RecordInput {
  type: NotificationEvent;
  ticketId: string;
  /** Tindakan linimasa pemicu (Close atau buka lagi). */
  actionId?: string;
}

/**
 * Mencatat satu kejadian tiket untuk notifikasi, di dalam transaksi perubahan tiketnya (`m`):
 * kejadian dan satu baris kiriman per grup penerima yang cocok (jenis kejadian dan customer)
 * tersimpan atau batal bersama tiketnya. Tanpa grup yang cocok, tidak ada yang dicatat.
 * Pengiriman dilakukan pekerja notifikasi setelah transaksi selesai.
 */
export async function recordNotification(m: EntityManager, input: RecordInput): Promise<void> {
  const ticket = await m.getRepository(TicketEntity).findOneByOrFail({ id: input.ticketId });
  const targets: Array<{ id: string }> = await m.query(
    `SELECT c.id FROM notification_channels c
     WHERE c.active AND $1 = ANY (c.events)
       AND (c.all_tenants OR EXISTS (
         SELECT 1 FROM notification_channel_tenants ct WHERE ct.channel_id = c.id AND ct.tenant_id = $2))`,
    [input.type, ticket.tenantId],
  );
  if (targets.length === 0) return;

  const [remote, tenant, category, creator, tt] = await Promise.all([
    m.getRepository(RemoteEntity).findOneByOrFail({ id: ticket.remoteId }),
    m.getRepository(TenantEntity).findOneByOrFail({ id: ticket.tenantId }),
    m.getRepository(TicketCategoryEntity).findOneByOrFail({ id: ticket.categoryId }),
    m.getRepository(UserEntity).findOneByOrFail({ id: ticket.createdById }),
    m.getRepository(TroubleTicketEntity).findOneBy({ ticketId: ticket.id }),
  ]);
  const payload: TicketNotificationPayload = {
    ticketId: ticket.id,
    number: ticket.number,
    customerTicketNumber: ticket.customerTicketNumber,
    tenant: tenant.name,
    siteId: remote.siteId,
    remote: remote.name,
    city: remote.city,
    timeZone: remote.timeZone,
    category: category.name,
    occurredAt: new Date(ticket.occurredAt).toISOString(),
    problem: ticket.problem,
    createdBy: creator.displayName,
    ttNumber: tt?.number ?? null,
  };

  if (input.type === 'tt_dibuka' && tt) {
    const [jarkom, opener] = await Promise.all([
      m.getRepository(JarkomEntity).findOneByOrFail({ id: remote.jarkomId }),
      m.getRepository(UserEntity).findOneByOrFail({ id: tt.createdById }),
    ]);
    payload.summary = troubleTicketSummary({
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
  }

  if (input.actionId) {
    const action = await m.getRepository(TicketActionEntity).findOneByOrFail({ id: input.actionId });
    const by = await m.getRepository(UserEntity).findOneByOrFail({ id: action.createdById });
    const closedAt = ticket.closedAt ? new Date(ticket.closedAt) : null;
    payload.action = {
      at: new Date(action.occurredAt).toISOString(),
      by: by.displayName,
      note: action.note,
      closedAt: closedAt?.toISOString() ?? null,
      // Menit yang tampil, detik diabaikan (T78), sama dengan laporan.
      durationMinutes: closedAt
        ? Math.max(0, Math.floor(closedAt.getTime() / 60_000) - Math.floor(new Date(ticket.occurredAt).getTime() / 60_000))
        : null,
      replacedParts: action.replacedParts,
    };
  }

  await m.query(
    `WITH event AS (
       INSERT INTO notification_events (event_type, tenant_id, ticket_id, payload)
       VALUES ($1, $2, $3, $4) RETURNING id
     )
     INSERT INTO notification_deliveries (event_id, channel_id)
     SELECT event.id, target FROM event CROSS JOIN unnest($5::uuid[]) AS target`,
    [input.type, ticket.tenantId, ticket.id, JSON.stringify(payload), targets.map((t) => t.id)],
  );
}
