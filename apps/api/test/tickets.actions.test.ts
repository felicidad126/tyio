import { readdirSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import type { AddTicketActionResponse, TicketAction, TicketActionsResponse, TicketResponse } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditEntryEntity } from '../src/common/audit/audit-entry.entity.js';
import { TicketActionEntity, TicketAttachmentEntity } from '../src/modules/tickets/ticket-action.entity.js';
import type { Tenant } from '../src/modules/tenants/tenant.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import {
  asTester,
  createRemote,
  createTenant,
  createUser,
  ensureCategory,
  sessionCookieFrom,
  TEST_PASSWORD,
  TINY_PNG,
} from './fixtures.js';
import { TEST_ATTACHMENTS_DIR } from './test-config.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

describe('linimasa tindakan tiket', () => {
  let app: INestApplication;
  let ds: DataSource;
  let a: Tenant;
  let ticketId: string;
  let cookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetData(ds);
    a = await createTenant(ds, 'TNA', 'Bank Uji Anggrek');
    const remote = await createRemote(ds, a, 'TNA-001');
    const category = await ensureCategory(ds);
    await createUser(ds, { username: 'l1.uji', displayName: 'Operator Uji' });
    cookie = await loginAs('l1.uji');
    const created = await http()
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send({ remoteId: remote.id, categoryId: category.id, occurredAt: new Date().toISOString(), problem: 'Remote down' })
      .expect(201);
    ticketId = (created.body as TicketResponse).ticket.id;
  });

  const http = () => request(app.getHttpServer());
  async function loginAs(username: string): Promise<string> {
    const res = await http().post('/api/auth/login').send({ username, password: TEST_PASSWORD }).expect(200);
    return sessionCookieFrom(res.headers['set-cookie']);
  }
  const at = '2026-11-17T02:30:00.000Z';
  const add = (body: Record<string, unknown>, who = cookie) =>
    http().post(`/api/tickets/${ticketId}/actions`).set('Cookie', who).send({ occurredAt: at, ...body });
  const addOk = async (body: Record<string, unknown>) => (await add(body).expect(201)).body as AddTicketActionResponse;
  const timeline = async (): Promise<TicketAction[]> =>
    ((await http().get(`/api/tickets/${ticketId}/actions`).set('Cookie', cookie).expect(200)).body as TicketActionsResponse)
      .actions;
  const ticket = async () =>
    ((await http().get(`/api/tickets/${ticketId}`).set('Cookie', cookie).expect(200)).body as TicketResponse).ticket;

  it('tiket baru langsung punya entri pertama: dibuat dengan status Terbuka', async () => {
    expect(await timeline()).toEqual([
      expect.objectContaining({
        statusFrom: null,
        statusTo: 'terbuka',
        note: null,
        createdBy: { id: expect.any(String), displayName: 'Operator Uji' },
        correctsId: null,
        correctedBy: [],
        attachments: [],
      }),
    ]);
  });

  it('catatan saja tidak mengubah status; waktu tindakan dari operator, waktu catat dari sistem', async () => {
    const { action, ticket: after } = await addOk({ note: 'Cek ping ke remote: timeout' });

    expect(action).toMatchObject({ note: 'Cek ping ke remote: timeout', statusFrom: null, statusTo: null, occurredAt: at });
    expect(Date.parse(action.createdAt)).toBeGreaterThan(Date.parse(at));
    expect(after.status).toBe('terbuka');
    // Urut waktu tindakan: entri "dibuat" (sekarang) di atas tindakan pukul 02.30 tadi.
    expect((await timeline()).map((x) => x.note)).toEqual([null, 'Cek ping ke remote: timeout']);
    expect(await addOk({ occurredAt: new Date().toISOString(), note: 'Terbaru' })).toBeTruthy();
    expect((await timeline())[0]?.note).toBe('Terbaru');
  });

  it('waktu tindakan diisi sampai menit: entri di menit yang sama diurutkan menurut waktu catat', async () => {
    const sameMinute = new Date();
    sameMinute.setSeconds(0, 0); // bisa lebih awal beberapa detik dari entri "dibuat"

    await addOk({ occurredAt: sameMinute.toISOString(), note: 'Menit yang sama' });

    expect((await timeline())[0]?.note).toBe('Menit yang sama');
  });

  it('pending wajib pihak dan alasan; tersimpan di tiket, lalu hilang saat keluar dari pending', async () => {
    const toPending = { note: 'Menunggu customer', statusTo: 'pending', expectedStatus: 'terbuka' };
    expect((await add(toPending).expect(400)).body).toMatchObject({ field: 'pendingParty' });
    expect((await add({ ...toPending, pendingParty: 'customer', pendingReason: 'x' }).expect(400)).body).toMatchObject({
      field: 'pendingReason',
    });

    const pending = await addOk({ ...toPending, pendingParty: 'customer', pendingReason: 'Lokasi tutup, buka besok' });
    expect(pending.ticket).toMatchObject({ status: 'pending', pending: { party: 'customer', reason: 'Lokasi tutup, buka besok' } });
    expect(pending.action.pending).toEqual({ party: 'customer', reason: 'Lokasi tutup, buka besok' });

    const resumed = await addOk({ note: 'Lokasi sudah buka', statusTo: 'dikerjakan', expectedStatus: 'pending' });
    expect(resumed.ticket).toMatchObject({ status: 'dikerjakan', pending: null });
  });

  it('status yang dilihat operator sudah berubah: 409, tidak ada yang tersimpan', async () => {
    await addOk({ statusTo: 'dikerjakan', expectedStatus: 'terbuka' });
    const before = (await timeline()).length;

    const res = await add({ type: 'close', note: 'Online', statusTo: 'selesai', expectedStatus: 'terbuka' }).expect(409);

    expect(res.body).toMatchObject({ currentStatus: 'dikerjakan', message: expect.stringMatching(/sudah berubah menjadi Dikerjakan/) });
    expect((await timeline()).length).toBe(before);
  });

  it('dua operator mengubah status bersamaan dari status yang sama: satu berhasil, satu 409', async () => {
    const other = await (async () => {
      await createUser(ds, { username: 'l1.lain' });
      return loginAs('l1.lain');
    })();

    const results = await Promise.all([
      add({ statusTo: 'dikerjakan', expectedStatus: 'terbuka' }),
      // Waktu online kembali tidak boleh sebelum kejadian (tiket ini dibuat dengan waktu sekarang).
      add({ type: 'close', occurredAt: new Date().toISOString(), note: 'Online kembali', statusTo: 'selesai', expectedStatus: 'terbuka' }, other),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await timeline()).filter((x) => x.statusTo && x.statusFrom)).toHaveLength(1);
  });

  it('koreksi adalah entri baru yang merujuk entri lama; entri lama mencatat koreksinya', async () => {
    const wrong = (await addOk({ note: 'Teknisi tiba 09.00' })).action;

    const fix = (await addOk({ correctsId: wrong.id, note: 'Ralat: teknisi tiba 10.00' })).action;

    expect(fix).toMatchObject({ correctsId: wrong.id, note: 'Ralat: teknisi tiba 10.00', statusTo: null });
    const entries = await timeline();
    expect(entries.find((x) => x.id === wrong.id)).toMatchObject({ note: 'Teknisi tiba 09.00', correctedBy: [fix.id] });
    expect(entries).toHaveLength(3);
  });

  it('koreksi tanpa catatan, dengan status, atau ke entri tiket lain ditolak', async () => {
    const entry = (await addOk({ note: 'Catatan' })).action;
    expect((await add({ correctsId: entry.id }).expect(400)).body).toMatchObject({ field: 'note' });
    expect((await add({ correctsId: entry.id, note: 'x', statusTo: 'selesai' }).expect(400)).body).toMatchObject({
      field: 'statusTo',
    });
    expect(
      (await add({ correctsId: '01900000-0000-7000-8000-0000000000aa', note: 'Ralat' }).expect(400)).body,
    ).toMatchObject({ field: 'correctsId', message: 'Entri yang dikoreksi tidak ada di tiket ini.' });
  });

  it('jenis tindakan: bawaan Catatan; Cek lokasi dan Problem tersimpan dan wajib berisi catatan', async () => {
    expect((await addOk({ note: 'Catatan biasa' })).action.type).toBe('catatan');
    const check = await addOk({ type: 'cek_lokasi', note: 'Hubungi PIC lokasi untuk cek modem' });
    expect(check.action).toMatchObject({ type: 'cek_lokasi', note: 'Hubungi PIC lokasi untuk cek modem' });
    // Jenis tindakan bisa bersama perubahan status.
    const problem = await addOk({
      type: 'problem',
      note: 'PIC: listrik padam sejak pagi',
      statusTo: 'dikerjakan',
      expectedStatus: 'terbuka',
    });
    expect(problem.action).toMatchObject({ type: 'problem', statusTo: 'dikerjakan' });
    expect((await timeline()).find((a) => a.id === check.action.id)?.type).toBe('cek_lokasi');

    for (const type of ['cek_lokasi', 'problem']) {
      expect((await add({ type }).expect(400)).body).toMatchObject({ field: 'note', message: expect.stringMatching(/Tulis catatan untuk tindakan/) });
      // Perubahan status saja tidak cukup untuk Cek lokasi dan Problem.
      expect((await add({ type, statusTo: 'pending', expectedStatus: 'dikerjakan', pendingParty: 'tm', pendingReason: 'Menunggu' }).expect(400)).body)
        .toMatchObject({ field: 'note' });
    }
    expect((await add({ type: 'eskalasi_sd', note: 'x' }).expect(400)).body).toMatchObject({ field: 'type' });
    expect((await add({ type: 'problem', note: 'x', correctsId: check.action.id }).expect(400)).body).toMatchObject({
      field: 'type',
    });
  });

  it('database menolak Cek lokasi atau Problem tanpa catatan, dan jenis yang tidak dikenal', async () => {
    const insert = (type: string, note: string | null) =>
      asTester(ds, (m) =>
        m.query(
          `INSERT INTO ticket_actions (tenant_id, ticket_id, occurred_at, note, status_to, action_type, created_by)
           SELECT tenant_id, id, now(), $2, 'terbuka', $1, created_by FROM tickets WHERE id = $3`,
          [type, note, ticketId],
        ),
      );
    await expect(insert('problem', null)).rejects.toThrow(/ticket_actions_type_note/);
    await expect(insert('lainnya', 'x')).rejects.toThrow(/ticket_actions_type_valid/);
  });

  it('entri linimasa dan lampiran tidak bisa diubah atau dihapus, juga lewat SQL langsung', async () => {
    await http()
      .post(`/api/tickets/${ticketId}/actions`)
      .set('Cookie', cookie)
      .field('data', JSON.stringify({ occurredAt: at, note: 'Dengan lampiran' }))
      .attach('lampiran', TINY_PNG, 'layar.png')
      .expect(201);

    for (const sql of [
      'UPDATE ticket_actions SET note = $1',
      'DELETE FROM ticket_actions WHERE note IS DISTINCT FROM $1',
      "UPDATE ticket_attachments SET file_name = $1",
      'DELETE FROM ticket_attachments WHERE file_name <> $1',
    ]) {
      await expect(asTester(ds, (m) => m.query(sql, ['diubah']))).rejects.toThrow(/hanya boleh ditambah/);
    }
  });

  it('lampiran gambar dan PDF: jenis dari isinya, nama asli dibersihkan, diunduh dengan header aman', async () => {
    const res = await http()
      .post(`/api/tickets/${ticketId}/actions`)
      .set('Cookie', cookie)
      .field('data', JSON.stringify({ occurredAt: at, note: 'Bukti gangguan' }))
      .attach('lampiran', TINY_PNG, 'tangkapan "layar".png')
      .attach('lampiran', PDF, '../laporan.pdf')
      .expect(201);

    const [image, pdf] = (res.body as AddTicketActionResponse).action.attachments;
    expect(image).toMatchObject({ fileName: 'tangkapan layar.png', contentType: 'image/png', sizeBytes: TINY_PNG.length });
    expect(pdf).toMatchObject({ fileName: 'laporan.pdf', contentType: 'application/pdf' });

    const shown = await http().get(`/api/attachments/${image!.id}`).set('Cookie', cookie).buffer(true).expect(200);
    expect(shown.headers).toMatchObject({
      'content-type': 'image/png',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    });
    expect(shown.headers['content-disposition']).toMatch(/^inline;/);
    expect(Buffer.compare(shown.body as Buffer, TINY_PNG)).toBe(0);

    const downloaded = await http().get(`/api/attachments/${pdf!.id}`).set('Cookie', cookie).expect(200);
    expect(downloaded.headers['content-disposition']).toMatch(/^attachment; filename="laporan.pdf"/);
  });

  it('berkas yang bukan gambar/PDF, lebih dari 5 MB, atau lebih dari 5 ditolak tanpa sisa di disk', async () => {
    const filesBefore = readdirSync(TEST_ATTACHMENTS_DIR).length;
    const send = (files: Array<[Buffer, string]>) => {
      let req = http()
        .post(`/api/tickets/${ticketId}/actions`)
        .set('Cookie', cookie)
        .field('data', JSON.stringify({ occurredAt: at, note: 'Lampiran' }));
      for (const [data, name] of files) req = req.attach('lampiran', data, name);
      return req;
    };

    const fake = await send([[TINY_PNG, 'a.png'], [Buffer.from('<script>alert(1)</script>'), 'b.png']]).expect(400);
    expect(fake.body).toMatchObject({ field: 'lampiran', message: 'b.png: hanya gambar PNG, JPEG, WebP, atau PDF.' });
    const big = await send([[Buffer.concat([TINY_PNG, Buffer.alloc(5 * 1024 * 1024)]), 'besar.png']]);
    expect(big.status).toBe(413);
    expect(big.body).toMatchObject({ field: 'lampiran', message: 'Lampiran lebih dari 5 MB.' });
    const many = await send(Array.from({ length: 6 }, (_, i) => [TINY_PNG, `${i}.png`] as [Buffer, string])).expect(400);
    expect(many.body).toMatchObject({ field: 'lampiran', message: 'Paling banyak 5 lampiran per tindakan.' });

    expect(readdirSync(TEST_ATTACHMENTS_DIR).length).toBe(filesBefore);
    expect(await ds.getRepository(TicketAttachmentEntity).count()).toBe(0);
  });

  it('lampiran ikut hilang dari disk bila tindakannya ditolak (status sudah berubah)', async () => {
    await addOk({ statusTo: 'dikerjakan', expectedStatus: 'terbuka' });
    const filesBefore = readdirSync(TEST_ATTACHMENTS_DIR).length;

    await http()
      .post(`/api/tickets/${ticketId}/actions`)
      .set('Cookie', cookie)
      .field('data', JSON.stringify({ type: 'close', occurredAt: at, note: 'x', statusTo: 'selesai', expectedStatus: 'terbuka' }))
      .attach('lampiran', TINY_PNG, 'a.png')
      .expect(409);

    expect(readdirSync(TEST_ATTACHMENTS_DIR).length).toBe(filesBefore);
  });

  it('nomor tiket customer: diisi, diubah, dihapus; setiap perubahan tercatat di linimasa', async () => {
    const patch = (value: string | null) =>
      http().patch(`/api/tickets/${ticketId}`).set('Cookie', cookie).send({ customerTicketNumber: value });

    expect(((await patch('  INC-0042 ').expect(200)).body as TicketResponse).ticket.customerTicketNumber).toBe('INC-0042');
    await patch('INC-0042').expect(200); // tidak berubah: tidak ada entri baru
    await patch('INC-0043').expect(200);
    await patch(null).expect(200);
    expect((await patch('x'.repeat(65)).expect(400)).body).toMatchObject({ field: 'customerTicketNumber' });

    expect((await ticket()).customerTicketNumber).toBeNull();
    expect((await timeline()).map((x) => x.note).slice(0, 3)).toEqual([
      'Nomor tiket customer dihapus (sebelumnya INC-0043).',
      'Nomor tiket customer: INC-0043',
      'Nomor tiket customer: INC-0042',
    ]);
  });

  it.each<[Record<string, unknown>, string]>([
    [{}, 'note'],
    [{ note: 'x', occurredAt: new Date(Date.now() + 3600_000).toISOString() }, 'occurredAt'],
    [{ note: 'x', occurredAt: 'tadi' }, 'occurredAt'],
    [{ note: 'x'.repeat(4001) }, 'note'],
    [{ note: 'x', statusTo: 'ditutup', expectedStatus: 'terbuka' }, 'statusTo'],
    [{ note: 'x', statusTo: 'dikerjakan' }, 'expectedStatus'],
    [{ note: 'x', pendingParty: 'customer' }, 'pendingParty'],
    [{ note: 'x', prioritas: 'tinggi' }, 'prioritas'],
  ])('isian %o ditolak di kolom %s', async (body, field) => {
    const res = await add(body).expect(400);
    expect(res.body).toMatchObject({ field });
  });

  it('tindakan tercatat di audit log atas nama operator', async () => {
    const { action } = await addOk({ note: 'Untuk audit' });

    const rows = await ds.getRepository(AuditEntryEntity).findBy({ tableName: 'ticket_actions', rowId: action.id });
    expect(rows.map((r) => [r.action, r.actor, r.tenantId])).toEqual([['insert', 'pengguna:l1.uji', a.id]]);
    expect(await ds.getRepository(TicketActionEntity).countBy({ ticketId })).toBe(2);
  });
});
