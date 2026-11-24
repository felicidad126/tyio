import { PASSWORD_MIN_LENGTH, type Role } from '@tyio/shared';
import type { TyioEnv } from '../config.js';
import { saveUser } from '../modules/users/user-accounts.js';
import type { Seeder } from './seed.js';

// Data dummy per modul, dijalankan berurutan oleh `node dist/seed/run.js`.
// Nama bank samaran (K19, K22); sama dengan data di mockup (design/mockup/ATURAN.md §8).

export const SEED_TENANTS: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'BNA', name: 'Bank Nusa' },
  { code: 'BAD', name: 'Bank Andalas' },
  { code: 'BSL', name: 'Bank Selaras' },
  { code: 'BPT', name: 'BPD Timur' },
];

/** Domain `.example` dicadangkan untuk contoh (RFC 2606), jadi tidak pernah dikirimi email. */
export const SEED_USERS: ReadonlyArray<{
  email: string;
  name: string;
  role: Role;
  tenantCodes?: readonly string[];
}> = [
  { email: 'admin@noc.example', name: 'Admin NOC', role: 'admin' },
  { email: 'dewi@noc.example', name: 'Dewi A.', role: 'l1' },
  // Contoh akses terbatas (K26): hanya dua customer.
  { email: 'rudi@noc.example', name: 'Rudi H.', role: 'l1', tenantCodes: ['BNA', 'BAD'] },
  { email: 'arif@noc.example', name: 'Arif S.', role: 'l2' },
  { email: 'sari@noc.example', name: 'Sari P.', role: 'l2' },
];

/**
 * Data master dummy, sama untuk setiap customer seed. Kategori mengikuti grafik mockup
 * (ATURAN.md §7); jarkom VSAT dan VPN mengikuti nomor NPR di mockup.
 */
export const SEED_MASTER = {
  kategori: ['Remote Down', 'Corrective', 'Preventive'],
  system: ['SNMP NOC', 'NMS VSAT'],
  jarkom: [
    { code: 'VSAT', name: 'VSAT' },
    { code: 'VPN', name: 'VPN IP' },
  ],
} as const;

/** Kata sandi semua akun dummy di lingkungan development dan test. Bukan rahasia. */
export const DEV_SEED_PASSWORD = 'sandi-dev-tyio';

/**
 * Kata sandi akun dummy: dari SEED_USER_PASSWORD bila diisi; bawaan hanya di development
 * dan test. Staging wajib mengisinya, karena staging bisa dibuka orang lain.
 */
export function seedUserPassword(env: TyioEnv, source: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = source.SEED_USER_PASSWORD;
  if (fromEnv) {
    if (fromEnv.length < PASSWORD_MIN_LENGTH) {
      throw new Error(`SEED_USER_PASSWORD minimal ${PASSWORD_MIN_LENGTH} karakter.`);
    }
    return fromEnv;
  }
  if (env === 'development' || env === 'test') return DEV_SEED_PASSWORD;
  throw new Error(
    `SEED_USER_PASSWORD wajib diisi (minimal ${PASSWORD_MIN_LENGTH} karakter) untuk seed pengguna di ${env}.`,
  );
}

/** `userPassword` dibaca saat seeder pengguna berjalan, bukan saat daftar disusun. */
export function createSeeders(options: { userPassword: () => string }): Seeder[] {
  return [
    {
      name: 'tenant',
      run: async (manager) => {
        for (const tenant of SEED_TENANTS) {
          await manager.query(
            `INSERT INTO tenants (code, name) VALUES ($1, $2)
             ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, active = true, updated_at = now()`,
            [tenant.code, tenant.name],
          );
        }
      },
    },
    {
      name: 'master',
      run: async (manager) => {
        // Nilai yang sudah ada diaktifkan lagi; nama dibandingkan tanpa huruf besar/kecil.
        const upsert = (table: string, columns: string, values: unknown[]) =>
          manager.query(
            `INSERT INTO ${table} (tenant_id, ${columns})
             SELECT id, ${values.slice(1).map((_, i) => `$${i + 2}`).join(', ')} FROM tenants WHERE code = $1
             ON CONFLICT (tenant_id, lower(name)) DO UPDATE SET active = true, updated_at = now()`,
            values,
          );
        for (const tenant of SEED_TENANTS) {
          for (const name of SEED_MASTER.kategori) {
            await upsert('master_categories', 'name', [tenant.code, name]);
          }
          for (const name of SEED_MASTER.system) {
            await upsert('master_systems', 'name', [tenant.code, name]);
          }
          for (const network of SEED_MASTER.jarkom) {
            await upsert('master_networks', 'name, code', [tenant.code, network.name, network.code]);
          }
        }
      },
    },
    {
      name: 'remote',
      run: async (manager) => {
        // Remote yang sudah ada tidak ditimpa: admin mungkin sudah mengubahnya di staging.
        await manager.query(
          `INSERT INTO remotes (tenant_id, code, name, network_id, time_zone, address, city, province,
                                kanwil, kanca, ip_snmp, ip_lan, manager, online_since, contacts, latitude, longitude)
           SELECT t.id, x.code, x.name, n.id, x.time_zone, x.address, x.city, x.province,
                  x.kanwil, x.kanca, x.ip_snmp, x.ip_lan, x.manager, x.online_since, x.contacts, x.latitude, x.longitude
           FROM jsonb_to_recordset($1::jsonb) AS x(
                  tenant_code text, network_code text, code text, name text, time_zone text,
                  address text, city text, province text, kanwil text, kanca text,
                  ip_snmp inet, ip_lan inet, manager text, online_since date, contacts jsonb,
                  latitude numeric, longitude numeric)
           JOIN tenants t ON t.code = x.tenant_code
           JOIN master_networks n ON n.tenant_id = t.id AND n.code = x.network_code
           ON CONFLICT (tenant_id, code) DO NOTHING`,
          [JSON.stringify(seedRemotes())],
        );
      },
    },
    {
      name: 'pengguna',
      run: async (manager) => {
        const password = options.userPassword();
        for (const user of SEED_USERS) {
          await saveUser(manager, { ...user, password }, { replaceExisting: true });
        }
      },
    },
    {
      name: 'npr',
      run: async (manager) => {
        // Hanya untuk customer yang belum punya NPR, agar seed aman diulang. Nomor dibuat
        // trigger database seperti NPR dari API; yang lebih lama disisipkan lebih dulu.
        await manager.query(
          `INSERT INTO tickets (tenant_id, remote_id, network_id, category_id, system_id, description,
                                started_at, created_by)
           SELECT t.id, r.id, r.network_id, c.id, s.id, x.description,
                  now() - make_interval(mins => x.minutes_ago), u.id
           FROM jsonb_to_recordset($1::jsonb) AS x(
                  tenant_code text, remote_code text, category text, system text, description text,
                  minutes_ago int)
           JOIN tenants t ON t.code = x.tenant_code
           JOIN remotes r ON r.tenant_id = t.id AND r.code = x.remote_code
           JOIN master_categories c ON c.tenant_id = t.id AND lower(c.name) = lower(x.category)
           JOIN master_systems s ON s.tenant_id = t.id AND lower(s.name) = lower(x.system)
           JOIN users u ON u.email = $2
           WHERE NOT EXISTS (SELECT 1 FROM tickets tk WHERE tk.tenant_id = t.id)
           ORDER BY x.minutes_ago DESC`,
          [JSON.stringify(seedTickets()), SEED_TICKET_AUTHOR],
        );
        // Contoh linimasa di NPR remote mockup (DetailTiket), hanya bila baru berisi entri awal.
        await manager.query(
          `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to,
                                       customer_ticket_number, created_by)
           SELECT tk.tenant_id, tk.id, x.kind, x.note, now(),
                  x.status_from, x.status_to, x.customer_ticket_number, tk.created_by
           FROM jsonb_to_recordset($1::jsonb) AS x(
                  kind text, note text, status_from text, status_to text,
                  customer_ticket_number text, ord int)
           CROSS JOIN tickets tk JOIN remotes r ON r.id = tk.remote_id
           WHERE r.code = 'BNA-MKS-0217'
             AND (SELECT count(*) FROM ticket_actions a WHERE a.ticket_id = tk.id) = 1
           ORDER BY x.ord`,
          [JSON.stringify(SEED_TIMELINE.map((action, ord) => ({ ...action, ord })))],
        );
        // Contoh TT ke SD di NPR yang sama (mockup DetailTiket), hanya bila belum ada TT.
        await manager.query(
          `INSERT INTO trouble_tickets (tenant_id, ticket_id, remote_id, network_id, problem, contact, created_by)
           SELECT tk.tenant_id, tk.id, tk.remote_id, tk.network_id, $1, $2, tk.created_by
             FROM tickets tk JOIN remotes r ON r.id = tk.remote_id
            WHERE r.code = 'BNA-MKS-0217' AND tk.status <> 'ditutup'
              AND NOT EXISTS (SELECT 1 FROM trouble_tickets tt WHERE tt.ticket_id = tk.id)`,
          [
            'Modem VSAT tidak sinkron setelah dinyalakan ulang (Rx lock hilang). Perlu cek BUC/LNB dan kabel IFL di lokasi.',
            'Hendra, Kepala Unit · +62 811-0000-0217',
          ],
        );
        // Riwayat NPR yang sudah ditutup di remote yang sama (mockup DetailTiket "Riwayat
        // remote", langkah 1.6), hanya bila remote itu belum punya NPR Ditutup. Terlama dulu, agar
        // nomornya berurutan; setiap NPR pulih lalu ditutup lewat linimasa seperti dari layar.
        const [history] = (await manager.query(
          `SELECT EXISTS (SELECT 1 FROM tickets tk JOIN remotes r ON r.id = tk.remote_id
                           JOIN tenants t ON t.id = r.tenant_id
                          WHERE t.code = 'BNA' AND r.code = 'BNA-MKS-0217' AND tk.status = 'ditutup') AS present`,
        )) as Array<{ present: boolean }>;
        for (const item of history?.present ? [] : SEED_CLOSED_HISTORY) {
          const [created] = (await manager.query(
            `INSERT INTO tickets (tenant_id, remote_id, network_id, category_id, system_id, description,
                                  started_at, created_at, created_by)
             SELECT t.id, r.id, r.network_id, c.id, s.id, $1,
                    now() - make_interval(mins => $2), now() - make_interval(mins => $2 - 5), u.id
               FROM tenants t
               JOIN remotes r ON r.tenant_id = t.id AND r.code = 'BNA-MKS-0217'
               JOIN master_categories c ON c.tenant_id = t.id AND lower(c.name) = lower($3)
               JOIN master_systems s ON s.tenant_id = t.id AND lower(s.name) = lower($4)
               JOIN users u ON u.email = $5
              WHERE t.code = 'BNA'
             RETURNING id`,
            [item.description, item.minutes_ago, item.category, item.system, SEED_TICKET_AUTHOR],
          )) as Array<{ id: string }>;
          if (!created) continue;
          await manager.query(
            `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to,
                                         created_by, created_at)
             SELECT tenant_id, id, 'catatan', $2, started_at + make_interval(mins => $3), 'terbuka', 'pulih',
                    created_by, started_at + make_interval(mins => $3)
               FROM tickets WHERE id = $1`,
            [created.id, item.recovered_note, item.duration_minutes],
          );
          await manager.query(
            `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to,
                                         close_cause, created_by, created_at)
             SELECT tk.tenant_id, tk.id, 'tutup', $2, tk.started_at + make_interval(mins => $3 + 10), 'pulih', 'ditutup',
                    $4, u.id, tk.started_at + make_interval(mins => $3 + 10)
               FROM tickets tk JOIN users u ON u.email = $5 WHERE tk.id = $1`,
            [created.id, item.resolution, item.duration_minutes, item.cause, item.closed_by],
          );
        }
        // NPR Ditutup yang tersebar dalam 13 hari terakhir (langkah 2.1), agar tren harian dan
        // remote paling sering bermasalah di Overview bisa dicoba di staging. Sekali saja: tidak
        // ditambah lagi bila salah satu remote tren sudah punya NPR Ditutup.
        const recent = seedRecentClosed();
        const [trend] = (await manager.query(
          `SELECT EXISTS (SELECT 1 FROM tickets tk JOIN remotes r ON r.id = tk.remote_id
                          WHERE r.code = ANY($1::text[]) AND tk.status = 'ditutup') AS present`,
          [[...new Set(recent.map((item) => item.remote_code))]],
        )) as Array<{ present: boolean }>;
        for (const item of trend?.present ? [] : recent) {
          const [created] = (await manager.query(
            `INSERT INTO tickets (tenant_id, remote_id, network_id, category_id, system_id, description,
                                  started_at, created_at, created_by)
             SELECT t.id, r.id, r.network_id, c.id, s.id, $1, at.created_at - interval '5 minutes', at.created_at, u.id
               FROM tenants t
               JOIN remotes r ON r.tenant_id = t.id AND r.code = $2
               JOIN master_categories c ON c.tenant_id = t.id AND lower(c.name) = lower($3)
               JOIN master_systems s ON s.tenant_id = t.id AND lower(s.name) = lower($4)
               JOIN users u ON u.email = $7
              CROSS JOIN LATERAL (
                SELECT (((now() AT TIME ZONE 'Asia/Jakarta')::date - $5::int)::timestamp + make_interval(mins => $6))
                         AT TIME ZONE 'Asia/Jakarta' AS created_at) at
              WHERE t.code = $8
             RETURNING id`,
            [
              item.description,
              item.remote_code,
              item.category,
              item.system,
              item.days_ago,
              item.minute_of_day,
              SEED_TICKET_AUTHOR,
              item.tenant_code,
            ],
          )) as Array<{ id: string }>;
          if (!created) continue;
          await manager.query(
            `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to,
                                         created_by, created_at)
             SELECT tenant_id, id, 'catatan', 'Remote up.', started_at + make_interval(mins => $2), 'terbuka', 'pulih',
                    created_by, started_at + make_interval(mins => $2)
               FROM tickets WHERE id = $1`,
            [created.id, item.duration_minutes],
          );
          await manager.query(
            `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to,
                                         close_cause, created_by, created_at)
             SELECT tenant_id, id, 'tutup', $2, started_at + make_interval(mins => $3 + 10), 'pulih', 'ditutup',
                    $4, created_by, started_at + make_interval(mins => $3 + 10)
               FROM tickets WHERE id = $1`,
            [created.id, item.resolution, item.duration_minutes, item.cause],
          );
        }
      },
    },
  ];
}

const RECENT_KINDS = [
  {
    category: 'Remote Down',
    system: 'SNMP NOC',
    description: 'Ping gagal 100% dari NOC',
    cause: 'listrik',
    resolution: 'Listrik padam di lokasi; remote pulih setelah listrik menyala.',
  },
  {
    category: 'Remote Down',
    system: 'SNMP NOC',
    description: 'Remote tidak terjangkau, hub normal',
    cause: 'link',
    resolution: 'Gangguan link jarkom; pulih setelah provider memulihkan jalur.',
  },
  {
    category: 'Corrective',
    system: 'NMS VSAT',
    description: 'Modem sering putus, sinyal turun',
    cause: 'cuaca',
    resolution: 'Hujan deras di lokasi; sinyal kembali normal setelah cuaca membaik.',
  },
  {
    category: 'Remote Down',
    system: 'NMS VSAT',
    description: 'Modem hang, ping putus-sambung',
    cause: 'perangkat',
    resolution: 'Modem dinyalakan ulang oleh petugas cabang; remote stabil.',
  },
  {
    category: 'Preventive',
    system: 'NMS VSAT',
    description: 'Pemeliharaan terjadwal perangkat VSAT',
    cause: 'lainnya',
    resolution: 'Pemeliharaan selesai sesuai jadwal; remote up.',
  },
] as const;

/**
 * NPR Ditutup dummy untuk tren Overview (langkah 2.1): per customer, di remote ke-3 sampai
 * ke-6 (dua pertama punya NPR terbuka), pada sekitar dua dari tiga hari dalam 13 hari terakhir,
 * jam 08–20 WIB. Tetap sama setiap kali dibangkitkan; hari dihitung dari saat seed berjalan.
 */
export function seedRecentClosed(): Array<{
  tenant_code: string;
  remote_code: string;
  category: string;
  system: string;
  description: string;
  cause: string;
  resolution: string;
  days_ago: number;
  minute_of_day: number;
  duration_minutes: number;
}> {
  const remotes = seedRemotes();
  const items: ReturnType<typeof seedRecentClosed> = [];
  SEED_TENANTS.forEach((tenant, tenantIndex) => {
    const own = remotes.filter((remote) => remote.tenant_code === tenant.code).slice(2, 6);
    for (let day = 13; day >= 1; day -= 1) {
      if ((day + tenantIndex) % 3 === 0) continue;
      // Remote pertama lebih sering, agar "paling sering bermasalah" punya urutan yang jelas.
      const remote = own[(day + tenantIndex) % 2 === 0 ? 0 : (day % (own.length - 1)) + 1] ?? own[0];
      const kind = RECENT_KINDS[(day * 2 + tenantIndex) % RECENT_KINDS.length] ?? RECENT_KINDS[0];
      items.push({
        tenant_code: tenant.code,
        remote_code: String(remote?.code),
        ...kind,
        days_ago: day,
        minute_of_day: (8 + ((day * 5 + tenantIndex * 3) % 12)) * 60 + ((day * 17) % 60),
        duration_minutes: 40 + ((day * 37 + tenantIndex * 11) % 200),
      });
    }
  });
  return items;
}

/**
 * NPR yang sudah ditutup di BNA-MKS-0217 (mockup DetailTiket "Riwayat remote"), terlama dulu:
 * mulai gangguan sekian menit lalu, lama sampai pulih, penyebab (T98), dan penutupnya.
 */
export const SEED_CLOSED_HISTORY = [
  {
    description: 'Ping gagal 100%, LAN cabang tidak terjangkau',
    category: 'Remote Down',
    system: 'SNMP NOC',
    minutes_ago: 33 * 24 * 60,
    duration_minutes: 105,
    recovered_note: 'Remote up setelah kabel LAN dipasang ulang petugas cabang.',
    cause: 'perangkat',
    resolution: 'Kabel LAN longgar di switch cabang; dipasang ulang oleh petugas, remote stabil.',
    closed_by: 'dewi@noc.example',
  },
  {
    description: 'Ping gagal 100%, beberapa remote Makassar ikut turun',
    category: 'Remote Down',
    system: 'SNMP NOC',
    minutes_ago: 26 * 24 * 60,
    duration_minutes: 185,
    recovered_note: 'Listrik gedung kembali menyala, remote up.',
    cause: 'listrik',
    resolution: 'Listrik padam di gedung (pemadaman PLN); remote pulih sendiri setelah listrik menyala.',
    closed_by: 'dewi@noc.example',
  },
  {
    description: 'Modem hang, ping putus-sambung',
    category: 'Corrective',
    system: 'NMS VSAT',
    minutes_ago: 17 * 24 * 60,
    duration_minutes: 100,
    recovered_note: 'Modem dinyalakan ulang petugas cabang, remote up.',
    cause: 'perangkat',
    resolution: 'Modem hang; pulih setelah dinyalakan ulang. Disarankan pemeriksaan adaptor pada kunjungan berikutnya.',
    closed_by: 'arif@noc.example',
  },
] as const;

/** Tindakan contoh untuk NPR BNA-MKS-0217, terlama dulu (mockup DetailTiket). */
const SEED_TIMELINE = [
  {
    kind: 'catatan',
    note: 'Alert benar gangguan, NPR diambil.',
    status_from: 'terbuka',
    status_to: 'dikerjakan',
    customer_ticket_number: null,
  },
  {
    kind: 'cek_lokasi',
    note: 'Menghubungi PIC cabang, Hendra (Kepala Unit). Listrik di lokasi menyala; petugas akan menyalakan ulang modem.',
    status_from: null,
    status_to: null,
    customer_ticket_number: 'INC-88213',
  },
];

/** Pembuat NPR dummy (L1 di mockup). */
export const SEED_TICKET_AUTHOR = 'dewi@noc.example';

/** NPR terbuka dummy: dua per customer seed, ditambah NPR di remote contoh mockup. */
export function seedTickets(): Array<Record<string, unknown>> {
  const tickets: Array<Record<string, unknown>> = [];
  const remotes = seedRemotes();
  SEED_TENANTS.forEach((tenant, tenantIndex) => {
    remotes
      .filter((remote) => remote.tenant_code === tenant.code)
      .slice(0, 2)
      .forEach((remote, index) => {
        tickets.push({
          tenant_code: tenant.code,
          remote_code: remote.code,
          category: index === 0 ? 'Remote Down' : 'Corrective',
          system: index === 0 ? 'SNMP NOC' : 'NMS VSAT',
          description:
            index === 0 ? 'Ping gagal 100% dari NOC, PIC cabang belum bisa dihubungi' : 'Modem sering putus sejak pagi',
          minutes_ago: 30 + tenantIndex * 15 + index * 90,
        });
      });
  });
  tickets.push({
    tenant_code: 'BNA',
    remote_code: 'BNA-MKS-0217',
    category: 'Remote Down',
    system: 'SNMP NOC',
    description: 'Ping gagal 100%, remote lain di hub normal',
    minutes_ago: 46,
  });
  return tickets;
}

/** Kota contoh per wilayah, dengan zona waktunya (mockup: Sulawesi, Sumatera, Kalimantan, Papua). */
// `at`: titik di daratan dekat kota (lintang, bujur) untuk peta remote (langkah 2.3).
const SEED_CITIES = [
  { city: 'Makassar', province: 'Sulawesi Selatan', zone: 'WITA', kanwil: 'Kanwil Makassar', at: [-5.15, 119.47] },
  { city: 'Palu', province: 'Sulawesi Tengah', zone: 'WITA', kanwil: 'Kanwil Makassar', at: [-0.95, 119.9] },
  { city: 'Medan', province: 'Sumatera Utara', zone: 'WIB', kanwil: 'Kanwil Medan', at: [3.56, 98.67] },
  { city: 'Padang', province: 'Sumatera Barat', zone: 'WIB', kanwil: 'Kanwil Padang', at: [-0.92, 100.44] },
  { city: 'Balikpapan', province: 'Kalimantan Timur', zone: 'WITA', kanwil: 'Kanwil Balikpapan', at: [-1.2, 116.9] },
  { city: 'Jayapura', province: 'Papua', zone: 'WIT', kanwil: 'Kanwil Jayapura', at: [-2.58, 140.66] },
] as const;

/** Setiap remote seed ke-N tidak punya koordinat, agar peta menampilkan jumlahnya (T143). */
export const SEED_REMOTES_WITHOUT_COORDINATES_EVERY = 20;

/** Banyaknya remote dummy per customer seed. */
export const SEED_REMOTES_PER_TENANT = 60;

/**
 * Remote dummy yang sama setiap kali seed dijalankan. BNA-MKS-0217 adalah remote contoh di
 * mockup (DetailTiket); sisanya dibangkitkan berurutan.
 */
export function seedRemotes(): Array<Record<string, unknown>> {
  const remotes: Array<Record<string, unknown>> = [];
  SEED_TENANTS.forEach((tenant, tenantIndex) => {
    for (let i = 1; i <= SEED_REMOTES_PER_TENANT; i++) {
      const place = SEED_CITIES[(i + tenantIndex) % SEED_CITIES.length] ?? SEED_CITIES[0];
      const number = String(i * 7).padStart(4, '0');
      const cityCode = place.city.slice(0, 3).toUpperCase();
      const kanca = `KCP ${place.city} ${i}`;
      // Sebaran tetap ±0,06° (±7 km) di sekitar kota: sama setiap kali seed dijalankan.
      const located = i % SEED_REMOTES_WITHOUT_COORDINATES_EVERY !== 0;
      const spread = (seed: number) => (((seed % 13) + 13) % 13) * 0.01 - 0.06;
      remotes.push({
        tenant_code: tenant.code,
        network_code: i % 4 === 0 ? 'VPN' : 'VSAT',
        code: `${tenant.code}-${cityCode}-${number}`,
        name: `ATM ${kanca}`,
        time_zone: place.zone,
        address: `Jl. Contoh No. ${i}, ${place.city}`,
        city: place.city,
        province: place.province,
        kanwil: place.kanwil,
        kanca,
        ip_snmp: `10.${40 + tenantIndex}.${i}.22`,
        ip_lan: `192.168.${i}.1`,
        manager: `${tenant.name} ${kanca}`,
        online_since: `20${String(18 + (i % 7)).padStart(2, '0')}-0${(i % 9) + 1}-1${i % 9}`,
        contacts: [{ name: `PIC ${kanca}`, role: 'Kepala Unit', phone: `+62 811-0000-${number}` }],
        latitude: located ? round6(place.at[0] + spread(i * 37 + tenantIndex * 11)) : null,
        longitude: located ? round6(place.at[1] + spread(i * 53 + tenantIndex * 7)) : null,
      });
    }
  });
  remotes.push({
    tenant_code: 'BNA',
    network_code: 'VSAT',
    code: 'BNA-MKS-0217',
    name: 'ATM KCP Pasar Sentral',
    time_zone: 'WITA',
    address: 'Jl. Sulawesi No. 12, Makassar, Sulawesi Selatan',
    city: 'Makassar',
    province: 'Sulawesi Selatan',
    kanwil: 'Kanwil Makassar',
    kanca: 'KCP Pasar Sentral',
    ip_snmp: '10.41.17.22',
    ip_lan: '192.168.217.1',
    manager: 'Bank Nusa KCP Pasar Sentral',
    online_since: '2023-03-12',
    contacts: [{ name: 'Hendra', role: 'Kepala Unit', phone: '+62 811-0000-0217' }],
    latitude: -5.1349,
    longitude: 119.4128,
  });
  return remotes;
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;
