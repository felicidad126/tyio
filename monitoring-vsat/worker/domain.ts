import { bulanWIB } from "../shared/waktu.js";
import type { Pengguna } from "./pengguna.js";
import { ApiError } from "./galat.js";
import { baca } from "./baca.js";

export { ApiError };

type DB = D1Database;
const remoteStatuses = [
  "ATM Offline",
  "Remote Down",
  "Remote Idle",
  "Relokasi",
  "Reposisi",
  "Maintenance",
  "Preventive Maintenance",
  "Other",
];
const fail = (message: string): never => {
  throw new ApiError(message);
};
// Nama isian yang ditampilkan di pesan error.
const labelIsian: Record<string, string> = {
  name: "nama customer",
  code: "kode customer",
  jarkom: "jarkom",
  ip_lan: "IP LAN",
  site_id: "Site ID",
  location: "lokasi",
  address: "alamat",
  city: "kota",
  province: "provinsi",
  pic_name: "nama PIC",
  pic_phone: "telepon PIC",
  notes: "catatan",
  kind: "tindakan",
  instruction: "instruksi",
  technician: "nama teknisi",
  attachment_name: "nama lampiran",
  attachment_data: "lampiran",
  report: "report teknisi",
};
function text(
  body: Record<string, unknown>,
  key: string,
  max = 4000,
  required = true,
) {
  const v = body[key];
  if (v === undefined && !required) return "";
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    return fail(`Isian ${labelIsian[key] ?? key} tidak valid.`);
  return v.trim();
}
function num(value: unknown) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) return fail("ID tidak valid.");
  return n;
}
function time(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return fail("Tanggal/waktu tidak valid.");
  const t = new Date(value);
  if (t.getTime() > Date.now() + 60000)
    return fail("Waktu tidak boleh di masa depan.");
  return t.toISOString();
}
// Nomor dokumen berurutan per jenis dan per bulan WIB saat dicatat,
// mis. NPR/2026/11/0001. Penghitung dinaikkan di batch yang sama dengan
// INSERT datanya. Batch D1 berjalan sebagai satu transaksi, jadi dua
// penyimpanan yang bersamaan tidak akan mendapat nomor yang sama.
function nomorBaru(db: DB, jenis: "NPR" | "TT" | "GAMAS") {
  const bulan = bulanWIB();
  const awalan = `${jenis}/${bulan.slice(0, 4)}/${bulan.slice(5, 7)}/`;
  return {
    naikkan: db
      .prepare(
        "INSERT INTO penghitung_nomor(jenis,periode,terakhir) VALUES (?,?,1) ON CONFLICT(jenis,periode) DO UPDATE SET terakhir=terakhir+1",
      )
      .bind(jenis, bulan),
    // Potongan SQL yang menghasilkan nomor lengkap dari penghitung.
    sql: "(SELECT printf('%s%04d', ?, terakhir) FROM penghitung_nomor WHERE jenis=? AND periode=?)",
    args: [awalan, jenis, bulan],
  };
}
function status(body: Record<string, unknown>, fallback?: string) {
  const s = body.remote_status ?? fallback;
  if (typeof s !== "string" || !remoteStatuses.includes(s))
    return fail("Status remote tidak valid.");
  return s;
}
async function row<T>(db: DB, sql: string, ...args: (string | number)[]) {
  return db
    .prepare(sql)
    .bind(...args)
    .first<T>();
}
type Npr = {
  id: number;
  remote_id: number;
  status: string;
  remote_status: string;
  pending_by: string;
  started_at: string;
};
type Ticket = { id: number; instruction: string; report: string };
export async function domain(request: Request, env: Env, user: Pengguna) {
  const db = env.DB,
    url = new URL(request.url),
    path = url.pathname;
  if (request.method === "GET" && path !== "/api/sla") {
    const hasil = await baca(db, url);
    if (hasil !== undefined) return hasil;
  }
  if (request.method === "GET" && path === "/api/sla")
    return sla(db, url.searchParams.get("month"));
  if (request.method !== "POST")
    throw new ApiError("Halaman API tidak ditemukan.", 404);
  const raw = await request.text();
  if (raw.length > 800000)
    throw new ApiError("Lampiran terlalu besar (maksimum 500 KB).", 413);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(raw);
  } catch {
    return fail("Format JSON tidak valid.");
  }
  if (!b || Array.isArray(b) || typeof b !== "object")
    return fail("Data tidak valid.");
  if (path === "/api/customers") {
    const name = text(b, "name", 100),
      code = text(b, "code", 12).toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(code))
      return fail("Kode customer hanya huruf, angka, atau tanda minus.");
    const r = await db
      .prepare("INSERT INTO customers(name,code) VALUES (?,?)")
      .bind(name, code)
      .run();
    return { ok: true, id: r.meta.last_row_id };
  }
  if (path === "/api/remotes") {
    const customer = num(b.customer_id);
    if (!(await row(db, "SELECT id FROM customers WHERE id=?", customer)))
      return fail("Customer tidak ditemukan.");
    const jarkom = text(b, "jarkom", 8);
    if (!["VSAT", "M2M"].includes(jarkom))
      return fail("Jarkom harus VSAT atau M2M.");
    const ip = text(b, "ip_lan", 15);
    if (
      !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) ||
      ip.split(".").some((v) => Number(v) > 255)
    )
      return fail("IP LAN tidak valid.");
    const vals = [
      customer,
      text(b, "site_id", 60),
      text(b, "location", 150),
      text(b, "address", 500),
      text(b, "city", 100),
      text(b, "province", 100),
      jarkom,
      ip,
      text(b, "pic_name", 150),
      text(b, "pic_phone", 50),
    ];
    const r = await db
      .prepare(
        "INSERT INTO remotes(customer_id,site_id,location,address,city,province,jarkom,ip_lan,pic_name,pic_phone) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(...vals)
      .run();
    return { ok: true, id: r.meta.last_row_id };
  }
  if (path === "/api/nprs") {
    const remote = num(b.remote_id);
    if (!(await row(db, "SELECT id FROM remotes WHERE id=?", remote)))
      return fail("Remote tidak ditemukan.");
    const started = time(b.started_at),
      s = status(b),
      notes = text(b, "notes"),
      nomor = nomorBaru(db, "NPR");
    // NPR baru belum punya kategori pending (pending_by kosong) sampai
    // helpdesk memilih Pending Customer atau Pending TM.
    const hasil = await db.batch<{ id: number; number: string }>([
      nomor.naikkan,
      db
        .prepare(
          `INSERT INTO nprs(number,remote_id,remote_status,pending_by,started_at,user_id,last_action) VALUES (${nomor.sql},?,?,'',?,?,?) RETURNING id, number`,
        )
        .bind(...nomor.args, remote, s, started, user.id, notes),
      db
        .prepare(
          `INSERT INTO actions(npr_id,kind,notes,remote_status,pending_by,occurred_at,user_id) VALUES ((SELECT id FROM nprs WHERE number=${nomor.sql}),?,?,?,'',?,?)`,
        )
        .bind(...nomor.args, "Create NPR", notes, s, started, user.id),
    ]);
    const baru = hasil[1].results[0];
    return { ok: true, id: baru.id, number: baru.number };
  }
  const actionMatch = path.match(/^\/api\/nprs\/(\d+)\/actions$/);
  if (actionMatch) {
    const pk = num(actionMatch[1]);
    const n = await row<Npr>(db, "SELECT * FROM nprs WHERE id=?", pk);
    if (!n) throw new ApiError("NPR tidak ditemukan.", 404);
    if (n.status === "CLOSED")
      return fail("NPR sudah ditutup. Riwayat tidak dapat diubah.");
    const kind = text(b, "kind", 30);
    if (
      !["Problem", "Eskalasi Service", "Close", "Report Teknisi"].includes(kind)
    )
      return fail("Tindakan tidak valid.");
    const notes = text(b, "notes"),
      s = status(b, n.remote_status),
      pending = String(b.pending_by ?? n.pending_by ?? "");
    // Problem wajib menentukan siapa yang ditunggu. Tindakan lain boleh
    // meneruskan kategori sebelumnya, termasuk yang belum dikategorikan.
    if (
      !["TM", "Customer"].includes(pending) &&
      !(pending === "" && kind !== "Problem")
    )
      return fail("Kategori pending tidak valid.");
    const occurred = time(b.occurred_at ?? new Date().toISOString());
    const latest = await row<{ occurred_at: string }>(
      db,
      "SELECT occurred_at FROM actions WHERE npr_id=? ORDER BY occurred_at DESC,id DESC LIMIT 1",
      pk,
    );
    if (occurred < n.started_at || (latest && occurred < latest.occurred_at))
      return fail("Waktu tindakan tidak boleh mendahului riwayat terakhir.");
    const attachmentName = text(b, "attachment_name", 150, false),
      attachmentData = text(b, "attachment_data", 700000, false);
    if (
      attachmentData &&
      !/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(
        attachmentData,
      )
    )
      return fail("Lampiran harus PNG, JPEG, WebP, atau PDF maksimal 500 KB.");
    if (attachmentData.length > 683000)
      return fail("Lampiran maksimal 500 KB.");
    const ticket = await row<Ticket>(
      db,
      "SELECT * FROM tickets WHERE npr_id=?",
      pk,
    );
    const statements: D1PreparedStatement[] = [];
    if (kind === "Eskalasi Service") {
      if (ticket) throw new ApiError("NPR ini sudah memiliki TT.", 409);
      const instruction = text(b, "instruction", 30);
      if (!["Maintenance", "Preventive Maintenance"].includes(instruction))
        return fail("Instruksi tidak valid.");
      const nomor = nomorBaru(db, "TT");
      statements.push(
        nomor.naikkan,
        db
          .prepare(
            `INSERT INTO tickets(npr_id,number,instruction,notes,created_at) VALUES (?,${nomor.sql},?,?,?) RETURNING number`,
          )
          .bind(pk, ...nomor.args, instruction, notes, occurred),
      );
    }
    if (kind === "Report Teknisi") {
      if (!ticket) return fail("NPR belum memiliki TT.");
      const technician = text(b, "technician", 150);
      statements.push(
        db
          .prepare(
            "UPDATE tickets SET report=?,technician=? WHERE npr_id=? AND EXISTS(SELECT 1 FROM nprs WHERE nprs.id=tickets.npr_id AND status<>'CLOSED')",
          )
          .bind(notes, technician, pk),
      );
    }
    let online: string | null = null;
    if (kind === "Close") {
      if (ticket && !ticket.report.trim())
        return fail("Catatan report teknisi harus diisi sebelum Close.");
      online = time(b.online_at ?? occurred);
      if (online < n.started_at || online > occurred)
        return fail("Waktu online harus antara awal gangguan dan waktu Close.");
    }
    const pendingFinal = kind === "Eskalasi Service" ? "TM" : pending;
    // Selama TT masih berjalan, NPR tetap berstatus ESKALASI walaupun ada
    // catatan Problem atau Report Teknisi baru.
    const statusBaru =
      kind === "Close"
        ? "CLOSED"
        : kind === "Eskalasi Service" || ticket
          ? "ESKALASI"
          : "PENDING";
    statements.push(
      db
        .prepare(
          "INSERT INTO actions(npr_id,kind,notes,remote_status,pending_by,occurred_at,user_id,attachment_name,attachment_data) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM nprs WHERE id=? AND status<>'CLOSED')",
        )
        .bind(
          pk,
          kind,
          notes,
          s,
          pendingFinal,
          occurred,
          user.id,
          attachmentName,
          attachmentData,
          pk,
        ),
    );
    statements.push(
      db
        .prepare(
          "UPDATE nprs SET remote_status=?,status=?,pending_by=?,last_action=?,online_at=COALESCE(?,online_at),closed_at=COALESCE(?,closed_at) WHERE id=? AND status<>'CLOSED'",
        )
        .bind(
          s,
          statusBaru,
          pendingFinal,
          notes,
          online,
          kind === "Close" ? occurred : null,
          pk,
        ),
    );
    const hasil = await db.batch<{ number: string }>(statements);
    const no =
      kind === "Eskalasi Service" ? (hasil[1].results[0]?.number ?? "") : "";
    return { ok: true, id: pk, number: no };
  }
  if (path === "/api/gamas") {
    const loc = text(b, "location", 200),
      notes = text(b, "notes"),
      started = time(b.started_at);
    if (
      !Array.isArray(b.remote_ids) ||
      !b.remote_ids.length ||
      b.remote_ids.length > 200
    )
      return fail("Pilih 1 sampai 200 remote terdampak.");
    const sites = [...new Set(b.remote_ids.map(num))];
    for (const remote of sites)
      if (!(await row(db, "SELECT id FROM remotes WHERE id=?", remote)))
        return fail("Remote terdampak tidak ditemukan.");
    const nomor = nomorBaru(db, "GAMAS");
    const idGamas = `(SELECT id FROM gamas WHERE number=${nomor.sql})`;
    const hasil = await db.batch<{ id: number; number: string }>([
      nomor.naikkan,
      db
        .prepare(
          `INSERT INTO gamas(number,location,notes,started_at,user_id) VALUES (${nomor.sql},?,?,?,?) RETURNING id, number`,
        )
        .bind(...nomor.args, loc, notes, started, user.id),
      ...sites.map((remote) =>
        db
          .prepare(
            `INSERT INTO gamas_sites(gamas_id,remote_id) VALUES (${idGamas},?)`,
          )
          .bind(...nomor.args, remote),
      ),
      db
        .prepare(
          `INSERT INTO gamas_actions(gamas_id,notes,occurred_at,user_id) VALUES (${idGamas},?,?,?)`,
        )
        .bind(...nomor.args, notes, started, user.id),
    ]);
    const baru = hasil[1].results[0];
    return { ok: true, id: baru.id, number: baru.number };
  }
  const gm = path.match(/^\/api\/gamas\/(\d+)\/actions$/);
  if (gm) {
    const pk = num(gm[1]),
      g = await row<{ status: string; started_at: string; report: string }>(
        db,
        "SELECT * FROM gamas WHERE id=?",
        pk,
      );
    if (!g) throw new ApiError("TT Gamas tidak ditemukan.", 404);
    if (g.status === "CLOSED") return fail("TT Gamas sudah ditutup.");
    const notes = text(b, "notes"),
      report = text(b, "report", 4000, false),
      occurred = time(b.occurred_at ?? new Date().toISOString()),
      close = b.close === true;
    const latest = await row<{ occurred_at: string }>(
      db,
      "SELECT occurred_at FROM gamas_actions WHERE gamas_id=? ORDER BY occurred_at DESC,id DESC LIMIT 1",
      pk,
    );
    if (occurred < g.started_at || (latest && occurred < latest.occurred_at))
      return fail(
        "Waktu perkembangan tidak boleh mendahului riwayat terakhir.",
      );
    if (close && !(report || g.report).trim())
      return fail("Report teknisi diperlukan sebelum Close Gamas.");
    // Jam kembali online wajib diisi saat menutup. Jika tidak, downtime SLA
    // akan memakai jam penutupan dan tercatat lebih panjang dari kenyataan.
    if (close && b.online_at === undefined)
      return fail("Isi waktu kembali online sebelum menutup Gamas.");
    const online = close ? time(b.online_at) : null;
    if (online && (online < g.started_at || online > occurred))
      return fail("Waktu online harus antara awal gangguan dan waktu Close.");
    await db.batch([
      db
        .prepare(
          "INSERT INTO gamas_actions(gamas_id,notes,report,occurred_at,user_id) VALUES (?,?,?,?,?)",
        )
        .bind(pk, notes, report, occurred, user.id),
      db
        .prepare(
          "UPDATE gamas SET report=CASE WHEN ?<>'' THEN ? ELSE report END,status=?,online_at=?,closed_at=? WHERE id=? AND status<>'CLOSED'",
        )
        .bind(
          report,
          report,
          close ? "CLOSED" : "IN PROGRESS",
          online,
          close ? occurred : null,
          pk,
        ),
    ]);
    return { ok: true, id: pk };
  }
  throw new ApiError("Halaman API tidak ditemukan.", 404);
}

async function sla(db: DB, month: string | null) {
  const m = month ?? bulanWIB();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m) || Number(m.slice(0, 4)) < 2000)
    return fail("Periode bulan tidak valid.");
  // Periode kalender WIB. Bulan berjalan dihitung sampai waktu sekarang, bukan sampai akhir bulan.
  const start = Date.parse(`${m}-01T00:00:00+07:00`),
    nextMonth =
      Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1) -
      7 * 60 * 60 * 1000;
  const end = Math.min(nextMonth, Date.now());
  if (start >= end) {
    const remotes = await db
      .prepare(
        "SELECT r.*,c.name AS customer_name FROM remotes r JOIN customers c ON c.id=r.customer_id",
      )
      .all();
    return {
      month: m,
      target: 99.5,
      rows: remotes.results.map((r) => ({
        remote_id: r.id,
        site_id: r.site_id,
        location: r.location,
        customer_name: r.customer_name,
        total_minutes: 0,
        downtime_minutes: 0,
        sla: null,
      })),
    };
  }
  const [remotes, nprs, actions, gamas] = await db.batch<
    Record<string, unknown>
  >([
    db.prepare(
      "SELECT r.*,c.name AS customer_name FROM remotes r JOIN customers c ON c.id=r.customer_id",
    ),
    db.prepare(
      "SELECT n.* FROM nprs n JOIN tickets t ON t.npr_id=n.id WHERE t.instruction='Maintenance'",
    ),
    db.prepare("SELECT * FROM actions ORDER BY occurred_at,id"),
    db.prepare(
      "SELECT g.*,s.remote_id FROM gamas g JOIN gamas_sites s ON s.gamas_id=g.id",
    ),
  ]);
  type Period = {
    remote_id: number;
    started_at: string;
    online_at: string | null;
  };
  type Act = {
    npr_id: number;
    kind: string;
    pending_by: string;
    occurred_at: string;
  };
  const intervals = new Map<number, [number, number][]>();
  function add(remote: number, a: number, b: number) {
    const left = Math.max(start, a),
      right = Math.min(end, b);
    if (right > left)
      intervals.set(remote, [...(intervals.get(remote) ?? []), [left, right]]);
  }
  for (const n of nprs.results as unknown as (Period & { id: number })[]) {
    const acts = (actions.results as unknown as Act[]).filter(
        (a) => a.npr_id === n.id,
      ),
      stop = n.online_at ? Date.parse(n.online_at) : end;
    // Maintenance confirms a network incident: count from observed start until first change of responsibility.
    let segment = Date.parse(n.started_at),
      by = "TM";
    for (const a of acts) {
      if (a.kind === "Create NPR") continue;
      const at = Date.parse(a.occurred_at);
      if (by === "TM") add(n.remote_id, segment, Math.min(at, stop));
      segment = at;
      by = a.pending_by;
      if (at >= stop) break;
    }
    if (by === "TM") add(n.remote_id, segment, stop);
  }
  for (const g of gamas.results as unknown as Period[])
    add(
      g.remote_id,
      Date.parse(g.started_at),
      g.online_at ? Date.parse(g.online_at) : end,
    );
  const total = (end - start) / 60000;
  const rows = remotes.results.map((r) => {
    const spans = (intervals.get(Number(r.id)) ?? []).sort(
      (a, b) => a[0] - b[0],
    );
    let duration = 0,
      left = -1,
      right = -1;
    for (const [a, b] of spans) {
      if (a <= right) right = Math.max(right, b);
      else {
        if (left >= 0) duration += right - left;
        left = a;
        right = b;
      }
    }
    if (left >= 0) duration += right - left;
    const down = duration / 60000;
    return {
      remote_id: r.id,
      site_id: r.site_id,
      location: r.location,
      customer_name: r.customer_name,
      total_minutes: total,
      downtime_minutes: down,
      sla: Math.max(0, ((total - down) / total) * 100),
    };
  });
  return { month: m, target: 99.5, rows };
}
