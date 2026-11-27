// Pengelolaan akun: daftar dan ubah pengguna (khusus admin), reset password
// oleh admin, dan ganti password sendiri.
import { ApiError } from "./galat.js";
import { buatSalt, hashPassword, hashesMatch } from "./sandi.js";

export type Peran = "admin" | "helpdesk";
export type Pengguna = {
  id: number;
  username: string;
  full_name: string;
  peran: Peran;
};

const PANJANG_MIN_PASSWORD = 12;

function gagal(message: string, status = 400): never {
  throw new ApiError(message, status);
}

function teks(
  body: Record<string, unknown>,
  key: string,
  label: string,
  max: number,
) {
  const nilai = body[key];
  if (typeof nilai !== "string" || !nilai.trim() || nilai.length > max)
    gagal(`${label} wajib diisi (maksimal ${max} karakter).`);
  return nilai.trim();
}

function peranValid(nilai: unknown): Peran {
  if (nilai !== "admin" && nilai !== "helpdesk")
    gagal("Peran harus admin atau helpdesk.");
  return nilai;
}

function passwordValid(nilai: unknown) {
  if (
    typeof nilai !== "string" ||
    nilai.length < PANJANG_MIN_PASSWORD ||
    nilai.length > 256
  )
    gagal(`Password minimal ${PANJANG_MIN_PASSWORD} karakter.`);
  return nilai;
}

async function bacaBody(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    gagal("Format JSON tidak valid.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    gagal("Data tidak valid.");
  return body as Record<string, unknown>;
}

async function simpanPassword(
  db: D1Database,
  userId: number,
  password: string,
) {
  const salt = buatSalt();
  const hash = await hashPassword(password, salt);
  return db
    .prepare(
      "UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?",
    )
    .bind(hash, salt, userId);
}

// Harus selalu ada minimal satu admin aktif supaya menu Pengguna tidak
// terkunci untuk semua orang.
async function jumlahAdminAktifLain(db: D1Database, kecualiId: number) {
  const hasil = await db
    .prepare(
      "SELECT COUNT(*) AS jumlah FROM users WHERE peran = 'admin' AND aktif = 1 AND id <> ?",
    )
    .bind(kecualiId)
    .first<{ jumlah: number }>();
  return hasil?.jumlah ?? 0;
}

export async function pengguna(
  request: Request,
  env: Env,
  user: Pengguna,
  sessionId: string,
) {
  const db = env.DB;
  const path = new URL(request.url).pathname;

  // Ganti password sendiri. Sesi lain milik akun ini ikut diakhiri.
  if (path === "/api/password" && request.method === "POST") {
    const body = await bacaBody(request);
    const lama = await db
      .prepare("SELECT password_hash, password_salt FROM users WHERE id = ?")
      .bind(user.id)
      .first<{ password_hash: string; password_salt: string }>();
    const hashLama = await hashPassword(
      String(body.old_password ?? ""),
      lama?.password_salt ?? "",
    );
    if (!lama || !hashesMatch(hashLama, lama.password_hash))
      gagal("Password lama salah.");
    const baru = passwordValid(body.new_password);
    await db.batch([
      await simpanPassword(db, user.id, baru),
      db
        .prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?")
        .bind(user.id, sessionId),
    ]);
    return { ok: true };
  }

  if (user.peran !== "admin") gagal("Menu ini hanya untuk admin.", 403);

  if (path === "/api/users" && request.method === "GET") {
    // Angka aktivitas per akun, dihitung dari riwayat NPR dan TT Gamas.
    const bulan = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
    const hasil = await db
      .prepare(
        `WITH tindakan AS (
           SELECT a.user_id, a.occurred_at AS at, a.kind AS jenis, n.number AS ref
             FROM actions a JOIN nprs n ON n.id = a.npr_id
           UNION ALL
           SELECT g.user_id, g.occurred_at, 'Perkembangan Gamas', m.number
             FROM gamas_actions g JOIN gamas m ON m.id = g.gamas_id
         )
         SELECT u.id, u.username, u.full_name, u.peran, u.aktif, u.created_at,
           (SELECT COUNT(*) FROM nprs n WHERE n.user_id = u.id) AS npr_dicatat,
           (SELECT COUNT(*) FROM actions a WHERE a.user_id = u.id AND a.kind = 'Eskalasi Service') AS tt_dibuat,
           (SELECT COUNT(*) FROM tindakan t WHERE t.user_id = u.id
             AND strftime('%Y-%m', t.at, '+7 hours') = ?) AS tindakan_bulan_ini,
           (SELECT jenis FROM tindakan t WHERE t.user_id = u.id ORDER BY t.at DESC LIMIT 1) AS tindakan_terakhir_jenis,
           (SELECT ref FROM tindakan t WHERE t.user_id = u.id ORDER BY t.at DESC LIMIT 1) AS tindakan_terakhir_ref,
           (SELECT at FROM tindakan t WHERE t.user_id = u.id ORDER BY t.at DESC LIMIT 1) AS tindakan_terakhir_at
         FROM users u WHERE u.password_hash <> '!' ORDER BY u.aktif DESC, u.full_name`,
      )
      .bind(bulan)
      .all();
    return { users: hasil.results };
  }

  if (path === "/api/users" && request.method === "POST") {
    const body = await bacaBody(request);
    const username = teks(body, "username", "Username", 32).toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username))
      gagal(
        "Username 3–32 karakter: huruf kecil, angka, titik, minus, atau garis bawah.",
      );
    const nama = teks(body, "full_name", "Nama lengkap", 100);
    const peran = peranValid(body.peran);
    const password = passwordValid(body.password);
    const ada = await db
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username)
      .first();
    if (ada) gagal("Username sudah dipakai.", 409);
    const salt = buatSalt();
    const hash = await hashPassword(password, salt);
    const hasil = await db
      .prepare(
        "INSERT INTO users (username, full_name, password_hash, password_salt, peran) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(username, nama, hash, salt, peran)
      .run();
    return { ok: true, id: hasil.meta.last_row_id };
  }

  const cocokUbah = path.match(/^\/api\/users\/(\d+)$/);
  if (cocokUbah && request.method === "POST") {
    const id = Number(cocokUbah[1]);
    const target = await db
      .prepare(
        "SELECT id, peran, aktif FROM users WHERE id = ? AND password_hash <> '!'",
      )
      .bind(id)
      .first<{ id: number; peran: Peran; aktif: number }>();
    if (!target) gagal("Pengguna tidak ditemukan.", 404);
    const body = await bacaBody(request);
    const nama = teks(body, "full_name", "Nama lengkap", 100);
    const peran = peranValid(body.peran);
    if (body.aktif !== true && body.aktif !== false)
      gagal("Status aktif tidak valid.");
    const aktif = body.aktif ? 1 : 0;

    const kehilanganAdmin =
      target.peran === "admin" &&
      target.aktif === 1 &&
      (peran !== "admin" || aktif === 0);
    if (kehilanganAdmin && (await jumlahAdminAktifLain(db, id)) === 0)
      gagal("Harus ada minimal satu admin aktif.");
    if (id === user.id && aktif === 0)
      gagal("Anda tidak bisa menonaktifkan akun sendiri.");

    const perintah = [
      db
        .prepare(
          "UPDATE users SET full_name = ?, peran = ?, aktif = ? WHERE id = ?",
        )
        .bind(nama, peran, aktif, id),
    ];
    // Akun yang dinonaktifkan langsung keluar dari semua sesi.
    if (aktif === 0)
      perintah.push(
        db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
      );
    await db.batch(perintah);
    return { ok: true };
  }

  const cocokReset = path.match(/^\/api\/users\/(\d+)\/password$/);
  if (cocokReset && request.method === "POST") {
    const id = Number(cocokReset[1]);
    const target = await db
      .prepare("SELECT id FROM users WHERE id = ? AND password_hash <> '!'")
      .bind(id)
      .first();
    if (!target) gagal("Pengguna tidak ditemukan.", 404);
    const body = await bacaBody(request);
    const password = passwordValid(body.password);
    await db.batch([
      await simpanPassword(db, id, password),
      // Semua sesi akun itu diakhiri, kecuali sesi admin yang sedang dipakai.
      db
        .prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?")
        .bind(id, sessionId),
    ]);
    return { ok: true };
  }

  gagal("Halaman API tidak ditemukan.", 404);
}
