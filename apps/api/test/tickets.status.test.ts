import type { INestApplication } from '@nestjs/common';
import { canTransition, TICKET_STATUSES, type TicketResponse, type TicketStatus } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TicketActionEntity } from '../src/modules/tickets/ticket-action.entity.js';
import { TicketEntity, type Ticket } from '../src/modules/tickets/ticket.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import { asTester, createRemote, createTenant, createTicket, createUser, sessionCookieFrom, TEST_PASSWORD } from './fixtures.js';

// Tabel transisi yang disetujui user (1.4). Ditulis ulang di sini, terpisah dari kode, agar
// perubahan diam-diam pada TICKET_TRANSITIONS ketahuan.
const APPROVED: Record<TicketStatus, TicketStatus[]> = {
  terbuka: ['dikerjakan', 'pending', 'eskalasi', 'selesai'],
  dikerjakan: ['pending', 'eskalasi', 'selesai'],
  pending: ['dikerjakan'],
  eskalasi: ['dikerjakan'],
  selesai: ['dikerjakan'],
};

describe('alur status tiket', () => {
  let app: INestApplication;
  let ds: DataSource;
  let ticket: Ticket;
  let cookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await resetData(ds);
    const tenant = await createTenant(ds, 'TNA', 'Bank Uji Anggrek');
    ticket = await createTicket(ds, await createRemote(ds, tenant, 'TNA-001'), 'NPR/UJI/TNA/2026/11/0001');
    await createUser(ds, { username: 'l1.uji' });
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'l1.uji', password: TEST_PASSWORD })
      .expect(200);
    cookie = sessionCookieFrom(res.headers['set-cookie']);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Menaruh tiket pada status tertentu langsung di database (titik awal tiap kasus). */
  const placeAt = (status: TicketStatus) =>
    asTester(ds, (m) =>
      m.getRepository(TicketEntity).update(ticket.id, {
        status,
        pendingParty: status === 'pending' ? 'customer' : null,
        pendingReason: status === 'pending' ? 'Menunggu konfirmasi' : null,
      }),
    );

  const move = (from: TicketStatus, to: TicketStatus) =>
    request(app.getHttpServer())
      .post(`/api/tickets/${ticket.id}/actions`)
      .set('Cookie', cookie)
      .send({
        occurredAt: new Date().toISOString(),
        note: `Dari ${from} ke ${to}`,
        statusTo: to,
        expectedStatus: from,
        ...(to === 'pending' ? { pendingParty: 'tm', pendingReason: 'Menunggu teknisi TM' } : {}),
      });

  it('tabel di kode sama dengan tabel yang disetujui', () => {
    for (const from of TICKET_STATUSES) {
      for (const to of TICKET_STATUSES) expect(canTransition(from, to), `${from} → ${to}`).toBe(APPROVED[from].includes(to));
    }
  });

  for (const from of TICKET_STATUSES) {
    for (const to of TICKET_STATUSES) {
      const allowed = APPROVED[from].includes(to);
      it(`${from} → ${to}: ${allowed ? 'boleh' : 'ditolak'}`, async () => {
        await placeAt(from);
        const before = await ds.getRepository(TicketActionEntity).count();

        const res = await move(from, to);

        if (allowed) {
          expect(res.status).toBe(201);
          expect((res.body as { ticket: TicketResponse['ticket'] }).ticket.status).toBe(to);
          expect(res.body.action).toMatchObject({ statusFrom: from, statusTo: to });
        } else {
          expect(res.status).toBe(400);
          expect(res.body).toMatchObject({ field: 'statusTo' });
          expect((await ds.getRepository(TicketEntity).findOneByOrFail({ id: ticket.id })).status).toBe(from);
          expect(await ds.getRepository(TicketActionEntity).count()).toBe(before);
        }
      });
    }
  }
});
