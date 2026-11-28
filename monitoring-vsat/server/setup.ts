// Menyiapkan database server sendiri dan akun admin pertama.
//
//   node dist/server/setup.js                 siapkan tabel + akun admin
//   node dist/server/setup.js --contoh        tambah data bank/site contoh
//   node dist/server/setup.js --reset-password  ganti password satu akun
//
// Data akun diketik saat diminta, atau diambil dari NPR_ADMIN_USERNAME,
// NPR_ADMIN_NAMA, dan NPR_ADMIN_PASSWORD. Tidak ada password di kode.
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { BATAS } from "../shared/batas.js";
import { DatabaseD1 } from "./d1.js";
import { siapkanDatabase } from "./migrasi.js";

const DB_PATH = process.env.DB_PATH ?? "data/npr.sqlite";
const FOLDER_SQL = resolve(process.env.SQL_DIR ?? ".");
const PANJANG_MIN_PASSWORD = BATAS.passwordMin;
const reset = process.argv.includes("--reset-password");
const contoh = process.argv.includes("--contoh");

let terminal: ReturnType<typeof createInterface> | undefined;
async function tanya(pertanyaan: string, namaEnv: string) {
  const dariEnv = process.env[namaEnv];
  if (dariEnv) return dariEnv;
  terminal ??= createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return (await terminal.question(pertanyaan)).trim();
}
function berhenti(pesan: string): never {
  console.error(pesan);
  terminal?.close();
  process.exit(1);
}
function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
  return { hash, salt };
}
// Membaca password tanpa menampilkannya di layar. Tidak dipangkas, karena
// spasi di awal atau akhir adalah bagian dari password.
async function bacaRahasia(pertanyaan: string): Promise<string> {
  terminal?.close();
  terminal = undefined;
  const input = process.stdin;
  if (!input.isTTY) {
    // Tanpa terminal (mis. input dari pipa): baca satu baris apa adanya.
    const rl = createInterface({ input });
    process.stdout.write(pertanyaan);
    for await (const baris of rl) {
      rl.close();
      return baris.replace(/\r$/, "");
    }
    return "";
  }
  process.stdout.write(pertanyaan);
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");
  return new Promise((selesai) => {
    let isi = "";
    const baca = (potongan: string) => {
      for (const huruf of potongan) {
        if (huruf === "\r" || huruf === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", baca);
          process.stdout.write("\n");
          selesai(isi);
          return;
        }
        if (huruf === "\u0003") {
          input.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (huruf === "\u007f" || huruf === "\b") {
          if (isi.length) {
            isi = isi.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (huruf >= " ") {
          isi += huruf;
          process.stdout.write("*");
        }
      }
    };
    input.on("data", baca);
  });
}

// Password diketik dua kali supaya salah ketik langsung ketahuan.
async function passwordBaru(label: string) {
  const dariEnv = process.env.NPR_ADMIN_PASSWORD;
  const password =
    dariEnv ??
    (await bacaRahasia(
      `${label} (minimal ${PANJANG_MIN_PASSWORD} karakter, tidak tampil di layar): `,
    ));
  if (password.length < PANJANG_MIN_PASSWORD)
    berhenti(`Password minimal ${PANJANG_MIN_PASSWORD} karakter.`);
  if (password.length > BATAS.passwordMaks)
    berhenti(`Password maksimal ${BATAS.passwordMaks} karakter.`);
  if (dariEnv === undefined) {
    const ulang = await bacaRahasia("Ulangi password: ");
    if (ulang !== password)
      berhenti("Password tidak sama. Jalankan perintah ini lagi.");
  }
  return password;
}

const db = new DatabaseD1(DB_PATH);
const migrasi = await siapkanDatabase(db, FOLDER_SQL);
console.log(
  migrasi.length
    ? `Migrasi dijalankan: ${migrasi.join(", ")}`
    : "Struktur database sudah terbaru.",
);
if (contoh) {
  db.exec(readFileSync(join(FOLDER_SQL, "seed-data.sql"), "utf8"));
  console.log("Data bank dan site contoh ditambahkan (jika belum ada).");
}

if (reset) {
  const username = (
    await tanya("Username yang password-nya diganti: ", "NPR_ADMIN_USERNAME")
  ).toLowerCase();
  const akun = await db
    .prepare("SELECT id FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: number }>();
  if (!akun) berhenti(`Akun ${username} tidak ditemukan.`);
  const { hash, salt } = hashPassword(await passwordBaru("Password baru"));
  await db.batch([
    db
      .prepare(
        "UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?",
      )
      .bind(hash, salt, akun.id),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(akun.id),
  ]);
  console.log(`Password akun ${username} sudah diganti.`);
} else {
  const admin = await db
    .prepare(
      "SELECT COUNT(*) AS jumlah FROM users WHERE peran = 'admin' AND aktif = 1",
    )
    .first<{ jumlah: number }>();
  if (admin?.jumlah) {
    console.log("Akun admin sudah ada, tidak ada akun yang diubah.");
  } else {
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
    await db
      .prepare(
        "INSERT INTO users (username, full_name, password_hash, password_salt, peran) VALUES (?, ?, ?, ?, 'admin')",
      )
      .bind(username, nama, hash, salt)
      .run();
    console.log(
      `Akun admin ${username} dibuat. Akun lain dibuat lewat menu Pengguna.`,
    );
  }
}
terminal?.close();
db.close();
