import { spawnSync } from "node:child_process";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { createInterface } from "node:readline/promises";

// Menyiapkan database (lokal atau Cloudflare) dan akun admin pertama.
// Tidak ada password yang ditulis di kode: password admin diketik saat setup
// atau diambil dari variabel lingkungan NPR_ADMIN_PASSWORD.
//
//   npm run setup                  database lokal
//   npm run setup:remote           database Cloudflare
//   npm run password:local         ganti password satu akun (lokal)
//   npm run password:remote        ganti password satu akun (Cloudflare)
const remote = process.argv.includes("--remote");
const reset = process.argv.includes("--reset-password");
const PANJANG_MIN_PASSWORD = 12;

let terminal;
async function tanya(pertanyaan, namaEnv) {
  if (process.env[namaEnv]) return process.env[namaEnv];
  terminal ??= createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return (await terminal.question(pertanyaan)).trim();
}
function berhenti(pesan) {
  console.error(pesan);
  terminal?.close();
  process.exit(1);
}
// Tanda kutip tunggal digandakan supaya aman di dalam teks SQL.
const sqlTeks = (nilai) => `'${String(nilai).replaceAll("'", "''")}'`;

function wrangler(args) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", ...args],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
const target = remote ? "--remote" : "--local";
wrangler([
  "d1",
  "execute",
  "monitoring-vsat-db",
  target,
  "--file=./schema.sql",
]);
// Perubahan struktur database setelah versi pertama ada di folder migrations/.
// Wrangler mencatat migrasi yang sudah dijalankan, jadi aman diulang.
wrangler(["d1", "migrations", "apply", "monitoring-vsat-db", target]);
wrangler([
  "d1",
  "execute",
  "monitoring-vsat-db",
  target,
  "--file=./seed-data.sql",
]);
function jalankanSql(sql) {
  const sementara = `.setup-${randomBytes(8).toString("hex")}.sql`;
  try {
    writeFileSync(sementara, sql, { mode: 0o600 });
    wrangler([
      "d1",
      "execute",
      "monitoring-vsat-db",
      target,
      `--file=${sementara}`,
    ]);
  } finally {
    try {
      unlinkSync(sementara);
    } catch {
      // Berkas sementara mungkin sudah terhapus.
    }
  }
}

function jumlahAdminAktif() {
  const hasil = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "monitoring-vsat-db",
      target,
      "--json",
      "--command",
      "SELECT COUNT(*) AS jumlah FROM users WHERE peran = 'admin' AND aktif = 1",
    ],
    { encoding: "utf8" },
  );
  if (hasil.status !== 0)
    berhenti(hasil.stderr || "Gagal membaca tabel pengguna.");
  return JSON.parse(hasil.stdout)[0].results[0].jumlah;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
  return { hash, salt };
}

async function passwordBaru(label) {
  const password = await tanya(
    `${label} (minimal ${PANJANG_MIN_PASSWORD} karakter; terlihat di terminal): `,
    "NPR_ADMIN_PASSWORD",
  );
  if (password.length < PANJANG_MIN_PASSWORD)
    berhenti(`Password minimal ${PANJANG_MIN_PASSWORD} karakter.`);
  return password;
}

let pesanAkhir =
  "Database siap. Akun admin sudah ada, tidak ada akun yang diubah.";

if (reset) {
  const username = await tanya(
    "Username yang password-nya diganti: ",
    "NPR_ADMIN_USERNAME",
  );
  const { hash, salt } = hashPassword(await passwordBaru("Password baru"));
  jalankanSql(
    `UPDATE users SET password_hash = ${sqlTeks(hash)}, password_salt = ${sqlTeks(salt)} WHERE username = ${sqlTeks(username)};` +
      `DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ${sqlTeks(username)});`,
  );
  pesanAkhir = `Password akun ${username} sudah diganti (jika username tersebut ada).`;
} else if (jumlahAdminAktif() === 0) {
  console.log("\nBelum ada akun admin. Buat akun admin pertama.");
  const username = (
    await tanya("Username admin: ", "NPR_ADMIN_USERNAME")
  ).toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username))
    berhenti(
      "Username 3–32 karakter: huruf kecil, angka, titik, minus, atau garis bawah.",
    );
  const nama = await tanya("Nama lengkap admin: ", "NPR_ADMIN_NAMA");
  if (!nama || nama.length > 100)
    berhenti("Nama lengkap wajib diisi (maksimal 100 karakter).");
  const { hash, salt } = hashPassword(await passwordBaru("Password admin"));
  jalankanSql(
    `INSERT INTO users (username, full_name, password_hash, password_salt, peran) VALUES (${sqlTeks(username)}, ${sqlTeks(nama)}, ${sqlTeks(hash)}, ${sqlTeks(salt)}, 'admin');`,
  );
  pesanAkhir = `Database siap. Akun admin: ${username}. Akun lain dibuat lewat menu Pengguna.`;
}
terminal?.close();

wrangler(["types"]);
console.log(pesanAkhir);
