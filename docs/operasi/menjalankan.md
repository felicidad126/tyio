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
| `SESSION_COOKIE_SECURE` | tidak | `true`/`false`. Bawaan `true` di staging dan produksi: cookie sesi hanya lewat HTTPS dan bernama `__Host-tyio_sid`. Browser memperlakukan `http://localhost` sebagai aman, jadi uji lokal tetap jalan |
| `TRUST_PROXY_HOPS` | tidak | Jumlah reverse proxy di depan aplikasi (0–5, bawaan 0). Isi dengan tepat: alamat IP klien dipakai untuk membatasi percobaan login |
| `TYIO_SEED_PASSWORD` | untuk seed di staging | Kata sandi pengguna contoh, minimal 12 karakter. Dev memakai bawaan di bawah |

Aplikasi menolak start bila konfigurasi tidak sah dan menyebut variabel yang bermasalah,
tanpa mencetak nilainya.

### Masuk dan sesi

- Semua endpoint API wajib login kecuali `/api/health`, `/api/auth/login`, dan `/api/auth/logout`.
- Sesi berakhir setelah 12 jam tidak dipakai, dan paling lama 7 hari sejak login.
- Setelah 5 kali gagal untuk satu nama pengguna, atau 20 kali gagal dari satu alamat IP,
  dalam 15 menit, percobaan ditahan sampai jendela itu lewat (HTTP 429 dengan `Retry-After`).
- Peran di R0: `L1` (L1 Monitoring), `L2` (L2 NOC), `admin`. Pengguna melihat semua
  customer, atau hanya customer tertentu bila dibatasi.

### Batas data per customer (tenant)

- Data milik customer hanya dibaca lewat repositori yang sudah dibatasi ke customer yang
  boleh dilihat pengguna. Data customer lain dijawab 404, agar keberadaannya tidak terungkap.
- `GET /api/tenants` mengembalikan customer aktif yang boleh dilihat pengguna;
  `GET /api/tenants/:id` mengembalikan satu customer.
- Setiap rute API wajib ditandai `@TenantScoped()` (menyentuh data customer) atau
  `@NoTenantData('alasan')`. Aplikasi **menolak start** bila ada rute tanpa tanda, dan
  menyebut rutenya.

### Audit log

Setiap perubahan pada tabel data (customer, pengguna, dan tabel R1 nanti) dicatat oleh
database ke tabel `audit_log`: siapa, kapan, apa (kolom yang berubah, nilai lama dan baru),
dan dari mana (IP dan peramban). Login, logout, login ditolak, dan login ditahan juga
dicatat. Hash kata sandi tidak pernah ikut tersimpan.

- **Perubahan tanpa pelaku ditolak database.** Aplikasi mengisi pelaku otomatis. Bila operator
  harus mengubah data langsung di database, isi pelakunya di dalam transaksi yang sama:

  ```sql
  BEGIN;
  SET LOCAL tyio.actor = 'dba:<nama-operator>';
  UPDATE ...;
  COMMIT;
  ```

- `audit_log` hanya bisa ditambah: UPDATE, DELETE, dan TRUNCATE ditolak.
- Tabel yang sengaja tidak diaudit beserta alasannya:
  `apps/api/src/common/audit/audit-exclusions.ts` (sesi, catatan login gagal, dan audit_log
  itu sendiri).
- **Belum:** pengguna database untuk aplikasi saat ini juga pemilik tabel, sehingga secara
  teknis masih bisa mencabut trigger. Pemisahan peran database (aplikasi tanpa hak mengubah
  audit) disiapkan bersama server produksi.

## Lingkungan lokal (pengembang)

Kebutuhan: Docker dengan Compose v2, Node.js 26, pnpm (lihat README).

```bash
pnpm install
pnpm dev:up          # bangun image, jalankan Postgres + migrasi + seed + aplikasi, tunggu sehat
pnpm e2e smoke       # uji asap terhadap http://localhost:8080
```

- Aplikasi: http://localhost:8080 · Postgres: `localhost:5432`, pengguna/sandi `tyio`/`tyio`
  (database dev `tyio`, database uji `tyio_test`). Semua port hanya terikat ke 127.0.0.1.
- Akun contoh dari seed (khusus dev, kata sandi `contoh-dev-2026`; semua nama rekaan):

  | Nama pengguna | Peran | Customer yang terlihat |
  | --- | --- | --- |
  | `admin.contoh` | admin | Semua |
  | `l2.contoh` | L2 NOC | Semua |
  | `l1.contoh` | L1 Monitoring | Semua |
  | `l1.merapi` | L1 Monitoring | Hanya Bank Merapi Sejahtera |
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
- Data dummy dan akun contoh untuk uji bersama pengguna (opsional; kata sandi akun contoh
  wajib diberikan, tidak ada bawaan di staging):
  `docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml run --rm -e TYIO_SEED_PASSWORD=<sandi> app node dist/seed/run.js`
- Staging hanya bisa dipakai login lewat HTTPS, kecuali dibuka dari `localhost` di server
  itu sendiri (cookie sesi `Secure`). Sebelum TLS siap, `SESSION_COOKIE_SECURE=false`
  bisa dipakai sementara di jaringan tertutup; jangan di produksi.
- Database tidak membuka port ke host. Aplikasi terikat ke `127.0.0.1:8080` secara bawaan;
  akses dari jaringan lain dan TLS (R-I) disiapkan bersama keputusan hosting.
- Uji asap terhadap staging dari mesin pengembang:
  `E2E_BASE_URL=http://<alamat-staging>:8080 pnpm e2e smoke`
