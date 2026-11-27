// Membuat salinan cadangan database tanpa menghentikan aplikasi.
//   node dist/server/cadangan.js
// Hasil: /data/cadangan/npr-TAHUNBULANTANGGAL-JAMMENIT.sqlite (waktu WIB).
// Hanya 30 cadangan terakhir yang disimpan.
import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = resolve(process.env.DB_PATH ?? "data/npr.sqlite");
const FOLDER = resolve(
  process.env.FOLDER_CADANGAN ?? join(dirname(DB_PATH), "cadangan"),
);
const SIMPAN = 30;

mkdirSync(FOLDER, { recursive: true });
const waktu = new Date(Date.now() + 7 * 3600000)
  .toISOString()
  .slice(0, 16)
  .replace(/[-:]/g, "")
  .replace("T", "-");
const tujuan = join(FOLDER, `npr-${waktu}.sqlite`);

const db = new DatabaseSync(DB_PATH);
db.exec(`VACUUM INTO '${tujuan.replaceAll("'", "''")}'`);
db.close();
console.log(`Cadangan dibuat: ${tujuan}`);

const lama = readdirSync(FOLDER)
  .filter((nama) => /^npr-\d{8}-\d{4}\.sqlite$/.test(nama))
  .sort()
  .slice(0, -SIMPAN);
for (const nama of lama) unlinkSync(join(FOLDER, nama));
if (lama.length) console.log(`${lama.length} cadangan lama dihapus.`);
