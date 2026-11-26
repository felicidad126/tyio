// Pengganti Cloudflare D1 untuk server sendiri. Kode di worker/ memakai
// antarmuka D1 (prepare, bind, first, all, run, batch). Kelas di sini
// menyediakan antarmuka yang sama di atas berkas SQLite biasa, sehingga
// kode aplikasi tidak perlu diubah.
import { DatabaseSync, type StatementSync } from "node:sqlite";

type Nilai = string | number | null;

function nilaiSql(nilai: unknown): Nilai {
  if (nilai === undefined || nilai === null) return null;
  if (typeof nilai === "boolean") return nilai ? 1 : 0;
  if (typeof nilai === "number" || typeof nilai === "string") return nilai;
  return String(nilai);
}

export class Statement {
  private readonly db: DatabaseD1;
  readonly sql: string;
  readonly params: Nilai[];
  constructor(db: DatabaseD1, sql: string, params: Nilai[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params.map(nilaiSql));
  }

  private siapkan(): StatementSync {
    return this.db.siapkan(this.sql);
  }

  async first<T = Record<string, unknown>>(kolom?: string) {
    const baris = this.siapkan().get(...this.params) as
      | Record<string, unknown>
      | undefined;
    if (!baris) return null;
    return (kolom ? baris[kolom] : baris) as T;
  }

  async all<T = Record<string, unknown>>() {
    return this.jalankan<T>();
  }

  async run<T = Record<string, unknown>>() {
    return this.jalankan<T>();
  }

  // Dipakai juga oleh batch. Pernyataan yang menghasilkan baris (SELECT,
  // INSERT … RETURNING) dibaca dengan all(); yang lain dengan run().
  jalankan<T>() {
    const stmt = this.siapkan();
    if (stmt.columns().length > 0) {
      const results = stmt.all(...this.params) as T[];
      return {
        success: true as const,
        results,
        meta: { changes: 0, last_row_id: 0 },
      };
    }
    const hasil = stmt.run(...this.params);
    return {
      success: true as const,
      results: [] as T[],
      meta: {
        changes: Number(hasil.changes),
        last_row_id: Number(hasil.lastInsertRowid),
      },
    };
  }
}

export class DatabaseD1 {
  private readonly db: DatabaseSync;
  private readonly cache = new Map<string, StatementSync>();

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    // Sama seperti D1: foreign key aktif. WAL membuat baca dan tulis
    // bersamaan lebih lancar, busy_timeout menunggu jika berkas sedang dikunci.
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
  }

  siapkan(sql: string) {
    let stmt = this.cache.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.cache.set(sql, stmt);
    }
    return stmt;
  }

  prepare(sql: string) {
    return new Statement(this, sql);
  }

  exec(sql: string) {
    this.db.exec(sql);
  }

  // Seperti D1: semua pernyataan dalam satu transaksi. Jika satu gagal,
  // semuanya dibatalkan.
  async batch<T = Record<string, unknown>>(statements: Statement[]) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const hasil = statements.map((s) => s.jalankan<T>());
      this.db.exec("COMMIT");
      return hasil;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}
