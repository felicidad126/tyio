# Rencana Revisi Program NPR

Tanggal: 25 November 2026
Branch: `Rev-NPR-Tyio` (tidak di-merge ke `main`)
Dasar: [REVIEW-NPR.md](REVIEW-NPR.md) dan keputusan pengguna di bawah ini.

Status: keputusan D-1…D-8 dan T-1…T-5 sudah ada; T-6 menyusul. Pengerjaan dimulai 25 November 2026.

| Tahap | Status | Hasil uji |
| --- | --- | --- |
| 0. Persiapan | Selesai | build, lint, setup lulus; uji API 20/20 (sama dengan saat review) |
| 1. Perbaikan data | Selesai | build, lint, setup lulus; uji API 30/30 |
| 2. Akun per orang | Selesai | build, lint, setup lulus; uji API 42/42; migrasi diuji pada database lama dan database kosong |
| 3–9 | Belum | – |

Kode program ada di folder `monitoring-vsat/` (di-commit setelah syarat T-1 terpenuhi). Kode program belum ada di repo dan belum diubah.

---

## 1. Keputusan yang sudah diambil

| ID | Keputusan | Artinya untuk revisi |
| --- | --- | --- |
| D-1 | **b)** label akademik cukup di halaman login | Satu baris "Proyek Kerja Praktek, Universitas Dian Nusantara" di bagian bawah halaman login. Semua tulisan "dummy", "fiktif", dan "simulasi" lainnya dihapus, termasuk di kop PDF dan label isian |
| D-2 | **b)** nama paket dan cookie diganti | `package.json` menjadi `npr`, cookie `vsat_session` menjadi `npr_session`. Nama worker (`monitoring-vsat`) dan database (`monitoring-vsat-db`) **tetap**, jadi alamat online dan data tidak berubah |
| D-3 | **c)** akun per orang + menu pengguna | Tabel pengguna dengan peran, menu kelola pengguna, ganti password sendiri, dan `created_by` diganti menjadi id pengguna. Akun `setio` dan password demo dihapus dari kode |
| D-4 | **b)** HP juga | Menu menjadi tombol ☰ di layar sempit, daftar menjadi kartu, form satu kolom. Diuji di lebar 390 px |
| D-5 | **a)** "VSAT & M2M" tetap sebagai subjudul | Ditulis "Helpdesk VSAT & M2M" di bawah nama aplikasi (login dan sidebar), tanpa huruf kapital berspasi |
| D-6 | **a)** nomor urut per bulan input (WIB) | `NPR/2026/11/0001` dan `TT/2026/11/0001`, dari tabel penghitung di database. Nomor lama tidak diubah |
| D-7 | **b)** PDF kop + tabel + tanda tangan | Kop dengan logo dan nama perusahaan, tabel data site, kotak catatan, tempat tanda tangan teknisi dan helpdesk. PDF hanya diunduh lewat tombol |
| D-8 | **a)** bahasa Indonesia, istilah kerja tetap | NPR, TT, Gamas, Pending, Remote, Site ID, Jarkom tetap. Label lain diterjemahkan (Address → Alamat, Submit NPR → Simpan NPR, Logout → Keluar, dst.) |

---

## 2. Yang dibutuhkan sebelum mulai

| No. | Kebutuhan | Status |
| --- | --- | --- |
| P-1 | Unggah ulang `Monitoring_VSAT_Lengkap.zip` | **Belum** |
| P-2 | Izin meng-commit kode program ke repo ini (repo publik) | **Ya, dengan syarat** (T-1): setelah tahap 2 dan ID database diganti tulisan pengganti |
| P-3 | Logo berlatar transparan (PNG atau SVG) untuk sidebar dan login yang gelap | Opsional. Jika tidak ada, latar putih dihapus sendiri dari logo yang ada |
| P-4 | Contoh format TT kertas dari kantor, jika ada | Opsional. Jika tidak ada, dipakai tata letak usulan |

---

## 3. Urutan pengerjaan

Revisi dibagi menjadi 9 tahap. Temuan tingkat Tinggi dikerjakan di tahap-tahap awal. Beberapa
temuan Sedang dan Rendah dikerjakan **bersama** temuan Tinggi karena menyentuh bagian yang sama
(misalnya variabel warna `U-03` dikerjakan sebelum perbaikan ukuran huruf dan kontras `U-01`,
`U-02`, supaya tidak mengubah ratusan tempat dua kali).

Setiap tahap diakhiri pemeriksaan (bagian 4), satu commit berbahasa Indonesia, lalu push ke
`Rev-NPR-Tyio`.

| Tahap | Isi | Temuan Tinggi | Ukuran |
| --- | --- | --- | --- |
| 0 | Persiapan dan kondisi awal | – | kecil |
| 1 | Perbaikan data: status, nomor, waktu | K-02, K-03 | sedang |
| 2 | Akun per orang | – | besar |
| 3 | Struktur kode dan kecepatan | K-01 | sedang |
| 4 | Identitas, warna, dan keterbacaan | U-01, U-02 | sedang |
| 5 | Menu, Dashboard, dan alur kerja | X-01, X-02 | besar |
| 6 | Tampilan HP | – | sedang |
| 7 | PDF Trouble Ticket dan Gamas | – | sedang |
| 8 | Bahasa, teks, dan dokumentasi | – | sedang |
| 9 | Uji akhir dan laporan hasil uji | – | kecil |

### Tahap 0. Persiapan dan kondisi awal

- Ekstrak zip ke folder kerja, `npm ci`.
- Jalankan `npm run build`, `npm run lint`, `npm run setup`, `npm run dev`, `npm run test:api`
  untuk memastikan kondisi awal sama dengan saat review (20/20 lulus).
- Ambil tangkapan layar awal semua halaman di 1440 px dan 390 px sebagai pembanding.
- Pasang Prettier dan format seluruh kode **dalam satu commit tersendiri** tanpa perubahan isi,
  supaya perubahan di tahap berikutnya mudah dibaca (`K-07`, `H-07`).
- Hapus sisa template: `react.svg`, `vite.svg`, `cloudflare.svg`, `hero.png`, `public/icons.svg`,
  `public/favicon.svg` (`K-14`).

### Tahap 1. Perbaikan data

| Temuan | Yang dikerjakan |
| --- | --- |
| K-05 | Satu fungsi `bulanWIB()` dan `tanggalWIB()` dipakai di server dan tampilan |
| K-02 | Tabel `penghitung_nomor` (jenis, tahun, bulan, nomor terakhir). Nomor baru `NPR/YYYY/MM/0001` dan `TT/YYYY/MM/0001` per bulan **input** WIB (D-6). Penambahan nomor dilakukan dalam satu transaksi supaya tidak bentrok. NPR/TT lama tetap memakai nomor lamanya |
| K-03 | Status tetap `ESKALASI` selama NPR punya TT yang belum Close. Tindakan Problem dan Report Teknisi tidak lagi menimpanya |
| X-02 (sebagian) | NPR baru dibuat tanpa kategori pending (`pending_by` kosong), sampai helpdesk memilih |
| K-04 | Jam online wajib saat menutup Gamas (form dan server). Tambah isian "Waktu perkembangan" pada Gamas, dengan aturan yang sama seperti waktu tindakan NPR |
| K-11 | Sesi dan catatan login yang kedaluwarsa dihapus setiap kali ada login |

Uji tambahan di `scripts/test-api.mjs`:

- Eskalasi → Problem → status tetap `ESKALASI`.
- Dua NPR berturut-turut bernomor `…/0001` dan `…/0002`.
- Nomor bulan memakai WIB pada pukul 00.30 WIB tanggal 1.
- Close Gamas tanpa jam online ditolak.

### Tahap 2. Akun per orang (D-3 c)

| Bagian | Yang dikerjakan |
| --- | --- |
| Database | Tabel `users` ditambah kolom `peran` (`admin` / `helpdesk`) dan `aktif`. Kolom `created_by` di NPR, tindakan, TT, dan Gamas diganti menjadi id pengguna. Data lama dipindahkan dengan mencocokkan nama |
| Akun pertama | `npm run setup` meminta username, nama, dan password admin pertama saat dijalankan (atau dari variabel lingkungan). Tidak ada password yang tertulis di kode atau dokumen |
| Menu Pengguna (khusus admin) | Daftar pengguna, tambah, ubah nama dan peran, nonaktifkan (tidak dihapus, supaya riwayat tetap utuh), dan reset password |
| Akun sendiri | Ganti password sendiri. Password lama wajib diisi |
| Server | Endpoint pengguna hanya bisa diakses admin. Pengguna nonaktif langsung keluar dari semua sesi |
| Riwayat | Riwayat NPR menampilkan nama pembuat dari tabel pengguna |
| Uji | Helpdesk tidak bisa membuka endpoint pengguna; pengguna nonaktif tidak bisa login; ganti password dengan password lama salah ditolak |
| Teks | Hapus `setio`, `Setio Permadi`, `SetioDemo123!` dari `scripts/`, `README.md`, `PANDUAN-MULAI.md`, `MULAI-WINDOWS.cmd` (`R-06`). Uji API membuat akun ujinya sendiri |

### Tahap 3. Struktur kode dan kecepatan

| Temuan | Yang dikerjakan |
| --- | --- |
| K-01 | `GET /api/data` diganti endpoint per kebutuhan: daftar NPR dengan paginasi dan filter, detail NPR per id, daftar TT, Gamas, Customer, Remote, dan ringkasan Dashboard. Isi lampiran tidak ikut di daftar; diambil lewat `GET /api/lampiran/:id` saat tautannya diklik |
| K-07 | `worker/domain.ts` dipecah menjadi `customers.ts`, `remotes.ts`, `nprs.ts`, `gamas.ts`, `sla.ts`, `users.ts`, dengan nama variabel yang jelas |
| K-08 | `shared/aturan.ts`: batas panjang, jenis berkas lampiran, pola kode customer, dipakai form dan server |
| K-09 | Satu fungsi `api()` untuk semua permintaan. Jika balasan bukan JSON: "Server sedang tidak bisa dihubungi. Coba lagi beberapa saat." `queueMicrotask` dihapus |
| K-10 | Hitung SLA hanya memuat NPR dan Gamas yang beririsan dengan bulan laporan |
| K-12 | Grafik 7 hari dihitung sekali di server dengan tanggal WIB |

Hasil hitung SLA dan semua uji API harus sama persis sebelum dan sesudah tahap ini.

`K-06` **tidak dikerjakan** (T-4). `App.tsx` tetap satu berkas dan halaman tetap disimpan di state,
tanpa alamat per halaman. Akibatnya tetap seperti sekarang: refresh kembali ke Dashboard, tombol
Back browser keluar dari aplikasi, dan tidak ada tautan langsung ke satu NPR. Perubahan `K-01`
dibuat di dalam `App.tsx`: setiap halaman mengambil datanya sendiri saat dibuka.

### Tahap 4. Identitas, warna, dan keterbacaan

| Temuan | Yang dikerjakan |
| --- | --- |
| U-03 | Semua warna dipindah ke variabel di `:root`: `--navy`, `--aksen`, `--teks`, `--teks-redup`, `--garis`, `--latar`, dan warna status |
| R-05 | Navy `#032459` untuk sidebar, judul, dan tombol utama. Biru muda logo hanya untuk aksen (garis menu aktif), tidak untuk teks |
| U-01 | Huruf dasar 14 px, isi tabel 13 px, paling kecil 12 px |
| U-02 | Semua teks abu-abu minimal kontras 4,5 : 1, diperiksa dengan alat hitung kontras |
| U-09 | Bingkai fokus 2 px warna aksen |
| U-04 | Ikon menu diganti satu set ikon SVG (Lucide) dengan `aria-hidden` |
| U-10 | SLA ditulis `99,95%` (2 desimal, format Indonesia), menit dibulatkan; CSV ikut dibulatkan |
| U-11 | Kartu "Menunggu Report" kuning/oranye |
| R-01, R-04 | Logo asli di login, sidebar, dan favicon (32 px dan 180 px), `<link rel="icon">`, judul tab `NPR — PT. Tangara Mitrakom`, `theme-color #032459` |
| R-07 | Nama lengkap "Network Problem Report" hanya di login, judul tab, dan kop PDF. Di dalam aplikasi: logo + "NPR" |
| D-5 | Subjudul "Helpdesk VSAT & M2M" di bawah nama aplikasi |
| H-09 | Kartu angka tanpa garis warna di kiri, satu warna aksen |

### Tahap 5. Menu, Dashboard, dan alur kerja

| Temuan | Yang dikerjakan |
| --- | --- |
| X-01 | Menu baru: Dashboard, NPR, Trouble Ticket, Gamas, Laporan SLA, Data Master (Customer, Remote), Pengguna (khusus admin). Menu "Detail NPR" dan "Report NPR" digabung ke NPR, dengan filter tanggal dan Ekspor CSV |
| X-02 | Kartu Dashboard bisa diklik dan membuka daftar NPR yang sudah tersaring. Tabel "NPR aktif terlama" (10 baris). Keterangan kartu diganti informasi nyata, mis. "2 di antaranya > 48 jam" (`H-04`) |
| U-06 | Blok judul besar diganti satu baris judul dengan tombol aksi di kanan (mis. "NPR Baru") |
| U-07 | Form NPR Baru: isian di atas (Jarkom → Customer → Remote, jenis gangguan, waktu mulai, catatan), data site sebagai kartu info ringkas. Kolom "NPR Number" dan "Created By" dihapus |
| X-03 | Form tindakan hanya menampilkan isian yang relevan untuk Problem, Eskalasi, Report Teknisi, dan Close |
| X-04 | Setelah Simpan NPR, langsung ke detail NPR yang baru |
| X-05 | Tombol Ubah untuk Customer dan Remote, dan status nonaktif sebagai pengganti hapus |
| X-06 | Pemilihan site Gamas: kotak cari, filter customer/kota/jarkom, tombol "Pilih semua hasil filter" |
| X-08 | Riwayat NPR dan Gamas sama-sama urut lama → baru |
| X-09 | Satu komponen tabel dengan paginasi untuk NPR, TT, Gamas, Remote, dan Pengguna |
| U-08 | Semua modal memakai `<dialog>` (bisa ditutup dengan Esc, fokus tetap di dalam). Login gagal cukup pesan merah di bawah form |

### Tahap 6. Tampilan HP (D-4 b)

- Di bawah ±900 px: sidebar menjadi tombol ☰ yang membuka menu dari samping (`U-05`).
- Di bawah ±640 px: daftar NPR, TT, Gamas, dan Remote tampil sebagai kartu (nomor, site, status,
  durasi); form satu kolom; tombol cukup besar untuk jari (tinggi minimal 44 px).
- Tabel Laporan SLA tetap tabel, dengan geser horizontal di dalam kotaknya sendiri.
- Diperiksa di 390 px (HP), 768 px (tablet), dan 1440 px (laptop).

### Tahap 7. PDF Trouble Ticket dan Gamas (D-7 b)

- PDF tidak lagi terunduh otomatis. Tombol "Unduh PDF" di detail TT dan Gamas (`X-07`).
- Tata letak:
  1. Kop: logo, **PT. Tangara Mitrakom**, "Network Problem Report", garis pemisah.
  2. Judul dokumen dan nomor TT, tanggal dibuat (WIB).
  3. Tabel data site: customer, remote/Site ID, alamat, kota, provinsi, PIC, telepon, IP LAN.
  4. Tabel gangguan: jenis, waktu mulai, instruksi, catatan NOC.
  5. Kotak kosong untuk hasil pekerjaan teknisi.
  6. Tempat tanda tangan: teknisi dan helpdesk, dengan nama dan tanggal.
  7. Kaki halaman: nomor halaman dan waktu cetak.
- Tulisan "SIMULASI AKADEMIK - DATA FIKTIF" dihapus (D-1).
- Untuk tabel dipakai `jspdf-autotable` (pasangan jsPDF yang sudah dipakai).

### Tahap 8. Bahasa, teks, dan dokumentasi

| Temuan | Yang dikerjakan |
| --- | --- |
| X-10 | Semua label diterjemahkan sesuai D-8, dengan satu daftar istilah supaya seragam |
| H-01 | Halaman login: logo, "Network Problem Report", "Helpdesk VSAT & M2M", form, tombol "Masuk", dan satu baris kampus di bawah (D-1). Slogan, daftar fitur bernomor, dan latar kisi dihapus |
| H-02, H-03 | Label huruf kapital berspasi dihapus (paling banyak satu). Titik tengah "·" dan panah "→" diganti tulisan biasa, kecuali tombol Kembali |
| H-04, H-06 | Teks pengisi dan catatan yang menjelaskan cara kerja sistem dihapus |
| H-05 | Semua "dummy", "fiktif", "simulasi" dihapus. Label isian ditulis normal: "Nama bank", "IP LAN", "Nama PIC", "Telepon PIC" |
| H-07 | Komentar kode seragam bahasa Indonesia, menjelaskan alasan. Keluaran `test-api.mjs` dalam bahasa Indonesia |
| R-02 (D-2 b) | `package.json` → `npr`, cookie → `npr_session`. `wrangler.jsonc` (nama worker dan database) **tidak diubah** |
| R-01 | `README.md`, `PANDUAN-MULAI.md`, `MULAI-WINDOWS.cmd`, `ATURAN-SLA.md` memakai nama NPR dan "PT. Tangara Mitrakom" |
| R-03 | Di Laporan SLA ditambah keterangan "TM = PT. Tangara Mitrakom" |
| H-08 | `HASIL-PEMERIKSAAN.md` dihapus, diganti hasil uji tahap 9. Panduan pribadi ("untuk Setio", "akun Cloudflare kaka") dipisah dari dokumentasi proyek |

### Tahap 9. Uji akhir dan laporan hasil uji

- `npm run build`, `npm run lint`, `npm run setup`, `npm run test:api` di database lokal yang baru.
- Uji migrasi: database lokal versi lama (dari zip) dimigrasikan, lalu data lama dicek masih utuh
  (NPR, nomor lama, pembuat, riwayat, SLA bulan lalu).
- Uji manual satu alur lengkap: login admin → buat akun helpdesk → login helpdesk → NPR Baru →
  Problem → Eskalasi (TT + PDF) → Report Teknisi → Close → cek Dashboard dan Laporan SLA → Gamas
  dengan beberapa site → Close Gamas.
- Tangkapan layar setiap halaman di 1440 px dan 390 px, dibandingkan dengan tahap 0.
- Tulis `HASIL-UJI.md`: tanggal, langkah, hasil, tangkapan layar, dan uji yang gagal jika ada.

---

## 4. Pemeriksaan di setiap tahap

1. `npm run build` dan `npm run lint` lulus.
2. `npm run setup` berhasil di database lokal.
3. `npm run test:api` lulus dengan server lokal `npm run dev` berjalan, termasuk uji baru.
4. Tampilan dicek di Chromium pada lebar laptop (1440 px) dan HP (390 px).
5. Hasil dilaporkan apa adanya, termasuk uji yang gagal.
6. Commit berbahasa Indonesia, push ke `Rev-NPR-Tyio`.

---

## 5. Perubahan database dan data online

Beberapa tahap mengubah struktur database: tabel penghitung nomor (tahap 1), kolom pengguna dan
`created_by` (tahap 2), status nonaktif Customer/Remote (tahap 5).

- Setiap perubahan ditulis sebagai berkas migrasi bernomor di folder `migrations/`, supaya bisa
  dijalankan ulang di database lokal maupun online.
- **Database online tidak disentuh** selama revisi. Semua uji di lokal.
- Jika nanti di-deploy dan sudah ada data online: ekspor cadangan dulu
  (`wrangler d1 export monitoring-vsat-db --remote`), lalu jalankan migrasi. Langkahnya ditulis di
  `PANDUAN-MULAI.md`.
- Karena cookie berganti nama (D-2), semua pengguna perlu login ulang satu kali setelah deploy.

---

## 6. Pertanyaan lanjutan dan jawabannya

| No. | Pertanyaan | Usulan | Keputusan |
| --- | --- | --- | --- |
| T-1 | Boleh meng-commit kode program ke repo ini? Repo publik, dan kode aslinya berisi nama mahasiswa, password demo, dan ID database Cloudflare | Boleh, **setelah** tahap 2 (nama dan password hilang) dan ID database di `wrangler.jsonc` diganti tulisan pengganti, mis. `ISI_ID_DATABASE`. Sebelum itu, perubahan hanya disimpan di folder kerja sesi ini | **Ya** |
| T-2 | Peran pengguna (D-3) | Dua peran: **admin** (semua menu + kelola pengguna) dan **helpdesk** (semua menu kecuali kelola pengguna) | **Ya** |
| T-3 | Nomor NPR/TT lama | Tetap seperti aslinya. Nomor urut baru mulai dari `0001` pada bulan berjalan | **Ya** |
| T-4 | Pecah `App.tsx` dan alamat per halaman (`K-06`) | Ikut dikerjakan di tahap 3, karena `K-01` sudah mengubah cara setiap halaman mengambil data | **Tidak.** `K-06` tidak dikerjakan |
| T-5 | Pustaka tambahan | `lucide-react` (ikon), `jspdf-autotable` (tabel PDF), `prettier` (format kode). Tidak ada pustaka lain | **Ya**, tanpa `react-router` karena T-4 tidak |
| T-6 | Temuan yang tidak dikerjakan | Tidak ada. Semua temuan K, U, X, H, dan R masuk rencana. Pemindahan lampiran ke Cloudflare R2 (saran jangka panjang di `K-01`) **tidak** dikerjakan | **Nanti.** Cakupan diputuskan kemudian |

---

## 7. Status temuan

Tabel ini menunjukkan tahap pengerjaan tiap temuan. `K-06` tidak dikerjakan (T-4). Cakupan temuan
lainnya masih menunggu keputusan T-6; yang sudah pasti hanya yang ditentukan oleh D-1 sampai D-8.

| Tahap | Temuan |
| --- | --- |
| 0 | K-07 (format), K-14, H-07 (sebagian) |
| 1 | K-02, K-03, K-04, K-05, K-11, X-02 (pending_by) |
| 2 | K-13, R-06 |
| 3 | K-01, K-07, K-08, K-09, K-10, K-12 |
| 4 | U-01, U-02, U-03, U-04, U-09, U-10, U-11, R-01 (tampilan), R-04, R-05, R-07, H-09 |
| 5 | X-01, X-02, X-03, X-04, X-05, X-06, X-08, X-09, U-06, U-07, U-08, H-04 (Dashboard) |
| 6 | U-05 |
| 7 | X-07 |
| 8 | X-10, H-01, H-02, H-03, H-04, H-05, H-06, H-07, H-08, R-01 (dokumen), R-02, R-03 |
| 9 | Uji akhir |
| Tidak dikerjakan | K-06 (T-4), pemindahan lampiran ke R2 |
