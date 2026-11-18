# Portal NOC Terpusat — Langkah teknis per rilis

Induk: [portal-noc-terpusat.md](portal-noc-terpusat.md) (keputusan K1–K14, rekomendasi R-A s.d. R-I — disetujui).
Status: **R0 0.1–0.5 selesai**; paket server demo terpasang di server user (backup 0.6 belum); **R1 berjalan — 1.1–1.5 selesai, penyesuaian 1.5c–1.5e dari jawaban user selesai** (titik periksa alur tiket bersama user). T1–T12 dan pilihan versi 0.1 disetujui 2026-11-16; 0.1–0.2 masuk `main` lewat PR #1.

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

**Keputusan yang diambil saat 4.2a, laporan rekap NPR** (bagian 4.2 yang tidak menunggu SLA; mohon dicek):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T98 | **Rekap NPR per periode tanggal kejadian WIB** (bawaan tgl 1 bulan ini sampai hari ini, paling panjang 366 hari), saringan customer/kategori/jarkom/status (Semua, Masih aktif, Selesai). Isi: jumlah, Selesai, Masih aktif, Dengan TT, rata-rata dan median lama gangguan (menit tampil, T78; hanya Selesai), per customer, per kategori, part diganti (per tindakan Close, termasuk NPR yang dibuka lagi), 10 remote terbanyak, daftar NPR 50 per halaman. Semua angka dari query dasar daftar Tiket, jadi setiap tautan menghasilkan jumlah yang sama. Halaman tidak dimuat ulang sendiri saat ada perubahan | SLA (4.1) dan contoh laporan wajib belum ada; rekap ini bisa dipakai sekarang dan tidak bergantung pada aturan SLA. Angka yang berubah sendiri saat dibaca atau dicetak membingungkan |
| T99 | **Excel .xlsx ditulis sendiri** (fflate 0.8.3 untuk ZIP, kompresi zlib bawaan Node di thread pool), bukan pustaka spreadsheet: teks selalu teks inline (tidak pernah rumus), waktu sebagai tanggal-waktu Excel WIB, judul beku, saringan otomatis. Rekap dan daftar dibaca dari **satu potret data** (REPEATABLE READ, hanya baca, JIT dimatikan) lewat cursor 500 baris dan **dikirim bertahap**; batas 100.000 NPR per berkas dan 2 unduhan bersamaan (429). Tidak perlu antrean latar | Diukur pada 100.000 NPR: 3,5 detik, memori puncak 285 MB, `/api/health` tetap ≤ 20 ms selama unduhan. Versi pertama (berkas utuh di memori, kompresi JavaScript) 6,2 detik, 777 MB, dan menahan event loop |
| T100 | **PDF lewat cetak browser** (Cetak / PDF): CSS cetak tanpa menu, header, dan saringan; periode dan saringan tertulis di judul; daftar di cetakan hanya halaman yang tampil (lengkap di Excel) | Tanpa pustaka PDF atau Chromium di server; hasil sama dengan layar. Templat resmi menunggu contoh laporan wajib dari user |

**Keputusan yang diambil saat 2.3** (NOC punya akses internet; mohon dicek):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T94 | Peta dengan **Leaflet 1.9.4 + Leaflet.markercluster 1.5.3** (BSD-2/MIT, dimuat terpisah hanya saat peta dibuka) dan gambar peta **OpenStreetMap**, bisa diganti lewat `MAP_TILE_URL`/`MAP_TILE_ATTRIBUTION` tanpa build ulang. CI memakai alamat `.invalid` agar uji tidak meminta gambar ke OSM | NOC punya internet; OSM gratis untuk pemakaian ringan dengan atribusi, dan melarang permintaan otomatis massal |
| T95 | **Warna titik = kondisi remote dari NPR aktif**: Gangguan (ada NPR aktif yang tidak Pending, termasuk Eskalasi), Pending (semua NPR aktifnya Pending), Normal, Nonaktif/Dismantle; kelompok titik berwarna kondisi terparah. Palet status tervalidasi, selalu bersama label dan jumlah di keterangan; saringan per kondisi di Overview | "Warna sesuai status" yang berguna bagi NOC adalah gangguan sekarang, bukan status master remote |
| T96 | Klik titik → info (Site ID, kota, customer, kondisi, jumlah NPR aktif) dan **Buka remote**; klik kelompok → perbesar. Layar dinding: peta sebagai panel kedua, tanpa popup dan saringan, peta dasar digelapkan | Kriteria 2.3 ("klik menuju remote"); info dulu agar tidak salah buka |
| T97 | Data lengkap saat dibuka, setelah koneksi pulih, dan tiap 10 menit; kabar perubahan → **`GET /api/map/states`** (hanya remote tidak normal) dan titik diubah tanpa membangun ulang. API kini **mengompresi gzip** jawaban JSON (stream dikecualikan; `no-transform` sebagai pengaman kedua) | Diukur pada 5.075 remote: data peta 1,3 MB → 175 KB, kondisi terkini 12,5 KB; tanpa ini setiap perubahan tiket memuat 1,3 MB di setiap layar |

**Keputusan yang diambil saat 2.4** (mohon dicek):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T89 | Layar dinding = halaman **`/dinding`** (modul Overview) tanpa menu, selalu bertema gelap: jam WIB, status koneksi, angka tiket aktif yang selalu tampil, dan panel yang berganti tiap 20 detik (8 NPR aktif terbaru, tren 14 hari, per kategori/customer, remote teratas); lama per panel `?putar=` 2–300 detik | Terbaca dari jauh (1920×1080, angka ≥ 64 px), tanpa disentuh; isi sama dengan Overview |
| T90 | **Kejadian kritis = NPR baru** (sampai Alert otomatis, R6): peringatan kuning besar 90 detik, bunyi, panel kembali ke antrean. Sumbernya kabar langsung `insert` (migrasi `LiveChangesOp`, kabar kini membawa `op`), dan untuk kabar yang terlewat saat putus: NPR yang baru masuk antrean saat dimuat ulang. Sekali per NPR | Alert dari Jupiter belum ada (K47); uji rendam menunjukkan 9 dari 37 kabar bisa terlewat tepat saat jaringan putus |
| T91 | Bunyi (Web Audio, tanpa berkas) dan layar penuh setelah **satu klik**; untuk PC khusus, **Chrome mode kios** (`--kiosk --autoplay-policy=no-user-gesture-required`) agar tanpa klik juga setelah PC menyala ulang. Layar diminta tetap menyala (Wake Lock) | Aturan browser: suara butuh interaksi pengguna kecuali mode kios |
| T92 | Sesi memakai **akun Helpdesk biasa**: setiap muat ulang memperpanjang sesi (batas diam 12 jam tidak tercapai); batas mutlak 7 hari tetap, lalu halaman masuk dan kembali ke `/dinding`. Akun atau token khusus layar dinding menunggu kelola pengguna (8.1) | Tidak melemahkan aturan sesi (0.3) untuk satu layar |
| T93 | Perawatan sendiri: versi baru portal dipasang otomatis 30 detik setelah tersedia (hanya di `/dinding`), halaman dimuat ulang sekali sehari 03.00 WIB, spanduk merah "Koneksi terputus sejak …" sampai tersambung lagi | Tidak ada orang yang menekan "Muat ulang sekarang" di layar dinding |

**Keputusan yang diambil saat 2.2**:

| # | Keputusan | Alasan |
| --- | --- | --- |
| T84 | Pembaruan langsung lewat **Server-Sent Events** `GET /api/stream` (satu arah, HTTP biasa). Isinya hanya ID tiket dan jenis perubahan; halaman memuat ulang datanya lewat rute biasa | Lolos Nginx aaPanel dan Caddy tanpa konfigurasi tambahan (`X-Accel-Buffering: no`); aturan akses dan bentuk data tetap satu tempat |
| T85 | Sumber kabar: **trigger database** `NOTIFY tyio_changes` di `tickets`, `ticket_actions`, `trouble_tickets`; aplikasi mendengarkan dengan satu koneksi khusus, menyambung ulang sendiri (jeda 1–30 detik), lalu mengirim `resync` | Terkirim hanya bila transaksi berhasil; perubahan dari server aplikasi mana pun ikut (produksi dua server, 1.7) |
| T86 | Penyaringan per customer **di server, per koneksi**: kabar customer lain tidak pernah dikirim | Sama dengan aturan tenant (T27); tidak bergantung pada browser |
| T87 | Detak tiap 25 detik; browser menganggap putus bila tidak ada kabar selama 2,5× jarak detak. Server menutup koneksi rapi tiap 5 menit (`bye`), browser menyambung ulang segera tanpa terlihat putus, dan sesi diperiksa ulang. Gagal tersambung dua kali: sesi diperiksa; bila habis, ke halaman masuk | Di bawah batas diam proxy (60 detik); sesi habis atau pengguna dinonaktifkan berhenti menerima kabar ≤ 5 menit |
| T88 | Tampilan: indikator **Langsung / Menyambung… / Terputus** di header (teks dan warna; ringkas di ponsel), **spanduk** selama terputus dengan "Sambungkan sekarang", **Data diterima HH.MM.SS WIB** di Overview, daftar Tiket, dan detail tiket, baris yang berubah disorot 4 detik, semua halaman memuat ulang setelah tersambung lagi. Form Tambah tindakan **tidak dibuat ulang** saat status berubah: pilihan status dan jenis disesuaikan, catatan dan lampiran yang sedang diisi tetap, dengan peringatan bila status diubah di tempat lain | Kriteria 2.2 (putus terlihat jelas, data terakhir diterima); ketikan Helpdesk tidak hilang karena perubahan rekan |

**Keputusan yang diambil saat 2.1** (mohon dicek):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T80 | Isi Overview: **tiket aktif** (total, per status, TT aktif, Down ≥ 7 hari), **aktif per kategori** dan **per customer**, **tren 14 hari** (NPR baru menurut tanggal kejadian, Selesai menurut tanggal online kembali), **10 remote dengan NPR terbanyak dalam 30 hari** (semua NPR menurut kejadian, termasuk yang Selesai; jumlah sama diurut Site ID). Hari menurut WIB, seperti bulan pada nomor tiket | Kriteria 2.1 (per status, kategori, customer, tren harian, remote paling sering bermasalah); remote bermasalah dinilai dari kejadian, bukan dari yang masih terbuka |
| T81 | **Setiap angka = tautan ke daftar Tiket** dengan jumlah yang sama persis. Daftar mendapat saringan status, rentang tanggal kejadian, rentang tanggal online kembali, remote, dan Down ≥ 7 hari (alamat: `status`, `dari`, `sampai`, `ditutupDari`, `ditutupSampai`, `remote`, `lama`), tampil sebagai chip yang bisa dihapus. Angka Overview dan daftar dihitung dari query dasar yang sama (`filteredQuery`), dan uji membandingkan setiap angka dengan total daftarnya | Kriteria 2.1 ("jumlahnya sama persis"); satu sumber query mencegah angka menyimpang |
| T82 | Overview dimuat ulang tiap 60 detik selama halaman terlihat, saat halaman kembali terlihat, dan lewat tombol; waktu "Diperbarui" selalu tampil. Saat memuat ulang, isi lama tetap tampil (diredupkan) | Pembaruan langsung lewat koneksi terbuka di 2.2; sampai itu angka tidak lebih tua dari semenit |
| T83 | Grafik tanpa pustaka (HTML/CSS): tren dua seri berdampingan dengan biru dan oranye dari palet yang divalidasi untuk buta warna (terang dan gelap), legenda, tooltip saat hover/fokus, dan tabel; per kategori/customer berupa batang horizontal satu warna | Tidak menambah dependensi; tetap terbaca tanpa warna dan tanpa mouse |

**Keputusan yang diambil saat 1.6** (turunan K32, K33, K40, K44; mohon dicek):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T74 | **Close** = jenis tindakan keempat di form Tambah tindakan, dan **satu-satunya jalan ke Selesai**: "Ubah status" tidak lagi menawarkan Selesai, API menolak Selesai tanpa Close, database menolak Close yang tidak ke Selesai. Close dari Terbuka, Dikerjakan, Eskalasi; dari Pending ubah ke Dikerjakan dulu (alur 1.4 yang disetujui). Catatan penyelesaian wajib | K32 (Close = Take Action); penutupan selalu membawa waktu dan catatannya |
| T75 | NPR **dengan TT** (ada kunjungan teknisi, K44): Close wajib **laporan teknisi** (lampiran, paling sedikit satu) dan **pilihan part**: Modem, Adaptor, Perangkat indoor, BUC, LNB, atau "Tidak ada part yang diganti". Part disimpan di entri Close (`replaced_parts`, dijaga database). TT ditutup bersama NPR pada waktu yang sama. NPR tanpa TT: tanpa part, lampiran opsional. Daftar part tetap di kode sampai diminta jadi master data | K32 ("lampirkan laporan dan part yang diganti"); K33 (tanpa Device Failure / Prob. Cause) |
| T76 | Waktu Close = **waktu jarkom online kembali** (diisi Helpdesk, jam lokasi), disimpan sebagai `tickets.closed_at`; tidak sebelum waktu kejadian dan tidak di masa depan. Database menjaga Selesai ⇔ `closed_at` terisi. Migrasi `TicketClose` mengisi `closed_at` tiket Selesai lama dari entri terakhir ke Selesai (cadangan: waktu ubah terakhir) dan menutup TT-nya | K32 ("tutup saat online lagi"); memperbaiki bug: tiket Selesai masih dihitung "tiket terbuka" saat membuat tiket baru |
| T77 | **Membuka lagi** (Selesai → Dikerjakan) mengosongkan waktu tutup NPR dan TT; TT aktif lagi (tetap satu TT); entri Close lama tetap di linimasa | K40 (down lagi dicatat di NPR yang sama); menyelesaikan catatan T73 |
| T78 | **Lama gangguan** = online kembali − kejadian, dihitung dari menit yang tampil (detik diabaikan), di kartu Gangguan dan riwayat remote. Waktu pending belum dikurangkan | Dasar SLA (R4); angka SLA dari user belum ada (K47) |
| T79 | **Riwayat tiket** di halaman remote: semua NPR remote itu, terbaru menurut kejadian, 50 per halaman, dengan status, kategori, online kembali, lama gangguan, no. TT; tautan dari halaman tiket. API: saringan `remoteId` di `GET /api/tickets` (indeks `tickets_remote_occurred_idx`). Hanya untuk peran yang boleh membuka Tiket | Kriteria 1.6; daftar bertumpuk (bukan tabel) agar terbaca di ponsel |

**Keputusan yang diambil saat 1.5b** (turunan K25, K27, K41, K44; Eskalasi disetujui user):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T69 | Status **Eskalasi** = TT terbuka, menunggu kunjungan teknisi. Dipasang otomatis oleh **Eskalasi To SD**, tidak lagi pilihan di form status. Dari Eskalasi: Dikerjakan, Pending, atau Selesai (setelah kunjungan). TT bisa dibuka dari Terbuka, Dikerjakan, Pending (pihak pending dikosongkan), dan tiket Eskalasi lama tanpa TT (tanpa entri ubah status); tidak dari Selesai | Disetujui user ("usul pertama"); TT = kunjungan teknisi (K44), jadi Eskalasi tanpa TT tidak bermakna. Menggantikan T68 |
| T70 | Nomor TT `TT/<jarkom>/<customer>/<tahun>/<bulan>/<urut>` dari penghitung sendiri (`ticket_sequences` jenis `TT`), per customer, jarkom, dan bulan WIB. **Satu TT per NPR** dijaga dua lapis: baris tiket dikunci saat membuka TT, dan constraint unik `trouble_tickets(ticket_id)`; TT kedua dijawab 409 dengan nomor TT yang ada | K27, K41; nomor TT tidak memakan nomor NPR |
| T71 | TT disimpan di tabel `trouble_tickets` (FK ke tiket dan customer yang sama, audit log). Isian hanya **Problem untuk teknisi** (3–2.000 karakter, terisi awal dari keterangan NPR). Pembukaan tercatat di linimasa NPR sebagai jenis **Eskalasi To SD** berisi nomor dan problem. Kolom `closed_at` disiapkan untuk 1.6; sampai itu TT tidak punya status sendiri | K27: TT tampil di linimasa NPR yang sama; penjadwalan teknisi di luar portal (K31) |
| T72 | **Salin ringkasan TT**: teks per baris (no. TT dan NPR, customer dan no. tiket customer, remote dan Site ID, lokasi, jarkom dan IP, problem, kontak, waktu dan pembuka TT). Setiap penyalinan dicatat server sebagai entri Bebas "Ringkasan TT/… disalin untuk dikirim ke SD."; bila browser menolak clipboard, teks ditampilkan untuk disalin manual | K25: pengiriman ke SD lewat chat dan harus tercatat |
| T73 | Tab **TT aktif** di daftar Tiket (NPR belum Selesai yang punya TT, apa pun statusnya) dengan jumlahnya; no. TT di baris daftar, kepala tiket, dan hasil pencarian; pencarian daftar dan global menemukan potongan no. TT (indeks trigram) | "Daftar TT aktif terpisah" di kriteria 1.5b sebagai tab, karena TT selalu milik NPR; tab Eskalasi tetap = menunggu kunjungan. Melengkapi T57. Bila NPR dibuka lagi dari Selesai, TT-nya tampil aktif lagi; ditinjau bersama penutupan di 1.6 |

**Keputusan yang diambil saat 1.5e** (turunan K30, K46):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T66 | Peran menjadi **`helpdesk`** dan **`admin`**. Migrasi `HelpdeskRole` mengubah pengguna L1/L2 menjadi helpdesk (tercatat di audit sebagai `sistem:migrasi`); `down` mengembalikan semuanya ke L1. Admin tetap bisa membuka semua modul operasional ditambah Admin | Satu peran operasional (K30); admin = pengelola aplikasi (K46) |
| T67 | Akun contoh: `helpdesk.contoh` (semua customer), `helpdesk.merapi` (hanya Merapi), `admin.contoh`. Server lama tetap memakai akun `l1.contoh`, `l2.contoh`, `l1.merapi` (kini helpdesk) sampai `ulang-data` | Tidak ada akun yang hilang atau berganti sandi saat `perbarui` |
| T68 | Status tiket **Eskalasi** (semula "ke L2") belum diubah; artinya ditetapkan bersama TT di 1.5b | Tanpa L2, eskalasi yang tersisa adalah Eskalasi To SD (TT) |

**Keputusan yang diambil saat 1.5c** (penyesuaian dari jawaban user K26–K41; mohon dicek):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T60 | **System dihapus dari layar** (form Buat tiket, detail, daftar, Admin › Master data) dan dari daftar/pencarian API. Kolom dan daftar System di database dibiarkan (kosong untuk tiket baru) sampai dibersihkan bersama perubahan peran | K29; tidak ada data yang dihapus selagi demo berjalan |
| T61 | Status remote `dibongkar` berlabel **Dismantle**; nilai di database tetap. Impor Excel menerima "Dismantle" dan "Dibongkar" | K38; file Excel lama tetap bisa dipakai |
| T62 | Menu **Dokumen** (Shared) dihapus | K31 |
| T63 | **Jenis tindakan** di linimasa: **Bebas** (bawaan), **Cek lokasi**, **Problem**; Cek lokasi dan Problem wajib berisi catatan (dijaga API dan database). Ditampilkan sebagai lencana di linimasa dan di tindakan terakhir daftar. Eskalasi To SD dan Close menyusul di 1.5b dan 1.6 | K32; nama "Bebas" mengikuti sistem lama, "Catatan" sudah nama kolom isinya |
| T64 | Pilihan pihak pending diberi keterangan: TM = problem jaringan (jarkom) di lokasi; Customer = listrik, obstacle, renovasi, atau part ATM belum siap | K28 |
| T65 | Tanda **"Down ≥ 7 hari"** otomatis untuk tiket yang belum Selesai dan kejadiannya 7 hari atau lebih, di daftar dan detail | K36 ("down seminggu, perlu diupdate"); dihitung dari waktu kejadian, bukan dari tindakan terakhir — mohon dicek |

**Keputusan yang diambil saat 1.5** (mohon dicek; turunan R-E, T9, T27, T51, T53):

| # | Keputusan | Alasan |
| --- | --- | --- |
| T55 | Tab daftar tiket: **Aktif** (belum Selesai), **Milik saya** (tiket aktif yang saya buat atau pernah saya beri tindakan; belum ada penugasan), **Pending**, **Eskalasi**, **Selesai**, **Semua**. Bawaan Aktif. Tab, pencarian, saringan, dan halaman tersimpan di alamat | "Filter tersimpan" di kriteria 1.5 tanpa akun penyimpan: alamat bisa dibagikan dan ditandai di browser; "milik" menunggu penugasan |
| T56 | Urutan daftar: **waktu kejadian terbaru dulu**, lalu id (yang terakhir dicatat dulu) bila waktunya sama. Urutan terlama dulu menunggu hitung mundur SLA (R4) | Tiket yang baru dibuat langsung terlihat (keluhan operator: tiket "hilang" setelah dibuat); urutan stabil antarhalaman |
| T57 | Pencarian (daftar dan global) di no. NPR, no. tiket customer, Site ID, nama, kota, dan kanca remote; potongan teks, tanpa beda huruf besar/kecil, `%` dan `_` dicari apa adanya; indeks trigram atas nomor tiket. Pencarian global minimal 2 karakter, paling banyak 10 tiket dan 10 remote dengan jumlah seluruhnya. No. TT menyusul di 1.5b | Operator sering hanya ingat potongan nomor (urut atau bulan) atau nama lokasi |
| T58 | Kinerja: jumlah di tab hanya untuk tab antrean (Aktif, Milik saya, Pending, Eskalasi) dan hanya membaca tiket aktif; total Selesai/Semua dihitung saat tab itu dibuka. Pencarian menggabungkan dua pencarian berindeks (nomor tiket, remote) lalu dibatasi tenant di query luar | Diukur pada 100.000 tiket: jumlah tab 183 → 11,5 ms, cari 173 → 16 ms (lihat Progres 1.5) |
| T59 | Pencarian global di header (menu di ponsel) ke halaman `/cari`; setiap jenis hasil hanya dicari bila peran boleh membuka modulnya (Tiket, Remote) | Satu kotak cari untuk semua; hak modul tetap satu sumber (`MODULE_ROLES`) |

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

**1.5b Open Ticket (TT) ke Service Delivery (M)** — dipindah dari 3.2 (K16); disesuaikan K27
- Terima: dari NPR aktif, helpdesk membuka TT lewat "Eskalasi To SD" (problem jarkom, pihak TM) bernomor `TT/<jarkom>/<customer>/<tahun>/<bulan>/<urut>` (disetujui K41); TT tampil di linimasa NPR yang sama; **satu NPR paling banyak satu TT** (K27); penjadwalan teknisi di luar portal, hasil kunjungan dicatat helpdesk di NPR; daftar TT aktif terpisah dari daftar NPR aktif; tombol "salin ringkasan TT" menyalin teks siap tempel ke chat (no. TT, remote, lokasi, problem, kontak) dan tercatat di linimasa (K25).
- Verifikasi: `pnpm test:api trouble-tickets && pnpm e2e tt`
- Berkas: `apps/api/src/modules/trouble-tickets/`, `apps/web/src/pages/tickets/detail/TroubleTicketCard.vue`
- Menunggu: 1.4

**1.6 Penutupan (Close) dan halaman riwayat remote (S)** — disesuaikan K30, K32, K33
- Terima: NPR ditutup saat jarkom terpantau online lagi (K32), dengan catatan penyelesaian; bila ada kunjungan teknisi, lampirkan laporannya dan pilih part yang diganti (modem, adaptor, perangkat indoor, BUC, LNB); tanpa kolom Device Failure / Prob. Cause (K33); NPR yang punya TT ditutup bersama TT-nya; satu peran Helpdesk (K30), jadi tidak ada pembagian L1/L2; halaman remote menampilkan seluruh riwayat tiketnya.
- Verifikasi: `pnpm test:api tickets.close migration-close && pnpm e2e ticket-close`
- Berkas: `apps/api/src/modules/tickets/actions/`, `apps/web/src/pages/tickets/detail/TicketActionForm.vue`, `apps/web/src/pages/remotes/RemoteTicketHistory.vue`
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
- Verifikasi: `pnpm test:api overview` (angka dibandingkan dengan query daftar) `&& pnpm e2e overview`
- Berkas: `apps/api/src/modules/overview/`, `apps/web/src/pages/overview/`
- Menunggu: 1.5

**2.2 Pembaruan langsung dan alert di dashboard (S)**
- Terima: tiket baru/berubah muncul tanpa muat ulang; koneksi putus terlihat jelas dan menyambung sendiri; setiap panel menampilkan "data terakhir diterima".
- Verifikasi: `pnpm test:api stream && pnpm e2e live-update`
- Berkas: `apps/api/src/modules/stream/`, `apps/web/src/stores/live.ts`
- Menunggu: 2.1

**2.3 Peta remote (M)**
- Terima: marker berkelompok, warna sesuai status, klik menuju remote; lancar dengan ribuan titik.
- Verifikasi: `pnpm test:api map && pnpm e2e map`
- Berkas: `apps/api/src/modules/map/`, `apps/web/src/pages/overview/map/`
- Menunggu: 2.1 · Sumber ubin: OpenStreetMap (NOC punya internet), bisa diganti lewat `MAP_TILE_URL`

**2.4 Mode layar dinding (S)**
- Terima: tanpa interaksi, teks terbaca dari jauh, berputar antarpanel, bunyi saat kejadian kritis, tidak keluar sesi sendiri, pulih sendiri setelah jaringan putus.
- Verifikasi: `pnpm e2e wall` + uji rendam 24 jam di staging
- Berkas: `apps/web/src/pages/wall/`, `apps/web/src/stores/live.ts`
- Menunggu: 2.2

### R3 — Gamas + laporan teknisi — **Dibatalkan** (K31, K45)
Gamas dihapus dari portal; penugasan dan laporan teknisi di luar portal. TT tercatat di linimasa
NPR lewat 1.5b.

**3.1 Gamas: buat, tautkan, tutup (M)** — **Dibatalkan (K45)**
- Terima: Gamas menyimpan waktu mulai/selesai, durasi, penyebab, troubleshooting, penyelesaian; remote dan tiket bisa ditautkan massal; menutup Gamas menawarkan penutupan tiket anak.
- Verifikasi: `pnpm test:api gamas && pnpm e2e gamas`
- Berkas: `apps/api/src/modules/gamas/`, `apps/web/src/pages/gamas/`
- Menunggu: 1.6 · **Butuh: sesi detail Gamas**

**3.2 Penugasan teknisi pada TT (S)** — **Dibatalkan (K31):** penjadwalan teknisi di luar portal
- Terima: eskalasi ke lapangan membuat TT bernomor `TT/…`; tindakan TT tampil di linimasa tiket yang sama; satu tiket bisa punya lebih dari satu TT.
- Verifikasi: `pnpm test:api trouble-tickets && pnpm e2e tt`
- Berkas: `apps/api/src/modules/trouble-tickets/`
- Menunggu: 1.5b

**3.3 Hasil kunjungan SD (S)** — **Dibatalkan (K31):** laporan teknisi dikirim ke NOC di luar portal; helpdesk mencatat dan melampirkannya di NPR (cukup dengan 1.4 dan 1.6)
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
- Terima: laporan NPR dan SLA (Gamas dan laporan teknisi tidak dipakai, K31/K45) dengan filter periode/customer/kategori; ekspor Excel dan PDF; laporan besar dikerjakan di latar dan diunduh saat siap.
- Verifikasi: `pnpm test:api reports && pnpm e2e reports`
- Berkas: `apps/api/src/modules/reports/`, `apps/web/src/pages/reports/`
- Menunggu: 4.1, 3.1 · **Butuh: contoh laporan wajib**
- **4.2a sudah dikerjakan lebih dulu** (tidak menunggu 4.1): rekap NPR per periode dengan ekspor Excel dan cetak/PDF (T98–T100). Sisa 4.2: laporan SLA dan templat sesuai contoh laporan wajib

### R5 — Notifikasi
Selesai bila: notifikasi sampai cepat dan tidak dobel.

**5.1 Mesin notifikasi dan pusat notifikasi di aplikasi (M)**
- Terima: kejadian (tiket baru, eskalasi/TT, SLA hampir lewat) menjadi notifikasi lewat antrean; kiriman gagal dicoba ulang; satu kejadian satu notifikasi per penerima per kanal.
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

**6.3 Dugaan penyebab (S)** — saran Gamas dibatalkan (K45)
- Terima: kandidat diberi dugaan (link / perangkat / listrik / cuaca) dari gabungan data SNMP dan VSAT (Jupiter, K47).
- Verifikasi: `pnpm test:api alerts.classify`
- Menunggu: 6.2

### R7 — Integrasi customer
**7.1 API tiket per tenant (M)** — kunci API per tenant, pembuatan tiket yang aman diulang (kunci idempoten), nomor tiket customer tersimpan, batas laju. Verifikasi: `pnpm test:api public-api`. Menunggu: 6.1.
**Belum jelas:** bentuk sistem customer; dirinci saat ada kebutuhan eksternal nyata.

### R8 — Go-live penuh
**8.1 Hak akses rinci (S)** — disederhanakan oleh K30/K46: dua peran (Helpdesk, Admin), sudah dipasang di 1.5e. Sisa: kelola akun pengguna dari layar Admin, diuji per endpoint.
**8.2 SSO (S)** — bila tersedia. **8.3 Dokumen dan runbook (M)** — **Dibatalkan (K31):** menu Shared tidak dibuat.
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
| ~~Detail Gamas, arti eskalasi/Take Action~~ | — | Terjawab: Take Action K32, Gamas dihapus K45 |
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
| 1.5 Antrean tiket dan pencarian global | **Selesai 2026-11-17.** Dipercepat karena operator di server demo tidak bisa menemukan tiket setelah halaman tiket ditutup (belum ada daftar). `pnpm test:api tickets.list search` lulus (37 uji): tab Aktif bawaan urut waktu kejadian terbaru, Pending/Eskalasi/Selesai/Semua, Milik saya (buat atau beri tindakan; yang selesai tidak), jumlah per tab ikut saringan dan pencarian, saringan customer/kategori/system/jarkom, cari potongan no. NPR, no. tiket customer (huruf kecil), Site ID, nama dan kota remote, `%`/`_` apa adanya, 50 per halaman tanpa tumpang tindih dengan urutan stabil, pengguna terbatas hanya customernya, parameter salah 400; pencarian global: tiket dan remote, maks 10 dengan total, minimal 2 karakter, data customer lain tidak muncul. Harness lintas-tenant kini memeriksa `/api/tickets` dan `/api/search` (dengan kata yang cocok untuk kedua tenant). `pnpm e2e ticket-queue` (6 uji): tiket baru di Aktif dan Milik saya lalu dibuka dan kembali ke tab yang sama, tab Pending dengan pihak dan alasan, pencarian header (no. tiket customer, Site ID), pengguna terbatas, 1280 px tabel di dalam kartu, 375 px tanpa gulir samping dan cari lewat menu. Uji mutasi (16): daftar atau remote di pencarian tanpa batas tenant, wildcard tidak di-escape, Milik saya tanpa syarat aktif atau tanpa tindakan saya, jumlah tab tanpa saringan atau tanpa batas status aktif, total Selesai/Semua dari jumlah antrean, tindakan terakhir terlama, cari tanpa no. tiket customer atau tanpa remote, urut terlama, tanpa penentu urutan id, pencarian tanpa panjang minimum atau tanpa batas 10, tampilan tak dikenal diterima: semuanya membuat uji merah (urutan id awalnya lolos; uji diperketat). **Diukur pada 100.000 tiket, 200.000 entri linimasa, 5.000 remote** (API sungguhan, query dari log Postgres): daftar Aktif 210 → 32–49 ms (jumlah tab 183 → 11,5 ms), cari di daftar 190–340 → 20–22 ms, pencarian global 200–320 → 15–26 ms, Selesai halaman 1.500 89 ms. Ditemukan dan diperbaiki: di 375 px halaman bergulir ke samping dan di 1280 px kolom Tindakan terakhir keluar kartu (uji lama memeriksa sebelum tabel dimuat; kedua uji baru merah pada image lama); nomor tiket patah di tengah angka urut (kini hanya setelah "/"); "Status Terbuka" sebagai tindakan terakhir (kini "Tiket dibuat"); uji skema bergantung urutan berkas (pembatalan migrasi linimasa gagal bila berkas lain meninggalkan tiket berstatus selain terbuka; kini mengosongkan data dulu); label uji lama bertabrakan dengan kotak cari global (dibuat persis). Seluruhnya 260 uji API, 9 uji unit web, dan 44 uji layar lulus dari database kosong (uji layar dua kali berturut-turut). CI run #36 (commit `7cc7b98`) hijau: lint, build, 260 uji API, 44 uji layar terhadap image lewat compose staging; image diterbitkan dan tag `demo` dipindah, jadi server demo bisa diperbarui dengan `deploy/scripts/server.sh perbarui`. **Belum:** no. TT di pencarian (1.5b); "Milik saya" berdasarkan penugasan; urutan per sisa SLA (R4). |
| 1.5c Penyesuaian dari jawaban user | **Selesai 2026-11-17.** Dari jawaban konfirmasi K26–K41 (T60–T65). API: kolom `action_type` di linimasa (migrasi `ActionType…`; entri lama menjadi Bebas), Cek lokasi/Problem wajib catatan (API 400 dan penjaga database), jenis tak dikenal dan koreksi berjenis ditolak, tindakan terakhir di daftar membawa jenisnya, saringan System dihapus dari daftar, impor menerima "Dismantle", pesan "berstatus Dismantle". Web: System hilang dari Buat tiket/detail/daftar/Master data (`/admin/master/system` tidak ada lagi), menu Dokumen hilang, label Dismantle, pilihan jenis tindakan dengan petunjuk, keterangan pihak pending sebagai deskripsi radio, tanda "Down ≥ 7 hari" di detail dan "≥ 7 hari" di daftar. Uji: 263 uji API (3 baru dan beberapa disesuaikan), 16 uji unit web (7 baru untuk aturan tanda), 49 uji layar (5 baru: jenis tindakan, keterangan pending, tanda 7 hari, Dismantle, tab master tanpa System) lulus dari database kosong, dua kali berturut-turut. Uji mutasi (9): jenis tindakan tidak disimpan, Cek lokasi/Problem tanpa catatan diterima, jenis tak dikenal diterima, koreksi berjenis, penjaga database dicabut, tindakan terakhir tanpa jenis, impor tanpa "Dismantle", tanda setelah 14 hari, tanda untuk tiket selesai: semuanya membuat uji merah. Ditemukan dan diperbaiki: pilihan "Catatan" bernama sama dengan kolom Catatan (kini "Bebas"); keterangan pihak pending ikut menjadi nama radio sehingga "Customer" cocok dengan "TM" karena kata "ATM" (kini deskripsi di luar label, diuji dengan nama persis dan deskripsi). CI run #39 (commit `240a614`) hijau: lint, build, 263 uji API, 49 uji layar terhadap image; tag `demo` dipindah. **Belum:** satu peran Helpdesk (K30), TT (1.5b), Close (1.6), penghapusan kolom System di database. |
| 1.5d Kategori baru, Gamas dihapus | **Selesai 2026-11-18.** Dari jawaban K42–K47: menu dan modul Gamas dihapus (K45; `/gamas` tidak ada lagi, ringkasan Alert dan Laporan tanpa Gamas); kategori data contoh menjadi Remote Down, Relokasi, Reposisi, Preventive Maintenance (K43; Corrective Maintenance tidak di-seed). Server yang sudah terpasang tidak berubah kategorinya oleh `perbarui` (seed tidak berjalan): tambahkan Relokasi dan Reposisi lalu nonaktifkan Corrective Maintenance di Admin › Master data, atau `ulang-data`. Rencana: R3 dan 6.3 (saran Gamas) dibatalkan, laporan dan notifikasi tanpa Gamas. 263 uji API, 16 uji unit web, 49 uji layar lulus dari database kosong; CI run #41 (commit `2805dcc`) hijau dan tag `demo` dipindah. |
| 1.5e Satu peran Helpdesk | **Selesai 2026-11-18.** K30/K46, T66–T68. Peran `helpdesk` dan `admin` di `@tyio/shared`, constraint `users_role_valid`, migrasi `HelpdeskRole…`, label "Helpdesk", akun contoh baru, daftar akun di `server.sh` dan panduan. `pnpm test:api` 264 uji lulus, termasuk uji migrasi baru: pengguna L1/L2 lama menjadi helpdesk, admin tetap, dua baris audit atas nama `sistem:migrasi`, peran lama ditolak setelahnya. 49 uji layar lulus dari database kosong dengan akun baru. Uji jalur pembaruan: database versi sebelumnya (commit `ac300e5`, akun `l1.contoh`/`l2.contoh`/`l1.merapi`) dimigrasi dengan versi baru; ketiganya menjadi helpdesk, login dengan sandi lama berhasil, tiket 200, Admin 403, `admin.contoh` Admin 200. Rencana: 8.1 disederhanakan, 8.3 dibatalkan. CI run #43 (commit `5a2c7b2`) hijau: 264 uji API, 49 uji layar terhadap image; tag `demo` dipindah. |
| 1.5b TT lewat Eskalasi To SD | **Selesai 2026-11-18.** K25, K27, K41, K44; T69–T73 (Eskalasi = TT terbuka, disetujui user). API: tabel `trouble_tickets` (migrasi `TroubleTickets…`: FK ke tiket dan customer yang sama, unik per NPR, unik nomor, panjang problem, indeks trigram nomor, audit), `POST /api/tickets/:id/tt` dan `POST /api/tickets/:id/tt/salin`, jenis linimasa `eskalasi_sd`, Eskalasi dihapus dari pilihan status manual, tab `tt` dengan jumlahnya, no. TT di detail, daftar, dan pencarian. Web: kartu Trouble Ticket di detail (Eskalasi To SD lewat panel kanan, Salin ringkasan TT dengan cadangan salin manual), lencana no. TT di kepala tiket, daftar, dan hasil pencarian, tab TT aktif. `pnpm test:api trouble-tickets` 12 uji: nomor `TT/VSAT/TNA/<tahun>/<bulan>/0001` dan status Eskalasi tercatat di linimasa dan audit, urut TT terpisah dari NPR, TT kedua 409 tanpa perubahan, dua Helpdesk bersamaan (satu 201, satu 409), status yang dilihat berubah 409, dari Selesai 400, isian salah per kolom, dari Pending pihak dikosongkan, Eskalasi manual ditolak dan jalur setelah kunjungan, tiket Eskalasi lama tanpa entri status, isi ringkasan dan setiap salinan tercatat, tab TT aktif (tanpa NPR Selesai) dan cari no. TT di daftar dan global, penjaga database (unik per NPR, TT tidak bisa milik customer lain), ringkasan dengan data kosong. Harness lintas-tenant: dua rute tulis baru (404, tidak berubah) dan tabel `trouble_tickets` ikut diperiksa. `pnpm e2e tt` 4 uji: buka TT lewat panel (nomor, status, linimasa, tombol hilang), salin ke clipboard dan tercatat, tab TT aktif dan pencarian global lewat no. TT, 375 px tanpa gulir samping dan Escape mengembalikan fokus. Uji mutasi (12): tanpa cek satu TT per NPR, status tidak menjadi Eskalasi, tanpa cek status yang dilihat, TT dari tiket Selesai, tanpa entri linimasa, tanpa batas tenant, penyalinan tidak tercatat, nomor dari penghitung NPR, cari tanpa no. TT, TT aktif termasuk yang Selesai, Eskalasi boleh dipilih manual: semuanya membuat uji merah. Tanpa kunci baris tiket saja lolos karena constraint unik tetap menolak TT kedua (409); tanpa kunci dan tanpa penanganan unik, uji serentak merah. Ditemukan dan diperbaiki: uji audit TT memilih baris audit dari run lain (audit log tidak pernah dikosongkan; kini disaring per baris). Seluruhnya 278 uji API, 16 uji unit web, dan 53 uji layar lulus dari database kosong; lint dan build bersih. Screenshot 1280 dan 375 px diperiksa. CI run #45 (commit `e3dcbb0`) hijau: lint, build, uji API, dan semua uji layar terhadap image; image diterbitkan dan tag `demo` dipindah. **Belum:** penutupan NPR bersama TT, laporan teknisi, dan part yang diganti (1.6). |
| 1.6 Close dan riwayat remote | **Selesai 2026-11-18.** K32, K33, K40, K44; T74–T79. API: jenis tindakan `close` (wajib catatan, selalu ke Selesai; Selesai hanya lewat Close), `replaced_parts` di entri Close, NPR dengan TT wajib part (atau daftar kosong) dan laporan teknisi, waktu online kembali tidak sebelum kejadian, `closed_at` NPR dan TT diisi saat Close dan dikosongkan saat dibuka lagi, `closedAt` di ringkasan/daftar/detail, saringan `remoteId` di daftar tiket. Migrasi `TicketClose…`: constraint `tickets_closed`, `ticket_actions_close`, `ticket_actions_replaced_parts`, pengisian `closed_at` tiket Selesai lama. Web: jenis Close di form (waktu online kembali, status → Selesai, part, laporan teknisi, tombol Close NPR; Close redup dengan alasan saat Pending/Selesai), Ubah status tanpa Selesai, part di linimasa, Online kembali dan Lama gangguan di kartu Gangguan, TT "ditutup bersama NPR", Riwayat tiket di halaman remote dengan tautan dari tiket. `pnpm test:api tickets.close migration-close` 8 uji: Close tanpa TT (status, waktu, linimasa, audit; dari Dikerjakan boleh, dari Pending 400), 11 isian salah per kolom tanpa menyimpan apa pun, NPR dengan TT (part dan laporan wajib, urutan part tetap, berkas yang ditolak tidak tertinggal di disk, TT ikut ditutup, "tidak ada part"), buka lagi lalu Close lagi, tiket Selesai tidak lagi tiket terbuka, riwayat remote, penjaga database (5 kasus), migrasi tiket Selesai lama (entri terakhir dipakai, TT ikut, audit `sistem:migrasi`). Harness lintas-tenant: riwayat remote customer lain kosong. `pnpm e2e ticket-close` 5 uji: Close tanpa TT sampai lama gangguan dan tidak lagi tiket terbuka, Close dengan TT (galat part dan laporan, part saling meniadakan dengan "tidak ada", TT ditutup, part dan laporan di linimasa, keluar dari TT aktif), Pending tidak bisa Close (deskripsi alasan), riwayat remote lewat tautan, 375 px. Uji mutasi (18): Selesai tanpa Close, Close tanpa Selesai, part berulang / tak dikenal / di tindakan lain / pada NPR tanpa TT, Close tanpa catatan, online sebelum kejadian, TT tanpa part atau tanpa laporan, waktu tutup bukan waktu online, TT tidak ikut ditutup atau tidak dibuka lagi, part tidak disimpan, riwayat tanpa saringan remote, `closedAt` tidak dikirim, migrasi memakai entri pertama atau tidak menutup TT: semuanya membuat uji merah. Ditemukan dan diperbaiki: constraint "Close selalu ke Selesai" lolos bila status tujuan kosong (NULL di CHECK; kini `IS NOT DISTINCT FROM`, ketahuan uji database); lama gangguan "1 jam 59 menit" untuk 12.19 → 14.19 (detik ikut dihitung; kini per menit yang tampil); label part merah semua saat galat (kini pesan saja). Seluruhnya 287 uji API, 26 uji unit web, dan 58 uji layar lulus dari database kosong; lint dan build bersih. Screenshot 1280 dan 375 px diperiksa. CI run #47 (commit `5c32a85`) hijau: lint, build, uji API, dan semua uji layar terhadap image; image diterbitkan dan tag `demo` dipindah. **Belum:** waktu pending belum dikurangkan dari lama gangguan (R4); daftar part belum master data. |
| 2.1 Overview: ringkasan dan analitik kejadian | **Selesai 2026-11-18.** T80–T83. API: `GET /api/overview` (modul Overview, dibatasi customer): tiket aktif per status, TT aktif, Down ≥ 7 hari, aktif per kategori dan customer, tren 14 hari WIB (hari kosong ikut), 10 remote teratas 30 hari; saringan daftar baru `status`, `occurredFrom/To`, `closedFrom/To`, `flagged` (dengan `remoteId` dari 1.6), semuanya dari satu query dasar `filteredQuery`; migrasi `Overview…` (indeks `tickets_closed_at_idx`). Web: halaman Overview (angka utama, kotak per status, batang per kategori/customer, grafik tren dengan legenda, tooltip, dan tabel, daftar remote teratas), semua angka berupa tautan; chip saringan dari Overview di daftar Tiket. `pnpm test:api overview` 5 uji: angka aktif per status/TT/≥ 7 hari dan per kategori/customer, **setiap angka sama dengan total daftar yang dituju** (43 pasangan, termasuk 28 batang tren), tren per hari WIB dengan batas tengah malam dan remote teratas (urut Site ID bila sama), pengguna terbatas hanya melihat customernya, saringan salah 400. Harness lintas-tenant otomatis memeriksa `/api/overview`. `pnpm e2e overview` 5 uji: angka status → daftar dengan jumlah tab yang sama dan chip yang bisa dihapus, batang hari ini dan remote teratas → total daftar sama, tooltip dan tabel tren, pengguna terbatas, 375 px dan muat ulang. Uji mutasi (12): tanpa batas tenant, ≥ 8 hari, tren per hari UTC, tanggal "sampai" eksklusif, saringan tutup memakai kejadian, rentang 31 hari, tren tanpa hari kosong, per kategori termasuk Selesai, ≥ 7 hari termasuk Selesai, urutan tanpa Site ID, status diabaikan, tanggal tak sah diterima: semuanya membuat uji merah (≥ 8 hari dan urutan Site ID awalnya lolos; data uji ditambah tiket tepat lewat 7 hari). **Diukur pada 100.000 tiket** (10.000 aktif): Overview 31–63 ms; daftar dengan saringan baru 13–24 ms; daftar Aktif 31–70 ms (sekali 3,2 detik tepat setelah data dimuat, cache dingin). Ditemukan dan diperbaiki lewat screenshot: label 0 dan garis bantu grafik tidak sejajar garis dasar, legenda membuat halaman bergulir ke samping di 375 px, nama kategori/customer terpotong di ponsel (kini di baris sendiri); peran dan cakupan customer sempat hilang bersama kartu "Akun Anda" (uji login lama menangkapnya; kini di bawah judul, karena angka Overview bergantung pada customer yang terlihat). Seluruhnya 292 uji API, 28 uji unit web, dan 63 uji layar lulus dari database kosong; lint dan build bersih. CI run #49 (commit `3e67830`) hijau: lint, build, uji API, dan semua uji layar terhadap image; image diterbitkan dan tag `demo` dipindah. **Belum:** pembaruan langsung (2.2), peta (2.3), layar dinding (2.4); saringan Overview per customer atau rentang tanggal lain. |
| 2.2 Pembaruan langsung | **Selesai 2026-11-18.** T84–T88. API: migrasi `LiveChanges…` (fungsi `notify_ticket_change` dan trigger di `tickets`, `ticket_actions`, `trouble_tickets`), `ChangeFeed` (LISTEN lewat koneksi khusus, sambung ulang dengan jeda, `resync`), `GET /api/stream` (SSE, saring per customer, `ready`/`change`/`resync`/`ping`/`bye`, header anti-buffer), konfigurasi `STREAM_HEARTBEAT_MS` dan `STREAM_MAX_MS`. Web: store `live` (satu koneksi per tab, kumpulkan kabar 400 ms, pengawas detak, sambung ulang 1–15 detik, `bye` tanpa terlihat putus, cek sesi), indikator di header, spanduk terputus, "Data diterima" di tiga halaman, sorotan baris, detail tiket tanpa membuat ulang form. `pnpm test:api stream config` 8 uji: tanpa login 401, header SSE dan `ready`, tiket/tindakan/TT dikabarkan dan pengguna satu customer tidak menerima kabar customer lain, rollback tidak dikabarkan, detak lalu `bye` dan koneksi ditutup, koneksi database pendengar diputus (`pg_terminate_backend`) lalu tersambung lagi dengan `resync`, isi NOTIFY asing diabaikan, batas konfigurasi. Harness lintas-tenant: rute stream ikut pemeriksaan "tidak membocorkan" (pemeriksaan "mengembalikan data A" diganti uji koneksi sungguhan). `pnpm e2e live-update` 5 uji: NPR baru muncul di daftar tanpa muat ulang dan disorot, angka Overview bertambah, detail tiket menerima catatan rekan dan peringatan status dengan ketikan tetap, koneksi putus (browser offline) → spanduk dan "Terputus" → tersambung lagi dan tiket yang dibuat selama putus ikut termuat, indikator di ponsel. Uji mutasi (9): tanpa saringan customer, tanpa `resync`, tanpa sambung ulang ke database, koneksi tidak pernah ditutup, tanpa detak, tanpa header anti-buffer, linimasa tidak dikabarkan, rute tanpa login, dan di browser tanpa muat ulang setelah tersambung lagi: semuanya membuat uji merah. **Lewat proxy sungguhan**: Nginx 1.28 dengan potongan konfigurasi aaPanel dari panduan dan Caddy 2, kabar tiba 28–29 ms setelah tiket dibuat, detak tiap 25 detik sampai. Ditemukan dan diperbaiki: `CASE` di trigger merujuk `NEW.ticket_id` yang tidak ada di tabel `tickets` (kini `IF`); uji layar menunggu baris daftar yang belum ada di database baru. Seluruhnya 300 uji API, 28 uji unit web, dan 68 uji layar lulus dari database kosong (dua kali); lint dan build bersih. CI run #51 **merah**: uji Overview 2.1 (tabel tren) membaca angka batang lalu tabel, dan di antaranya uji paralel membuat tiket sehingga Overview memuat ulang sendiri (efek pembaruan langsung); uji kini membandingkan keduanya pada saat yang sama. CI run #52 (commit `6427b33`) hijau; image diterbitkan dan tag `demo` dipindah. |
| 2.4 Layar dinding 24/7 | **Selesai 2026-11-18; uji rendam 24 jam di server menyusul.** T89–T93. API: migrasi `LiveChangesOp…` (kabar perubahan membawa `insert`/`update`), `StreamChange.op`. Web: halaman `/dinding` (jam, status, angka aktif, empat panel berganti, peringatan NPR baru, bunyi Web Audio, Wake Lock, layar penuh, tema gelap yang dikembalikan saat keluar), pemasangan versi baru otomatis di layar dinding, muat ulang harian, tombol **Layar dinding** di Overview; grafik tren dan batang per kategori bisa tanpa tautan dan berukuran besar. `pnpm e2e wall` 6 uji: tanpa interaksi (angka ≥ 64 px, jam berjalan, ≥ 3 panel berganti, 1920×1080 tanpa gulir), NPR baru → peringatan, bunyi, panel antrean, NPR dengan kejadian mundur diumumkan lewat kabar langsung, jaringan putus → spanduk, pulih, NPR selama putus tampil dan diumumkan, sesi berakhir → halaman masuk → kembali ke `/dinding`, 1280×720 dan tema pengguna kembali. Uji API `stream` kini memeriksa `op`. Uji mutasi (3): kabar langsung tidak diumumkan, NPR terlewat tidak diumumkan, tema tidak dikembalikan: semuanya membuat uji merah (dua awalnya lolos; uji ditambah: NPR berkejadian mundur, keluar lewat tombol aplikasi). **Uji rendam dipercepat 10 menit** (panel tiap 2 detik ≈ 300 pergantian, 37 NPR baru, 9 kali jaringan putus): heap JS 3,07–3,36 MB, elemen halaman tetap ±403, pendengar tetap 116, status akhir Langsung; menemukan 9 NPR tanpa bunyi (dibuat tepat sebelum putus) → diperbaiki dengan pemeriksaan antrean (T90). Ditemukan dan diperbaiki lewat screenshot: tema gelap tidak berlaku bila dipasang pada elemen (kini di `<html>` dan dikembalikan), panel tidak mengisi sisa tinggi, petunjuk klik menimpa daftar panel, teks grafik dan nama di batang terlalu kecil untuk TV; lewat uji: kepala Overview melebar di 375 px dengan teks 125% setelah tombol Layar dinding ditambah (tombol kini tidak tampil di ponsel), peringatan "status diubah di tempat lain" untuk simpanan sendiri bila kabar tiba sebelum jawaban (kini halaman menandai simpanan yang sedang berjalan). Seluruhnya 300 uji API, 28 uji unit web, dan 74 uji layar lulus dari database kosong (dua kali); lint dan build bersih. CI run #53 (commit `366439c`) hijau: lint, build, uji API, dan semua uji layar terhadap image; image diterbitkan dan tag `demo` dipindah. **Belum:** uji rendam 24 jam di server user; akun/token khusus layar dinding (8.1); bunyi untuk Alert kritis (R6). |
| 2.3 Peta remote | **Selesai 2026-11-18.** NOC punya akses internet; T94–T97. API: `GET /api/map` (remote berkoordinat dengan kondisi dari NPR aktif, nama customer, sumber gambar peta dari konfigurasi), `GET /api/map/states` (hanya yang tidak normal), `MAP_TILE_URL`/`MAP_TILE_ATTRIBUTION` (https dengan {z}/{x}/{y}), kompresi gzip jawaban JSON (kecuali stream). Web: komponen `RemoteMap` (Leaflet + markercluster dimuat terpisah, titik berwarna kondisi, kelompok berwarna terparah, keterangan dengan jumlah dan saringan, popup dengan Buka remote, pembaruan warna tanpa membangun ulang, peta dasar gelap di tema gelap) di Overview dan sebagai panel kedua layar dinding. `pnpm test:api map` 5 uji: kondisi per remote (gangguan, pending, campuran pending+eskalasi, normal, nonaktif, Dismantle dengan NPR, Selesai tidak dihitung, tanpa koordinat dihitung terpisah), sumber gambar dari konfigurasi, pengguna terbatas, kondisi terkini sama dengan peta lengkap dan tanpa yang normal, gzip; uji `stream` kini memastikan stream tidak dikompresi; harness lintas-tenant otomatis memeriksa kedua rute (remote uji kini berkoordinat). `pnpm e2e map` 5 uji: jumlah di keterangan sama dengan API dan semua remote tampil dalam kelompok, saringan kondisi, perbesar sampai titik → popup → halaman remote, NPR baru → jumlah Gangguan bertambah tanpa muat ulang lewat `states`, panel peta di layar dinding, 375 px. Uji mutasi (6): peta atau kondisi terkini tanpa batas tenant, pending dihitung gangguan, kondisi terkini memuat semua remote, NPR Selesai ikut dihitung: merah; stream ikut dikompresi lolos karena `no-transform` menjadi pengaman kedua, dan bila keduanya dicabut uji stream merah. **Diukur pada 5.075 remote** (500 dengan NPR aktif): `/api/map` 57–99 ms, 1,3 MB → 175 KB gzip; `/api/map/states` 10–15 ms, 12,5 KB; peta tampil 0,72 detik, zoom 0,34–0,48 detik, tugas terpanjang 128 ms, kabar → warna berubah 0,8 detik. Ditemukan dan diperbaiki: `:global(...)` di CSS scoped memasang filter pembalik warna di `<html>` sehingga seluruh layar dinding pucat (kini blok CSS biasa), pola yang sama membuat warna seri grafik di tema gelap tidak pernah dipakai (diperbaiki juga); nama wilayah peta bentrok dengan judul kartu; nama panel layar dinding meluber ke dua baris; uji layar dinding bergantung pada urutan panel; CI akan meminta ratusan gambar ke OSM setiap run (kini `.invalid`). Seluruhnya 306 uji API, 33 uji unit web, dan 79 uji layar lulus dari database kosong (dua kali); lint dan build bersih. CI run #59 (commit `c866ed1`) hijau: lint, build, uji API, dan semua uji layar terhadap image (gambar peta ke alamat `.invalid`); image diterbitkan dan tag `demo` dipindah. |
| 4.2a Laporan rekap NPR | **Selesai 2026-11-18** (bagian 4.2 yang tidak menunggu SLA); T98–T100. API: `GET /api/reports/npr` (periode tanggal kejadian WIB, saringan customer/kategori/jarkom/status, ringkasan, per customer, per kategori, part diganti, 10 remote terbanyak, daftar 50 per halaman; semua dari query dasar daftar Tiket) dan `GET /api/reports/npr/excel` (6 lembar; satu potret data REPEATABLE READ, cursor 500 baris, dikirim bertahap, kompresi zlib bawaan; batas 100.000 NPR dan 2 unduhan bersamaan). Web: menu **Laporan** (saringan dan periode cepat di alamat, angka bertaut ke daftar Tiket, Unduh Excel lewat fetch dengan pesan galat di halaman, Cetak / PDF dengan CSS cetak). `pnpm test:api reports` 15 uji: angka dan batas hari WIB, detik diabaikan, baris rinci (TT, catatan dan part Close, NPR yang dibuka lagi), setiap angka sama dengan total daftar Tiket untuk 8 saringan, pembatasan customer (JSON dan isi Excel), halaman, periode bawaan, 8 pesan 400, isi Excel (lembar, waktu WIB, saringan otomatis, teks mirip rumus tetap teks), batas baris 400 tanpa koneksi atau jatah bocor, 429. Harness lintas-tenant kini membongkar berkas Excel dan memeriksa nama customer di dalamnya. `pnpm e2e reports` 6 uji: angka → daftar Tiket dengan total sama, periode cepat dan status di alamat setelah muat ulang, periode terbalik/kosong/lebih dari setahun, unduh Excel, cetak (menu dan saringan tersembunyi, PDF dibuat), 375 px. Uji mutasi (20): 19 merah (catatan Close pada NPR yang dibuka lagi baru merah setelah ujinya ditambahkan); 1 setara (filter jenis Close pada part, sudah dijaga constraint database). Divalidasi dengan openpyxl dan LibreOffice. **Diukur pada 100.000 NPR**: laporan setahun 0,34–0,38 detik (halaman jauh 1,1 → 0,34 detik dengan memilih id halaman dulu); Excel setahun 6,2 → 3,5 detik, memori puncak 777 → 285 MB, `/api/health` ≤ 20 ms selama unduhan; Excel sebulan 0,25 detik. Seluruhnya 321 uji API, 36 uji unit web, dan 85 uji layar lulus dari database kosong; lint dan build bersih. CI run #64 (commit `5a4326f`) hijau: lint, build, uji API, dan semua uji layar terhadap image; image diterbitkan dan tag `demo` dipindah. |
| 1.7, R3–R8 | Belum mulai (R3 dibatalkan) |
