# Portal NOC Terpusat — Langkah teknis per rilis

Induk: [portal-noc-terpusat.md](portal-noc-terpusat.md) (keputusan K1–K14, rekomendasi R-A s.d. R-I — disetujui).
Status: **R0 0.1–0.5 selesai** (pemasangan staging dan 0.6 menunggu keputusan hosting); **R1 berjalan — 1.1–1.4 selesai** (titik periksa alur tiket bersama user). T1–T12 dan pilihan versi 0.1 disetujui 2026-11-16; 0.1–0.2 masuk `main` lewat PR #1.

Cara baca: tiap langkah satu alur utuh (data → API → layar), berukuran S atau M, dengan
kriteria terima, perintah verifikasi, dan langkah yang harus selesai lebih dulu.
Langkah yang semua pendahulunya selesai boleh dikerjakan paralel.

## A. Keputusan teknis turunan

| # | Keputusan | Alasan |
| --- | --- | --- |
| T1 | Satu repo (monorepo pnpm): `apps/api`, `apps/web`, `packages/shared`, `deploy/`, `docs/` | Satu versi, satu rilis; tipe data dipakai bersama depan–belakang |
| T2 | API NestJS, satu modul per domain di `apps/api/src/modules/<nama>` | Monolit modular (R-A) |
| T3 | PostgreSQL + TypeORM dengan migrasi; setiap migrasi punya jalur turun | Rilis bisa dibatalkan |
| T4 | Web Vue 3 + Vite + Pinia + Vue Router, komponen Tabler, PWA lewat plugin Vite | Tampilan admin siap pakai, mudah dirawat |
| T5 | Login sesi dengan cookie httpOnly; kata sandi di-hash argon2; SSO menyusul di R8 | Lebih sederhana dan lebih aman daripada token di browser |
| T6 | Data langsung ke layar memakai SSE (server-sent events) | Cukup untuk layar 24/7; lebih sederhana daripada WebSocket |
| T7 | Pekerjaan latar (notifikasi, SLA, laporan) memakai antrean berbasis PostgreSQL | Tidak menambah komponen baru (R-B) |
| T8 | Lampiran disimpan di volume disk yang ikut backup; nama berkas diacak | Paling sederhana; bisa dipindah ke penyimpanan objek kelak |
| T9 | Setiap tabel domain punya `tenant_id`; penyaringan tenant dipasang di satu tempat (lapisan repositori), bukan di tiap query | Satu titik kebocoran yang dijaga dan diuji |
| T10 | Linimasa tiket hanya-tambah: tidak ada UPDATE/DELETE pada tabel tindakan | R-F |
| T11 | Uji: Vitest + database PostgreSQL asli untuk API; Playwright untuk alur layar | Uji di jahitan tinggi, bukan mock |
| T12 | Waktu `timestamptz` UTC; zona tampilan mengikuti lokasi remote, dengan pilihan zona pengguna | R-H |

**Pilihan versi yang diambil saat 0.1** (disetujui bersama T1–T12; semua dipin persis):

| Komponen | Versi | Alasan |
| --- | --- | --- |
| Node.js | 26 LTS | Active LTS sampai Okt 2027, didukung sampai Apr 2029; Node 22 berakhir Apr 2027 |
| pnpm | 12.21.0 | Versi terbaru; setelan di `pnpm-workspace.yaml`, install script dependensi diblokir bawaan |
| NestJS | 12 (ESM) | Nest 12 sudah ESM; API ikut ESM sesuai templat resminya |
| TypeScript | 6.0.3 | TypeScript 7 belum didukung typescript-eslint (peer `<6.1.0`) |
| Vitest | 5 tanpa SWC | Transform Vite 8 (Oxc) sudah memancarkan metadata dekorator; dibuktikan uji mutasi |
| Lint | ESLint 10 + typescript-eslint + eslint-plugin-vue, tanpa info tipe | Satu konfigurasi untuk Vue dan Nest; cek tipe di `pnpm build` |

**Keputusan yang diambil saat 0.2** (turunan R-A, R-B, T3, T5, T11, T12):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T13 | Satu image Docker berisi API + hasil build web; API di `/api`, web di jalur lain, satu origin | R-A satu yang di-deploy; cookie sesi (T5) tanpa CORS; tanpa web server tambahan |
| T14 | Migrasi dan seed adalah langkah terpisah dari image yang sama, sebelum aplikasi start; aplikasi tidak menjalankan migrasi sendiri | Migrasi gagal = rilis gagal yang terlihat, bukan aplikasi yang restart berulang |
| T15 | `TYIO_ENV` wajib tanpa nilai bawaan; seed data dummy ditolak bila `production` | Produksi tidak pernah diam-diam dianggap dev |
| T16 | PostgreSQL 18 dipin digest, sama di dev, CI, dan staging; sesi database dipaksa UTC | Migrasi diuji di versi yang sama dengan yang dipasang; T12 |
| T17 | TypeORM 1.1 (stabil, mendukung ESM); daftar entity/migrasi eksplisit di satu berkas (`db/registry.ts`) | Tanpa glob yang rapuh di ESM; konfigurasi aplikasi dan skrip migrasi tidak bisa menyimpang |
| — | Registry image untuk staging: **belum diputuskan** | Bergantung pada hosting (lihat bagian D) |

**Keputusan yang diambil saat 0.3** (mohon dicek; turunan R-E, R-I, T5, T9, K20–K24):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T18 | Pengguna punya satu peran (L1, L2, admin) dan cakupan tenant: **semua customer** atau **daftar customer tertentu** (`user_tenants`). Tabel pengguna sendiri tanpa `tenant_id` | Tim NOC memantau semua bank; pembatasan per bank tetap mungkin; akun pihak bank kelak cukup diberi satu tenant |
| T19 | Sesi disimpan di PostgreSQL; cookie berisi token acak 256-bit, database hanya menyimpan hash SHA-256-nya. Cookie `HttpOnly`, `SameSite=Lax`; di staging/produksi `Secure` dengan awalan `__Host-`. Berakhir setelah 12 jam tidak dipakai, paling lama 7 hari | T5 tanpa komponen baru; isi database yang bocor tidak bisa dipakai untuk masuk |
| T20 | Kata sandi di-hash argon2id dari modul `crypto` bawaan Node 26 (parameter OWASP), tanpa dependensi native | T5 tanpa install script dan tanpa toolchain build di image |
| T21 | Pembatasan login: 5 gagal per nama pengguna atau 20 gagal per IP dalam 15 menit → HTTP 429; dicatat di PostgreSQL dengan nama pengguna di-hash | Berlaku di kedua server produksi sekaligus; isian salah ketik tidak tersimpan apa adanya |
| T22 | Semua endpoint wajib login (guard global); yang publik harus ditandai `@Public()` | Endpoint baru otomatis terlindungi; lupa menandai berarti tertutup, bukan terbuka |
| T23 | Entity memakai `EntitySchema` tanpa dekorator, nama constraint eksplisit; uji memastikan hasil migrasi sama persis dengan entity | Sesuai pedoman database Anda; menghindari masalah relasi melingkar di ESM |

**Keputusan yang diambil saat 0.4** (mohon dicek; turunan T9, T10, R-F, R-I):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T24 | Audit perubahan data ditulis **trigger PostgreSQL** pada setiap tabel data; perubahan tanpa pelaku (`tyio.actor`, diisi aplikasi per transaksi) **ditolak** database; `audit_log` hanya-tambah | Mencakup juga perubahan lewat SQL mentah atau manual, dan tidak bisa lupa dipanggil; uji gagal bila tabel baru tidak dipasangi trigger |
| T25 | Filter tenant hanya di `TenantScopedRepository`, yang mengunci query: `andWhere` selalu dikurung, `where`/`orWhere` ditolak | Tiga cara bocor yang nyata di query builder (`where`, `orWhere`, `OR` di `andWhere`) tertutup di satu tempat |
| T26 | Setiap rute wajib bertanda `@TenantScoped()` atau `@NoTenantData('alasan')`; aplikasi menolak start bila ada yang lupa. Uji lintas-tenant menelusuri semua rute terdaftar | Rute baru tidak bisa lolos tanpa keputusan; uji tidak perlu diperbarui manual untuk tiap rute |
| T27 | Data customer lain dijawab 404, bukan 403 | Tidak mengungkap bahwa data itu ada |

**Keputusan yang diambil saat 0.5** (mohon dicek; turunan T4, K18, K24):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T28 | Hak buka modul di satu tempat (`MODULE_ROLES` di `packages/shared`), dibaca menu web dan kelak penjaga API. **Sementara**: modul operasional untuk L1, L2, admin; Admin khusus admin | Tombol yang tampil selalu sama dengan yang diizinkan; matriks rinci menunggu sesi hak akses (8.1) |
| T29 | Pembaruan PWA ditawarkan ("Muat ulang sekarang"), tidak dimuat paksa; service worker tidak menyimpan `/api` | Isian form operator tidak hilang; data operasional tidak tampil basi |
| T30 | Sidebar terbuka mulai 768 px; di bawahnya menu lewat tombol. Isi halaman dibatasi 1280 px, shell melebar penuh | Mengikuti standar viewports (tiga titik ukuran, batas lebar hanya untuk konten); layar dinding mendapat mode sendiri di 2.4 |

**Keputusan yang diambil saat 1.1** (mohon dicek; turunan R-E, R-F, T9, T23, T28, K11, K18):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T31 | Customer = baris `tenants`; kategori, system, dan jarkom = tiga tabel global (tanpa `tenant_id`) berbentuk sama dengan tenants: kode, nama, aktif. Satu halaman Admin › Master data dengan satu tab per daftar | Satu pola untuk empat daftar; customer tidak punya salinan kedua yang bisa menyimpang |
| T32 | Kode: huruf besar dan angka 2–16, unik per daftar, **tidak bisa diubah** setelah dibuat. Nama: unik per daftar tanpa membedakan huruf besar/kecil, bisa diubah | Kode customer dan jarkom menjadi bagian nomor tiket (1.3); dua nama yang hanya beda huruf membingungkan operator |
| T33 | "Sudah dipakai" ditentukan database: setiap foreign key ke tabel master wajib `ON DELETE RESTRICT` (dijaga uji). Hapus yang ditolak dijawab 409 dengan tawaran menonaktifkan; nonaktif = tidak ditawarkan untuk data baru, data lama tetap | Tidak ada daftar "pemakai" yang harus diperbarui tiap tabel baru; CASCADE yang diam-diam menghapus remote/tiket tertangkap uji |
| T34 | Hak modul ditegakkan di API: `@RequireModule` membaca `MODULE_ROLES` yang sama dengan menu. Kebijakan tenant ketiga `@AllTenants`: rute data lintas customer hanya untuk pengguna dengan akses semua customer (403 untuk yang dibatasi, termasuk admin) | T28 kini juga ditegakkan server; master berlaku untuk semua bank, jadi admin yang dibatasi ke satu bank tidak boleh mengubahnya |
| T35 | Dialog memakai elemen `<dialog>` bawaan browser, bukan JS modal Bootstrap atau pustaka modal. Tambah = panel dari kanan; ganti nama = langsung di sel tanpa menggeser baris; hapus = konfirmasi yang menyebut namanya, fokus awal di Batal | Fokus, Escape, dan lapisan teratas diurus browser tanpa dependensi baru; pola permukaan sesuai standar UX yang dipakai |

**Keputusan yang diambil saat 1.2** (mohon dicek; turunan R-E, R-H, T8, T9, T12, K18):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T36 | Remote dikenali dari **Site ID, unik per customer** (disimpan huruf besar). Remote tidak pernah dihapus; statusnya **Aktif / Nonaktif / Dibongkar** — *nilai status ini usulan, mohon dikonfirmasi* | Tiket kelak merujuk remote; riwayat tidak boleh hilang. Site ID menjadi kunci impor ulang |
| T37 | Provinsi dipilih dari 38 provinsi (penulisan umum seperti "Jatim", "DIY" dikenali); **zona waktu ditentukan dari provinsi**, tidak diisi | Setiap provinsi berada di satu zona; satu sumber kebenaran untuk tampilan waktu (R-H) |
| T38 | Kontak terstruktur (nama, peran, telepon, email), paling banyak 5, disimpan sebagai daftar di baris remote; impor mengisi sampai 3 | Menggantikan kolom kontak yang dipakai untuk catatan bebas; tidak menambah tabel ber-tenant baru |
| T39 | Membaca remote: semua peran, dibatasi customer. Mengisi/mengubah: **hanya admin dengan akses semua customer**, di 1.2 lewat impor Excel; form ubah satu remote menyusul bila dibutuhkan | K18 (daftar remote ranah admin); satu jalur tulis yang diuji dulu |
| T40 | File Excel **dibaca di browser** (`fflate` + pembaca kecil yang diuji); API hanya menerima teks per sel. Impor dua tahap: periksa (laporan per baris dan kolom), lalu simpan **semua-atau-tidak** dalam satu transaksi. Kolom tak ada di file = tidak diubah; sel kosong = dikosongkan | Server tidak mengurai file kiriman pengguna; tidak ada impor setengah jadi; impor ulang aman. `read-excel-file` tidak dipakai: 4 paket satu pengelola yang dirilis hampir tiap hari |
| T41 | Pencarian memakai **indeks trigram** (`pg_trgm`) atas Site ID, nama, kota, kanca; daftar 50 per halaman dengan total, urut Site ID (berindeks) | Diukur pada 50.000 remote: cari 1–3,5 ms, halaman pertama 0,04 ms |

**Keputusan yang diambil saat 1.3** (mohon dicek; turunan R-E, R-F, R-H, T9, T12):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T42 | Tiket merujuk remote, **tidak menyalin** alamat/kota/jarkom. Customer tiket = customer remote, dijaga database (foreign key gabungan remote + customer) | Kelemahan sistem lama (diketik ulang); tiket tidak mungkin "pindah" customer |
| T43 | Nomor `NPR/<jarkom>/<customer>/<tahun>/<bulan>/<urut 4 digit>`; urut per customer, jarkom, dan bulan dari penghitung yang dikunci dalam transaksi yang sama. **Bulan menurut WIB saat tiket dibuat**, bukan waktu kejadian — *mohon konfirmasi WIB* | Tidak bentrok saat serentak, tidak ada nomor terbuang bila gagal; tiket yang dicatat terlambat tidak mengacak urutan bulan lalu |
| T44 | Waktu kejadian diisi menurut **jam lokasi remote** (zona tertulis di label), disimpan UTC; waktu pencatatan diisi sistem; masa depan ditolak (toleransi 5 menit) | R-F (waktu kejadian terpisah dari pencatatan), R-H (zona mengikuti lokasi) |
| T45 | Remote dengan tiket terbuka: server menolak (409) kecuali operator mengonfirmasi; baris remote dikunci saat membuat tiket sehingga dua operator bersamaan tidak lolos tanpa peringatan. "Terbuka" = belum ditutup, lepas dari alur status 1.4 | Mencegah tiket ganda untuk satu gangguan tanpa melarang gangguan kedua yang sah |
| T46 | Status awal "Terbuka"; status lain menunggu alur yang disetujui (1.4). System **opsional** sampai artinya dibahas. Remote dibongkar dan customer nonaktif tidak bisa dibuatkan tiket | Tidak menebak alur status; tidak memaksa kolom yang artinya belum jelas |
| T47 | "Buat tiket" adalah aksi global (header, menu ponsel, halaman remote) untuk peran dengan modul Tiket. Rute tenant yang mengubah data wajib terdaftar dengan uji lintas-tenantnya sendiri | Prinsip pengemasan (aksi global); harness tidak bisa diam-diam melewatkan rute tulis |

**Keputusan yang diambil saat 1.4** (mohon dicek; turunan R-F, R-H, T8, T10, K21):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T48 | Alur status yang disetujui menjadi satu tabel di `@tyio/shared`; API menolak jalur lain (400), web hanya menawarkan jalur yang sah. "Ditutup" ditambahkan bersama aturan K21 di 1.6 | Satu sumber aturan; tidak ada tombol yang menjanjikan jalur yang akan ditolak |
| T49 | Linimasa dan lampiran **hanya-tambah, dijaga trigger database** (UPDATE/DELETE ditolak, juga lewat SQL langsung). Koreksi = entri baru yang merujuk entri lama di tiket yang sama; entri lama ditandai "Dikoreksi" | T10/R-F: jejak tindakan bisa dipercaya untuk SLA dan audit |
| T50 | Perubahan status mengunci tiket dan wajib menyebut status yang dilihat operator; bila sudah berubah → 409, pesan tetap tampil, tiket dimuat ulang | Dua operator tidak saling menimpa keputusan tanpa sadar |
| T51 | Pending wajib pihak (Customer/TM) dan alasan; selama pending keduanya juga tersimpan di tiket | Syarat 1.4; antrean (1.5) bisa menampilkan "pending oleh" tanpa membaca linimasa |
| T52 | Lampiran: gambar PNG/JPEG/WebP atau PDF, ≤ 5 MB, ≤ 5 per tindakan, **jenis dari isi berkas**; disimpan di volume dengan nama acak (T8); diunduh lewat API yang dibatasi customer dengan `nosniff` dan CSP `sandbox`; PDF selalu diunduh. Tangkapan layar bisa ditempel langsung | Berkas kiriman pengguna tidak bisa menyamar atau dijalankan sebagai halaman; cara kerja operator (tempel tangkapan layar) didukung |
| T53 | Linimasa diurutkan menurut **waktu tindakan** (per menit), lalu waktu pencatatan | Cerita tiket urut kejadian walau dicatat terlambat; waktu catat tetap terlihat di setiap entri |
| T54 | Nomor tiket customer kolom sendiri, diubah di tempat, setiap perubahan tercatat di linimasa. Pilihan "Take Action" sistem lama **belum** dipasang | Menunggu arti pilihan itu dari tim NOC; catatan + status sudah menutup kebutuhan alur |

Perintah verifikasi yang dipakai di bawah: `pnpm test:api <pola>` (uji API),
`pnpm e2e <berkas>` (uji layar), `pnpm lint`, `pnpm build`.

## B. Rilis

### R0 — Fondasi
Selesai bila: aplikasi bisa dipasang di perangkat, login jalan, backup bisa di-restore.

**0.1 Kerangka repo dan pipeline (S)**
- Terima: `pnpm build` dan `pnpm lint` lulus di repo kosong; CI menjalankan keduanya + uji di setiap push.
- Verifikasi: `pnpm lint && pnpm build && pnpm test:api health`
- Berkas: `package.json`, `pnpm-workspace.yaml`, `apps/api/`, `apps/web/`, `packages/shared/`, `.github/workflows/ci.yml`
- Uji di: endpoint `/health` · Menunggu: tidak ada

**0.2 Lingkungan lokal dan staging (S)**
- Terima: satu perintah menyalakan API + web + database dengan data dummy; staging dipasang dari artefak CI yang sama.
- Verifikasi: `pnpm dev:up && pnpm e2e smoke`
- Berkas: `deploy/compose.dev.yml`, `deploy/compose.staging.yml`, `apps/api/src/seed/`, `docs/operasi/menjalankan.md`
- Uji di: halaman login terbuka · Menunggu: 0.1

**0.3 Tenant, pengguna, login (M)**
- Terima: login/logout dengan sesi; pengguna terikat ke tenant dan peran (L1 Monitoring, L2 NOC, admin — lihat K20, K23, K24; L3 menyusul); percobaan login gagal dibatasi.
- Verifikasi: `pnpm test:api auth && pnpm e2e auth`
- Berkas: `apps/api/src/modules/{tenants,users,auth}/`, `apps/web/src/pages/login/`, migrasi awal
- Uji di: `POST /auth/login`, alur login di browser · Menunggu: 0.2

**0.4 Isolasi tenant dan audit log (M)**
- Terima: pengguna tenant A tidak bisa membaca data tenant B lewat API mana pun; setiap perubahan data tercatat (siapa, kapan, apa, dari mana).
- Verifikasi: `pnpm test:api tenant-isolation audit`
- Berkas: `apps/api/src/common/{tenant,audit}/`
- Uji di: uji lintas-tenant yang berjalan terhadap semua endpoint terdaftar · Menunggu: 0.3

**0.5 Kerangka PWA dan navigasi (S)**
- Terima: aplikasi bisa dipasang di desktop dan ponsel; menu Overview · Alert · Tiket · Gamas · Remote · Laporan · Dokumen · Admin tampil sesuai peran; layout dipakai dari 375px sampai layar dinding.
- Verifikasi: `pnpm e2e shell`
- Berkas: `apps/web/src/{layouts,router,stores}/`, manifest PWA
- Uji di: navigasi per peran · Menunggu: 0.3

**0.6 Backup, restore, dan checklist kepatuhan (S)**
- Terima: backup terjadwal terenkripsi; latihan restore ke server bersih berhasil dan terdokumentasi; checklist bank/OJK terisi dengan status tiap butir.
- Verifikasi: `deploy/scripts/latihan-restore.sh` (keluar 0 bila data hasil restore cocok)
- Berkas: `deploy/scripts/`, `docs/operasi/backup.md`, `docs/kepatuhan/checklist.md`
- Uji di: latihan restore · Menunggu: 0.2 · **Butuh: keputusan hosting**

### R1 — Remote + Tiket
Selesai bila: satu gangguan tercatat dari awal sampai ditutup tanpa sistem lama.

**1.1 Master data: customer, kategori, system, jarkom (S)**
- Terima: admin mengelola daftar; nilai tidak bisa dihapus bila sudah dipakai (hanya dinonaktifkan).
- Verifikasi: `pnpm test:api master`
- Berkas: `apps/api/src/modules/master/`, `apps/web/src/pages/admin/master/`
- Menunggu: 0.4, 0.5

**1.2 Remote: daftar, detail, impor (M)**
- Terima: remote menyimpan identitas, lokasi (alamat, kota, provinsi, koordinat, zona waktu), jaringan (IP SNMP, IP LAN, user IP/ID), kontak terstruktur, kanwil/kanca, tanggal online, status; impor dari Excel dengan laporan baris gagal; daftar bisa dicari dan disaring untuk ribuan baris.
- Verifikasi: `pnpm test:api remotes && pnpm e2e remotes`
- Berkas: `apps/api/src/modules/remotes/`, `apps/web/src/pages/remotes/`
- Uji di: impor 5.000 baris dummy, pencarian · Menunggu: 1.1

**1.3 Buat tiket (M)**
- Terima: pilih remote → data lokasi dan jaringan terisi otomatis dan hanya-baca; nomor `NPR/JARKOM/CUSTOMER/TAHUN/BULAN/urut` dibuat sistem tanpa bentrok saat dua operator menyimpan bersamaan; remote dengan tiket terbuka memberi peringatan.
- Verifikasi: `pnpm test:api tickets.create && pnpm e2e ticket-create`
- Berkas: `apps/api/src/modules/tickets/`, `apps/web/src/pages/tickets/new/`
- Uji di: `POST /tickets` termasuk uji serentak · Menunggu: 1.2

**1.4 Linimasa tindakan dan mesin status (M)**
- Terima: tindakan hanya bisa ditambah; koreksi adalah entri baru yang merujuk entri lama; perpindahan status hanya lewat jalur yang sah; pending wajib memilih pihak (Customer/TM) dan alasan; lampiran lewat klik atau tempel; nomor tiket customer punya kolom sendiri.
- Verifikasi: `pnpm test:api tickets.actions tickets.status && pnpm e2e ticket-detail`
- Berkas: `apps/api/src/modules/tickets/{actions,status}/`, `apps/web/src/pages/tickets/detail/`
- Uji di: tabel transisi status · Menunggu: 1.3 · **Butuh: alur status disetujui user**

**1.5 Antrean tiket dan pencarian global (M)**
- Terima: daftar dengan filter tersimpan (milik saya, pending, eskalasi), kolom status dan pending menonjol; pencarian global menemukan no. NPR, no. TT, no. tiket customer, nama remote.
- Verifikasi: `pnpm test:api tickets.list search && pnpm e2e ticket-queue`
- Berkas: `apps/web/src/pages/tickets/list/`, `apps/api/src/modules/search/`
- Menunggu: 1.4

**1.5b Open Ticket (TT) ke Service Delivery (M)** — dipindah dari 3.2 (K16)
- Terima: dari NPR aktif, operator membuat TT bernomor `TT/…` berisi problem jarkom dan lokasi; TT tampil di linimasa NPR yang sama; satu NPR bisa punya lebih dari satu TT; daftar TT aktif terpisah dari daftar NPR aktif; tombol "salin ringkasan TT" menyalin teks siap tempel ke chat (no. TT, remote, lokasi, problem, kontak) dan tercatat di linimasa (K25).
- Verifikasi: `pnpm test:api trouble-tickets && pnpm e2e tt`
- Berkas: `apps/api/src/modules/trouble-tickets/`, `apps/web/src/pages/tickets/tt/`
- Menunggu: 1.4

**1.6 Aturan penutupan dan halaman riwayat remote (S)**
- Terima: L1 bisa menutup NPR tanpa TT; NPR dengan TT dan TT itu sendiri hanya bisa ditutup L2 ke atas (K21; ditolak API, bukan hanya tombol disembunyikan); penutupan wajib isi penyebab dan penyelesaian; halaman remote menampilkan seluruh riwayat tiketnya.
- Verifikasi: `pnpm test:api tickets.close && pnpm e2e ticket-close`
- Menunggu: 1.4

**1.7 Produksi pertama (M)**
- Terima: dua server dengan replika database; latihan pindah ke server cadangan berhasil; pemantauan dari luar aktif; TLS di semua koneksi.
- Verifikasi: `deploy/scripts/latihan-failover.sh` + uji asap di produksi
- Berkas: `deploy/compose.prod.yml`, `docs/operasi/{rilis,failover}.md`
- Menunggu: 0.6, 1.6 · **Butuh: server produksi**

### R2 — Overview + monitor 24/7
Selesai bila: angka Overview cocok dengan daftar tiket; layar dinding jalan 24 jam tanpa disentuh.

**2.1 Ringkasan dan analitik kejadian (M)**
- Terima: jumlah tiket per status, per kategori, per customer; tren harian; remote paling sering bermasalah; setiap angka bisa diklik menuju daftar yang jumlahnya sama persis.
- Verifikasi: `pnpm test:api overview` (angka dibandingkan dengan query daftar)
- Berkas: `apps/api/src/modules/overview/`, `apps/web/src/pages/overview/`
- Menunggu: 1.5

**2.2 Pembaruan langsung dan alert di dashboard (S)**
- Terima: tiket baru/berubah muncul tanpa muat ulang; koneksi putus terlihat jelas dan menyambung sendiri; setiap panel menampilkan "data terakhir diterima".
- Verifikasi: `pnpm test:api stream && pnpm e2e live-update`
- Berkas: `apps/api/src/modules/stream/`, `apps/web/src/composables/useStream.ts`
- Menunggu: 2.1

**2.3 Peta remote (M)**
- Terima: marker berkelompok, warna sesuai status, klik menuju remote; lancar dengan ribuan titik.
- Verifikasi: `pnpm e2e map`
- Berkas: `apps/web/src/pages/overview/map/`
- Menunggu: 2.1 · **Belum jelas: sumber ubin peta bila jaringan NOC tertutup dari internet**

**2.4 Mode layar dinding (S)**
- Terima: tanpa interaksi, teks terbaca dari jauh, berputar antarpanel, bunyi saat kejadian kritis, tidak keluar sesi sendiri, pulih sendiri setelah jaringan putus.
- Verifikasi: `pnpm e2e wall` + uji rendam 24 jam di staging
- Berkas: `apps/web/src/pages/wall/`
- Menunggu: 2.2

### R3 — Gamas + laporan teknisi
Selesai bila: satu Gamas menutup banyak tiket sekaligus; TT tercatat di linimasa tiket.

**3.1 Gamas: buat, tautkan, tutup (M)**
- Terima: Gamas menyimpan waktu mulai/selesai, durasi, penyebab, troubleshooting, penyelesaian; remote dan tiket bisa ditautkan massal; menutup Gamas menawarkan penutupan tiket anak.
- Verifikasi: `pnpm test:api gamas && pnpm e2e gamas`
- Berkas: `apps/api/src/modules/gamas/`, `apps/web/src/pages/gamas/`
- Menunggu: 1.6 · **Butuh: sesi detail Gamas**

**3.2 Penugasan teknisi pada TT (S)** — TT dasar sudah dibuat di 1.5b
- Terima: eskalasi ke lapangan membuat TT bernomor `TT/…`; tindakan TT tampil di linimasa tiket yang sama; satu tiket bisa punya lebih dari satu TT.
- Verifikasi: `pnpm test:api trouble-tickets && pnpm e2e tt`
- Berkas: `apps/api/src/modules/trouble-tickets/`
- Menunggu: 1.5b

**3.3 Hasil kunjungan SD (S)** — diubah karena SD tidak login (K23)
- Terima: L1/L2 mencatat hasil kunjungan SD (waktu tiba, temuan, perangkat diganti, foto dari SD) di linimasa TT; TT tidak bisa ditutup tanpa hasil kunjungan.
- Verifikasi: `pnpm test:api trouble-tickets.visit && pnpm e2e tt-visit`
- Berkas: `apps/api/src/modules/trouble-tickets/`, `apps/web/src/pages/tickets/tt/`
- Menunggu: 3.2

### R4 — SLA + Laporan
Selesai bila: laporan bulanan dihasilkan tanpa olah manual di Excel.

**4.1 Aturan SLA dan jam berjalan (M)**
- Terima: aturan per tenant/kategori; jam berhenti saat pending sesuai aturan; hitung mundur tampil di antrean dan detail; pelanggaran tercatat. Jam dihitung dari linimasa, bukan disimpan sebagai angka.
- Verifikasi: `pnpm test:api sla` (tabel skenario waktu)
- Berkas: `apps/api/src/modules/sla/`
- Menunggu: 1.4 · **Butuh: sesi aturan SLA**

**4.2 Template laporan dan ekspor (M)**
- Terima: laporan NPR, Gamas, SLA, dan teknisi dengan filter periode/customer/kategori; ekspor Excel dan PDF; laporan besar dikerjakan di latar dan diunduh saat siap.
- Verifikasi: `pnpm test:api reports && pnpm e2e reports`
- Berkas: `apps/api/src/modules/reports/`, `apps/web/src/pages/reports/`
- Menunggu: 4.1, 3.1 · **Butuh: contoh laporan wajib**

### R5 — Notifikasi
Selesai bila: notifikasi sampai cepat dan tidak dobel.

**5.1 Mesin notifikasi dan pusat notifikasi di aplikasi (M)**
- Terima: kejadian (tiket baru, eskalasi, SLA hampir lewat, Gamas) menjadi notifikasi lewat antrean; kiriman gagal dicoba ulang; satu kejadian satu notifikasi per penerima per kanal.
- Verifikasi: `pnpm test:api notifications`
- Berkas: `apps/api/src/modules/notifications/`
- Menunggu: 2.2

**5.2 Kanal Telegram dan email (S + S)**
- Terima: bot mengirim ke grup per tenant/shift; email memakai template; pengguna mengatur kanal yang diterima.
- Verifikasi: `pnpm test:api notifications.telegram notifications.email` (dengan penerima tiruan)
- Menunggu: 5.1 · **Butuh: akun bot dan server email**

### R6 — Alert otomatis
Selesai bila: remote turun di alat monitoring → kandidat muncul; pulih → tiket diperbarui.

**6.0 Uji coba sambungan (S, eksperimen)**
- Terima: satu alert nyata dari alat SNMP dan satu dari sistem VSAT berhasil diterima di staging; bentuk datanya terdokumentasi.
- Verifikasi: catatan di `docs/integrasi/sumber-alert.md`
- Menunggu: 0.2 (boleh mulai sejak R0) · **Butuh: nama produk + akses**

**6.1 Pintu masuk alert dan kandidat tiket (M)**
- Terima: alert dipetakan ke remote lewat IP/ID; disimpan dengan waktu kejadian dan waktu diterima; alert berulang menempel ke kandidat/tiket yang terbuka; alert yang tidak cocok dengan remote mana pun masuk daftar tersendiri.
- Verifikasi: `pnpm test:api alerts.ingest alerts.dedup`
- Berkas: `apps/api/src/modules/alerts/`
- Menunggu: 6.0, 1.4

**6.2 Verifikasi L1, debounce, pemulihan (M)**
- Terima: L1 mengubah kandidat jadi tiket atau menandai bukan gangguan dengan alasan; gangguan lebih singkat dari ambang tidak menjadi kandidat; alert pulih memperbarui tiket yang sama.
- Verifikasi: `pnpm test:api alerts.verify alerts.debounce && pnpm e2e alerts`
- Berkas: `apps/web/src/pages/alerts/`
- Menunggu: 6.1

**6.3 Dugaan penyebab dan saran Gamas (M)**
- Terima: kandidat diberi dugaan (link / perangkat / listrik / cuaca) dari gabungan data SNMP dan VSAT; banyak remote turun dalam satu jendela waktu pada hub/wilayah yang sama memunculkan saran Gamas.
- Verifikasi: `pnpm test:api alerts.classify alerts.gamas-suggest`
- Menunggu: 6.2, 3.1

### R7 — Integrasi customer
**7.1 API tiket per tenant (M)** — kunci API per tenant, pembuatan tiket yang aman diulang (kunci idempoten), nomor tiket customer tersimpan, batas laju. Verifikasi: `pnpm test:api public-api`. Menunggu: 6.1.
**Belum jelas:** bentuk sistem customer; dirinci saat ada kebutuhan eksternal nyata.

### R8 — Go-live penuh
**8.1 Hak akses rinci (M)** — matriks izin per peran, diuji per endpoint. Menunggu: sesi hak akses.
**8.2 SSO (S)** — bila tersedia. **8.3 Dokumen dan runbook (M)** — berkas bersama, runbook tertaut ke kategori tiket.
**8.4 Pengerasan dan uji beban (M)** — tinjauan keamanan, uji beban dengan data setara satu tahun.
**8.5 Pelatihan dan pemadaman sistem lama (S).**

## C. Urutan dan titik periksa

```
0.1 → 0.2 → 0.3 → 0.4 ─┬→ 1.1 → 1.2 → 1.3 → 1.4 ─┬→ 1.5 → 2.1 → 2.2 → 2.4
              └→ 0.5 ──┘                         ├→ 1.6 → 1.7       └→ 5.1 → 5.2
        0.2 → 0.6                                ├→ 3.1 ┐  2.1 → 2.3
        0.2 → 6.0 (eksperimen, paralel)          ├→ 3.2 → 3.3
                                                 ├→ 4.1 → 4.2
                                                 └→ 6.1 → 6.2 → 6.3 → 7.1
```

Titik periksa dengan user: setelah 0.5 (kerangka terlihat), 1.4 (alur tiket), 1.7 (produksi
pertama), 2.4 (layar dinding), lalu di akhir tiap rilis.

Langkah paling berisiko dikerjakan paling awal di rilisnya: 0.4 (isolasi tenant),
1.3 (penomoran serentak), 1.4 (mesin status), 6.0 (sambungan ke alat yang belum dikenal).

## D. Yang harus tersedia agar tidak tertahan

| Dibutuhkan | Untuk langkah | Dari |
| --- | --- | --- |
| Keputusan hosting + server staging + registry image | 0.2 (pemasangan staging), 0.6 | Anda |
| Alur status tiket disetujui | 1.4 | Sesi dengan user |
| Server produksi (dua unit) | 1.7 | Anda |
| Detail Gamas, arti eskalasi/Take Action | 3.1, 3.2 | Sesi dengan user |
| Aturan SLA, contoh laporan wajib | 4.1, 4.2 | Sesi dengan user |
| Akun bot Telegram, server email | 5.2 | Anda |
| Nama produk + akses alat SNMP dan sistem VSAT | 6.0 | Tim NOC |
| Matriks hak akses | 8.1 | Sesi dengan user |

Langkah 0.1–0.5 dan 1.1–1.3 tidak bergantung pada siapa pun dan bisa mulai begitu disetujui.

## E. Selalu / Tidak pernah (teknis)
- Selalu: migrasi punya jalur turun; aturan izin ditegakkan di API; setiap endpoint baru ikut uji isolasi tenant; rilis lewat staging.
- Tidak pernah: UPDATE/DELETE pada linimasa; rahasia (kata sandi, token) di dalam repo; data kartu/nasabah di portal; komponen infrastruktur baru tanpa keputusan tercatat.

## Progres
| Langkah | Status |
| --- | --- |
| 0.1 Kerangka repo dan pipeline | **Selesai 2026-11-16** (commit `e27430e`). `pnpm lint && pnpm build && pnpm test:api health` lulus dari salinan bersih (Node 26.13.1, pnpm 12.21.0). CI run #1 di GitHub hijau: lint, build, 2 uji health lulus. API hasil build dijalankan: `GET /health` → 200 `{"status":"ok"}`. Uji mutasi: mematikan metadata dekorator membuat uji merah. Workflow belum diperiksa actionlint (unduhan biner ditolak izin sesi); validitasnya dibuktikan oleh run CI. |
| 0.2 Lingkungan lokal dan staging | **Selesai 2026-11-16; pemasangan staging menunggu hosting.** `pnpm dev:up && pnpm e2e smoke` lulus dari salinan bersih dengan database baru: Postgres 18 + migrasi + seed + aplikasi sehat dalam ±25 detik, 3 uji asap lulus. 19 uji API lulus terhadap PostgreSQL asli. Uji mutasi pada 4 penjaga (zona waktu UTC, aset hilang = 404, seed ditolak di produksi, health 503) masing-masing membuat uji merah. Compose staging dijalankan lokal dengan image hasil build dan lolos uji asap. CI run #9 (commit `8606787`, memuat kode 0.2 `5003862` + perbaikan CI `1b1f86c`) hijau: job `verify` lint/build/uji API dengan service PostgreSQL 18; job `image` membangun image, menjalankannya dengan compose staging, 3 uji asap lulus, lalu dibersihkan. Run #3–#8 dibatalkan oleh push berikutnya ke branch yang sama (aturan concurrency), bukan gagal. **Belum:** registry image dan pemasangan di server staging (bagian D); seeder masih kosong sampai 0.3 menambah tenant dan pengguna; "uji di halaman login" diganti halaman utama karena login baru ada di 0.3. |
| 0.3 Tenant, pengguna, login | **Selesai 2026-11-16.** `pnpm test:api auth && pnpm e2e auth` lulus dari salinan bersih dengan database baru (18 uji API, 5 uji layar); seluruh uji API 50 lulus. Uji mutasi pada 9 kontrol masing-masing membuat uji merah: guard global dicabut, token disimpan mentah, pembatasan dilewati, pengguna nonaktif boleh masuk, tanpa hash palsu (waktu jawab membocorkan nama pengguna), sesi kedaluwarsa tidak dihapus, perpanjangan tanpa batas absolut, cookie tanpa `HttpOnly`, dan `next` tanpa penyaringan (open redirect). Uji skema mendeteksi beda panjang kolom dan nama FK antara migrasi dan entity. Compose staging dengan image hasil build: cookie `__Host-tyio_sid` `Secure` dan uji login lulus. CI run #13 (commit `0bd99c5`) hijau: uji API dengan PostgreSQL 18; image dijalankan lewat compose staging, diisi seed dengan kata sandi acak, lalu uji asap dan uji login lulus. Screenshot terang/gelap, 375 px dan desktop, diperiksa; tiga cacat tampilan ditemukan dan diperbaiki (tinggi kolom sandi, kotak berbayang di pesan galat, pesan ganda setelah login gagal), serta satu bug: klik "Masuk" hilang karena tata letak bergeser. **Belum:** halaman kelola pengguna dan reset kata sandi (admin, R1/R8); router dan store minimal ikut dibuat untuk alur login, diperluas di 0.5. |
| 0.4 Isolasi tenant dan audit log | **Selesai 2026-11-17.** `pnpm test:api tenant-isolation audit` lulus dari salinan bersih dengan database baru (19 uji); seluruh uji API 69 lulus; verifikasi 0.3 dan uji asap tetap lulus. Di stack dev, 8 baris seed tercatat sebagai `sistem:seed`, login/logout/login ditolak tercatat dengan asalnya. CI run #15 (commit `90f0732`) hijau: semua uji API dengan PostgreSQL 18; image dengan migrasi audit dijalankan lewat compose staging, seed tercatat, uji asap dan login lulus. Uji mutasi pada 13 kontrol masing-masing membuat uji merah (setelah pengendali mutasi pertama ternyata tidak menerapkan 7 mutasi; diulang dengan pengendali yang memastikan setiap mutasi mengubah berkas): pelaku tidak wajib, kata sandi tidak disamarkan, `audit_log` bisa diubah/dihapus, bisa dikosongkan, satu tabel lupa diaudit, login ditolak tidak dicatat, daftar dan detail tanpa filter tenant, `OR` tidak dikurung, `where()` tidak dilarang, cakupan pengguna diabaikan, pemeriksaan saat start dimatikan, rute tanpa tanda (aplikasi menolak start), serta rute salah tanda yang membocorkan data. **Belum:** belum ada rute tenant yang mengubah data (uji gagal begitu ada, sampai uji mutasinya ditambah); pencatatan "siapa melihat apa" (R-I) dan pemisahan peran database menyusul. |
| 0.5 Kerangka PWA dan navigasi | **Selesai 2026-11-17 — titik periksa dengan user.** `pnpm e2e shell` lulus dari salinan bersih (kini 12 uji): menu per peran, setiap menu membuka halamannya, L1 ke `/admin` mendapat halaman tanpa akses, 375 px dengan menu lipat dan target sentuh ≥ 44 px, 1280 dan 2560 px tanpa gulir samping, panel menu pengguna utuh di layar, tema diingat, keyboard (Escape mengembalikan fokus), manifest dan ikon lengkap, service worker aktif tanpa menyimpan `/api`. Uji API 69 dan uji layar auth/smoke tetap lulus. Uji mutasi: Admin terbuka untuk semua peran, penjaga rute dihapus, dan service worker menjawab `/api` dengan halaman aplikasi masing-masing membuat uji merah. Ditemukan dan diperbaiki lewat uji/screenshot: tombol menu tampil di desktop, service worker tidak terdaftar di halaman masuk, panel menu pengguna terpotong keluar layar (uji baru merah pada image lama), nama aksesibel pemicu menu berulang, dan nama pengguna tampil huruf besar. CI run #17 (commit `ab0e2b4`) hijau. Sejak commit `168a245` CI juga menjalankan uji `shell` terhadap image lewat compose staging; run #18 **merah**: di runner CI (font sistem lebih lebar) header ponsel turun ke baris kedua, menu pengguna pindah ke kiri dan panelnya keluar layar. Bug nyata, juga untuk pengguna yang memperbesar teks. Uji baru (375 px dengan teks 125%, header harus satu baris) merah di lokal, lalu diperbaiki: di layar sempit nama portal yang menyusut dengan "…". CI run #19 (commit `a26117d`) hijau: lint, build, 69 uji API, dan 20 uji layar (asap, login, kerangka) terhadap image lewat compose staging. |
| 1.1 Master data: customer, kategori, system, jarkom | **Selesai 2026-11-17.** `pnpm test:api master` lulus dari salinan bersih (34 uji): keempat daftar bisa ditambah, diganti nama, dinonaktifkan, dan dihapus; kode tetap setelah dibuat; kode dan nama unik per daftar (nama tanpa beda huruf besar/kecil); isian salah ditolak dengan pesan per kolom; hapus yang sudah dipakai dijawab 409 dengan saran menonaktifkan (customer lewat pengguna yang dibatasi ke customer itu; kategori/system/jarkom lewat tabel pemakai uji); semua foreign key ke tabel master RESTRICT; audit mencatat admin sebagai pelaku; L1, L2, dan admin yang dibatasi ke sebagian customer ditolak 403; tanpa login 401. Uji lintas-tenant diperluas untuk rute `@AllTenants`. Seluruhnya 106 uji API dan 24 uji layar (4 di antaranya master data) lulus dari salinan bersih dengan database kosong. Uji mutasi: mematikan penjaga akses, cek semua-customer, `@RequireModule`, atau `@AllTenants`; menganggap hanya satu kode galat sebagai "dipakai"; membolehkan ubah kode; tanpa normalisasi kode; pelaku bukan admin; serta menghapus indeks nama unik customer atau master lain: masing-masing membuat uji merah. Ditemukan dan diperbaiki: foreign key RESTRICT memberi kode 23001, bukan 23503, sehingga hapus yang dipakai menjawab 500 (kini 409); keunikan nama kategori/system/jarkom belum diuji (ketahuan karena mutasinya lolos; uji ditambah); dialog konfirmasi tanpa latar karena `.modal-content` di luar `.modal` (uji baru merah pada image lama); nama di tabel menjorok dan sakelar menempel teksnya (terlihat di screenshot). CI run #21 (commit `c80688b`, API) dan run #22 (commit `8315a24`) hijau: lint, build, 106 uji API, dan 24 uji layar terhadap image lewat compose staging; CI kini menjalankan semua berkas uji layar. |
| 0.6 Pemasangan staging | **Paket server demo selesai 2026-11-17; menunggu server user.** Atas permintaan user: portal dipasang di server user dengan data contoh untuk demo ke customer, dan diperbarui mengikuti progres. CI menerbitkan image yang lolos semua uji ke `ghcr.io/felicidad126/tyio` (tag `sha-<commit>`; tag `demo` dipindah job baru setelah `verify` dan `image` hijau, hanya di branch `claude/r0-fondasi`, tanpa build ulang). `deploy/compose.https.yml` menambah Caddy 2.11.9 (Let's Encrypt otomatis untuk domain; CA internal untuk alamat IP atau `--sertifikat-internal`), aplikasi `TRUST_PROXY_HOPS=1`. `deploy/scripts/server.sh`: `pasang` (env acak per server, image `demo`, checkout ke commit image, seed, cek HTTPS, cetak akun), `perbarui` (data tetap, image lama dihapus), `status`, `ulang-data` (sertifikat tetap), `sertifikat`, `log`. Panduan: `docs/operasi/server-demo.md`. Diuji di sini dengan registry lokal sebagai pengganti GHCR dan salinan repo sebagai server: `pasang` dengan domain (CA internal), 38 uji layar lulus lewat HTTPS/Caddy (browser mempercayai CA, cookie `Secure`), `perbarui` dua kali (checkout pindah, 9 tiket/15 tindakan tetap, versi sebelumnya tercetak, image lama terhapus, jalankan ulang = "sudah terbaru"), `ulang-data` (batal tanpa HAPUS; tiket 0, remote kembali 75, CA sama), `pasang` dengan alamat IP, image tidak ada → pesan jelas. Uji mutasi: `TRUST_PROXY_HOPS` 0 mencatat IP Caddy untuk semua klien (pembatasan login per IP mengunci semua orang), `X-Forwarded-For` palsu tidak pernah tercatat (ditimpa Caddy), tanpa `default_sni` HTTPS lewat alamat IP gagal. Ditemukan dan diperbaiki saat uji: cek HTTPS lewat proxy keluar server (kini `--noproxy`), revisi sebelumnya kosong karena image lama tak bisa dicari lewat digest setelah tag pindah (kini dibaca dari container). shellcheck dan actionlint bersih. CI run #33 (commit `ff21032`) hijau: job `verify`, `image` (38 uji layar, lalu image `sha-ff21032…` diterbitkan), dan `demo` (tag `demo` dipindah); image bisa ditarik tanpa login. **Server user: Ubuntu 24.04 dengan aaPanel** (Nginx aaPanel memakai 80/443), jadi ditambah mode `--panel`: tanpa Caddy, aplikasi hanya di `127.0.0.1:8080`, `TRUST_PROXY_HOPS=1`, SSL dan domain diurus aaPanel dengan potongan konfigurasi Nginx di panduan (`location ^~ /`, jalur `acme-challenge`, `client_max_body_size 30m`). `pasang` tanpa `--panel` ditolak bila port 80/443 sudah dipakai. Pemeriksaan portal kini juga mengambil halaman, satu berkas `.js`, dan ikon `.png` lewat proxy. `perbarui` menyerahkan sisa langkah ke skrip dari commit yang baru dipasang. Diuji dengan Nginx 1.28 berkonfigurasi situs bawaan aaPanel (SSL, Force HTTPS, aturan berkas statis): 38 uji layar lulus lewat Nginx, unggah 4,9 MB 201, jalur `acme-challenge` dilayani dari folder situs lewat HTTP dan HTTPS, `/.env` hanya halaman aplikasi. Uji mutasi: `location /` biasa → `.js`/`.png` 404 (terdeteksi `status`), tanpa `client_max_body_size` → 413, `TRUST_PROXY_HOPS=2` di belakang Nginx → IP palsu `X-Forwarded-For` tercatat. Ditemukan dan diperbaiki: `perbarui` dijalankan skrip versi lama sehingga Caddy tetap dinyalakan di server mode panel dan bentrok dengan port 80. Mode Caddy diuji ulang setelah perubahan. CI run #34 (commit `5e8589c`) hijau dan tag `demo` pindah ke image commit itu. Uji akhir persis langkah user: clone baru dari GitHub, `pasang <domain> --panel` menarik image asli dari GHCR tanpa login (revisi `5e8589c`, amd64), `HTTPS: OK` lewat Nginx tiruan aaPanel dalam 14 detik, 38 uji layar lulus. **Belum:** backup terenkripsi, latihan restore, dan checklist kepatuhan (isi asli langkah 0.6); image hanya amd64; server ini hanya untuk data contoh. |
| 1.2 Remote: daftar, detail, impor | **Selesai 2026-11-17.** `pnpm test:api remotes` lulus dari salinan bersih (42 uji) dan `pnpm e2e remotes` (5 uji). Daftar urut Site ID 50 per halaman dengan total; cari di Site ID/nama/kota/kanca (wildcard `%` dan `_` dicari apa adanya); saringan customer, provinsi, jarkom, status; parameter salah dijawab 400; pengguna terbatas hanya melihat customernya. Detail lengkap dengan zona waktu dari provinsi; remote customer lain 404. Impor: periksa tanpa menyimpan (baru, diperbarui, tidak berubah, gagal per kolom), 16 aturan kolom, Site ID kembar di file, semua-atau-tidak (422), kolom tak ada tidak diubah dan sel kosong mengosongkan, impor ulang file yang sama = tidak berubah (kontak, IP, koordinat, tanggal), 5.000 baris tersimpan lalu bisa dicari (impor + impor ulang + cari ±1,6 detik), audit atas nama admin, L1 ditolak, batas isian besar hanya di alamat impor. Pembaca Excel di browser diuji 9 uji unit (shared strings, teks kaya, sel jarang, rumus, tanggal 1904, file bukan xlsx, bom zip). Diukur dengan `EXPLAIN ANALYZE` pada 50.000 remote: cari memakai indeks trigram (1,0 ms dan 3,5 ms); halaman pertama untuk pengguna semua customer 13,7 ms → 0,04 ms setelah indeks `site_id` ditambahkan. Uji mutasi (11): daftar atau detail tanpa batas tenant (tertangkap juga oleh harness lintas-tenant), wildcard tidak di-escape, periksa tetap menyimpan, baris gagal tetap menyimpan, kontak dibandingkan sebagai teks JSON, IP host tidak dinormalkan, kolom tak ada dianggap kosong, Site ID kembar tidak diperiksa, zona selalu WIB, jarkom nonaktif diterima: semuanya membuat uji merah. Ditemukan dan diperbaiki: pengurai JSON khusus impor membuat Nest tidak memasang pengurai globalnya (semua isian lain tak terbaca); kontak dari jsonb berubah urutan kunci sehingga impor ulang dianggap perubahan; judul halaman daftar dan datagrid detail (terlihat di screenshot). Seluruhnya 149 uji API, 9 uji unit web, dan 29 uji layar lulus. CI run #24 (commit `89dc777`, API) dan run #25 (commit `fad024f`) hijau, termasuk 29 uji layar terhadap image lewat compose staging. |
| 1.3 Buat tiket | **Selesai 2026-11-17.** `pnpm test:api tickets.create` lulus dari salinan bersih (23 uji) dan `pnpm e2e ticket-create` (4 uji). Nomor `NPR/VSAT/TNA/<tahun>/<bulan>/0001`, urut terpisah per customer, jarkom, dan bulan; bulan WIB (30 Nov 17.00 UTC = Desember). **Uji serentak:** 20 operator menyimpan bersamaan → 20 nomor unik berurutan tanpa celah; dua operator bersamaan pada remote yang sama tanpa konfirmasi → tepat satu tiket, satu 409. Tiket terbuka → 409 berisi tiket itu, lalu dibuat setelah dikonfirmasi tanpa celah nomor. Data remote ikut di tiket dan hanya-baca di form. Isian salah per kolom (11 kasus), kategori nonaktif, remote dibongkar, customer nonaktif, remote customer lain (404, tidak ada yang dibuat), audit atas nama operator. Harness lintas-tenant kini mendata rute tenant yang menulis beserta ujinya. Uji mutasi (9): tanpa kunci baris remote (tertangkap 3 dari 3 kali), nomor dari jumlah tiket alih-alih penghitung, bulan UTC, tanpa peringatan tiket terbuka, remote atau daftar tiket terbuka tanpa batas tenant, kategori nonaktif, waktu masa depan, remote dibongkar: semuanya membuat uji merah. Ditemukan dan diperbaiki: pemeriksaan "rute mengembalikan data tenant A" di harness menjalankan GET ke rute POST; uji auth lama menganggap `/tiket/...` belum punya halaman. Seluruhnya 173 uji API, 9 uji unit web, dan 33 uji layar lulus (dua kali berturut-turut, juga saat remote sudah punya tiket terbuka dari run sebelumnya). CI run #27 (commit `51d62a2`, API) dan run #28 (commit `460e149`) hijau, termasuk 33 uji layar terhadap image lewat compose staging. |
| 1.4 Linimasa tindakan dan mesin status | **Selesai 2026-11-17 — titik periksa dengan user.** Alur status disetujui user. `pnpm test:api tickets.actions tickets.status` lulus dari salinan bersih (48 uji): **26 uji tabel transisi** (seluruh 25 pasangan status ditambah pemeriksaan bahwa tabel di kode sama dengan tabel yang disetujui); 22 uji linimasa: entri awal saat tiket dibuat, catatan tanpa ubah status, pending wajib pihak dan alasan, status yang sudah berubah → 409 tanpa menyimpan apa pun, dua operator bersamaan → satu berhasil satu 409, koreksi merujuk entri lama (tanpa status, tanpa lampiran, hanya di tiket yang sama), UPDATE/DELETE lewat SQL langsung ditolak database, lampiran PNG dan PDF (jenis dari isi, nama dibersihkan, header unduh aman), berkas palsu / lebih dari 5 MB / lebih dari 5 ditolak tanpa sisa di disk, berkas dihapus lagi bila tindakan ditolak, nomor tiket customer, urutan per menit, isian salah, audit. Harness lintas-tenant: dua rute tulis baru diuji (404, tidak berubah), lampiran milik customer lain 404. `pnpm e2e ticket-detail` (5 uji): jalur status yang ditawarkan, pending, lampiran lewat pilih dan tempel, koreksi, nomor tiket customer di tempat tanpa menggeser isi, status diubah rekan. Uji mutasi (13): tanpa cek jalur, tanpa cek status yang dilihat, tanpa kunci tiket (tertangkap 3 dari 3 kali), jenis berkas dari nama, berkas tidak dibersihkan, pending tanpa pihak, koreksi lintas tiket, unduh tanpa batas tenant, nomor customer tanpa entri linimasa, PDF inline, tanpa CSP sandbox, tiket tanpa entri awal, urut per detik: semuanya membuat uji merah. Ditemukan dan diperbaiki: pesan "status sudah berubah" hilang karena form dibuat ulang (kini di tingkat halaman, dan uji memastikannya tetap tampil); linimasa urut waktu catat tampak acak (kini urut waktu tindakan per menit); peringatan tiket terbuka menampilkan 5 tiket tertua (kini terbaru); miniatur gambar kecil tak terlihat. Seluruhnya 223 uji API, 9 uji unit web, 38 uji layar lulus (uji layar dua kali berturut-turut). CI run #30 (commit `4f83b5b`, API) dan run #31 (commit `63dd64e`) hijau, termasuk 38 uji layar terhadap image lewat compose staging dengan volume lampiran. |
| 1.5–1.7, R2–R8 | Belum mulai |
