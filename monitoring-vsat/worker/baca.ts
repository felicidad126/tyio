// Endpoint baca data. Setiap halaman hanya mengambil data yang ditampilkan,
// dan isi lampiran baru dikirim saat tautannya dibuka (K-01).
import { tanggalWIB } from "../shared/waktu.js";
import { ApiError } from "./galat.js";

type DB = D1Database;
type Nilai = string | number;

const KONDISI_AKTIF = "n.status <> 'CLOSED'";
// Kondisi daftar NPR yang dipakai kartu dan tautan Dashboard.
const KONDISI: Record<string, string> = {
  aktif: KONDISI_AKTIF,
  kritis: `${KONDISI_AKTIF} AND julianday('now') - julianday(n.started_at) > 2`,
  aging: `${KONDISI_AKTIF} AND julianday('now') - julianday(n.started_at) BETWEEN 1 AND 2`,
  menunggu_report: `${KONDISI_AKTIF} AND t.id IS NOT NULL AND t.report = ''`,
  pending_tm: `${KONDISI_AKTIF} AND n.pending_by = 'TM'`,
  pending_customer: `${KONDISI_AKTIF} AND n.pending_by = 'Customer'`,
  belum_kategori: `${KONDISI_AKTIF} AND n.pending_by = ''`,
};

const KOLOM_NPR = `n.id, n.number, n.remote_id, n.remote_status, n.status, n.pending_by,
  n.started_at, n.online_at, n.closed_at, n.last_action, u.full_name AS created_by,
  r.site_id, r.location, r.jarkom, r.customer_id, c.name AS customer_name,
  t.number AS ticket_number, t.report AS ticket_report`;
const SUMBER_NPR = `FROM nprs n
  JOIN remotes r ON r.id = n.remote_id
  JOIN customers c ON c.id = r.customer_id
  LEFT JOIN tickets t ON t.npr_id = n.id
  LEFT JOIN users u ON u.id = n.user_id`;

function angka(nilai: string | null, awal: number, min: number, max: number) {
  const n = Number(nilai ?? awal);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : awal;
}

async function daftarNpr(db: DB, q: URLSearchParams) {
  const syarat: string[] = [];
  const nilai: Nilai[] = [];
  const cari = (q.get("cari") ?? "").trim().slice(0, 100);
  if (cari) {
    syarat.push(
      "(n.number LIKE ? OR IFNULL(t.number,'') LIKE ? OR r.site_id LIKE ? OR r.location LIKE ? OR c.name LIKE ? OR n.last_action LIKE ?)",
    );
    nilai.push(...Array(6).fill(`%${cari}%`));
  }
  const customer = q.get("customer");
  if (customer) {
    syarat.push("r.customer_id = ?");
    nilai.push(Number(customer));
  }
  const status = q.get("status");
  if (status) {
    syarat.push("n.status = ?");
    nilai.push(status);
  }
  // Tanggal filter dibandingkan dengan tanggal mulai gangguan menurut WIB.
  const dari = q.get("dari");
  if (dari && /^\d{4}-\d{2}-\d{2}$/.test(dari)) {
    syarat.push("date(n.started_at, '+7 hours') >= ?");
    nilai.push(dari);
  }
  const sampai = q.get("sampai");
  if (sampai && /^\d{4}-\d{2}-\d{2}$/.test(sampai)) {
    syarat.push("date(n.started_at, '+7 hours') <= ?");
    nilai.push(sampai);
  }
  const kondisi = q.get("kondisi");
  if (kondisi) {
    if (!KONDISI[kondisi]) throw new ApiError("Filter tidak dikenal.");
    syarat.push(KONDISI[kondisi]);
  }
  const where = syarat.length ? `WHERE ${syarat.join(" AND ")}` : "";
  // Urutan dari kepala kolom tabel. Nilai lain diabaikan (aman dari injeksi
  // karena hanya kolom di daftar ini yang dipakai).
  const KOLOM_URUT: Record<string, string> = {
    nomor: "n.number",
    customer: "c.name",
    gangguan: "n.remote_status",
    mulai: "n.started_at",
    status:
      "CASE n.status WHEN 'OPEN' THEN 0 WHEN 'PENDING' THEN 1 WHEN 'ESKALASI' THEN 2 ELSE 3 END",
    pending: "CASE n.pending_by WHEN '' THEN 'zzz' ELSE n.pending_by END",
  };
  const arah = q.get("arah") === "naik" ? "ASC" : "DESC";
  const urut =
    q.get("urut") === "terlama"
      ? "n.started_at ASC"
      : KOLOM_URUT[q.get("urut") ?? ""]
        ? `${KOLOM_URUT[q.get("urut")!]} ${arah}, n.id DESC`
        : "n.id DESC";

  // Ekspor CSV mengambil semua hasil filter sekaligus (dibatasi 5.000 baris).
  const ekspor = q.get("ekspor") === "1";
  const per = ekspor ? 5000 : angka(q.get("per"), 10, 1, 100);
  const halaman = ekspor ? 1 : angka(q.get("halaman"), 1, 1, 100000);

  const [baris, jumlah] = await db.batch([
    db
      .prepare(
        `SELECT ${KOLOM_NPR} ${SUMBER_NPR} ${where} ORDER BY ${urut} LIMIT ? OFFSET ?`,
      )
      .bind(...nilai, per, (halaman - 1) * per),
    db
      .prepare(`SELECT COUNT(*) AS total ${SUMBER_NPR} ${where}`)
      .bind(...nilai),
  ]);
  return {
    rows: baris.results,
    total: (jumlah.results[0] as { total: number }).total,
  };
}

async function detailNpr(db: DB, id: number) {
  const npr = await db
    .prepare(`SELECT ${KOLOM_NPR} ${SUMBER_NPR} WHERE n.id = ?`)
    .bind(id)
    .first();
  if (!npr) throw new ApiError("NPR tidak ditemukan.", 404);
  const [remote, ticket, actions] = await db.batch([
    db
      .prepare(
        "SELECT r.*, c.name AS customer_name FROM remotes r JOIN customers c ON c.id = r.customer_id WHERE r.id = ?",
      )
      .bind(npr.remote_id as number),
    db.prepare("SELECT * FROM tickets WHERE npr_id = ?").bind(id),
    // Isi lampiran tidak ikut dikirim, hanya namanya.
    db
      .prepare(
        `SELECT a.id, a.npr_id, a.kind, a.notes, a.remote_status, a.pending_by, a.occurred_at,
           a.attachment_name, u.full_name AS created_by
         FROM actions a LEFT JOIN users u ON u.id = a.user_id
         WHERE a.npr_id = ? ORDER BY a.occurred_at, a.id`,
      )
      .bind(id),
  ]);
  return {
    npr,
    remote: remote.results[0],
    ticket: ticket.results[0] ?? null,
    actions: actions.results,
  };
}

async function dashboard(db: DB) {
  const ringkas = await db
    .prepare(
      `SELECT
        SUM(${KONDISI.aktif}) AS aktif,
        SUM(${KONDISI.kritis}) AS kritis,
        SUM(${KONDISI.aging}) AS aging,
        SUM(${KONDISI.menunggu_report}) AS menunggu_report,
        SUM(${KONDISI.pending_tm}) AS pending_tm,
        SUM(${KONDISI.pending_customer}) AS pending_customer,
        SUM(${KONDISI.belum_kategori}) AS belum_kategori
       ${SUMBER_NPR}`,
    )
    .first<Record<string, number | null>>();

  // Grafik NPR masuk 7 hari terakhir, dihitung per tanggal WIB.
  const hari = Array.from({ length: 7 }, (_, i) =>
    tanggalWIB(Date.now() - (6 - i) * 86400000),
  );
  const awal = new Date(`${hari[0]}T00:00:00+07:00`).toISOString();
  const [grafik, gamas, terlama] = await db.batch([
    db
      .prepare(
        "SELECT date(started_at, '+7 hours') AS hari, COUNT(*) AS jumlah FROM nprs WHERE started_at >= ? GROUP BY hari",
      )
      .bind(awal),
    db.prepare(
      `SELECT id, number, location, status, started_at,
         (SELECT COUNT(*) FROM gamas_sites s WHERE s.gamas_id = gamas.id) AS site_count
       FROM gamas WHERE status <> 'CLOSED' ORDER BY started_at`,
    ),
    db.prepare(
      `SELECT ${KOLOM_NPR} ${SUMBER_NPR} WHERE ${KONDISI.aktif} ORDER BY n.started_at ASC LIMIT 10`,
    ),
  ]);
  const perHari = new Map(
    (grafik.results as { hari: string; jumlah: number }[]).map((b) => [
      b.hari,
      b.jumlah,
    ]),
  );
  return {
    ringkas: Object.fromEntries(
      Object.entries(ringkas ?? {}).map(([k, v]) => [k, v ?? 0]),
    ),
    grafik: hari.map((h) => ({ hari: h, jumlah: perHari.get(h) ?? 0 })),
    gamas_aktif: gamas.results,
    npr_terlama: terlama.results,
  };
}

async function daftarTicket(db: DB, q: URLSearchParams) {
  const cari = (q.get("cari") ?? "").trim().slice(0, 100);
  const pola = `%${cari}%`;
  const hasil = await db
    .prepare(
      `SELECT t.*, n.number AS npr_number, n.status AS npr_status,
         n.remote_status, n.started_at AS npr_started_at,
         r.site_id, r.location, r.address, r.city, r.province, r.jarkom, r.ip_lan,
         r.pic_name, r.pic_phone, c.name AS customer_name
       FROM tickets t
       JOIN nprs n ON n.id = t.npr_id
       JOIN remotes r ON r.id = n.remote_id
       JOIN customers c ON c.id = r.customer_id
       WHERE t.number LIKE ? OR n.number LIKE ? OR r.site_id LIKE ?
       ORDER BY t.id DESC LIMIT 500`,
    )
    .bind(pola, pola, pola)
    .all();
  return { rows: hasil.results };
}

async function daftarGamas(db: DB) {
  const hasil = await db
    .prepare(
      `SELECT g.id, g.number, g.location, g.notes, g.started_at, g.online_at, g.closed_at, g.status, g.report,
         (SELECT COUNT(*) FROM gamas_sites s WHERE s.gamas_id = g.id) AS site_count,
         (SELECT GROUP_CONCAT(r.site_id, ', ') FROM gamas_sites s JOIN remotes r ON r.id = s.remote_id
           WHERE s.gamas_id = g.id) AS site_ids
       FROM gamas g ORDER BY g.id DESC LIMIT 500`,
    )
    .all();
  return { rows: hasil.results };
}

async function detailGamas(db: DB, id: number) {
  const gamas = await db
    .prepare("SELECT * FROM gamas WHERE id = ?")
    .bind(id)
    .first();
  if (!gamas) throw new ApiError("TT Gamas tidak ditemukan.", 404);
  const [sites, actions] = await db.batch([
    db
      .prepare(
        `SELECT r.*, c.name AS customer_name FROM gamas_sites s
         JOIN remotes r ON r.id = s.remote_id
         JOIN customers c ON c.id = r.customer_id
         WHERE s.gamas_id = ? ORDER BY r.site_id`,
      )
      .bind(id),
    db
      .prepare(
        `SELECT a.id, a.gamas_id, a.notes, a.report, a.occurred_at AS created_at, u.full_name AS created_by
         FROM gamas_actions a LEFT JOIN users u ON u.id = a.user_id
         WHERE a.gamas_id = ? ORDER BY a.occurred_at DESC, a.id DESC`,
      )
      .bind(id),
  ]);
  return { gamas, sites: sites.results, actions: actions.results };
}

async function master(db: DB) {
  // Angka ringkas per customer dan per remote untuk tabel Data Master.
  // "Bulan ini" memakai bulan WIB berjalan.
  const bulan = tanggalWIB().slice(0, 7);
  const [customers, remotes] = await db.batch([
    db
      .prepare(
        `SELECT c.*,
           (SELECT COUNT(*) FROM remotes r WHERE r.customer_id = c.id) AS remote_count,
           (SELECT COUNT(*) FROM nprs n JOIN remotes r ON r.id = n.remote_id
             WHERE r.customer_id = c.id AND n.status <> 'CLOSED') AS npr_aktif,
           (SELECT COUNT(*) FROM nprs n JOIN remotes r ON r.id = n.remote_id
             WHERE r.customer_id = c.id AND strftime('%Y-%m', n.started_at, '+7 hours') = ?) AS npr_bulan_ini
         FROM customers c ORDER BY c.name`,
      )
      .bind(bulan),
    db
      .prepare(
        `SELECT r.*,
           (SELECT COUNT(*) FROM nprs n WHERE n.remote_id = r.id AND n.status <> 'CLOSED') AS npr_aktif,
           (SELECT COUNT(*) FROM nprs n WHERE n.remote_id = r.id
             AND strftime('%Y-%m', n.started_at, '+7 hours') = ?) AS npr_bulan_ini,
           t.number AS npr_terakhir_number, t.status AS npr_terakhir_status,
           t.remote_status AS npr_terakhir_gangguan, t.started_at AS npr_terakhir_mulai,
           t.online_at AS npr_terakhir_online
         FROM remotes r
         LEFT JOIN nprs t ON t.id = (SELECT id FROM nprs WHERE remote_id = r.id ORDER BY started_at DESC, id DESC LIMIT 1)
         ORDER BY r.site_id`,
      )
      .bind(bulan),
  ]);
  return { customers: customers.results, remotes: remotes.results };
}

/** Mengembalikan undefined jika alamat bukan endpoint baca. */
export async function baca(db: DB, url: URL) {
  const path = url.pathname;
  const q = url.searchParams;
  if (path === "/api/master") return master(db);
  if (path === "/api/dashboard") return dashboard(db);
  if (path === "/api/nprs") return daftarNpr(db, q);
  if (path === "/api/tickets") return daftarTicket(db, q);
  if (path === "/api/gamas") return daftarGamas(db);

  const npr = path.match(/^\/api\/nprs\/(\d+)$/);
  if (npr) return detailNpr(db, Number(npr[1]));
  const gamas = path.match(/^\/api\/gamas\/(\d+)$/);
  if (gamas) return detailGamas(db, Number(gamas[1]));
  const lampiran = path.match(/^\/api\/lampiran\/(\d+)$/);
  if (lampiran) {
    const hasil = await db
      .prepare(
        "SELECT attachment_name AS name, attachment_data AS data FROM actions WHERE id = ? AND attachment_data <> ''",
      )
      .bind(Number(lampiran[1]))
      .first();
    if (!hasil) throw new ApiError("Lampiran tidak ditemukan.", 404);
    return hasil;
  }
  return undefined;
}
