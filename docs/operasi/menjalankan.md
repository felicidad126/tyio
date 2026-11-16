# Menjalankan portal NOC

Dokumen ini untuk pengembang (lingkungan lokal) dan operator (staging).
Produksi menyusul di langkah 1.7.

## Bentuk aplikasi

Satu image Docker (`deploy/Dockerfile`) berisi API dan hasil build web. Image yang sama
dipakai untuk tiga peran:

| Peran | Perintah di dalam image | Kapan |
| --- | --- | --- |
| Migrasi | `node dist/db/migrate.js up` (atau `down` untuk membatalkan satu) | Sebelum aplikasi start |
| Seed data dummy | `node dist/seed/run.js` | Dev otomatis; staging manual; **ditolak di produksi** |
| Aplikasi | `node dist/main.js` (bawaan) | Selalu |

Aplikasi melayani API di `/api/...` dan aplikasi web di jalur lain dari origin yang sama.
Kesehatan: `GET /api/health` → 200 `{"status":"ok","database":"ok"}`, atau 503 bila
database tidak bisa dihubungi.

### Variabel lingkungan

| Nama | Wajib | Isi |
| --- | --- | --- |
| `TYIO_ENV` | ya | `development`, `test`, `staging`, atau `production`. Tanpa nilai bawaan |
| `DATABASE_URL` | ya | `postgres://pengguna:sandi@host:5432/nama_db` |
| `PORT` | tidak | Bawaan 3000 |
| `WEB_DIST_DIR` | tidak | Folder hasil build web; di image sudah diisi `/app/public` |

Aplikasi menolak start bila konfigurasi tidak sah dan menyebut variabel yang bermasalah,
tanpa mencetak nilainya.

## Lingkungan lokal (pengembang)

Kebutuhan: Docker dengan Compose v2, Node.js 26, pnpm (lihat README).

```bash
pnpm install
pnpm dev:up          # bangun image, jalankan Postgres + migrasi + seed + aplikasi, tunggu sehat
pnpm e2e smoke       # uji asap terhadap http://localhost:8080
```

- Aplikasi: http://localhost:8080 · Postgres: `localhost:5432`, pengguna/sandi `tyio`/`tyio`
  (database dev `tyio`, database uji `tyio_test`). Semua port hanya terikat ke 127.0.0.1.
- Uji API (`pnpm test:api`) memakai database `tyio_test` di Postgres yang sama, jadi
  `pnpm dev:up` harus sudah jalan. Sasaran lain: set `TEST_DATABASE_URL`.
- Setelah mengubah kode API, jalankan `pnpm dev:up` lagi (image dibangun ulang).
- Mengembangkan tampilan dengan hot reload: `pnpm --filter @tyio/web dev`, lalu buka alamat
  yang dicetak Vite. Permintaan `/api` diteruskan ke stack dev (ubah dengan `TYIO_API_URL`).
- Berhenti: `pnpm dev:down`. Hapus juga data database: `pnpm dev:reset`.
- Port bentrok: set `TYIO_APP_PORT` atau `TYIO_DB_PORT` sebelum `pnpm dev:up`.

### Jaringan kantor dengan proxy pemeriksa TLS

Bila build image gagal dengan galat sertifikat (`SELF_SIGNED_CERT_IN_CHAIN`,
`UnknownIssuer`), minta berkas sertifikat CA proxy (format `.pem`) ke tim jaringan, lalu:

```bash
mkdir -p deploy/certs && cp /path/ke/ca-kantor.pem deploy/certs/
TYIO_EXTRA_CA_FILE=./certs/ca-kantor.pem pnpm dev:up
```

`deploy/certs/` diabaikan git. Sertifikat hanya dipakai saat build dan tidak tersimpan
di image. Build manual: `docker build --secret id=extra_ca,src=deploy/certs/ca-kantor.pem ...`.

### Uji layar di mesin tanpa unduhan browser Playwright

`pnpm --filter @tyio/web exec playwright install chromium` mengunduh browser sekali.
Bila Chromium sudah terpasang di tempat lain, set `E2E_CHROMIUM_PATH` ke berkas
programnya.

## Staging

Staging menjalankan image yang **sudah dibangun dan lolos uji asap di CI** (job `image`
di `.github/workflows/ci.yml` menjalankan image itu dengan `deploy/compose.staging.yml`
yang sama). Staging tidak membangun image sendiri.

> **Belum lengkap:** tempat menyimpan image hasil CI (registry) dan server staging menunggu
> keputusan hosting. Sampai itu diputuskan, image belum dikirim ke mana pun; CI hanya
> membangun dan mengujinya.

Langkah memasang, setelah image tersedia di server:

```bash
cp deploy/staging.env.example deploy/staging.env    # isi TYIO_IMAGE dan TYIO_DB_PASSWORD
docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml up -d --wait
curl -s http://127.0.0.1:8080/api/health
```

- Kata sandi database: `openssl rand -hex 24` (heksadesimal aman di dalam URL).
- Migrasi berjalan otomatis sebelum aplikasi. Membatalkan satu migrasi:
  `docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml run --rm app node dist/db/migrate.js down`
- Data dummy untuk uji bersama pengguna (opsional):
  `docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml run --rm app node dist/seed/run.js`
- Database tidak membuka port ke host. Aplikasi terikat ke `127.0.0.1:8080` secara bawaan;
  akses dari jaringan lain dan TLS (R-I) disiapkan bersama keputusan hosting.
- Uji asap terhadap staging dari mesin pengembang:
  `E2E_BASE_URL=http://<alamat-staging>:8080 pnpm e2e smoke`
