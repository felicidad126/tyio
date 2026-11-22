import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TicketAction, TicketDetail, TicketTimeline } from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CORRECTED_NOT_FOUND_MESSAGE } from '../src/modules/tickets/actions/ticket-actions.service.js';
import { TICKET_NOT_FOUND_MESSAGE } from '../src/modules/tickets/tickets.service.js';
import { createTestApp } from './create-test-app.js';
import {
  asOperator,
  insertMasterValue,
  insertNoteWithAttachment,
  insertRemote,
  insertTenant,
  insertTicket,
  insertUser,
  operatorQuery,
  TEST_PASSWORD,
} from './fixtures.js';

// Linimasa NPR (langkah 1.4): entri hanya ditambah (T10), koreksi merujuk entri lama, jenis
// tindakan (T67), waktu kejadian, nomor tiket customer, dan lampiran di database (T70).
// Perpindahan status diuji di tickets.status.test.ts; isolasi di tenant-isolation.test.ts.

type Agent = ReturnType<typeof request.agent>;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('isi gambar uji'),
]);

describe('linimasa NPR', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let tenantId: string;
  let l1: Agent;
  let l1Name: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    tenantId = (await insertTenant(dataSource, 'Bank Linimasa')).id;
    l1Name = `Dewi ${randomUUID().slice(0, 4)}`;
    const user = await insertUser(dataSource, { role: 'l1', name: l1Name });
    l1 = request.agent(app.getHttpServer());
    await l1.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  const add = (ticketId: string, body: Record<string, unknown>) =>
    l1.post(`/api/tickets/${ticketId}/actions`).send(body);
  const timeline = async (ticketId: string) =>
    (await l1.get(`/api/tickets/${ticketId}/actions`).expect(200)).body as TicketAction[];

  describe('entri dibuat', () => {
    it('NPR dari API langsung punya entri awal: keterangan, status Terbuka, pembuat', async () => {
      const remote = await insertRemote(dataSource, tenantId);
      const category = await insertMasterValue(dataSource, 'kategori', tenantId);
      const system = await insertMasterValue(dataSource, 'system', tenantId);
      const created = await l1
        .post('/api/tickets')
        .send({ remoteId: remote.id, categoryId: category.id, systemId: system.id, description: 'Ping gagal 100%' })
        .expect(201);
      const ticket = created.body as TicketDetail;

      const [entry, ...rest] = await timeline(ticket.id);
      expect(rest).toEqual([]);
      expect(entry).toMatchObject({
        kind: 'dibuat',
        note: 'Ping gagal 100%',
        statusChange: { from: null, to: 'terbuka' },
        createdBy: { name: l1Name, role: 'l1' },
        createdAt: ticket.createdAt,
        occurredAt: ticket.createdAt,
        correctsId: null,
        correctedByIds: [],
        attachments: [],
      });
    });

    it('entri dibuat tidak bisa ditambahkan lagi, lewat API maupun langsung', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const res = await add(ticket.id, { kind: 'dibuat', note: 'NPR dibuat lagi' }).expect(400);
      expect(res.body.message).toMatch(/Pilih jenis tindakan/);
      await expect(
        operatorQuery(
          dataSource,
          `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_to, created_by)
           SELECT tenant_id, id, 'dibuat', 'x', now(), 'terbuka', created_by FROM tickets WHERE id = $1`,
          [ticket.id],
        ),
      ).rejects.toThrow(/sudah punya entri dibuat/);
    });
  });

  describe('tambah tindakan', () => {
    it('setiap jenis tindakan tersimpan, terbaru di atas, dengan pembuat dan waktu dari sistem', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      for (const kind of ['cek_jaringan', 'cek_lokasi', 'hubungi_customer', 'catatan']) {
        await add(ticket.id, { kind, note: `  Tindakan ${kind}  ` }).expect(201);
      }
      const actions = await timeline(ticket.id);
      expect(actions.map((action) => action.kind)).toEqual([
        'catatan',
        'hubungi_customer',
        'cek_lokasi',
        'cek_jaringan',
        'dibuat',
      ]);
      expect(actions[0]).toMatchObject({
        note: 'Tindakan catatan',
        statusChange: null,
        createdBy: { name: l1Name },
      });
      expect(actions[0]?.occurredAt).toBe(actions[0]?.createdAt);
    });

    it('waktu kejadian boleh mundur sampai 30 hari, tidak boleh di masa depan', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const past = new Date(Date.now() - 3 * 60 * MINUTE);
      const res = await add(ticket.id, {
        kind: 'cek_jaringan',
        note: 'Ping dari NMS',
        occurredAt: past.toISOString().replace('Z', '+00:00'),
      }).expect(201);
      const [entry] = (res.body as TicketTimeline).actions;
      expect(entry?.occurredAt).toBe(past.toISOString());

      const future = await add(ticket.id, {
        kind: 'catatan',
        note: 'x',
        occurredAt: new Date(Date.now() + 10 * MINUTE).toISOString(),
      }).expect(400);
      expect(future.body.message).toBe('Waktu kejadian tidak boleh di masa depan.');
      const old = await add(ticket.id, {
        kind: 'catatan',
        note: 'x',
        occurredAt: new Date(Date.now() - 31 * DAY).toISOString(),
      }).expect(400);
      expect(old.body.message).toBe('Waktu kejadian paling lama 30 hari yang lalu.');
      const noZone = await add(ticket.id, { kind: 'catatan', note: 'x', occurredAt: '2026-11-20T10:00' }).expect(400);
      expect(noZone.body.message).toBe('Waktu kejadian harus berupa tanggal dan jam yang sah.');

      // Sedikit di depan jam server (jam perangkat lebih cepat): disimpan sama dengan waktu pencatatan.
      const skew = await add(ticket.id, {
        kind: 'catatan',
        note: 'Jam ponsel lebih cepat',
        occurredAt: new Date(Date.now() + 2 * MINUTE).toISOString(),
      }).expect(201);
      const [skewed] = (skew.body as TicketTimeline).actions;
      expect(skewed?.occurredAt).toBe(skewed?.createdAt);
    });

    it('isian yang salah ditolak dengan pesan yang jelas', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const cases: Array<[Record<string, unknown>, string | RegExp]> = [
        [{ kind: 'catatan', note: '   ' }, 'Catatan wajib diisi.'],
        [{ kind: 'catatan' }, 'Catatan wajib diisi.'],
        [{ kind: 'catatan', note: 'x'.repeat(2001) }, 'Catatan paling panjang 2000 karakter.'],
        [{ kind: 'eskalasi', note: 'x' }, /Pilih jenis tindakan/],
        [{ kind: 'catatan', note: 'x', createdBy: randomUUID() }, /tidak bisa diisi atau diubah: createdBy/],
        [{ kind: 'catatan', note: 'x', statusTo: 'selesai', statusFrom: 'terbuka' }, 'Status tujuan tidak dikenal.'],
        [{ kind: 'catatan', note: 'x', correctsId: randomUUID() }, 'Entri yang dikoreksi hanya diisi untuk tindakan koreksi.'],
        [{ kind: 'catatan', note: 'x', customerTicketNumber: 'X'.repeat(101) }, 'Nomor tiket customer paling panjang 100 karakter.'],
      ];
      for (const [body, message] of cases) {
        const res = await add(ticket.id, body).expect(400);
        expect(res.body.message).toEqual(typeof message === 'string' ? message : expect.stringMatching(message));
      }
      expect(await timeline(ticket.id)).toHaveLength(1);
    });

    it('NPR yang tidak ada atau id yang salah format: 404', async () => {
      const missing = await add(randomUUID(), { kind: 'catatan', note: 'x' }).expect(404);
      expect(missing.body.message).toBe(TICKET_NOT_FOUND_MESSAGE);
      await add('NPR-1', { kind: 'catatan', note: 'x' }).expect(404);
      await l1.get(`/api/tickets/${randomUUID()}/actions`).expect(404);
    });
  });

  describe('hanya-tambah', () => {
    it('UPDATE, DELETE, dan TRUNCATE pada linimasa ditolak database', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const [entry] = await timeline(ticket.id);
      await expect(
        operatorQuery(dataSource, `UPDATE ticket_actions SET note = 'diubah' WHERE id = $1`, [entry?.id]),
      ).rejects.toThrow(/ticket_actions hanya bisa ditambah; UPDATE ditolak/);
      await expect(operatorQuery(dataSource, 'DELETE FROM ticket_actions WHERE id = $1', [entry?.id])).rejects.toThrow(
        /ticket_actions hanya bisa ditambah; DELETE ditolak/,
      );
      await expect(operatorQuery(dataSource, 'TRUNCATE ticket_actions CASCADE')).rejects.toThrow(/TRUNCATE/);
      expect((await timeline(ticket.id))[0]?.note).toBe('NPR uji');
    });

    it('UPDATE dan DELETE pada lampiran ditolak database', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const { attachmentId } = await insertNoteWithAttachment(dataSource, ticket.id);
      await expect(
        operatorQuery(dataSource, `UPDATE ticket_attachments SET file_name = 'lain.txt' WHERE id = $1`, [attachmentId]),
      ).rejects.toThrow(/ticket_attachments hanya bisa ditambah/);
      await expect(
        operatorQuery(dataSource, 'DELETE FROM ticket_attachments WHERE id = $1', [attachmentId]),
      ).rejects.toThrow(/ticket_attachments hanya bisa ditambah/);
    });

    it('NPR yang sudah punya linimasa tidak bisa dihapus', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      await expect(operatorQuery(dataSource, 'DELETE FROM tickets WHERE id = $1', [ticket.id])).rejects.toThrow(
        /ticket_actions_ticket_same_tenant/,
      );
    });
  });

  describe('koreksi', () => {
    it('koreksi merujuk entri lama; entri lama tetap ada dan ditandai dikoreksi', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const first = (await add(ticket.id, { kind: 'cek_lokasi', note: 'Gangguan mulai sekitar 14:30' }).expect(201))
        .body as TicketTimeline;
      const original = first.actions[0];
      if (!original) throw new Error('entri tidak ada');

      const res = await add(ticket.id, {
        kind: 'koreksi',
        note: 'Waktu mulai 14:12 dari log NMS, bukan 14:30',
        correctsId: original.id.toUpperCase(),
      }).expect(201);
      const actions = (res.body as TicketTimeline).actions;
      const correction = actions[0];
      expect(correction).toMatchObject({ kind: 'koreksi', correctsId: original.id });
      expect(actions.find((action) => action.id === original.id)).toMatchObject({
        note: 'Gangguan mulai sekitar 14:30',
        correctedByIds: [correction?.id],
      });
    });

    it('koreksi wajib menunjuk entri NPR yang sama', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const other = await insertTicket(dataSource, tenantId);
      const [otherEntry] = await timeline(other.id);
      const missing = await add(ticket.id, { kind: 'koreksi', note: 'x' }).expect(400);
      expect(missing.body.message).toBe('Pilih entri yang dikoreksi.');
      const cross = await add(ticket.id, { kind: 'koreksi', note: 'x', correctsId: otherEntry?.id }).expect(400);
      expect(cross.body.message).toBe(CORRECTED_NOT_FOUND_MESSAGE);
      await expect(
        operatorQuery(
          dataSource,
          `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, corrects_id, created_by)
           SELECT tenant_id, id, 'koreksi', 'x', now(), $2, created_by FROM tickets WHERE id = $1`,
          [ticket.id, otherEntry?.id],
        ),
      ).rejects.toThrow(/ticket_actions_corrects_same_ticket/);
    });

    it('mulai gangguan dikoreksi lewat entri koreksi; NPR memakai nilai baru', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const [created] = await timeline(ticket.id);
      const before = (await l1.get(`/api/tickets/${ticket.id}`).expect(200)).body as TicketDetail;
      const corrected = new Date(new Date(before.createdAt).getTime() - 45 * MINUTE);

      const res = await add(ticket.id, {
        kind: 'koreksi',
        note: 'Mulai gangguan dari log NMS',
        correctsId: created?.id,
        startedAt: corrected.toISOString(),
      }).expect(201);
      const body = res.body as TicketTimeline;
      expect(body.ticket.startedAt).toBe(corrected.toISOString());
      expect(body.actions[0]?.startedAtCorrection).toBe(corrected.toISOString());

      const after = await add(ticket.id, {
        kind: 'koreksi',
        note: 'x',
        correctsId: created?.id,
        startedAt: new Date(new Date(before.createdAt).getTime() + MINUTE).toISOString(),
      }).expect(400);
      expect(after.body.message).toBe('Mulai gangguan tidak boleh sesudah NPR dibuat.');
      const tooOld = await add(ticket.id, {
        kind: 'koreksi',
        note: 'x',
        correctsId: created?.id,
        startedAt: new Date(new Date(before.createdAt).getTime() - 31 * DAY).toISOString(),
      }).expect(400);
      expect(tooOld.body.message).toBe('Mulai gangguan paling lama 30 hari sebelum NPR dibuat.');
      const notCorrection = await add(ticket.id, {
        kind: 'catatan',
        note: 'x',
        startedAt: corrected.toISOString(),
      }).expect(400);
      expect(notCorrection.body.message).toBe('Mulai gangguan hanya bisa diubah lewat tindakan koreksi.');
    });
  });

  describe('nomor tiket customer', () => {
    it('dicatat lewat linimasa, tampil di NPR, dan bisa dikosongkan', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const set = await add(ticket.id, {
        kind: 'hubungi_customer',
        note: 'Customer membuka tiket',
        customerTicketNumber: ' INC-88213 ',
      }).expect(201);
      expect((set.body as TicketTimeline).ticket.customerTicketNumber).toBe('INC-88213');
      expect((set.body as TicketTimeline).actions[0]?.customerTicketNumber).toBe('INC-88213');

      const unchanged = await add(ticket.id, { kind: 'catatan', note: 'Tanpa nomor' }).expect(201);
      expect((unchanged.body as TicketTimeline).ticket.customerTicketNumber).toBe('INC-88213');

      const cleared = await add(ticket.id, { kind: 'catatan', note: 'Nomor salah', customerTicketNumber: '' }).expect(201);
      expect((cleared.body as TicketTimeline).ticket.customerTicketNumber).toBeNull();
      expect((cleared.body as TicketTimeline).actions[0]?.customerTicketNumber).toBe('');
    });
  });

  describe('lampiran', () => {
    const upload = (ticketId: string, data: Record<string, unknown>, files: Array<[Buffer, string]>) => {
      let req = l1.post(`/api/tickets/${ticketId}/actions`).field('data', JSON.stringify(data));
      for (const [content, name] of files) req = req.attach('lampiran', content, { filename: name });
      return req;
    };

    it('gambar dan log tersimpan bersama tindakan, bisa diunduh utuh dengan jenis dari daftar', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const log = Buffer.from('14:12 ICMP timeout 10.41.17.22\n14:13 ICMP timeout\n');
      const res = await upload(ticket.id, { kind: 'cek_jaringan', note: 'Ping gagal' }, [
        [PNG, 'ping-1752.png'],
        [log, 'log-nms-1412.LOG'],
      ]).expect(201);
      const [entry] = (res.body as TicketTimeline).actions;
      expect(entry?.attachments.map(({ fileName, contentType, sizeBytes }) => ({ fileName, contentType, sizeBytes }))).toEqual([
        { fileName: 'log-nms-1412.LOG', contentType: 'text/plain', sizeBytes: log.length },
        { fileName: 'ping-1752.png', contentType: 'image/png', sizeBytes: PNG.length },
      ]);

      const png = entry?.attachments.find((file) => file.fileName.endsWith('.png'));
      const image = await l1.get(png?.url ?? '').buffer(true).responseType('blob').expect(200);
      expect(Buffer.compare(image.body as Buffer, PNG)).toBe(0);
      expect(image.headers['content-type']).toBe('image/png');
      expect(image.headers['content-disposition']).toMatch(/^inline; filename="ping-1752.png"/);
      expect(image.headers['x-content-type-options']).toBe('nosniff');
      expect(image.headers['content-security-policy']).toMatch(/sandbox/);
      expect(image.headers['cache-control']).toBe('private, no-store');

      const text = entry?.attachments.find((file) => file.fileName.endsWith('.LOG'));
      const download = await l1.get(text?.url ?? '').buffer(true).expect(200);
      expect(download.text).toBe(log.toString());
      expect(download.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(download.headers['content-disposition']).toMatch(/^attachment; /);
    });

    it('nama berkas: tanpa folder, huruf non-ASCII tetap terbaca', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const res = await upload(ticket.id, { kind: 'catatan', note: 'Foto' }, [[PNG, 'C:\\foto\\Lokasi Pasar – ATM.png']]).expect(201);
      const [file] = (res.body as TicketTimeline).actions[0]?.attachments ?? [];
      expect(file?.fileName).toBe('Lokasi Pasar – ATM.png');
      const download = await l1.get(file?.url ?? '').buffer(true).responseType('blob').expect(200);
      expect(download.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent('Lokasi Pasar – ATM.png')}`);
    });

    it('jenis yang tidak diterima, isi yang menyamar, dan berkas kosong ditolak; tidak ada yang tersimpan', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const cases: Array<[Buffer, string, RegExp]> = [
        [Buffer.from('MZ biner'), 'alat.exe', /jenis ini tidak diterima/],
        [Buffer.from('<html><script>alert(1)</script></html>'), 'foto.png', /tidak cocok dengan jenisnya \(\.png\)/],
        [Buffer.from('<svg onload="x"/>'), 'gambar.svg', /jenis ini tidak diterima/],
        [Buffer.from([0x00, 0x01, 0x02]), 'log.txt', /tidak cocok dengan jenisnya \(\.txt\)/],
        [Buffer.from('bukan pdf'), 'laporan.pdf', /tidak cocok/],
        [Buffer.alloc(0), 'kosong.png', /kosong/],
      ];
      for (const [content, name, message] of cases) {
        const res = await upload(ticket.id, { kind: 'catatan', note: 'x' }, [[PNG, 'baik.png'], [content, name]]).expect(400);
        expect(res.body.message).toMatch(message);
      }
      expect(await timeline(ticket.id)).toHaveLength(1);
      const [count] = (await dataSource.query('SELECT count(*)::int AS n FROM ticket_attachments WHERE ticket_id = $1', [
        ticket.id,
      ])) as Array<{ n: number }>;
      expect(count?.n).toBe(0);
    });

    it('lebih dari 10 MB atau lebih dari 5 berkas ditolak dengan pesan berbahasa Indonesia', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]);
      const tooBig = await upload(ticket.id, { kind: 'catatan', note: 'x' }, [[big, 'besar.png']]).expect(400);
      expect(tooBig.body.message).toBe('Berkas paling besar 10 MB.');

      const six = Array.from({ length: 6 }, (_, index) => [PNG, `foto-${index}.png`] as [Buffer, string]);
      const tooMany = await upload(ticket.id, { kind: 'catatan', note: 'x' }, six).expect(400);
      expect(tooMany.body.message).toBe('Paling banyak 5 lampiran per tindakan.');

      const five = six.slice(0, 5);
      const ok = await upload(ticket.id, { kind: 'catatan', note: 'Lima foto' }, five).expect(201);
      expect((ok.body as TicketTimeline).actions[0]?.attachments).toHaveLength(5);
      expect(await timeline(ticket.id)).toHaveLength(2);
    });

    it('multipart tanpa bagian data, atau data bukan JSON, ditolak', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const noData = await l1
        .post(`/api/tickets/${ticket.id}/actions`)
        .attach('lampiran', PNG, { filename: 'a.png' })
        .expect(400);
      expect(noData.body.message).toBe('Bagian data (JSON tindakan) wajib dikirim.');
      const badJson = await l1.post(`/api/tickets/${ticket.id}/actions`).field('data', '{kind:').expect(400);
      expect(badJson.body.message).toBe('Bagian data harus JSON yang sah.');
      const otherField = await l1
        .post(`/api/tickets/${ticket.id}/actions`)
        .field('data', JSON.stringify({ kind: 'catatan', note: 'x' }))
        .attach('berkas', PNG, { filename: 'a.png' })
        .expect(400);
      expect(otherField.body.message).toMatch(/lampiran/);
    });

    it('lampiran hanya bisa ditambahkan bersama entrinya, paling banyak 5, juga bila ditulis langsung', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const [created] = await timeline(ticket.id);
      const insertFile = (actionId: string) =>
        asOperator(dataSource, (manager) =>
          manager.query(
            `INSERT INTO ticket_attachments (tenant_id, ticket_id, action_id, file_name, content_type, size_bytes,
                                             sha256, content, created_by)
             SELECT tenant_id, id, $2, 'telat.txt', 'text/plain', 1, encode(sha256('x'), 'hex'), 'x', created_by
               FROM tickets WHERE id = $1`,
            [ticket.id, actionId],
          ),
        );
      await expect(insertFile(created?.id ?? '')).rejects.toThrow(/bersama entri linimasanya/);

      await expect(
        asOperator(dataSource, async (manager) => {
          const [action] = (await manager.query(
            `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, created_by)
             SELECT tenant_id, id, 'catatan', 'x', now(), created_by FROM tickets WHERE id = $1 RETURNING id`,
            [ticket.id],
          )) as Array<{ id: string }>;
          for (let index = 0; index < 6; index += 1) {
            await manager.query(
              `INSERT INTO ticket_attachments (tenant_id, ticket_id, action_id, file_name, content_type, size_bytes,
                                               sha256, content, created_by)
               SELECT tenant_id, id, $2, 'f.txt', 'text/plain', 1, encode(sha256('x'), 'hex'), 'x', created_by
                 FROM tickets WHERE id = $1`,
              [ticket.id, action?.id],
            );
          }
        }),
      ).rejects.toThrow(/Paling banyak 5 lampiran/);
    });

    it('isi lampiran tidak masuk audit_log; faktanya tercatat', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const secret = Buffer.from(`isi-rahasia-${randomUUID()}`);
      await upload(ticket.id, { kind: 'catatan', note: 'Log' }, [[secret, 'catatan.txt']]).expect(201);
      const rows = (await dataSource.query(
        `SELECT changes FROM audit_log WHERE table_name = 'ticket_attachments' AND changes ->> 'ticket_id' = $1`,
        [ticket.id],
      )) as Array<{ changes: Record<string, unknown> }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.changes).toMatchObject({ file_name: 'catatan.txt', size_bytes: secret.length });
      expect(rows[0]?.changes).not.toHaveProperty('content');
      expect(JSON.stringify(rows)).not.toContain(secret.toString('hex'));
      expect(JSON.stringify(rows)).not.toContain(secret.toString('base64'));
    });

    it('lampiran yang tidak ada atau milik NPR lain: 404', async () => {
      const ticket = await insertTicket(dataSource, tenantId);
      const other = await insertTicket(dataSource, tenantId);
      const { attachmentId } = await insertNoteWithAttachment(dataSource, other.id);
      await l1.get(`/api/tickets/${ticket.id}/attachments/${attachmentId}`).expect(404);
      await l1.get(`/api/tickets/${ticket.id}/attachments/${randomUUID()}`).expect(404);
      await l1.get(`/api/tickets/${other.id}/attachments/bukan-uuid`).expect(404);
      await l1.get(`/api/tickets/${other.id}/attachments/${attachmentId}`).expect(200);
    });
  });
});

