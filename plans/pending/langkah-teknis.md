# Portal NOC Terpusat — Langkah teknis per rilis

Induk: [portal-noc-terpusat.md](portal-noc-terpusat.md) (keputusan K1–K14, rekomendasi R-A s.d. R-I — disetujui).
Status: **R0 berjalan — 0.1 dan 0.2 selesai** (staging menunggu keputusan hosting). T1–T12 dan pilihan versi 0.1 disetujui 2026-11-16.

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

**Keputusan yang diambil saat 0.2** (mohon dicek; turunan R-A, R-B, T3, T5, T11, T12):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T13 | Satu image Docker berisi API + hasil build web; API di `/api`, web di jalur lain, satu origin | R-A satu yang di-deploy; cookie sesi (T5) tanpa CORS; tanpa web server tambahan |
| T14 | Migrasi dan seed adalah langkah terpisah dari image yang sama, sebelum aplikasi start; aplikasi tidak menjalankan migrasi sendiri | Migrasi gagal = rilis gagal yang terlihat, bukan aplikasi yang restart berulang |
| T15 | `TYIO_ENV` wajib tanpa nilai bawaan; seed data dummy ditolak bila `production` | Produksi tidak pernah diam-diam dianggap dev |
| T16 | PostgreSQL 18 dipin digest, sama di dev, CI, dan staging; sesi database dipaksa UTC | Migrasi diuji di versi yang sama dengan yang dipasang; T12 |
| T17 | TypeORM 1.1 (stabil, mendukung ESM); daftar entity/migrasi eksplisit di satu berkas (`db/registry.ts`) | Tanpa glob yang rapuh di ESM; konfigurasi aplikasi dan skrip migrasi tidak bisa menyimpang |
| — | Registry image untuk staging: **belum diputuskan** | Bergantung pada hosting (lihat bagian D) |

**Keputusan yang diambil saat 0.3** (mohon dicek; turunan T5, T7, T13, K26–K29):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T18 | Sesi disimpan di PostgreSQL (tabel `sessions`); cookie hanya berisi token acak 256 bit, database hanya menyimpan hash SHA-256-nya. Batas idle dan batas mutlak dihitung dengan jam database | T7 tanpa Redis; sesi bisa dicabut seketika (logout, pengguna dinonaktifkan); bocornya isi tabel tidak memberi akses |
| T19 | Hash kata sandi argon2id memakai `crypto.argon2` bawaan Node 26 (m=19 MiB, t=2, p=1, format PHC), bukan paket `argon2` | Parameter minimum OWASP; tanpa modul native dan install script (diblokir pnpm) |
| T20 | Cookie `tyio_sesi`: HttpOnly, SameSite=Strict, Path=/api, Secure di luar development/test. Ditambah penjaga origin: POST/PUT/DELETE dari situs lain ditolak 403; login hanya menerima JSON | Dua lapis lawan CSRF tanpa token CSRF, karena web dan API satu origin (T13) |
| T21 | Semua endpoint wajib sesi kecuali yang ditandai `@Public()` (health, login, logout) | Endpoint baru otomatis terlindungi tanpa perlu diingat |
| T22 | Login gagal dibatasi: 5 kali per email (sejak login berhasil terakhir) dan 20 kali per IP, dalam 15 menit; lalu 429 + `Retry-After`. Email tak terdaftar, akun nonaktif, dan kata sandi salah memberi jawaban dan waktu yang sama | Menahan tebakan kata sandi tanpa membocorkan akun mana yang ada; kunci habis sendiri tanpa admin |
| T23 | Rute web memakai vue-router 5.4.0 (versi terbaru yang sudah berumur ≥ 2 minggu saat dipasang) | Rantai pasok: versi yang baru terbit belum sempat diperiksa komunitas |

**Keputusan yang diambil saat 0.4** (mohon dicek; turunan T9, T10, R-E, R-F, R-I):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T24 | Audit dicatat trigger PostgreSQL di setiap tabel data (`audit_enable`), bukan kode aplikasi: siapa, kapan, dari mana (IP), dan apa yang berubah (UPDATE hanya kolom yang berubah, lama → baru). Kolom rahasia (hash kata sandi) hanya dicatat "berubah" | Tidak ada jalur tulis yang terlewat, termasuk CLI, seed, dan perbaikan langsung di database |
| T25 | Tulisan ke tabel yang diaudit tanpa konteks audit (setelan transaksi `tyio.source`, pelaku, IP) **ditolak database**. Aplikasi menulis lewat `auditedTransaction`; skrip migrasi membawa sumber `migrasi`; operator di psql wajib menyebut namanya | "Siapa" tidak pernah kosong; lupa memasang konteks gagal di uji, bukan diam-diam tercatat tanpa pelaku |
| T26 | `audit_log` hanya-tambah: UPDATE, DELETE, TRUNCATE ditolak trigger; TRUNCATE di tabel yang diaudit juga ditolak | R-F. **Batas:** pemilik database masih bisa mematikan trigger; perlindungan penuh butuh peran database terpisah untuk aplikasi, disiapkan bersama produksi (1.7) |
| T27 | Login, login gagal, dan logout dicatat sebagai peristiwa audit; percobaan yang ditolak karena terkunci (429) tidak | Jejak masuk-keluar untuk kepatuhan; penyerang tidak bisa membanjiri audit |
| T28 | Setiap endpoint wajib menyatakan `@TenantScoped()` atau `@NoTenantData()`. Uji membaca semua endpoint dari aplikasi: yang tanpa pernyataan, endpoint data customer tanpa uji lintas-tenant, dan endpoint non-publik yang tidak menjawab 401 tanpa sesi membuat uji gagal | "Setiap endpoint baru ikut uji isolasi tenant" (bagian E) ditegakkan mesin, bukan ingatan |
| T29 | Data di luar cakupan customer dijawab 404, sama dengan data yang tidak ada (juga id yang formatnya salah) | Tidak membocorkan keberadaan data customer lain |
| T30 | Jejak audit dibaca lewat `GET /api/audit`, hanya admin, dalam cakupan customer admin itu; catatan tanpa customer (login, data pengguna) hanya untuk admin semua customer. Peran diperiksa guard global `RequireRole` | Admin yang dibatasi tidak melihat kegiatan customer lain |

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
- Catatan: sesi biasa berakhir paling lama 12 jam (K28), jadi layar dinding butuh cara masuk sendiri (mis. akun perangkat hanya-baca). Diputuskan di langkah ini.
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
- Selalu: migrasi punya jalur turun; aturan izin ditegakkan di API; setiap endpoint baru ikut uji isolasi tenant; setiap tabel data baru punya `tenant_id` dan `audit_enable` (lihat `docs/pengembangan/tenant-dan-audit.md`); rilis lewat staging.
- Tidak pernah: UPDATE/DELETE pada linimasa; rahasia (kata sandi, token) di dalam repo; data kartu/nasabah di portal; komponen infrastruktur baru tanpa keputusan tercatat.

## Progres
| Langkah | Status |
| --- | --- |
| 0.1 Kerangka repo dan pipeline | **Selesai 2026-11-16** (commit `e27430e`). `pnpm lint && pnpm build && pnpm test:api health` lulus dari salinan bersih (Node 26.13.1, pnpm 12.21.0). CI run #1 di GitHub hijau: lint, build, 2 uji health lulus. API hasil build dijalankan: `GET /health` → 200 `{"status":"ok"}`. Uji mutasi: mematikan metadata dekorator membuat uji merah. Workflow belum diperiksa actionlint (unduhan biner ditolak izin sesi); validitasnya dibuktikan oleh run CI. |
| 0.2 Lingkungan lokal dan staging | **Selesai 2026-11-16; pemasangan staging menunggu hosting.** `pnpm dev:up && pnpm e2e smoke` lulus dari salinan bersih dengan database baru: Postgres 18 + migrasi + seed + aplikasi sehat dalam ±25 detik, 3 uji asap lulus. 19 uji API lulus terhadap PostgreSQL asli. Uji mutasi pada 4 penjaga (zona waktu UTC, aset hilang = 404, seed ditolak di produksi, health 503) masing-masing membuat uji merah. Compose staging dijalankan lokal dengan image hasil build dan lolos uji asap. CI run #9 (commit `8606787`, memuat kode 0.2 `5003862` + perbaikan CI `1b1f86c`) hijau: job `verify` lint/build/uji API dengan service PostgreSQL 18; job `image` membangun image, menjalankannya dengan compose staging, 3 uji asap lulus, lalu dibersihkan. Run #3–#8 dibatalkan oleh push berikutnya ke branch yang sama (aturan concurrency), bukan gagal. **Belum:** registry image dan pemasangan di server staging (bagian D); seeder masih kosong sampai 0.3 menambah tenant dan pengguna; "uji di halaman login" diganti halaman utama karena login baru ada di 0.3. |
| 0.3 Tenant, pengguna, login | **Selesai 2026-11-19.** `pnpm test:api auth` (24 uji) dan seluruh `pnpm test` (66 uji) lulus terhadap PostgreSQL 18.7 asli; migrasi diterapkan, dibatalkan semua, lalu diterapkan ulang di setiap run uji (jalur turun T3 teruji). `pnpm e2e smoke auth` (9 uji) lulus di Chromium terhadap aplikasi hasil build dengan `TYIO_ENV=staging`, jadi cookie Secure ikut teruji di http://localhost. `pnpm lint` dan `pnpm build` bersih. Perintah `create-user` dicoba manual: membuat admin, menolak email ganda dan peran tak dikenal, lalu akun baru bisa login. CI run #70 (commit `6d92aa9`) hijau: job `verify` lint/build/uji API; job `image` membangun image, menjalankannya dengan compose staging, men-seed akun dummy dengan kata sandi acak, lalu `pnpm e2e smoke auth` lulus (cookie Secure di http://localhost). Run #69 (merge `main`) gagal di pemasangan Chromium karena mirror Ubuntu menjawab 503, bukan karena kode. `pnpm dev:up` belum dijalankan untuk perubahan ini (sesi tanpa Docker); compose staging sudah diuji CI. Halaman setelah login masih sementara (nama, peran, customer, tombol Keluar); layout dan menu di 0.5. Belum: halaman admin untuk mengelola pengguna (pengguna dibuat lewat CLI dan seed dulu). |
| 0.4 Isolasi tenant dan audit log | **Selesai 2026-11-19 (lokal); CI menunggu push.** `pnpm test:api tenant-isolation audit` (36 uji) dan seluruh `pnpm test` (100 uji) lulus terhadap PostgreSQL 18.7 asli. Uji isolasi membaca 7 endpoint dari aplikasi: semua menyatakan sifat tenant-nya, 5 endpoint data customer masing-masing punya uji lintas-tenant (pengguna customer A tidak melihat data B, tetap melihat A), dan semua endpoint non-publik menjawab 401 tanpa sesi. Uji mutasi: 8 penjaga dirusak satu per satu (filter cakupan, dekorator tenant, customer nonaktif, guard peran, penolakan tulisan tanpa konteks, penyembunyian hash kata sandi, audit_log hanya-tambah, catatan login) dan masing-masing membuat uji merah. Dicoba di database dev: migrasi naik-turun-naik, seed dan `create-user` tercatat dengan sumbernya, `UPDATE` langsung di psql ditolak dengan petunjuk, contoh perbaikan manual di dokumen operasi berjalan; aplikasi hasil build lolos `pnpm e2e smoke auth` (9 uji) dan `GET /api/audit` menampilkan login dari browser. Endpoint baru: `GET /api/tenants`, `GET /api/tenants/:id`, `GET /api/audit` (admin). Belum: pencatatan siapa *melihat* data (R-I) dan lama penyimpanan audit (0.6); halaman audit di web. |
| 0.5 Kerangka PWA dan navigasi | Siap dikerjakan |
| 0.6, R1–R8 | Belum mulai |
