import type { INestApplication } from '@nestjs/common';
import type {
  NotificationDeliveriesResponse,
  NotificationSettingsResponse,
  TelegramChannel,
  TelegramChannelInput,
  TelegramChatsResponse,
  TicketDetail,
  TicketResponse,
} from '@tyio/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withActor } from '../src/common/audit/actor.js';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { CHAT_INTERVAL_MS, NotificationWorker } from '../src/modules/notifications/notification-worker.service.js';
import { packMessages, TELEGRAM_TEXT_MAX } from '../src/modules/notifications/telegram-message.js';
import { TelegramClient } from '../src/modules/notifications/telegram.client.js';
import type { Remote } from '../src/modules/remotes/remote.entity.js';
import type { Tenant } from '../src/modules/tenants/tenant.entity.js';
import { createTestApp } from './create-test-app.js';
import { resetData } from './db.js';
import { FakeTelegram } from './fake-telegram.js';
import {
  createRemote,
  createTenant,
  createUser,
  ensureCategory,
  sessionCookieFrom,
  TEST_PASSWORD,
  TINY_PNG,
} from './fixtures.js';
import { testConfig } from './test-config.js';

const TOKEN = '123456789:AAH-uji_token_rahasia_yang_panjang_0123';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const HOUR = 60 * 60 * 1000;

/** Menunggu sampai syarat terpenuhi (pengiriman berjalan di latar). */
async function until(check: () => boolean | Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('Waktu tunggu habis');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

// Notifikasi Telegram (R5): kejadian tiket → pesan ke grup yang cocok, sekali per grup, dengan
// coba ulang, batas kirim per grup, dan pengaturan khusus admin semua customer.
describe('notifikasi Telegram', { timeout: 30_000 }, () => {
  const fake = new FakeTelegram(TOKEN);
  let app: INestApplication;
  let ds: DataSource;
  let worker: NotificationWorker;
  let a: Tenant;
  let b: Tenant;
  let remoteA: Remote;
  let remoteB: Remote;
  let categoryId: string;
  const cookies = { admin: '', helpdesk: '' };
  let chatSeq = 0;
  /** ID chat baru per grup, agar jeda per grup dari uji lain tidak ikut menunda. */
  const chat = () => `-100${String(5_000_000_000 + ++chatSeq)}`;

  const http = () => request(app.getHttpServer());
  const asAdmin = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    http()[method](`/api/admin/notifications${path}`).set('Cookie', cookies.admin);
  const addChannel = async (input: Partial<TelegramChannelInput>): Promise<TelegramChannel> =>
    (
      await asAdmin('post', '/channels')
        .send({ name: `Grup ${chatSeq + 1}`, chatId: chat(), events: ['npr_baru'], allTenants: true, tenantIds: [], active: true, ...input })
        .expect(201)
    ).body.channel;
  const newTicket = async (remote: Remote, problem = 'Remote down'): Promise<TicketDetail> =>
    (
      (
        await http()
          .post('/api/tickets')
          .set('Cookie', cookies.helpdesk)
          .send({
            remoteId: remote.id,
            categoryId,
            occurredAt: new Date(Date.now() - 3 * HOUR).toISOString(),
            problem,
            confirmOpenTickets: true,
          })
          .expect(201)
      ).body as TicketResponse
    ).ticket;
  const deliveries = async () =>
    (await ds.query(
      `SELECT d.id, d.status, d.attempts, d.last_error, d.next_attempt_at, d.channel_id, e.event_type, e.payload->>'number' AS number
       FROM notification_deliveries d JOIN notification_events e ON e.id = d.event_id ORDER BY d.created_at`,
    )) as Array<{
      id: string;
      status: string;
      attempts: number;
      last_error: string | null;
      next_attempt_at: Date;
      channel_id: string;
      event_type: string;
      number: string;
    }>;
  const sentTo = (chatId: string) => fake.sent().filter((m) => m.chat_id === chatId);

  beforeAll(async () => {
    const apiUrl = await fake.start();
    app = await createTestApp(
      testConfig({ telegramBotToken: TOKEN, telegramApiUrl: apiUrl, publicUrl: 'https://noc.contoh.id' }),
    );
    ds = app.get(DataSource);
    worker = app.get(NotificationWorker);
    await resetData(ds);
    a = await createTenant(ds, 'TNA', 'Bank Uji Anggrek');
    b = await createTenant(ds, 'TNB', 'Bank Uji Rahasia');
    remoteA = await createRemote(ds, a, 'TNA-001', {
      name: 'ATM Pasar <Baru>',
      city: 'Malang',
      contacts: [{ name: 'Budi', role: 'PIC cabang', phone: '0812-0000-1111', email: null }],
    });
    remoteB = await createRemote(ds, b, 'TNB-001', { name: 'ATM Rahasia', city: 'Jayapura' });
    categoryId = (await ensureCategory(ds, 'RD', 'Remote Down')).id;
    await createUser(ds, { username: 'admin.semua', role: 'admin', allTenants: true });
    await createUser(ds, { username: 'helpdesk.semua', role: 'helpdesk', allTenants: true, displayName: 'Helpdesk Uji' });
    for (const [key, username] of [
      ['admin', 'admin.semua'],
      ['helpdesk', 'helpdesk.semua'],
    ] as const) {
      const res = await http().post('/api/auth/login').send({ username, password: TEST_PASSWORD }).expect(200);
      cookies[key] = sessionCookieFrom(res.headers['set-cookie']);
    }
  });

  beforeEach(async () => {
    await worker.idle();
    await withActor(ds, { name: 'uji:reset' }, (m) => m.query('DELETE FROM notification_channels'));
    await ds.query('DELETE FROM notification_events');
    fake.reset();
  });

  afterAll(async () => {
    await app.close();
    await fake.stop();
  });

  it('NPR baru: hanya grup dengan kejadian dan customer yang cocok, sekali per grup; isi pesan HTML aman', async () => {
    const semua = await addChannel({ events: ['npr_baru', 'npr_selesai'] });
    const topik = await addChannel({ threadId: 42, allTenants: false, tenantIds: [a.id] });
    const lain = await addChannel({ allTenants: false, tenantIds: [b.id] });
    const sd = await addChannel({ events: ['tt_dibuka'] });
    const mati = await addChannel({ active: false });

    const ticket = await newTicket(remoteA, 'Modem <mati> & lampu "merah"');
    await until(() => sentTo(semua.chatId).length === 1 && sentTo(topik.chatId).length === 1);
    await worker.idle();

    for (const silent of [lain, sd, mati]) expect(sentTo(silent.chatId)).toEqual([]);
    const [message] = sentTo(topik.chatId);
    expect(message).toMatchObject({ parse_mode: 'HTML', message_thread_id: 42 });
    expect(message!.text).toContain(`🔴 <b>NPR baru</b> · Bank Uji Anggrek`);
    expect(message!.text).toContain(`<b>${ticket.number}</b>`);
    expect(message!.text).toContain('TNA-001 · ATM Pasar &lt;Baru&gt;, Malang');
    expect(message!.text).toContain('Kategori: Remote Down');
    expect(message!.text).toContain('Masalah: Modem &lt;mati&gt; &amp; lampu &quot;merah&quot;');
    expect(message!.text).toContain('Dibuat oleh: Helpdesk Uji');
    expect(message!.text).toContain(`<a href="https://noc.contoh.id/tiket/${ticket.id}">Buka di portal</a>`);
    expect(message!.text).toMatch(/Kejadian: \d+ \w+ \d{4}, \d{2}\.\d{2} WIB/);
    expect((await deliveries()).map((d) => d.status)).toEqual(['terkirim', 'terkirim']);

    // NPR customer B: ke grup khusus B (dan grup semua customer), tidak ke grup khusus A.
    const rahasia = await newTicket(remoteB);
    await until(() => sentTo(lain.chatId).length === 1 && sentTo(semua.chatId).length === 2);
    await worker.idle();
    expect(sentTo(lain.chatId)[0]!.text).toContain(`<b>${rahasia.number}</b>`);
    expect(sentTo(topik.chatId)).toHaveLength(1);
    expect(fake.sent().map((m) => m.text).join('\n').split(rahasia.number).length - 1).toBe(2);
  });

  it('TT dibuka: grup Service Delivery menerima ringkasan TT lengkap dengan kontak PIC', async () => {
    const sd = await addChannel({ events: ['tt_dibuka'] });
    const ticket = await newTicket(remoteA);
    await http()
      .post(`/api/tickets/${ticket.id}/tt`)
      .set('Cookie', cookies.helpdesk)
      .send({ problem: 'Modem mati, perlu teknisi', expectedStatus: 'terbuka' })
      .expect(201);

    await until(() => sentTo(sd.chatId).length === 1);
    const text = sentTo(sd.chatId)[0]!.text;
    expect(text).toContain('🟠 <b>TT untuk Service Delivery</b> · Bank Uji Anggrek');
    expect(text).toMatch(new RegExp(`TT/\\S+ \\(NPR ${ticket.number.replace(/\//g, '\\/')}\\)`));
    expect(text).toContain('Problem: Modem mati, perlu teknisi');
    expect(text).toContain('Kontak: Budi (PIC cabang) 0812-0000-1111');
  });

  it('Close dan buka lagi: lama gangguan, part, catatan; lalu NPR dibuka lagi', async () => {
    const grup = await addChannel({ events: ['npr_selesai', 'npr_dibuka_lagi'] });
    const ticket = await newTicket(remoteA);
    const occurred = new Date(ticket.occurredAt).getTime();
    await http()
      .post(`/api/tickets/${ticket.id}/tt`)
      .set('Cookie', cookies.helpdesk)
      .send({ problem: 'Perlu teknisi', expectedStatus: 'terbuka' })
      .expect(201);
    await http()
      .post(`/api/tickets/${ticket.id}/actions`)
      .set('Cookie', cookies.helpdesk)
      .field(
        'data',
        JSON.stringify({
          type: 'close',
          occurredAt: new Date(occurred + 2 * HOUR + 5 * 60_000).toISOString(),
          note: 'Modem diganti, online',
          statusTo: 'selesai',
          expectedStatus: 'eskalasi',
          replacedParts: ['modem', 'adaptor'],
        }),
      )
      .attach('lampiran', PDF, 'laporan.pdf')
      .attach('lampiran', TINY_PNG, 'foto.png')
      .expect(201);
    await until(() => sentTo(grup.chatId).length === 1);
    const closed = sentTo(grup.chatId)[0]!.text;
    expect(closed).toContain('✅ <b>NPR Selesai</b>');
    expect(closed).toMatch(/Online lagi: .+ · lama 2 jam 5 menit/);
    expect(closed).toContain('Part diganti: Modem, Adaptor');
    expect(closed).toContain('Catatan: Modem diganti, online');
    expect(closed).toContain('Ditutup oleh: Helpdesk Uji');
    expect(closed).toContain(` · TT/`);

    await new Promise((resolve) => setTimeout(resolve, CHAT_INTERVAL_MS));
    await http()
      .post(`/api/tickets/${ticket.id}/actions`)
      .set('Cookie', cookies.helpdesk)
      .send({ occurredAt: new Date().toISOString(), note: 'Down lagi', statusTo: 'dikerjakan', expectedStatus: 'selesai' })
      .expect(201);
    await until(() => sentTo(grup.chatId).length === 2);
    expect(sentTo(grup.chatId)[1]!.text).toContain('🔁 <b>NPR dibuka lagi</b>');
    expect(sentTo(grup.chatId)[1]!.text).toContain('Catatan: Down lagi');
  });

  it('tanpa grup yang cocok tidak ada yang dicatat; kejadian batal bersama tiketnya', async () => {
    await addChannel({ events: ['tt_dibuka'] });
    await newTicket(remoteA);
    expect(await deliveries()).toEqual([]);
    expect((await ds.query('SELECT count(*)::int AS n FROM notification_events'))[0].n).toBe(0);

    // Tiket ditolak (remote Dismantle): kejadian ikut batal.
    await addChannel({});
    const dismantled = await createRemote(ds, a, 'TNA-099', { status: 'dibongkar' });
    await http()
      .post('/api/tickets')
      .set('Cookie', cookies.helpdesk)
      .send({ remoteId: dismantled.id, categoryId, occurredAt: new Date().toISOString(), problem: 'Uji', confirmOpenTickets: true })
      .expect(400);
    expect(await deliveries()).toEqual([]);
  });

  it('gangguan sementara (5xx, putus) dicoba ulang dengan jeda; 429 mengikuti retry_after', async () => {
    const grup = await addChannel({});
    fake.next('sendMessage', 502, { ok: false, error_code: 502, description: 'Bad Gateway' });
    const ticket = await newTicket(remoteA);
    await until(async () => (await deliveries())[0]?.last_error !== null && (await deliveries())[0]?.last_error !== undefined);
    await worker.idle();
    let [d] = await deliveries();
    expect(d).toMatchObject({ status: 'menunggu', attempts: 1, last_error: 'Telegram sedang bermasalah (Bad Gateway).' });
    // Coba ulang pertama 30 detik kemudian.
    const wait = new Date(d!.next_attempt_at).getTime() - Date.now();
    expect(wait).toBeGreaterThan(25_000);
    expect(wait).toBeLessThanOrEqual(30_000);

    fake.next('sendMessage', 429, { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 7 } });
    await ds.query('UPDATE notification_deliveries SET next_attempt_at = now()');
    worker.kick();
    await until(async () => (await deliveries())[0]!.attempts === 2);
    await worker.idle();
    [d] = await deliveries();
    expect(d).toMatchObject({ status: 'menunggu', last_error: 'Telegram meminta jeda (batas kirim).' });
    const retryAfter = new Date(d!.next_attempt_at).getTime() - Date.now();
    expect(retryAfter).toBeGreaterThan(5_000);
    expect(retryAfter).toBeLessThanOrEqual(7_000);

    await ds.query('UPDATE notification_deliveries SET next_attempt_at = now()');
    worker.kick();
    await until(() => sentTo(grup.chatId).length === 1);
    await worker.idle();
    expect((await deliveries())[0]).toMatchObject({ status: 'terkirim', attempts: 3, last_error: null });
    expect(sentTo(grup.chatId)[0]!.text).toContain(ticket.number);
  });

  it('ditolak permanen (bot dikeluarkan): gagal dengan pesan jelas, tampil di pengaturan, bisa dikirim ulang', async () => {
    const grup = await addChannel({ name: 'NOC Shift' });
    fake.next('sendMessage', 403, { ok: false, error_code: 403, description: 'Forbidden: bot was kicked from the supergroup chat' });
    await newTicket(remoteA);
    await until(async () => (await deliveries())[0]?.status === 'gagal');
    const settings = (await asAdmin('get', '').expect(200)).body as NotificationSettingsResponse;
    expect(settings.channels.find((c) => c.id === grup.id)).toMatchObject({
      lastError: { message: 'Bot tidak lagi ada di grup ini. Tambahkan lagi bot ke grup.' },
      lastSentAt: null,
      waiting: 0,
    });

    const log = (await asAdmin('get', '/deliveries?status=gagal').expect(200)).body as NotificationDeliveriesResponse;
    expect(log.items).toHaveLength(1);
    expect(log.items[0]).toMatchObject({ event: 'npr_baru', tenant: 'Bank Uji Anggrek', channel: { name: 'NOC Shift' }, status: 'gagal' });
    await asAdmin('post', `/deliveries/${log.items[0]!.id}/retry`).expect(204);
    await until(() => sentTo(grup.chatId).length === 1);
    await worker.idle();
    const after = (await asAdmin('get', '').expect(200)).body as NotificationSettingsResponse;
    expect(after.channels[0]).toMatchObject({ lastError: null, lastSentAt: expect.any(String) });
    expect((await asAdmin('post', `/deliveries/${log.items[0]!.id}/retry`).expect(409)).body.message).toBe(
      'Hanya kiriman yang gagal yang bisa dikirim ulang.',
    );
  });

  it('grup ditingkatkan menjadi supergroup: ID chat diperbarui (tercatat di audit) lalu dikirim ke ID baru', async () => {
    const grup = await addChannel({ chatId: '-4001234567' });
    fake.next('sendMessage', 400, {
      ok: false,
      error_code: 400,
      description: 'Bad Request: group chat was upgraded to a supergroup chat',
      parameters: { migrate_to_chat_id: -1004001234567 },
    });
    await newTicket(remoteA);
    await until(() => sentTo('-1004001234567').length === 1);
    const settings = (await asAdmin('get', '').expect(200)).body as NotificationSettingsResponse;
    expect(settings.channels.find((c) => c.id === grup.id)!.chatId).toBe('-1004001234567');
    const audit = await ds.query(
      `SELECT actor FROM audit_log WHERE table_name = 'notification_channels' AND row_id = $1 ORDER BY id DESC LIMIT 1`,
      [grup.id],
    );
    expect(audit[0]?.actor).toBe('sistem:notifikasi');
  });

  it('banyak NPR sekaligus: digabung ke sedikit pesan dengan jeda per grup, tanpa ada yang terlewat', async () => {
    const grup = await addChannel({});
    const release = fake.hold('sendMessage');
    const first = await newTicket(remoteA, 'Gangguan massal 0');
    // NPR pertama sedang dikirim (ditahan Telegram tiruan) selagi NPR lain masuk.
    await until(async () => (await deliveries())[0]?.status === 'mengirim');
    const rest: TicketDetail[] = [];
    for (let i = 1; i < 13; i++) rest.push(await newTicket(remoteA, `Gangguan massal ${i}`));
    release();
    await until(async () => (await deliveries()).every((d) => d.status === 'terkirim'), 15_000);

    const texts = sentTo(grup.chatId).map((m) => m.text);
    // Pesan pertama (ditahan) berisi NPR pertama; sisanya 12 dalam 2 pesan gabungan (10 + 2).
    expect(texts.map((t) => t.split('NPR baru</b>').length - 1)).toEqual([1, 10, 2]);
    for (const ticket of [first, ...rest]) {
      expect(texts.filter((t) => t.includes(`<b>${ticket.number}</b>`)), ticket.number).toHaveLength(1);
    }
    for (const text of texts) expect(text.length).toBeLessThanOrEqual(TELEGRAM_TEXT_MAX);
  });

  it('dua pekerja bersamaan (mis. dua proses aplikasi) tidak pernah mengirim kiriman yang sama dua kali', async () => {
    const grup1 = await addChannel({});
    const grup2 = await addChannel({});
    const release = fake.hold('sendMessage');
    const tickets = [await newTicket(remoteA, 'Paralel 1')];
    for (let i = 2; i <= 6; i++) tickets.push(await newTicket(remoteA, `Paralel ${i}`));
    const other = new NotificationWorker(ds, app.get<AppConfig>(APP_CONFIG), new TelegramClient(app.get<AppConfig>(APP_CONFIG).telegramApiUrl, TOKEN), undefined);
    await ds.query('UPDATE notification_deliveries SET next_attempt_at = now() WHERE status = $1', ['menunggu']);
    const runs = [other.runOnce(), other.runOnce(), worker.runOnce()];
    release();
    await Promise.all(runs);
    await ds.query(`UPDATE notification_deliveries SET next_attempt_at = now() WHERE status = 'menunggu'`);
    await new Promise((resolve) => setTimeout(resolve, CHAT_INTERVAL_MS));
    await Promise.all([other.runOnce(), worker.runOnce()]);
    await until(async () => (await deliveries()).every((d) => d.status === 'terkirim'), 15_000);

    for (const g of [grup1, grup2]) {
      const texts = sentTo(g.chatId).map((m) => m.text).join('\n');
      for (const t of tickets) expect(texts.split(`<b>${t.number}</b>`).length - 1, `${g.name} ${t.number}`).toBe(1);
    }
  });

  it('kiriman yang tidak terkirim dalam 24 jam kedaluwarsa; bisa dikirim ulang dari Admin', async () => {
    await addChannel({});
    fake.next('sendMessage', 502, { ok: false, error_code: 502, description: 'Bad Gateway' });
    await newTicket(remoteA);
    await until(async () => (await deliveries())[0]?.attempts === 1 && (await deliveries())[0]?.status === 'menunggu');
    await worker.idle();
    await ds.query(`UPDATE notification_deliveries SET expires_at = now() - interval '1 second', next_attempt_at = now()`);
    await worker.runOnce();
    const [d] = await deliveries();
    expect(d!.status).toBe('gagal');
    expect(d!.last_error).toContain('kedaluwarsa');

    // Dikirim ulang dari Admin: mendapat batas 24 jam yang baru, lalu terkirim.
    await asAdmin('post', `/deliveries/${d!.id}/retry`).expect(204);
    await until(async () => (await deliveries())[0]!.status === 'terkirim');
  });

  it('pesan uji dari Admin; galat Telegram dijawab dengan pesan yang bisa ditindaklanjuti', async () => {
    const grup = await addChannel({ name: 'Service Delivery', events: ['tt_dibuka'], allTenants: false, tenantIds: [a.id, b.id] });
    expect((await asAdmin('post', `/channels/${grup.id}/test`).expect(200)).body).toEqual({ ok: true });
    const text = sentTo(grup.chatId)[0]!.text;
    expect(text).toContain('Grup penerima: Service Delivery');
    expect(text).toContain('Kejadian: TT dibuka (Eskalasi To SD)');
    expect(text).toContain('Customer: Bank Uji Anggrek, Bank Uji Rahasia');

    fake.next('sendMessage', 400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' });
    const res = await asAdmin('post', `/channels/${grup.id}/test`).expect(503);
    expect(res.body.message).toBe('Grup tidak ditemukan. Periksa ID chat dan pastikan bot sudah ditambahkan ke grup.');
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
  });

  it('cari grup: chat yang baru terlihat bot (tanpa chat pribadi dan grup yang bot sudah keluar)', async () => {
    const dipakai = await addChannel({ chatId: '-1002000000001' });
    fake.updates = [
      { update_id: 1, my_chat_member: { chat: { id: -1002000000001, type: 'supergroup', title: 'NOC Shift' }, new_chat_member: { status: 'member' } } },
      { update_id: 2, message: { chat: { id: -1002000000002, type: 'supergroup', title: 'Service Delivery' } } },
      { update_id: 3, message: { chat: { id: 555, type: 'private', first_name: 'Budi' } } },
      { update_id: 4, my_chat_member: { chat: { id: -1002000000003, type: 'group', title: 'Grup lama' }, new_chat_member: { status: 'member' } } },
      { update_id: 5, my_chat_member: { chat: { id: -1002000000003, type: 'group', title: 'Grup lama' }, new_chat_member: { status: 'kicked' } } },
    ];
    const res = (await asAdmin('get', '/chats').expect(200)).body as TelegramChatsResponse;
    expect(res.chats).toEqual([
      { chatId: dipakai.chatId, title: 'NOC Shift', type: 'supergroup', used: true },
      { chatId: '-1002000000002', title: 'Service Delivery', type: 'supergroup', used: false },
    ]);
  });

  it('pengaturan: nama bot dari Telegram, isian divalidasi, nama dan tujuan kembar ditolak, tanpa token di jawaban', async () => {
    const settings = (await asAdmin('get', '').expect(200)).body as NotificationSettingsResponse;
    expect(settings.bot).toEqual({ configured: true, username: 'noc_uji_bot', error: null });
    expect(settings.publicUrl).toBe('https://noc.contoh.id');
    expect(JSON.stringify(settings)).not.toContain(TOKEN);

    const bad = async (body: object) => (await asAdmin('post', '/channels').send(body).expect(400)).body as { message: string; field?: string };
    const base = { name: 'NOC', chatId: '-100123', events: ['npr_baru'], allTenants: true, tenantIds: [], active: true };
    expect(await bad({ ...base, name: ' ' })).toMatchObject({ field: 'name' });
    expect(await bad({ ...base, chatId: 'grup noc' })).toMatchObject({ field: 'chatId' });
    expect(await bad({ ...base, events: [] })).toMatchObject({ field: 'events', message: 'Pilih minimal satu kejadian.' });
    expect(await bad({ ...base, events: ['gamas'] })).toMatchObject({ field: 'events' });
    expect(await bad({ ...base, allTenants: false })).toMatchObject({ field: 'tenantIds' });
    expect(await bad({ ...base, threadId: 0 })).toMatchObject({ field: 'threadId' });
    expect(await bad({ ...base, token: 'x' })).toMatchObject({ message: 'Kolom tidak dikenal: token.' });

    const noc = (await asAdmin('post', '/channels').send(base).expect(201)).body.channel as TelegramChannel;
    expect(noc).toMatchObject({ name: 'NOC', chatId: '-100123', threadId: null, events: ['npr_baru'], allTenants: true, tenants: [] });
    expect(await bad({ ...base, name: 'noc', chatId: '-100999' })).toMatchObject({ field: 'name', message: 'Nama ini sudah dipakai grup lain.' });
    expect(await bad({ ...base, name: 'Lain' })).toMatchObject({ field: 'chatId', message: 'Grup (dan topik) ini sudah terdaftar.' });
    // Topik lain di grup yang sama boleh.
    await asAdmin('post', '/channels').send({ ...base, name: 'NOC topik', threadId: 7 }).expect(201);

    const updated = (
      await asAdmin('patch', `/channels/${noc.id}`)
        .send({ ...base, events: ['npr_selesai', 'npr_baru'], allTenants: false, tenantIds: [b.id, a.id], active: false })
        .expect(200)
    ).body.channel as TelegramChannel;
    expect(updated).toMatchObject({ events: ['npr_baru', 'npr_selesai'], allTenants: false, active: false });
    expect(updated.tenants.map((t) => t.code)).toEqual(['TNA', 'TNB']);
    await asAdmin('delete', `/channels/${noc.id}`).expect(204);
    await asAdmin('delete', `/channels/${noc.id}`).expect(404);
  });

  it('pengguna non-admin tidak bisa membuka pengaturan notifikasi', async () => {
    await http().get('/api/admin/notifications').set('Cookie', cookies.helpdesk).expect(403);
    await http().get('/api/admin/notifications').expect(401);
  });

  it('penggabungan pesan: paling banyak 10 kejadian dan 4096 karakter per pesan, urutan tetap', () => {
    const parts = Array.from({ length: 23 }, (_, i) => `pesan ${i} ${'x'.repeat(i === 5 ? 3000 : 100)}`);
    const batches = packMessages(parts);
    expect(batches.flatMap((b) => b.indexes)).toEqual(parts.map((_, i) => i));
    for (const batch of batches) {
      expect(batch.indexes.length).toBeLessThanOrEqual(10);
      expect(batch.text.length).toBeLessThanOrEqual(TELEGRAM_TEXT_MAX);
    }
  });
});
