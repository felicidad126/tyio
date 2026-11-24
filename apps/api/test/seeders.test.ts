import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dataSourceOptions } from '../src/db/options.js';
import { verifyPassword } from '../src/modules/users/password.js';
import {
  createSeeders,
  DEV_SEED_PASSWORD,
  SEED_CLOSED_HISTORY,
  SEED_MASTER,
  SEED_REMOTES_PER_TENANT,
  SEED_TENANTS,
  SEED_USERS,
  seedRecentClosed,
  seedTickets,
  seedUserPassword,
} from '../src/seed/seeders.js';
import { seed } from '../src/seed/seed.js';
import { testConfig } from './test-config.js';

describe('kata sandi akun dummy', () => {
  it('memakai bawaan yang diketahui hanya di development dan test', () => {
    expect(seedUserPassword('development', {})).toBe(DEV_SEED_PASSWORD);
    expect(seedUserPassword('test', {})).toBe(DEV_SEED_PASSWORD);
  });

  it('mewajibkan SEED_USER_PASSWORD di staging', () => {
    expect(() => seedUserPassword('staging', {})).toThrow(/SEED_USER_PASSWORD wajib/);
    expect(seedUserPassword('staging', { SEED_USER_PASSWORD: 'sandi-staging-panjang' })).toBe(
      'sandi-staging-panjang',
    );
  });

  it('menolak SEED_USER_PASSWORD yang terlalu pendek', () => {
    expect(() => seedUserPassword('development', { SEED_USER_PASSWORD: 'pendek' })).toThrow(
      /minimal 12/,
    );
  });
});

describe('seeder tenant dan pengguna', () => {
  const dataSource = new DataSource(dataSourceOptions(testConfig().databaseUrl));

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('bisa dijalankan berulang dan membuat akun sesuai daftar', async () => {
    // Satu-satunya uji yang menyentuh email dan kode tetap dari daftar seed;
    // dijalankan dua kali untuk membuktikan seed aman diulang.
    const seeders = createSeeders({ userPassword: () => DEV_SEED_PASSWORD });
    await seed(dataSource, 'test', seeders);
    await seed(dataSource, 'test', seeders);

    const tenants: Array<{ code: string; name: string }> = await dataSource.query(
      'SELECT code, name FROM tenants WHERE code = ANY($1) ORDER BY code',
      [SEED_TENANTS.map((tenant) => tenant.code)],
    );
    expect(tenants).toEqual(
      [...SEED_TENANTS].sort((a, b) => a.code.localeCompare(b.code)).map(({ code, name }) => ({ code, name })),
    );

    const users: Array<{ email: string; role: string; all_tenants: boolean; password_hash: string; codes: string[] }> =
      await dataSource.query(
        `SELECT u.email, u.role, u.all_tenants, u.password_hash,
                coalesce(array_agg(t.code ORDER BY t.code) FILTER (WHERE t.code IS NOT NULL), '{}') AS codes
         FROM users u
         LEFT JOIN user_tenants ut ON ut.user_id = u.id
         LEFT JOIN tenants t ON t.id = ut.tenant_id
         WHERE u.email = ANY($1)
         GROUP BY u.id
         ORDER BY u.email`,
        [SEED_USERS.map((user) => user.email)],
      );
    expect(users).toHaveLength(SEED_USERS.length);

    const rudi = users.find((user) => user.email === 'rudi@noc.example');
    expect(rudi).toMatchObject({ role: 'l1', all_tenants: false, codes: ['BAD', 'BNA'] });
    const admin = users.find((user) => user.email === 'admin@noc.example');
    expect(admin).toMatchObject({ role: 'admin', all_tenants: true, codes: [] });
    expect(await verifyPassword(DEV_SEED_PASSWORD, admin?.password_hash ?? '')).toBe(true);

    // Data master: setiap customer seed punya daftar yang sama, sekali saja walau seed diulang.
    const master: Array<{ code: string; kategori: string[]; system: string[]; jarkom: string[] }> =
      await dataSource.query(
        `SELECT t.code,
                (SELECT array_agg(name ORDER BY name) FROM master_categories WHERE tenant_id = t.id) AS kategori,
                (SELECT array_agg(name ORDER BY name) FROM master_systems WHERE tenant_id = t.id) AS system,
                (SELECT array_agg(code || ':' || name ORDER BY code) FROM master_networks WHERE tenant_id = t.id) AS jarkom
         FROM tenants t WHERE t.code = ANY($1) ORDER BY t.code`,
        [SEED_TENANTS.map((tenant) => tenant.code)],
      );
    expect(master).toHaveLength(SEED_TENANTS.length);
    for (const row of master) {
      expect(row).toEqual({
        code: row.code,
        kategori: [...SEED_MASTER.kategori].sort(),
        system: [...SEED_MASTER.system].sort(),
        jarkom: SEED_MASTER.jarkom.map((network) => `${network.code}:${network.name}`).sort(),
      });
    }

    // Remote dummy: jumlahnya tetap walau seed diulang; remote contoh mockup ada.
    const remotes: Array<{ code: string; count: number }> = await dataSource.query(
      `SELECT t.code, count(r.id)::int AS count FROM tenants t LEFT JOIN remotes r ON r.tenant_id = t.id
       WHERE t.code = ANY($1) GROUP BY t.code ORDER BY t.code`,
      [SEED_TENANTS.map((tenant) => tenant.code)],
    );
    expect(remotes).toEqual(
      SEED_TENANTS.map((tenant) => ({
        code: tenant.code,
        count: SEED_REMOTES_PER_TENANT + (tenant.code === 'BNA' ? 1 : 0),
      })).sort((a, b) => a.code.localeCompare(b.code)),
    );
    const [sample] = (await dataSource.query(
      `SELECT r.name, n.code AS network, r.time_zone FROM remotes r JOIN master_networks n ON n.id = r.network_id
       WHERE r.code = 'BNA-MKS-0217'`,
    )) as Array<{ name: string; network: string; time_zone: string }>;
    expect(sample).toEqual({ name: 'ATM KCP Pasar Sentral', network: 'VSAT', time_zone: 'WITA' });

    // NPR dummy: sekali saja walau seed diulang, bernomor dari trigger, dibuat Dewi (L1).
    const tickets: Array<{ code: string; count: number }> = await dataSource.query(
      `SELECT t.code, count(tk.id)::int AS count FROM tenants t LEFT JOIN tickets tk ON tk.tenant_id = t.id
       WHERE t.code = ANY($1) GROUP BY t.code ORDER BY t.code`,
      [SEED_TENANTS.map((tenant) => tenant.code)],
    );
    expect(tickets).toEqual(
      SEED_TENANTS.map((tenant) => ({
        code: tenant.code,
        count:
          seedTickets().filter((ticket) => ticket.tenant_code === tenant.code).length +
          (tenant.code === 'BNA' ? SEED_CLOSED_HISTORY.length : 0) +
          seedRecentClosed().filter((ticket) => ticket.tenant_code === tenant.code).length,
      })).sort((a, b) => a.code.localeCompare(b.code)),
    );
    const [ticket] = (await dataSource.query(
      `SELECT tk.number, tk.status, tk.customer_ticket_number, u.email,
              (SELECT array_agg(a.kind ORDER BY a.seq) FROM ticket_actions a WHERE a.ticket_id = tk.id) AS kinds
         FROM tickets tk JOIN remotes r ON r.id = tk.remote_id
         JOIN users u ON u.id = tk.created_by WHERE r.code = 'BNA-MKS-0217' AND tk.status <> 'ditutup'`,
    )) as Array<{ number: string; status: string; email: string }>;
    // Contoh linimasa mockup (1.4) dan TT (1.5b): sekali saja walau seed diulang.
    expect(ticket).toMatchObject({
      status: 'dikerjakan',
      customer_ticket_number: 'INC-88213',
      email: 'dewi@noc.example',
      kinds: ['dibuat', 'catatan', 'cek_lokasi', 'tt_dibuat'],
    });
    expect(ticket?.number).toMatch(/^NPR\/VSAT\/BNA\/\d{4}\/\d{2}\/\d{4}$/);

    // Riwayat NPR Ditutup di remote yang sama (1.6): sekali saja, penyebab dan penyelesaian lewat
    // entri tutup, terlama dulu.
    const closed = (await dataSource.query(
      `SELECT tk.close_cause, tk.resolution, u.email AS closed_by,
              (SELECT array_agg(a.kind ORDER BY a.seq) FROM ticket_actions a WHERE a.ticket_id = tk.id) AS kinds
         FROM tickets tk JOIN remotes r ON r.id = tk.remote_id JOIN users u ON u.id = tk.closed_by
        WHERE r.code = 'BNA-MKS-0217' AND tk.status = 'ditutup' ORDER BY tk.started_at`,
    )) as Array<Record<string, unknown>>;
    expect(closed).toEqual(
      SEED_CLOSED_HISTORY.map((item) => ({
        close_cause: item.cause,
        resolution: item.resolution,
        closed_by: item.closed_by,
        kinds: ['dibuat', 'catatan', 'tutup'],
      })),
    );

    // NPR Ditutup tersebar dalam 13 hari terakhir untuk tren Overview (2.1): semuanya Ditutup
    // lewat entri tutup, dibuat 1–13 hari lalu menurut WIB, tidak di remote yang punya NPR terbuka.
    const recent = seedRecentClosed();
    expect(recent.length).toBeGreaterThan(20);
    const [spread] = (await dataSource.query(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE tk.status = 'ditutup' AND tk.closed_at IS NOT NULL)::int AS closed,
              min((now() AT TIME ZONE 'Asia/Jakarta')::date - (tk.created_at AT TIME ZONE 'Asia/Jakarta')::date) AS min_days,
              max((now() AT TIME ZONE 'Asia/Jakarta')::date - (tk.created_at AT TIME ZONE 'Asia/Jakarta')::date) AS max_days,
              count(DISTINCT (tk.created_at AT TIME ZONE 'Asia/Jakarta')::date)::int AS days,
              bool_or(EXISTS (SELECT 1 FROM tickets o WHERE o.remote_id = tk.remote_id AND o.status <> 'ditutup')) AS open_remote
         FROM tickets tk JOIN remotes r ON r.id = tk.remote_id
        WHERE r.code = ANY($1::text[])`,
      [[...new Set(recent.map((item) => item.remote_code))]],
    )) as Array<{ n: number; closed: number; min_days: number; max_days: number; days: number; open_remote: boolean }>;
    expect(spread).toEqual({ n: recent.length, closed: recent.length, min_days: 1, max_days: 13, days: 13, open_remote: false });
  });

  it('tidak membaca kata sandi bila seeder pengguna tidak dijalankan', () => {
    let read = false;
    createSeeders({
      userPassword: () => {
        read = true;
        return DEV_SEED_PASSWORD;
      },
    });

    expect(read).toBe(false);
  });
});
