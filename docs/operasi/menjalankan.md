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
| `ATTACHMENTS_DIR` | staging/produksi | Folder lampiran tiket. Di image sudah diisi `/app/data/lampiran`, dipasang sebagai volume `attachments` di compose. Dev dan uji memakai `data/lampiran` |
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
- Setiap rute API wajib ditandai `@TenantScoped()` (menyentuh data customer),
  `@NoTenantData('alasan')`, atau `@AllTenants('alasan')` (data lintas semua customer, mis.
  master data; pengguna yang dibatasi ke sebagian customer ditolak 403, juga admin).
  Aplikasi **menolak start** bila ada rute tanpa tanda, dan menyebut rutenya.

### Menu per peran

Siapa boleh membuka modul mana diatur di satu tempat: `MODULE_ROLES` di
`packages/shared/src/modules.ts`. Menu web membaca aturan yang sama, dan rute API modul
menegakkannya lewat `@RequireModule('<modul>')` (peran lain dijawab 403). Sementara (sampai
sesi hak akses): semua modul operasional untuk semua peran; **Admin** khusus peran admin.
Membuka `/admin` tanpa hak menampilkan halaman "tidak tersedia untuk peran Anda".

### Master data (Admin › Master data)

- Tiga daftar: **Customer**, **Kategori**, **Jarkom**. (Daftar System tidak dipakai lagi dan
  tidak tampil; datanya tetap di database.) Hanya untuk admin dengan
  akses ke semua customer, karena daftar ini berlaku untuk semua customer.
- **Kode**: huruf besar dan angka, 2–16 karakter, unik per daftar. Kode tidak bisa diubah
  setelah disimpan (kode customer dan jarkom menjadi bagian nomor tiket). Salah ketik: hapus
  selama belum dipakai, lalu buat ulang.
- **Nama**: unik per daftar tanpa membedakan huruf besar/kecil; bisa diganti langsung di tabel.
- **Hapus** hanya bila belum dipakai. Yang sudah dipakai ditolak dengan saran
  **nonaktifkan**: nilai nonaktif tidak muncul di pilihan baru, data lama tetap utuh.
- Data contoh dev: kategori dari dashboard lama (Remote Down, Corrective Maintenance,
  Preventive Maintenance); System dan Jarkom berisi nilai contoh sampai isinya dibahas
  bersama tim NOC.
- Untuk pengembang: tabel baru yang merujuk tabel master wajib memakai foreign key
  `ON DELETE RESTRICT`. Uji `pnpm test:api master` gagal bila ada yang memakai CASCADE,
  karena menghapus master akan ikut menghapus data yang merujuknya.

### Remote

- **Remote** di menu: daftar remote yang boleh dilihat pengguna (dibatasi customer), 50 per
  halaman. Cari Site ID, nama, kota, atau kanca; saring customer, provinsi, jarkom, status.
  Pencarian dan saringan tersimpan di alamat halaman, jadi bisa dibagikan.
- Detail remote: lokasi, zona waktu (WIB/WITA/WIT, mengikuti provinsi), jaringan, kanwil/kanca,
  tanggal online, dan kontak.
- Remote **tidak pernah dihapus** (tiket akan merujuknya); ubah statusnya menjadi Nonaktif atau
  Dibongkar.
- **Mengisi dan mengubah remote: Remote › Impor dari Excel**, khusus admin dengan akses semua
  customer (K18):
  1. Unduh template. Lembar "Remote" berisi judul kolom; lembar "Petunjuk" berisi aturan tiap
     kolom. Kolom wajib: Site ID, Nama Remote, Jarkom (kode di master data), Kota, Provinsi.
  2. Pilih customer, lalu pilih file .xlsx (paling banyak 10.000 remote, 20 MB). File dibaca di
     browser; server hanya menerima isi selnya.
  3. Periksa hasil: jumlah baru, diperbarui, tidak berubah, dan baris yang gagal beserta kolom
     dan masalahnya. **Bila ada satu baris saja yang gagal, tidak ada yang disimpan**; perbaiki
     di Excel lalu pilih filenya lagi.
  4. Simpan. Site ID yang sudah ada di customer itu diperbarui. Kolom yang **tidak ada** di file
     tidak mengubah data; sel yang **kosong** mengosongkan nilainya. Impor ulang file yang sama
     tidak mengubah apa pun.
- Telepon dan Site ID berawalan nol: isi sebagai teks di Excel (template sudah begitu), agar
  angka nolnya tidak hilang.
- Database: pencarian memakai ekstensi `pg_trgm` (dipasang migrasi; termasuk ekstensi
  "trusted", jadi cukup hak CREATE di database). Saat peran database produksi dipisah,
  pastikan migrasi tetap boleh membuat ekstensi ini, atau pasang lebih dulu oleh DBA.

### Membuat tiket (NPR)

- **Buat tiket** ada di header (layar lebar), di menu (ponsel), dan di halaman remote ("Buat
  tiket untuk remote ini"). Semua peran yang bisa membuka modul Tiket bisa membuat tiket untuk
  remote customer yang boleh dilihatnya.
- Pilih remote; lokasi, jarkom, jaringan, dan kontaknya tampil dari data remote dan **tidak
  diketik ulang**. Isi kategori, system (boleh kosong), waktu kejadian, dan keterangan.
- **Waktu kejadian** diisi menurut jam di lokasi remote (WIB/WITA/WIT tertulis di label),
  disimpan dalam UTC. Waktu pencatatan diisi sistem. Waktu di masa depan ditolak.
- **Nomor** dibuat sistem saat disimpan: `NPR/<jarkom>/<customer>/<tahun>/<bulan>/<urut>`.
  Urut per customer, jarkom, dan bulan; bulan menurut WIB saat tiket dibuat. Dua operator yang
  menyimpan bersamaan tidak pernah mendapat nomor yang sama, dan tiket yang gagal dibuat tidak
  memakan nomor.
- Bila remote masih punya **tiket terbuka**, form menampilkannya dan tiket baru hanya dibuat
  setelah operator mencentang konfirmasi. Pemeriksaan ini juga dilakukan server, termasuk saat
  dua operator menyimpan untuk remote yang sama pada saat yang sama.
- Remote yang dibongkar dan customer yang nonaktif tidak bisa dibuatkan tiket.
- Tiket tidak bisa dihapus.

### Linimasa dan status tiket

- Halaman tiket berisi **Tambah tindakan** dan **Linimasa** (urut waktu tindakan, terbaru di
  atas). Setiap entri mencatat waktu tindakan (diisi operator, jam lokasi remote) dan waktu
  pencatatan beserta nama pencatat (diisi sistem).
- **Alur status** (disetujui): Terbuka → Dikerjakan / Pending / Eskalasi / Selesai;
  Dikerjakan → Pending / Eskalasi / Selesai; Pending → Dikerjakan; Eskalasi → Dikerjakan;
  Selesai → Dikerjakan. Form hanya menawarkan jalur ini, dan server menolak jalur lain.
  Ditutup menyusul bersama aturan penutupan (langkah 1.6).
- **Pending** wajib memilih pihak yang ditunggu (Customer atau TM) dan alasannya; keduanya
  tampil di kepala tiket selama pending.
- Bila rekan mengubah status saat form Anda terbuka, penyimpanan ditolak dengan pesan, dan
  tiket dimuat ulang dengan status terbaru.
- **Linimasa tidak bisa diubah atau dihapus**, juga lewat SQL langsung (ditolak database).
  Kesalahan diperbaiki dengan **Koreksi** pada entri itu: entri baru yang merujuk entri lama;
  entri lama diberi tanda "Dikoreksi".
- **Lampiran**: gambar (PNG, JPEG, WebP) atau PDF, paling besar 5 MB, paling banyak 5 per
  tindakan. Pilih lewat "Lampirkan berkas", atau tempel tangkapan layar (Ctrl+V) di kolom
  Catatan. Jenis berkas diperiksa dari isinya; PDF selalu diunduh, tidak dibuka di halaman.
- **No. tiket customer** diisi atau diubah langsung di kepala tiket; setiap perubahan tercatat
  di linimasa.
- Operasi: lampiran disimpan di volume `attachments` dengan nama berkas acak; nama aslinya ada
  di database. **Backup harus mencakup volume ini bersama database**, karena keduanya saling
  merujuk.

### Jenis tindakan, pihak pending, dan tanda 7 hari (1.5c)

- **Jenis tindakan** di form Tambah tindakan (nama dari sistem lama):
  - **Bebas** (bawaan): catatan apa saja, perubahan status, atau lampiran.
  - **Cek lokasi**: minta PIC di lokasi mengecek. Wajib catatan, mis. siapa yang dihubungi.
  - **Problem**: hasil pengecekan PIC, yaitu penyebab masalahnya. Wajib catatan.

  Jenisnya tampil sebagai lencana di linimasa dan di kolom Tindakan terakhir daftar tiket.
  Eskalasi To SD (TT) dan Close menyusul di langkah 1.5b dan 1.6.
- **Pihak pending**: **TM** untuk problem jaringan (jarkom) di lokasi; **Customer** untuk
  listrik, obstacle, renovasi, atau part ATM yang belum siap.
- **Tanda "Down ≥ 7 hari"**: tiket yang belum Selesai dan waktu kejadiannya sudah 7 hari atau
  lebih ditandai merah di daftar dan detail, sebagai pengingat untuk memperbarui NPR.
- Kolom **System** tidak dipakai lagi dan tidak tampil di layar. Status remote yang dibongkar
  bernama **Dismantle**; impor Excel menerima "Dismantle" atau "Dibongkar".

### Daftar tiket dan pencarian

- **Tiket** di menu: daftar tiket yang boleh dilihat pengguna (dibatasi customer), 50 per
  halaman, waktu kejadian terbaru di atas. Tab:
  - **Aktif** (bawaan): belum Selesai.
  - **Milik saya**: tiket aktif yang Anda buat atau pernah Anda beri tindakan.
  - **Pending**, **Eskalasi**, **Selesai**, **Semua**.

  Angka di tab Aktif, Milik saya, Pending, dan Eskalasi ikut pencarian dan saringan yang
  sedang dipakai.
- Saringan: customer, kategori, jarkom. Kotak **Cari** menerima potongan no. NPR
  (mis. `2026/11/0002`), no. tiket customer, Site ID, nama, kota, atau kanca remote.
- Tab, pencarian, saringan, dan halaman tersimpan di alamat halaman. Alamatnya bisa
  dibagikan atau ditandai di browser, dan tombol kembali dari tiket membuka tab yang sama.
- Setiap baris menampilkan status (pending dengan pihak dan alasannya), waktu kejadian menurut
  jam lokasi remote, dan tindakan terakhir (waktu, pencatat, potongan catatan).
- **Pencarian global**: kotak di header (di ponsel ada di menu), untuk tiket dan remote
  sekaligus. Minimal 2 karakter. Hasil di halaman `/cari`, paling banyak 10 per jenis,
  dengan tautan ke daftar lengkap. Hanya jenis yang boleh dibuka peran Anda yang dicari.
- Database: jumlah di tab hanya membaca tiket aktif, dan pencarian memakai indeks trigram
  atas nomor tiket (migrasi `TicketList…`) serta indeks remote yang sudah ada. Diukur pada
  100.000 tiket: setiap panggilan di bawah 0,1 detik.

### Memasang aplikasi (PWA)

- Desktop (Chrome/Edge): ikon "Pasang" di bilah alamat. Ponsel Android: menu browser →
  "Tambahkan ke layar utama". iPhone (Safari): Bagikan → "Tambahkan ke Layar Utama".
- Pemasangan butuh HTTPS, kecuali dibuka dari `localhost`.
- Service worker hanya menyimpan cangkang aplikasi (HTML, JS, CSS, ikon). Jawaban `/api`
  tidak pernah disimpan, jadi data operasional selalu terbaru.
- Setelah rilis baru, aplikasi menampilkan "Versi baru portal tersedia" dengan tombol
  **Muat ulang sekarang**; tidak memuat ulang sendiri agar isian form tidak hilang.

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

  Seed dev juga mengisi 25 remote rekaan per customer contoh, tersebar di ketiga zona waktu.
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

**Cara yang disarankan: [Server demo (staging) di server sendiri](server-demo.md).** CI
menerbitkan image yang lolos semua uji ke `ghcr.io/felicidad126/tyio` (tag `sha-<commit>`,
dan tag `demo` untuk versi terbaru yang hijau di branch `claude/r0-fondasi`).
`deploy/scripts/server.sh` memasang, memperbarui, dan memeriksanya, dengan HTTPS lewat Caddy
(`deploy/compose.https.yml`), atau di belakang Nginx panel server seperti aaPanel (`--panel`).

Langkah manual tanpa HTTPS, untuk pemeriksaan di server itu sendiri:

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
