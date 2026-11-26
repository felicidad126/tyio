// Menyiapkan struktur database: schema.sql (versi pertama), lalu berkas di
// migrations/ yang belum pernah dijalankan. Catatan migrasi memakai tabel
// d1_migrations, sama dengan yang dipakai Wrangler.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseD1 } from "./d1.js";

export async function siapkanDatabase(db: DatabaseD1, folder: string) {
  db.exec(readFileSync(join(folder, "schema.sql"), "utf8"));
  db.exec(
    "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)",
  );
  const sudah = new Set(
    (
      await db.prepare("SELECT name FROM d1_migrations").all<{
        name: string;
      }>()
    ).results.map((r) => r.name),
  );
  const berkas = readdirSync(join(folder, "migrations"))
    .filter((nama) => nama.endsWith(".sql"))
    .sort();
  const baru: string[] = [];
  for (const nama of berkas) {
    if (sudah.has(nama)) continue;
    const sql = readFileSync(join(folder, "migrations", nama), "utf8");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO d1_migrations (name) VALUES (?)")
        .bind(nama)
        .jalankan();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(`Migrasi ${nama} gagal: ${(error as Error).message}`, {
        cause: error,
      });
    }
    baru.push(nama);
  }
  return baru;
}
