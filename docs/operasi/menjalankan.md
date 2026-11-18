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
| `STREAM_HEARTBEAT_MS` | tidak | Jarak detak koneksi pembaruan langsung, 50–55000 ms (bawaan 25000). Harus di bawah batas diam proxy (Nginx `proxy_read_timeout`, bawaan 60 detik) |
| `STREAM_MAX_MS` | tidak | Umur koneksi pembaruan langsung sebelum server menutupnya dengan rapi agar sesi diperiksa ulang, 200–3600000 ms (bawaan 300000 = 5 menit) |
| `MAP_TILE_URL` | tidak | Sumber gambar peta remote, URL https dengan `{z}`, `{x}`, `{y}`. Bawaan OpenStreetMap. Di compose staging diisi lewat `TYIO_MAP_TILE_URL` |
| `MAP_TILE_ATTRIBUTION` | tidak | Atribusi yang wajib tampil di peta. Bawaan `© OpenStreetMap contributors` |
| `TYIO_SEED_PASSWORD` | untuk seed di staging | Kata sandi pengguna contoh, minimal 12 karakter. Dev memakai bawaan di bawah |

Aplikasi menolak start bila konfigurasi tidak sah dan menyebut variabel yang bermasalah,
tanpa mencetak nilainya.

### Masuk dan sesi

- Semua endpoint API wajib login kecuali `/api/health`, `/api/auth/login`, dan `/api/auth/logout`.
- Sesi berakhir setelah 12 jam tidak dipakai, dan paling lama 7 hari sejak login.
- Setelah 5 kali gagal untuk satu nama pengguna, atau 20 kali gagal dari satu alamat IP,
  dalam 15 menit, percobaan ditahan sampai jendela itu lewat (HTTP 429 dengan `Retry-After`).
- Peran (K30, K46): **`helpdesk`** mengerjakan NPR (dan TT); **`admin`** mengelola aplikasi
  (master data, impor remote, akun) dan juga bisa membuka semua modul operasional. Tingkatan
  L1/L2/L3 tidak dipakai; pengguna L1/L2 lama otomatis menjadi helpdesk (migrasi
  `HelpdeskRole…`). Pengguna melihat semua customer, atau hanya customer tertentu bila dibatasi.

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
- Data contoh dev: kategori = nilai "Remote Status" dashboard lama (Remote Down, Relokasi,
  Reposisi, Preventive Maintenance; K43). Jarkom berisi nilai contoh.
- Untuk pengembang: tabel baru yang merujuk tabel master wajib memakai foreign key
  `ON DELETE RESTRICT`. Uji `pnpm test:api master` gagal bila ada yang memakai CASCADE,
  karena menghapus master akan ikut menghapus data yang merujuknya.

### Remote

- **Remote** di menu: daftar remote yang boleh dilihat pengguna (dibatasi customer), 50 per
  halaman. Cari Site ID, nama, kota, atau kanca; saring customer, provinsi, jarkom, status.
  Pencarian dan saringan tersimpan di alamat halaman, jadi bisa dibagikan.
- Detail remote: lokasi, zona waktu (WIB/WITA/WIT, mengikuti provinsi), jaringan, kanwil/kanca,
  tanggal online, kontak, dan **Riwayat tiket** (1.6): semua NPR remote itu, terbaru menurut
  waktu kejadian, 50 per halaman, dengan status, kategori, waktu online kembali, lama gangguan,
  dan no. TT. Dari halaman tiket, buka lewat tautan **Riwayat tiket remote ini**.
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
- **Alur status** (disetujui, Eskalasi disesuaikan di 1.5b, Selesai di 1.6): Terbuka →
  Dikerjakan / Pending / Selesai; Dikerjakan → Pending / Selesai; Pending → Dikerjakan;
  Eskalasi → Dikerjakan / Pending / Selesai; Selesai → Dikerjakan (NPR dibuka lagi). Form hanya
  menawarkan jalur ini, dan server menolak jalur lain.
  - **Eskalasi** tidak dipilih di "Ubah status": dipasang otomatis saat TT dibuka lewat
    **Eskalasi To SD** (lihat Trouble Ticket di bawah).
  - **Selesai** juga tidak dipilih di "Ubah status": NPR ditutup lewat jenis tindakan **Close**
    (lihat Penutupan NPR di bawah).
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
  Jenis **Eskalasi To SD** dicatat sistem saat TT dibuka (1.5b). **Close** menutup NPR (1.6).
- **Pihak pending**: **TM** untuk problem jaringan (jarkom) di lokasi; **Customer** untuk
  listrik, obstacle, renovasi, atau part ATM yang belum siap.
- **Tanda "Down ≥ 7 hari"**: tiket yang belum Selesai dan waktu kejadiannya sudah 7 hari atau
  lebih ditandai merah di daftar dan detail, sebagai pengingat untuk memperbarui NPR.
- Kolom **System** tidak dipakai lagi dan tidak tampil di layar. Status remote yang dibongkar
  bernama **Dismantle**; impor Excel menerima "Dismantle" atau "Dibongkar".

### Trouble Ticket (TT) ke Service Delivery (1.5b)

- **TT** dibuka bila problem jaringan (pihak TM) perlu **kunjungan teknisi**. Tanpa kunjungan,
  cukup NPR. Penjadwalan teknisi tetap di luar portal.
- Di halaman tiket, kartu **Trouble Ticket (TT)** → **Eskalasi To SD** → isi **Problem untuk
  teknisi** (terisi awal dari keterangan NPR, 3–2.000 karakter) → **Buka TT**.
  - Nomor dibuat sistem: `TT/<jarkom>/<customer>/<tahun>/<bulan>/<urut>`, mis.
    `TT/VSAT/TNA/2026/11/0001`. Urutnya sendiri, terpisah dari nomor NPR, per customer,
    jarkom, dan bulan (WIB).
  - Status NPR menjadi **Eskalasi** (menunggu kunjungan teknisi); pihak pending dikosongkan.
  - Linimasa NPR mendapat entri **Eskalasi To SD** berisi nomor TT dan problemnya.
- **Satu NPR paling banyak satu TT.** Setelah TT dibuka, tombol Eskalasi To SD hilang; bila
  rekan membuka TT lebih dulu, permintaan Anda ditolak dan halaman menampilkan TT rekan.
  TT bisa dibuka dari Terbuka, Dikerjakan, Pending, atau Eskalasi lama, tidak dari Selesai
  (ubah ke Dikerjakan dulu).
- **Salin ringkasan TT** menyalin teks siap tempel untuk chat Service Delivery: no. TT dan NPR,
  customer (dan no. tiket customer), remote dan Site ID, lokasi, jarkom dan IP, problem,
  kontak lokasi, serta waktu dan pembuka TT. Setiap penyalinan tercatat di linimasa. Bila
  browser menolak salin otomatis, teksnya ditampilkan untuk disalin manual.
- Hasil kunjungan dicatat di NPR seperti biasa (tindakan, lampiran laporan), lalu status
  diubah ke Dikerjakan atau Pending, atau NPR ditutup lewat **Close** (TT ikut ditutup).
- No. TT tampil di kepala tiket, di baris daftar, dan di hasil pencarian.
- Database: tabel `trouble_tickets` (migrasi `TroubleTickets…`), satu TT per NPR dijaga
  constraint unik, TT selalu milik customer yang sama dengan NPR-nya, perubahan tercatat di
  audit log.

### Penutupan NPR: Close (1.6)

- NPR ditutup saat jarkom **terpantau online kembali**, dengan atau tanpa kunjungan teknisi.
  Di **Tambah tindakan** pilih jenis **Close**:
  - **Waktu online kembali** (jam lokasi remote): tidak boleh sebelum waktu kejadian NPR atau
    di masa depan. Waktu ini disimpan sebagai waktu tutup NPR.
  - **Catatan penyelesaian** (wajib): apa yang membuat jarkom online kembali.
  - Status otomatis menjadi **Selesai**; kolom "Ubah status" diganti keterangan
    "Status → Selesai".
- **NPR yang punya TT** (ada kunjungan teknisi) juga wajib:
  - **Part yang diganti teknisi**: Modem, Adaptor, Perangkat indoor, BUC, LNB (boleh lebih
    dari satu), atau **Tidak ada part yang diganti**;
  - **Laporan teknisi** sebagai lampiran (PDF atau foto, paling sedikit satu).

  TT ikut ditutup pada waktu yang sama dan keluar dari tab TT aktif.
- Close bisa dari Terbuka, Dikerjakan, atau Eskalasi. Dari **Pending**, ubah ke Dikerjakan
  dulu (alur yang disetujui); pilihan Close tampak redup dengan alasannya.
- Setelah Selesai, kartu Gangguan menampilkan **Online kembali** dan **Lama gangguan**
  (dihitung dari menit yang tampil). Entri Close di linimasa menampilkan part yang diganti dan
  lampirannya.
- **Membuka lagi**: Ubah status Selesai → Dikerjakan (mis. jarkom down lagi, K40). Waktu
  tutup NPR dan TT dikosongkan, TT aktif lagi; entri Close lama tetap di linimasa.
- NPR yang sudah Selesai tidak lagi muncul sebagai "tiket terbuka" saat membuat tiket baru
  untuk remote yang sama.
- Database: migrasi `TicketClose…` menambah jenis `close`, kolom `replaced_parts` di linimasa,
  dan aturan "Selesai ⇔ waktu tutup terisi". Tiket yang sudah Selesai sebelum pembaruan diberi
  waktu tutup dari entri terakhir yang mengubahnya ke Selesai (tercatat di audit atas nama
  `sistem:migrasi`).

### Laporan rekap NPR (4.2, bagian tanpa SLA)

- Menu **Laporan**: NPR menurut **tanggal kejadian (WIB)** dalam satu periode. Bawaan tanggal 1
  bulan ini sampai hari ini; tombol cepat Bulan ini, Bulan lalu, Tahun ini; periode paling
  panjang 366 hari. Saringan customer, kategori, jarkom, dan status (Semua, Masih aktif,
  Selesai). Periode dan saringan tersimpan di alamat halaman, jadi bisa dibagikan.
- Isi: jumlah NPR, Selesai, Masih aktif, Dengan TT, **rata-rata dan median lama gangguan**
  (kejadian sampai link online lagi, hanya NPR Selesai, detik diabaikan), tabel per customer
  dan per kategori, part yang diganti, 10 remote dengan NPR terbanyak, dan daftar NPR 50 per
  halaman. Part dihitung per tindakan Close (NPR yang dibuka lagi tetap menghitung part yang
  sudah diganti).
- Setiap angka bertaut ke daftar **Tiket** dengan saringan yang sama dan menghasilkan jumlah
  yang sama (diuji). Halaman laporan tidak berubah sendiri selagi dibaca; tekan Muat ulang untuk
  angka terbaru.
- **Unduh Excel** (`GET /api/reports/npr/excel`): lembar Rekap, Per customer, Per kategori, Part
  diganti, Remote terbanyak, dan **Daftar NPR** berisi semua NPR periode itu (waktu dalam WIB
  sebagai tanggal-waktu Excel, judul kolom beku, saringan otomatis). Teks tidak pernah menjadi
  rumus. Rekap dan daftar dibaca dari satu potret data, jadi jumlahnya selalu cocok walau ada
  NPR baru selama unduhan. Batas 100.000 NPR per berkas; paling banyak 2 unduhan berjalan
  bersamaan (yang ketiga diminta mencoba lagi). Diukur: 100.000 NPR (setahun) 3,5 detik, berkas
  7,8 MB; satu bulan (±5.000) 0,25 detik. Selama unduhan, permintaan lain tidak melambat.
- **Cetak / PDF**: dialog cetak browser (pilih "Simpan sebagai PDF"). Menu, header, dan saringan
  disembunyikan; periode dan saringan tertulis di judul. Daftar NPR di cetakan hanya halaman yang
  tampil; daftar lengkap ada di berkas Excel.
- API JSON: `GET /api/reports/npr?from=TTTT-BB-HH&to=TTTT-BB-HH&tenantId=&categoryId=&jarkomId=&status=semua|aktif|selesai&page=`.
  Dibatasi customer seperti rute tiket lain. Laporan SLA menunggu aturan SLA (4.1).

### Peta remote (2.3)

- Di **Overview** (kartu Peta remote) dan sebagai panel di **layar dinding**. Satu titik per
  remote yang punya koordinat, berwarna menurut kondisinya sekarang:
  - **Gangguan (NPR aktif)**, merah: ada NPR yang belum Selesai dan tidak Pending (termasuk
    Eskalasi);
  - **Pending**, kuning: semua NPR aktifnya Pending;
  - **Normal**, hijau: tanpa NPR aktif;
  - **Nonaktif / Dismantle**, abu-abu: remote nonaktif atau Dismantle tanpa NPR aktif.
- Titik yang berdekatan dikelompokkan; angka di kelompok = jumlah remote, warnanya kondisi
  terparah di dalamnya. Klik kelompok untuk memperbesar; klik titik untuk info remote (Site ID,
  kota, customer, jumlah NPR aktif) dan **Buka remote**.
- Keterangan di atas peta menampilkan jumlah per kondisi; centang untuk menyembunyikan atau
  menampilkan satu kondisi (mis. sembunyikan Normal agar yang bermasalah menonjol). Remote tanpa
  koordinat disebut jumlahnya; isi koordinat lewat kolom Latitude/Longitude di impor Excel.
- Warna diperbarui sendiri saat ada perubahan tiket (pembaruan langsung): hanya kondisi
  terkini yang diambil (`GET /api/map/states`, ±12 KB untuk 5.000 remote); data lengkap dimuat
  saat dibuka, setelah koneksi pulih, dan tiap 10 menit.
- Gambar peta dari **OpenStreetMap** (browser pengguna perlu akses internet; gratis untuk
  pemakaian ringan dengan atribusi). Bila pemakaian membesar, isi `MAP_TILE_URL` dan
  `MAP_TILE_ATTRIBUTION` dengan penyedia berlangganan. Di tema gelap (layar dinding) peta dasar
  digelapkan; warna titik tetap.
- Kinerja (diukur dengan 5.075 remote): data peta 175 KB setelah gzip (API kini mengompresi
  jawaban JSON, kecuali koneksi pembaruan langsung), peta tampil 0,7 detik, zoom 0,3–0,5 detik.

### Layar dinding 24/7 (2.4)

- Alamat **`/dinding`** (tombol **Layar dinding** di Overview), untuk TV atau monitor besar di
  ruang NOC. Tanpa menu, bertema gelap, dan berjalan tanpa disentuh:
  - Atas: jam WIB (detik demi detik), status koneksi (Langsung/Terputus), dan waktu data diterima.
  - Angka tiket aktif selalu tampil: total, per status, TT aktif, Down ≥ 7 hari.
  - Panel berganti tiap 20 detik: **NPR aktif terbaru** (remote, customer, status, umur),
    **Peta remote**, **NPR baru dan Selesai per hari**, **per kategori dan customer**, **remote paling sering
    bermasalah**. Lama per panel bisa diatur lewat alamat, mis. `/dinding?putar=30` (2–300 detik).
  - **NPR baru** memunculkan peringatan kuning besar (remote, customer, no. NPR, problem) selama
    90 detik, berbunyi, dan panel kembali ke antrean.
  - Koneksi putus: spanduk merah "Koneksi terputus sejak …". Layar menyambung ulang sendiri dan
    memuat ulang data; NPR yang dibuat selama putus ikut tampil.
- **Bunyi**: browser baru mengizinkan suara setelah ada satu klik di halaman. Klik sekali di
  layar setelah membuka `/dinding` (sekaligus masuk layar penuh). Untuk PC khusus layar dinding,
  jalankan Chrome dalam mode kios agar bunyi dan layar penuh aktif tanpa klik, juga setelah PC
  menyala ulang:

  ```bash
  google-chrome --kiosk --autoplay-policy=no-user-gesture-required https://<domain>/dinding
  ```

  (Windows: buat pintasan ke `chrome.exe` dengan argumen yang sama, taruh di folder Startup.)
- **Tidak tidur**: halaman meminta layar tetap menyala (Wake Lock). Tetap matikan juga
  "sleep"/"screen off" di pengaturan daya sistem operasi PC tersebut.
- **Sesi**: setiap muat ulang memperpanjang sesi, jadi layar tidak keluar sendiri selama
  dipakai. Batas mutlak sesi tetap 7 hari: seminggu sekali (atau bila sesi diputus admin)
  layar menampilkan halaman masuk dan kembali ke `/dinding` setelah masuk.
- **Perawatan sendiri**: versi baru portal dipasang otomatis 30 detik setelah tersedia, dan
  halaman dimuat ulang sekali sehari pukul 03.00 WIB untuk membersihkan memori browser.

### Pembaruan langsung (2.2)

- Overview, daftar Tiket, dan halaman tiket memuat ulang sendiri saat ada tiket baru atau
  berubah (dibuat, diberi tindakan, status berubah, TT dibuka), tanpa menekan muat ulang.
  Di daftar, baris yang berubah disorot sebentar. Setiap panel menampilkan **Data diterima
  HH.MM.SS WIB**.
- Header menampilkan **Langsung** (tersambung), **Menyambung…**, atau **Terputus**. Selama
  terputus, spanduk kuning di atas halaman menjelaskan bahwa data mungkin tidak terbaru, dengan
  tombol **Sambungkan sekarang**. Browser menyambung ulang sendiri (jeda 1–15 detik), lalu semua
  halaman memuat ulang datanya agar perubahan selama putus tidak terlewat.
- Di halaman tiket, bila rekan mengubah status saat Anda sedang mengisi Tambah tindakan,
  muncul peringatan dan pilihan status menyesuaikan; catatan yang sedang diketik tetap.
- Cara kerja: trigger database mengirim `NOTIFY tyio_changes` (customer dan ID tiket saja) setiap
  ada perubahan di tiket, linimasa, atau TT (migrasi `LiveChanges…`). Aplikasi mendengarkannya
  lewat satu koneksi database khusus dan meneruskannya lewat `GET /api/stream` (Server-Sent
  Events) hanya ke pengguna yang boleh melihat customer itu. Isinya hanya penanda; datanya
  diambil lewat rute biasa. Bila koneksi database pendengar putus, aplikasi menyambung ulang
  sendiri dan meminta browser memuat ulang. Karena sumbernya database, ini tetap benar bila
  aplikasi berjalan di lebih dari satu server.
- Server mengirim detak tiap 25 detik dan menutup koneksi dengan rapi tiap 5 menit (browser
  langsung menyambung lagi, sesi diperiksa ulang): sesi yang habis atau pengguna yang
  dinonaktifkan berhenti menerima kabar paling lama 5 menit kemudian.
- Proxy: jawaban `/api/stream` membawa `X-Accel-Buffering: no`, sehingga Nginx (aaPanel)
  meneruskannya tanpa menahan; Caddy meneruskan event stream langsung. Potongan konfigurasi
  Nginx di panduan server demo sudah cukup (`proxy_read_timeout 120s` di atas jarak detak).
  Diuji lewat Nginx 1.28 dan Caddy 2: kabar tiba dalam ±30 ms.

### Overview (2.1)

- Halaman pertama setelah masuk. Semua angka dibatasi customer yang boleh dilihat pengguna,
  dan **setiap angka adalah tautan** ke daftar Tiket yang menghasilkan jumlah yang sama persis:
  - **Tiket aktif** (belum Selesai): jumlah seluruhnya, per status (Terbuka, Dikerjakan,
    Pending, Eskalasi), **TT aktif**, dan **Down ≥ 7 hari**.
  - **Tiket aktif per kategori** dan **per customer**, terbanyak dulu.
  - **NPR baru dan Selesai per hari**, 14 hari terakhir (hari menurut WIB): NPR baru menurut
    waktu kejadian, Selesai menurut waktu online kembali. Arahkan kursor atau fokus ke batang
    untuk melihat angkanya, atau buka **Lihat sebagai tabel**.
  - **Remote paling sering bermasalah**: 10 remote dengan NPR terbanyak menurut waktu kejadian
    dalam 30 hari terakhir (termasuk yang sudah Selesai). Nama remote membuka halaman remote,
    jumlahnya membuka daftar NPR remote itu dalam rentang yang sama.
- Angka dimuat ulang saat ada perubahan tiket (pembaruan langsung, 2.2), tiap menit (untuk
  angka yang berubah karena waktu, mis. Down ≥ 7 hari), saat halaman kembali dibuka, atau lewat
  tombol muat ulang; waktu "Data diterima" ada di kanan atas.
- Database: tren Selesai per hari memakai indeks `tickets_closed_at_idx` (migrasi
  `Overview…`). Diukur pada 100.000 tiket: Overview 31–63 ms.

### Daftar tiket dan pencarian

- **Tiket** di menu: daftar tiket yang boleh dilihat pengguna (dibatasi customer), 50 per
  halaman, waktu kejadian terbaru di atas. Tab:
  - **Aktif** (bawaan): belum Selesai.
  - **Milik saya**: tiket aktif yang Anda buat atau pernah Anda beri tindakan.
  - **Pending**, **Eskalasi** (menunggu kunjungan teknisi).
  - **TT aktif**: NPR yang punya TT dan belum Selesai, apa pun statusnya.
  - **Selesai**, **Semua**.

  Angka di tab Aktif, Milik saya, Pending, Eskalasi, dan TT aktif ikut pencarian dan saringan
  yang sedang dipakai.
- Saringan: customer, kategori, jarkom. Kotak **Cari** menerima potongan no. NPR
  (mis. `2026/11/0002`), no. TT, no. tiket customer, Site ID, nama, kota, atau kanca remote.
- Saringan yang datang dari angka **Overview** (status, tanggal kejadian, tanggal online
  kembali, remote, Down ≥ 7 hari) tampil sebagai chip di bawah kolom saringan; tombol × pada
  chip menghapusnya. Di alamat: `status`, `dari`/`sampai`, `ditutupDari`/`ditutupSampai`
  (tanggal WIB, TTTT-BB-HH), `remote`, `lama`.
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
  | `helpdesk.contoh` | Helpdesk | Semua |
  | `helpdesk.merapi` | Helpdesk | Hanya Bank Merapi Sejahtera |
  | `admin.contoh` | Admin | Semua |

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
