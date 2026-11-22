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
| `SESSION_IDLE_MINUTES` | tidak | Sesi berakhir setelah sekian menit tanpa aktivitas. Bawaan 30 (K28) |
| `SESSION_MAX_HOURS` | tidak | Sesi berakhir paling lama sekian jam setelah login. Bawaan 12 (K28) |
| `SESSION_COOKIE_SECURE` | tidak | `true`/`false`. Bawaan `true`, kecuali di `development` dan `test`. Lihat [Login dan akun](#login-dan-akun) |
| `TRUST_PROXY` | tidak | Jumlah reverse proxy di depan aplikasi (mis. `1`), agar IP klien dan HTTPS terbaca dari header proxy. Kosong = aplikasi diakses langsung; jangan diisi bila tidak ada proxy, karena IP klien jadi bisa dipalsukan |
| `SEED_USER_PASSWORD` | hanya seed di staging | Kata sandi semua akun dummy, minimal 12 karakter. Di `development`/`test` bawaannya `sandi-dev-tyio` |

Aplikasi menolak start bila konfigurasi tidak sah dan menyebut variabel yang bermasalah,
tanpa mencetak nilainya.

## Lingkungan lokal (pengembang)

Kebutuhan: Docker dengan Compose v2, Node.js 26, pnpm (lihat README).

```bash
pnpm install
pnpm dev:up          # bangun image, jalankan Postgres + migrasi + seed + aplikasi, tunggu sehat
pnpm e2e smoke auth shell  # uji asap, login, dan kerangka aplikasi terhadap http://localhost:8080
```

- Masuk di http://localhost:8080 dengan salah satu akun dummy di bawah. Kata sandi semuanya
  `sandi-dev-tyio` (hanya di development dan test; bukan rahasia).

  | Email | Nama | Peran | Customer |
  | --- | --- | --- | --- |
  | `admin@noc.example` | Admin NOC | Admin | semua |
  | `dewi@noc.example` | Dewi A. | L1 Monitoring | semua |
  | `rudi@noc.example` | Rudi H. | L1 Monitoring | hanya Bank Nusa (BNA) dan Bank Andalas (BAD) |
  | `arif@noc.example` | Arif S. | L2 NOC | semua |
  | `sari@noc.example` | Sari P. | L2 NOC | semua |

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
cp deploy/staging.env.example deploy/staging.env    # isi TYIO_IMAGE, TYIO_DB_PASSWORD, TYIO_BACKUP_PUBLIC_KEY
docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml up -d --wait
curl -s http://127.0.0.1:8080/api/health
```

- Kata sandi database: `openssl rand -hex 24` (heksadesimal aman di dalam URL).
- Backup terenkripsi harian berjalan otomatis (service `backup`); butuh kunci publik backup
  sebelum `up`. Cara membuat kunci, latihan restore, dan restore sungguhan:
  [backup.md](backup.md).
- Migrasi berjalan otomatis sebelum aplikasi. Membatalkan satu migrasi:
  `docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml run --rm app node dist/db/migrate.js down`
- Data dummy untuk uji bersama pengguna (opsional). Staging tidak punya kata sandi bawaan
  untuk akun dummy; isi sendiri (minimal 12 karakter) dan bagikan ke penguji lewat jalur aman:

  ```bash
  read -rs SEED_USER_PASSWORD && export SEED_USER_PASSWORD
  docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml run --rm -e SEED_USER_PASSWORD app node dist/seed/run.js
  ```
- Database tidak membuka port ke host. Aplikasi terikat ke `127.0.0.1:8080` secara bawaan;
  akses dari jaringan lain dan TLS (R-I) disiapkan bersama keputusan hosting.
- Uji asap terhadap staging dari mesin pengembang:
  `E2E_BASE_URL=http://<alamat-staging>:8080 pnpm e2e smoke`
- Uji login dan kerangka terhadap staging yang sudah di-seed: tambahkan
  `E2E_USER_PASSWORD=<kata sandi seed>` lalu `pnpm e2e auth shell`. Uji memakai akun dummy
  `dewi@`, `arif@`, dan `admin@noc.example` dari seed.

## Login dan akun

- Login memakai email dan kata sandi (K27). Sesi berakhir setelah 30 menit tanpa aktivitas
  atau 12 jam setelah login, mana yang lebih dulu (K28). Logout mencabut sesi di server.
- Pengguna bawaan boleh melihat semua customer; pengguna tertentu bisa dibatasi ke beberapa
  customer (K26). Peran: L1 Monitoring (`l1`), L2 NOC (`l2`), Admin (`admin`).
- Lima kali gagal login untuk satu email dalam 15 menit mengunci email itu sampai 15 menit
  sejak kegagalan pertama; dua puluh kali gagal dari satu IP mengunci IP itu. Kunci habis
  sendiri. Login berhasil mengatur ulang hitungan email.

### Membuat pengguna (termasuk admin pertama)

Belum ada halaman admin untuk pengguna; akun dibuat dengan perintah di server (K29).
Kata sandi diminta dua kali tanpa ditampilkan, minimal 12 karakter:

```bash
docker compose --env-file deploy/staging.env -f deploy/compose.staging.yml run --rm app node dist/modules/users/create-user.js --email admin@contoh.co.id --name "Nama Admin" --role admin
```

- `--role` salah satu dari `l1`, `l2`, `admin`.
- `--tenants BNA,BAD` membatasi akses ke customer berkode itu; tanpa opsi ini, semua customer.
- Dari skrip, kata sandi bisa dikirim lewat pipa (tambahkan `-T` setelah `run`); jangan pernah
  sebagai argumen, karena argumen tercatat di riwayat shell.
- Di lingkungan lokal tanpa Docker: `node apps/api/dist/modules/users/create-user.js ...`
  dengan `TYIO_ENV` dan `DATABASE_URL` terisi. Bantuan: `--help`.

### Memasang aplikasi (PWA)

Portal bisa dipasang seperti aplikasi: di Chrome/Edge desktop lewat ikon "Pasang" di bilah
alamat, di Android lewat menu "Tambahkan ke layar utama", di iPhone lewat Bagikan → "Tambahkan
ke Layar Utama".

- Butuh **HTTPS** (atau `http://localhost`). Selama staging dibuka lewat `http://<alamat-server>`,
  aplikasi tetap jalan di peramban, tetapi tidak bisa dipasang dan tidak punya service worker.
- Service worker hanya menyimpan berkas aplikasi (HTML, JS, CSS, ikon). Jawaban API (data
  customer) tidak pernah disimpan di perangkat.
- Setelah rilis baru, pengguna melihat pesan "Versi baru portal tersedia" dengan tombol
  "Muat ulang sekarang"; halaman tidak dimuat ulang sendiri di tengah pekerjaan. Layar yang
  menyala terus memeriksa versi baru setiap jam.

### Jejak audit

Setiap perubahan data (customer, pengguna, akses customer, dan tabel data berikutnya)
tercatat otomatis di tabel `audit_log`: siapa, kapan, dari mana (IP), dan apa yang berubah.
Login, login gagal, dan logout juga tercatat. Hash kata sandi tidak pernah ikut tercatat.

- Membaca: `GET /api/audit` dengan sesi admin (terbaru dulu; `?limit=`, `?before=`,
  `?tenantId=`). Admin yang dibatasi ke beberapa customer hanya melihat catatan customer itu.
  Halaman admin untuk audit menyusul.
- Catatan tidak bisa diubah atau dihapus, juga oleh aplikasi sendiri.
- Perbaikan data langsung di database **wajib menyebut siapa pelakunya**; tanpa itu
  database menolak perubahannya:

  ```sql
  BEGIN;
  SELECT set_config('tyio.source', 'manual', true), set_config('tyio.actor_label', 'Nama Operator: alasan', true);
  UPDATE tenants SET name = 'Bank Nusa' WHERE code = 'BNA';
  COMMIT;
  ```

- Status, mulai gangguan, dan nomor tiket customer NPR tidak bisa diubah dengan UPDATE
  (langkah 1.4). Perbaikan manual ditambahkan sebagai entri linimasa, dengan konteks yang sama:

  ```sql
  BEGIN;
  SELECT set_config('tyio.source', 'manual', true), set_config('tyio.actor_label', 'Nama Operator: alasan', true);
  INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to, created_by)
  SELECT tenant_id, id, 'catatan', 'Perbaikan manual: alasan', now(), status, 'dikerjakan',
         (SELECT id FROM users WHERE email = 'operator@contoh')
    FROM tickets WHERE number = 'NPR/VSAT/BNA/2026/11/0418';
  COMMIT;
  ```

- Belum diatur: lama penyimpanan audit (bersama checklist kepatuhan, langkah 0.6) dan
  pencatatan siapa *melihat* data (R-I, sebelum produksi).

### Cookie Secure dan HTTPS

Di staging dan produksi cookie sesi bertanda Secure, jadi peramban hanya menyimpannya lewat
HTTPS atau `http://localhost`. Selama staging belum punya TLS (R-I) dan dibuka lewat
`http://<alamat-server>` dari mesin lain, login tampak berhasil lalu kembali ke halaman login.
Sementara itu isi `TYIO_SESSION_COOKIE_SECURE=false` di `deploy/staging.env`, dan kembalikan ke
`true` begitu TLS terpasang. Bila TLS ditutup oleh reverse proxy di depan aplikasi, isi juga
`TYIO_TRUST_PROXY=1`, dan pastikan proxy meneruskan header `Host` asli; permintaan yang
mengubah data dari origin lain ditolak 403.
