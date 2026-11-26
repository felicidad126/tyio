// Server Node.js untuk menjalankan NPR di server sendiri (tanpa Cloudflare).
// - /api/* diteruskan ke kode yang sama dengan versi Cloudflare (worker/).
// - Alamat lain melayani berkas tampilan hasil build di dist/client.
// Server ini dimaksudkan berada di belakang Nginx (reverse proxy) dan hanya
// mendengarkan di 127.0.0.1.
import { createServer, type IncomingMessage } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import worker from "../worker/index.js";
import { DatabaseD1 } from "./d1.js";
import { siapkanDatabase } from "./migrasi.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const DB_PATH = process.env.DB_PATH ?? "data/npr.sqlite";
const FOLDER_SQL = resolve(process.env.SQL_DIR ?? ".");
const FOLDER_CLIENT = resolve(process.env.CLIENT_DIR ?? "dist/client");
const BATAS_BODY = 2 * 1024 * 1024;
// Alamat yang dibuka pengguna, mis. https://npr.contoh.id (tanpa garis miring
// di akhir).
const ALAMAT_PUBLIK = (process.env.ALAMAT_PUBLIK ?? "").replace(/\/+$/, "");
// Commit yang terpasang, diisi saat build (NPR_VERSI di docker-compose.yml).
// Tampil di /api/health supaya hasil pembaruan bisa dicek dari luar.
const VERSI = process.env.NPR_VERSI ?? "";

const db = new DatabaseD1(DB_PATH);
const migrasiBaru = await siapkanDatabase(db, FOLDER_SQL);
if (migrasiBaru.length)
  console.log(`Migrasi dijalankan: ${migrasiBaru.join(", ")}`);
const env = { DB: db } as unknown as Env;

const jenisBerkas: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function bacaBody(req: IncomingMessage) {
  const potongan: Buffer[] = [];
  let ukuran = 0;
  for await (const bagian of req) {
    ukuran += bagian.length;
    if (ukuran > BATAS_BODY) throw new Error("terlalu besar");
    potongan.push(bagian);
  }
  return Buffer.concat(potongan);
}

// Ubah permintaan Node menjadi Request standar (seperti di Cloudflare).
async function keRequest(req: IncomingMessage) {
  // Alamat yang dilihat aplikasi harus sama dengan alamat di browser (penting
  // untuk cek Origin dan cookie Secure). Jika ALAMAT_PUBLIK diisi, itu yang
  // dipakai. Jika tidak, diambil dari header yang dikirim Nginx.
  const proto = String(req.headers["x-forwarded-proto"] ?? "http").split(
    ",",
  )[0];
  const host =
    req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", ALAMAT_PUBLIK || `${proto}://${host}`);

  const headers = new Headers();
  for (const [kunci, nilai] of Object.entries(req.headers)) {
    if (nilai === undefined) continue;
    for (const v of Array.isArray(nilai) ? nilai : [nilai])
      headers.append(kunci, v);
  }
  // IP pengguna untuk batas percobaan login. Header dari luar dibuang supaya
  // tidak bisa dipalsukan; nilai diambil dari X-Real-IP yang diisi Nginx.
  headers.delete("cf-connecting-ip");
  const ip =
    String(req.headers["x-real-ip"] ?? "").trim() ||
    req.socket.remoteAddress ||
    "local";
  headers.set("cf-connecting-ip", ip);

  const adaBody = !["GET", "HEAD"].includes(req.method ?? "GET");
  return new Request(url, {
    method: req.method,
    headers,
    body: adaBody ? await bacaBody(req) : undefined,
  });
}

async function berkasStatis(pathname: string) {
  const tujuan = normalize(join(FOLDER_CLIENT, decodeURIComponent(pathname)));
  if (!tujuan.startsWith(FOLDER_CLIENT)) return null;
  try {
    const info = await stat(tujuan);
    if (info.isFile()) return tujuan;
  } catch {
    // Berkas tidak ada; tampilkan index.html di bawah.
  }
  return null;
}

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url ?? "/", "http://x").pathname;

    if (pathname === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(VERSI ? { ok: true, versi: VERSI } : { ok: true }),
      );
      return;
    }

    if (pathname.startsWith("/api/")) {
      let request: Request;
      try {
        request = await keRequest(req);
      } catch {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end('{"message":"Data yang dikirim terlalu besar."}');
        return;
      }
      const response = await worker.fetch(
        request as unknown as Parameters<typeof worker.fetch>[0],
        env,
        {} as ExecutionContext,
      );
      const headers: Record<string, string | string[]> = {};
      response.headers.forEach((nilai, kunci) => {
        if (kunci !== "set-cookie") headers[kunci] = nilai;
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) headers["set-cookie"] = cookies;
      res.writeHead(response.status, headers);
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }

    // Tampilan: berkas yang ada dikirim apa adanya, alamat lain ke index.html
    // (aplikasi satu halaman).
    const berkas =
      (await berkasStatis(pathname)) ?? join(FOLDER_CLIENT, "index.html");
    const isi = await readFile(berkas);
    const ext = extname(berkas);
    res.writeHead(200, {
      "Content-Type": jenisBerkas[ext] ?? "application/octet-stream",
      "Cache-Control": pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : isi);
  } catch (error) {
    console.error("Permintaan gagal", error);
    if (!res.headersSent)
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Terjadi kesalahan di server.");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`NPR berjalan di http://${HOST}:${PORT} (database: ${DB_PATH})`);
});

function berhenti() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", berhenti);
process.on("SIGINT", berhenti);
