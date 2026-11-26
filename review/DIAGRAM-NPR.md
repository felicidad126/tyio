# Diagram perancangan aplikasi NPR

Dokumen ini berisi diagram perancangan aplikasi NPR (Network Problem Report) untuk laporan Kerja
Praktek di PT. Tangara Mitrakom. Semua isi diagram diambil dari kode di folder `monitoring-vsat/`
pada branch `Rev-NPR-Tyio` (commit `95e957e`), bukan dari ingatan atau dokumen lama. Bila dokumen
review berbeda dengan kode, diagram mengikuti kode dan perbedaannya dicatat di
[bagian 6](#6-perbedaan-dokumen-dan-kode).

Setiap diagram ditulis dalam Mermaid dan sudah dirender ke PNG dan SVG di folder
`review/gambar/diagram/`. Untuk laporan Word, pakai berkas PNG (resolusi dua kali lipat, tetap
tajam saat dicetak). Berkas SVG bisa dipakai bila ingin gambar yang bisa diperbesar tanpa pecah.

## Daftar gambar

| No. | Diagram | Berkas |
|---|---|---|
| 1 | ERD (struktur database) | `01-erd.png`, `01-erd.svg` |
| 2 | Use case | `02-use-case.png`, `02-use-case.svg` |
| 3.1 | Activity: Login | `03a-activity-login.png`, `.svg` |
| 3.2 | Activity: Siklus NPR | `03b-activity-siklus-npr.png`, `.svg` |
| 3.3 | Activity: TT Gamas | `03c-activity-gamas.png`, `.svg` |
| 3.4 | Activity: Laporan SLA bulanan | `03d-activity-sla.png`, `.svg` |
| 4.1 | Sequence: Login | `04a-sequence-login.png`, `.svg` |
| 4.2 | Sequence: Buat NPR | `04b-sequence-buat-npr.png`, `.svg` |
| 4.3 | Sequence: Eskalasi menjadi TT | `04c-sequence-eskalasi-tt.png`, `.svg` |
| 4.4 | Sequence: Close NPR | `04d-sequence-close-npr.png`, `.svg` |
| 4.5 | Sequence: Unduh PDF TT | `04e-sequence-pdf-tt.png`, `.svg` |
| 5.1 | Class diagram (domain) | `05a-class-domain.png`, `.svg` |
| 5.2a | Nilai tetap NPR dan TT | `05b-enumerasi-npr.png`, `.svg` |
| 5.2b | Nilai tetap Remote, Gamas, dan akun | `05c-enumerasi-lain.png`, `.svg` |
| 5.3 | Diagram modul | `05d-modul.png`, `.svg` |

## Istilah singkat

| Istilah | Arti |
|---|---|
| NPR | Network Problem Report: catatan gangguan pada satu site (remote) |
| TT | Trouble Ticket: permintaan kunjungan teknisi untuk satu NPR, dibuat lewat tindakan Eskalasi Service |
| TT Gamas | Trouble Ticket gangguan massal: satu gangguan yang mengenai banyak site sekaligus |
| Remote, Site ID | Lokasi ATM yang dipantau. Site ID adalah kode unik lokasi itu |
| Pending TM, Pending Customer | Pihak yang sedang ditunggu: TM (PT. Tangara Mitrakom) atau Customer (bank) |
| SLA | Persentase waktu layanan normal dalam satu bulan. Target 99,5% |
| API (worker) | Bagian server yang menerima permintaan dari browser dan membaca atau menulis database |
| Batch | Beberapa perintah database yang dijalankan sebagai satu transaksi: semua berhasil, atau semua dibatalkan |

Semua waktu disimpan dalam UTC di database, lalu ditampilkan dan dihitung per bulan menurut WIB.

---

## 1. ERD

ERD (Entity Relationship Diagram) menggambarkan tabel di database dan hubungannya. Setiap kotak
adalah satu tabel. Baris di dalam kotak adalah kolom: tipe data, nama, lalu tanda kunci.

- **PK** (primary key): kolom pengenal unik setiap baris.
- **FK** (foreign key): kolom yang menunjuk ke baris di tabel lain.
- **UK** (unique key): nilainya tidak boleh kembar.

Garis antartabel menunjukkan kardinalitas. Ujung bergaris dua (`||`) berarti "tepat satu", ujung
lingkaran dan garis (`o|`) berarti "nol atau satu", ujung kaki gagak (`{`) berarti "banyak". Contoh:
satu customer memiliki nol atau banyak remote, dan setiap remote milik tepat satu customer.

Struktur di bawah adalah keadaan akhir setelah `schema.sql`, `migrations/0001_nomor_urut.sql`, dan
`migrations/0002_pengguna.sql` dijalankan. Migrasi 0002 menghapus kolom teks `created_by` di
`nprs`, `actions`, `gamas`, dan `gamas_actions`, lalu menggantinya dengan `user_id` yang menunjuk ke
tabel `users`.

<!-- gambar: 01-erd layout=elk -->
```mermaid
erDiagram
  customers ||--o{ remotes : "memiliki"
  remotes ||--o{ nprs : "mengalami"
  nprs ||--|{ actions : "riwayat"
  nprs ||--o| tickets : "dieskalasi menjadi"
  remotes ||--o{ gamas_sites : "terdampak"
  gamas ||--|{ gamas_sites : "mencakup"
  gamas ||--|{ gamas_actions : "perkembangan"
  users ||--o{ sessions : "memiliki"
  users |o--o{ nprs : "mencatat"
  users |o--o{ actions : "mencatat"
  users |o--o{ gamas : "mencatat"
  users |o--o{ gamas_actions : "mencatat"

  customers {
    INTEGER id PK
    TEXT name UK
    TEXT code UK
  }
  remotes {
    INTEGER id PK
    INTEGER customer_id FK
    TEXT site_id UK
    TEXT location
    TEXT address
    TEXT city
    TEXT province
    TEXT jarkom
    TEXT ip_lan
    TEXT pic_name
    TEXT pic_phone
  }
  nprs {
    INTEGER id PK
    TEXT number UK
    INTEGER remote_id FK
    TEXT remote_status
    TEXT status
    TEXT pending_by
    TEXT started_at
    TEXT online_at
    TEXT closed_at
    TEXT last_action
    INTEGER user_id FK
  }
  actions {
    INTEGER id PK
    INTEGER npr_id FK
    TEXT kind
    TEXT notes
    TEXT remote_status
    TEXT pending_by
    TEXT occurred_at
    TEXT attachment_name
    TEXT attachment_data
    INTEGER user_id FK
  }
  tickets {
    INTEGER id PK
    INTEGER npr_id FK,UK
    TEXT number UK
    TEXT instruction
    TEXT notes
    TEXT created_at
    TEXT report
    TEXT technician
  }
  gamas {
    INTEGER id PK
    TEXT number UK
    TEXT location
    TEXT notes
    TEXT started_at
    TEXT online_at
    TEXT closed_at
    TEXT status
    TEXT report
    INTEGER user_id FK
  }
  gamas_sites {
    INTEGER gamas_id PK,FK
    INTEGER remote_id PK,FK
  }
  gamas_actions {
    INTEGER id PK
    INTEGER gamas_id FK
    TEXT notes
    TEXT report
    TEXT occurred_at
    INTEGER user_id FK
  }
  users {
    INTEGER id PK
    TEXT username UK
    TEXT full_name
    TEXT password_hash
    TEXT password_salt
    TEXT created_at
    TEXT peran
    INTEGER aktif
  }
  sessions {
    TEXT id PK
    INTEGER user_id FK
    INTEGER expires_at
  }
  login_attempts {
    TEXT key PK
    INTEGER attempts
    INTEGER reset_at
  }
  penghitung_nomor {
    TEXT jenis PK
    TEXT periode PK
    INTEGER terakhir
  }
  d1_migrations {
    INTEGER id PK
    TEXT name UK
    TIMESTAMP applied_at
  }
```

### Kardinalitas

| Hubungan | Kardinalitas | Dasar di kode |
|---|---|---|
| customers → remotes | 1 : 0..N | `remotes.customer_id NOT NULL REFERENCES customers(id)` |
| remotes → nprs | 1 : 0..N | `nprs.remote_id NOT NULL REFERENCES remotes(id)` |
| nprs → actions | 1 : 1..N | Tindakan `Create NPR` disimpan di batch yang sama dengan NPR baru (`worker/domain.ts`) |
| nprs → tickets | 1 : 0..1 | `tickets.npr_id NOT NULL UNIQUE`; Eskalasi kedua ditolak dengan 409 |
| gamas ↔ remotes | N : N lewat `gamas_sites` | PK gabungan `(gamas_id, remote_id)`; satu Gamas berisi 1 sampai 200 remote |
| gamas → gamas_actions | 1 : 1..N | Perkembangan pertama disimpan saat Gamas dibuat |
| users → sessions | 1 : 0..N | `sessions.user_id ... ON DELETE CASCADE` |
| users → nprs, actions, gamas, gamas_actions | 0..1 : 0..N | `user_id` boleh kosong di skema (hasil `ALTER TABLE`), tetapi aplikasi selalu mengisinya |

Tiga tabel tidak berhubungan lewat FK:

- `penghitung_nomor` menyimpan nomor terakhir per jenis dokumen (NPR, TT, GAMAS) dan per bulan WIB.
  Nomor di `nprs.number`, `tickets.number`, dan `gamas.number` dibuat dari tabel ini, tetapi tidak
  ada FK karena nomor disalin sebagai teks.
- `login_attempts` mencatat jumlah percobaan login per alamat IP selama 15 menit.
- `d1_migrations` mencatat migrasi yang sudah dijalankan. Tabel ini dibuat oleh Wrangler (Cloudflare)
  atau oleh `server/migrasi.ts` (Docker), bukan oleh `schema.sql`.

### Keterangan kolom

Supaya gambar tetap cukup kecil untuk halaman laporan, keterangan kolom tidak ditulis di dalam ERD,
tetapi di tabel berikut.

| Kolom | Keterangan |
|---|---|
| `nprs.number`, `tickets.number`, `gamas.number` | Nomor dokumen `NPR/YYYY/MM/0001`, `TT/YYYY/MM/0001`, `GAMAS/YYYY/MM/0001`, urut per bulan WIB dari `penghitung_nomor` |
| `nprs.started_at`, `gamas.started_at` | Waktu mulai gangguan (teks ISO, UTC) |
| `nprs.online_at`, `nprs.closed_at`, `gamas.online_at`, `gamas.closed_at` | Boleh kosong; diisi saat Close |
| `nprs.last_action` | Catatan tindakan terakhir, untuk ditampilkan di daftar NPR |
| `nprs.remote_status`, `actions.remote_status` | Jenis gangguan atau keadaan remote |
| `actions.attachment_data` | Isi lampiran dalam base64 (maksimal 500 KB); hanya dikirim saat lampiran dibuka |
| `tickets.npr_id` | FK sekaligus UK: satu NPR paling banyak punya satu TT |
| `tickets.notes`, `tickets.report`, `tickets.technician` | Catatan NOC saat eskalasi, report teknisi, dan nama teknisi |
| `gamas.location` | Lokasi penanganan, mis. HUB atau data center |
| `user_id` di `nprs`, `actions`, `gamas`, `gamas_actions` | Akun yang mencatat data itu |
| `users.password_hash`, `users.password_salt` | Hash PBKDF2 (SHA-256, 100.000 putaran) dan salt acak. Password asli tidak disimpan |
| `sessions.id`, `sessions.expires_at` | UUID acak yang juga menjadi isi cookie `npr_session`; berlaku 8 jam (milidetik sejak 1970) |
| `login_attempts.key`, `login_attempts.reset_at` | Alamat IP dan batas waktu 15 menit untuk menghitung percobaan login |
| `penghitung_nomor.periode` | Bulan WIB dalam bentuk `YYYY-MM` |

### Nilai yang diizinkan

| Kolom | Nilai | Dijaga oleh |
|---|---|---|
| `remotes.jarkom` | `VSAT`, `M2M` | `CHECK` di skema dan `worker/domain.ts` |
| `nprs.remote_status`, `actions.remote_status` | `ATM Offline`, `Remote Down`, `Remote Idle`, `Relokasi`, `Reposisi`, `Maintenance`, `Preventive Maintenance`, `Other` | `worker/domain.ts` |
| `nprs.status` | `OPEN` (baru), `PENDING`, `ESKALASI`, `CLOSED` | `worker/domain.ts` |
| `nprs.pending_by`, `actions.pending_by` | kosong (belum dikategorikan), `TM`, `Customer` | `worker/domain.ts` |
| `actions.kind` | `Create NPR`, `Problem`, `Eskalasi Service`, `Report Teknisi`, `Close` | `worker/domain.ts` |
| `tickets.instruction` | `Maintenance`, `Preventive Maintenance` | `CHECK` di skema dan `worker/domain.ts` |
| `gamas.status` | `OPEN` (baru), `IN PROGRESS`, `CLOSED` | `worker/domain.ts` |
| `users.peran` | `admin`, `helpdesk` | `CHECK` di migrasi 0002 |
| `users.aktif` | `1` (aktif), `0` (nonaktif) | `CHECK` di migrasi 0002 |

Catatan:

- `nprs.pending_by` di `schema.sql` punya nilai bawaan `'Customer'`, tetapi kode selalu mengisi
  kosong saat NPR dibuat. Jadi nilai bawaan itu tidak pernah terpakai.
- Akun arsip (dibuat migrasi 0002 untuk nama pencatat lama) memakai `password_hash = '!'` dan
  `aktif = 0`. Akun ini tidak bisa login dan tidak tampil di menu Pengguna.

---

## 2. Use case

Diagram use case menunjukkan siapa memakai aplikasi dan untuk apa. Kotak "Sistem NPR" adalah batas
aplikasi. Oval di dalamnya adalah use case (kegiatan yang bisa dilakukan).

- **Helpdesk** memakai semua menu kecuali Pengguna.
- **Admin** adalah Helpdesk dengan hak tambahan. Garis "generalisasi" berarti Admin bisa melakukan
  semua use case Helpdesk, ditambah use case di kotak "Khusus Admin".
- **Teknisi** tidak punya akun dan tidak membuka aplikasi. Teknisi hanya menerima PDF TT (dan PDF
  TT Gamas) yang dikirim helpdesk di luar aplikasi, lalu melaporkan hasil kerjanya kepada helpdesk.
  Garis putus-putus menandai penyerahan di luar aplikasi.

Pembatasan Admin dijaga di dua tempat: menu Pengguna disembunyikan untuk helpdesk (`src/App.tsx`),
dan server menolak `/api/users` dengan 403 untuk peran selain admin (`worker/pengguna.ts`).

<!-- gambar: 02-use-case -->
```mermaid
flowchart LR
  helpdesk["«aktor»<br/>Helpdesk"]
  admin["«aktor»<br/>Admin"]
  teknisi["«aktor luar»<br/>Teknisi"]

  subgraph sistem["Sistem NPR"]
    %% Kelompok sengaja ditulis terbalik: Mermaid menggambarnya dari bawah ke atas.
    subgraph khusus["Khusus Admin"]
      uc18(["UC-18 Lihat daftar dan aktivitas pengguna"])
      uc19(["UC-19 Tambah pengguna"])
      uc20(["UC-20 Ubah nama dan peran"])
      uc21(["UC-21 Nonaktifkan atau aktifkan kembali"])
      uc22(["UC-22 Reset password pengguna"])
    end
    subgraph lain["Laporan dan data master"]
      uc15(["UC-15 Lihat Laporan SLA bulanan"])
      uc16(["UC-16 Lihat dan tambah Customer"])
      uc17(["UC-17 Lihat dan tambah Remote"])
    end
    subgraph gamas["TT Gamas"]
      uc12(["UC-12 Buat TT Gamas"])
      uc13(["UC-13 Catat perkembangan dan Close Gamas"])
      uc14(["UC-14 Unduh PDF TT Gamas"])
    end
    subgraph npr["NPR dan Trouble Ticket"]
      uc04(["UC-04 Lihat Dashboard"])
      uc05(["UC-05 Cari, lihat, dan ekspor NPR"])
      uc06(["UC-06 Buat NPR"])
      uc07(["UC-07 Catat Problem"])
      uc08(["UC-08 Eskalasi Service menjadi TT"])
      uc09(["UC-09 Catat Report Teknisi"])
      uc10(["UC-10 Close NPR"])
      uc11(["UC-11 Unduh PDF TT"])
    end
    subgraph akun["Akun"]
      uc01(["UC-01 Login"])
      uc02(["UC-02 Keluar"])
      uc03(["UC-03 Ganti password sendiri"])
    end
  end

  admin -->|"generalisasi"| helpdesk
  helpdesk --- uc01 & uc02 & uc03
  helpdesk --- uc04 & uc05 & uc06 & uc07 & uc08 & uc09 & uc10 & uc11
  helpdesk --- uc12 & uc13 & uc14
  helpdesk --- uc15 & uc16 & uc17
  admin ---- uc18 & uc19 & uc20 & uc21 & uc22
  uc11 -.->|"menerima PDF"| teknisi
  uc14 -.->|"menerima PDF"| teknisi
```

### Skenario per use case

Prasyarat umum untuk UC-02 sampai UC-22: pengguna sudah login dan akunnya aktif. Setiap
penyimpanan juga ditolak bila sesi habis (pengguna diminta login lagi).

| UC | Aktor | Prasyarat | Alur utama | Alur alternatif |
|---|---|---|---|---|
| UC-01 Login | Helpdesk, Admin | Punya akun aktif yang dibuat admin | 1) Buka alamat aplikasi. 2) Sistem memeriksa sesi; bila belum login, form Login tampil. 3) Isi username dan password, klik Masuk. 4) Sistem mencocokkan password, membuat sesi 8 jam, dan mengirim cookie. 5) Halaman yang dibuka tampil. | Sesi masih berlaku: langsung masuk tanpa form. Username atau password salah: "Username atau password salah." Akun nonaktif: "Akun ini sudah dinonaktifkan. Hubungi admin." Lebih dari 20 percobaan dari satu IP dalam 15 menit: diminta mencoba lagi 15 menit kemudian. |
| UC-02 Keluar | Helpdesk, Admin | Sudah login | 1) Buka menu akun, pilih Keluar. 2) Sistem menghapus sesi dan cookie. 3) Form Login tampil. | Permintaan gagal (mis. jaringan putus): pesan galat, tetap di halaman. |
| UC-03 Ganti password sendiri | Helpdesk, Admin | Sudah login | 1) Menu akun, pilih Ganti Password. 2) Isi password lama, password baru (minimal 12 karakter), dan ulangi password baru. 3) Simpan. 4) Sistem menyimpan password baru dan mengakhiri sesi lain milik akun itu. | Password lama salah, atau password baru kurang dari 12 karakter: ditolak dengan pesan. |
| UC-04 Lihat Dashboard | Helpdesk, Admin | Sudah login | 1) Buka Dashboard. 2) Sistem menampilkan jumlah NPR aktif, kritis (lebih dari 2 hari), aging (1 sampai 2 hari), menunggu report, pending per kategori, grafik NPR 7 hari, Gamas aktif, dan 10 NPR aktif terlama. 3) Klik kartu untuk membuka daftar NPR yang sudah tersaring. | Data gagal dimuat: pesan galat. |
| UC-05 Cari, lihat, dan ekspor NPR | Helpdesk, Admin | Sudah login | 1) Buka menu NPR. 2) Cari, saring (customer, status, tanggal, kondisi), urutkan, dan pindah halaman. Semua dikerjakan server. 3) Buka detail NPR: data site, TT, riwayat tindakan, lampiran. 4) Ekspor CSV (maksimal 5.000 baris). | Tidak ada hasil: tampil keadaan kosong. NPR tidak ditemukan: pesan "NPR tidak ditemukan." |
| UC-06 Buat NPR | Helpdesk, Admin | Remote sudah terdaftar (UC-17) | 1) Klik NPR Baru. 2) Pilih jarkom, customer, dan remote. 3) Pilih jenis gangguan, isi mulai gangguan (WIB) dan catatan. 4) Simpan. 5) Sistem memberi nomor `NPR/YYYY/MM/0001`, status OPEN, pending kosong, dan mencatat tindakan Create NPR. 6) Detail NPR terbuka. | Mulai gangguan di masa depan: ditolak. Remote tidak ditemukan: ditolak. |
| UC-07 Catat Problem | Helpdesk, Admin | NPR belum CLOSED | 1) Di detail NPR pilih Problem. 2) Pilih Pending Customer atau Pending TM (wajib), status remote, waktu tindakan, catatan, dan lampiran bila perlu. 3) Simpan. 4) Status menjadi PENDING, atau tetap ESKALASI bila NPR sudah punya TT. | Kategori pending kosong, waktu mendahului riwayat terakhir atau di masa depan, lampiran bukan PNG/JPEG/WebP/PDF atau lebih dari 500 KB: ditolak. |
| UC-08 Eskalasi Service menjadi TT | Helpdesk, Admin | NPR belum CLOSED dan belum punya TT | 1) Pilih Eskalasi Service. 2) Pilih instruksi Maintenance atau Preventive Maintenance, isi catatan NOC dan waktu. 3) Klik Kirim TT. 4) Sistem membuat TT bernomor `TT/YYYY/MM/0001`; status NPR menjadi ESKALASI dan pending menjadi TM. 5) Tombol Unduh PDF TT muncul. | NPR sudah punya TT: pilihan Eskalasi tidak tampil, dan server menolak dengan 409. |
| UC-09 Catat Report Teknisi | Helpdesk, Admin (isi dari Teknisi) | NPR punya TT dan belum CLOSED | 1) Teknisi melaporkan hasil kerja kepada helpdesk di luar aplikasi. 2) Pilih Report Teknisi, isi nama teknisi dan isi report. 3) Simpan. 4) Report tersimpan di TT; status tetap ESKALASI. | NPR belum punya TT: pilihan tidak tampil, dan server menolak. |
| UC-10 Close NPR | Helpdesk, Admin | NPR belum CLOSED. Bila punya TT, report teknisi sudah dicatat | 1) Pilih Close. 2) Isi waktu tindakan, waktu kembali online, dan catatan. 3) Simpan. 4) Status menjadi CLOSED; waktu online dan waktu tutup tersimpan; riwayat tidak bisa diubah lagi. | NPR tanpa TT: boleh langsung Close. Ada TT tanpa report: tombol Simpan terkunci dan server menolak. Waktu online di luar rentang mulai gangguan sampai waktu Close: ditolak. |
| UC-11 Unduh PDF TT | Helpdesk, Admin. Teknisi menerima | TT sudah ada | 1) Dari menu Trouble Ticket atau detail NPR, klik Unduh PDF. 2) Browser menyusun PDF: kop, data site, gangguan, kotak hasil pekerjaan, tanda tangan. 3) Berkas tersimpan. 4) Helpdesk mengirimkannya ke teknisi di luar aplikasi. | PDF gagal dibuat: "PDF gagal dibuat. Silakan coba unduh kembali." |
| UC-12 Buat TT Gamas | Helpdesk, Admin | Remote terdampak sudah terdaftar | 1) Klik TT Gamas Baru. 2) Isi lokasi penanganan, mulai gangguan, catatan, dan pilih remote terdampak. 3) Simpan. 4) Sistem memberi nomor `GAMAS/YYYY/MM/0001` dengan status OPEN, lalu detail Gamas terbuka. | Tidak ada remote dipilih atau lebih dari 200, remote tidak ditemukan, atau waktu di masa depan: ditolak. |
| UC-13 Catat perkembangan dan Close Gamas | Helpdesk, Admin | Gamas belum CLOSED | 1) Di detail Gamas isi waktu perkembangan, catatan, dan report teknisi bila ada. 2) Simpan; status menjadi IN PROGRESS. 3) Untuk menutup: centang "Tutup TT Gamas" dan isi waktu kembali online. 4) Status menjadi CLOSED. | Waktu mendahului perkembangan terakhir; tutup tanpa report (baru atau sebelumnya); tutup tanpa waktu online; waktu online di luar rentang: ditolak. |
| UC-14 Unduh PDF TT Gamas | Helpdesk, Admin. Teknisi menerima | Gamas sudah ada | 1) Klik Unduh PDF di daftar atau detail Gamas. 2) Browser mengambil detail dan daftar site terdampak, lalu menyusun PDF. 3) Helpdesk mengirimkannya ke teknisi di luar aplikasi. | PDF gagal dibuat: pesan galat. |
| UC-15 Lihat Laporan SLA bulanan | Helpdesk, Admin | Sudah login | 1) Buka Laporan SLA (bulan ini). 2) Pilih bulan dengan tombol sebelumnya dan berikutnya. 3) Server menghitung SLA per site. 4) Ringkasan, target 99,5%, dan site di bawah target tampil. 5) Cari, saring, dan ekspor CSV bila perlu. | Bulan depan tidak bisa dipilih. Bulan di alamat tidak valid: kembali ke bulan ini. |
| UC-16 Lihat dan tambah Customer | Helpdesk, Admin | Sudah login | 1) Buka Customer: daftar dengan jumlah remote, NPR aktif, NPR bulan ini. 2) Tambah: isi nama dan kode. 3) Simpan. | Nama atau kode sudah ada: "Data sudah ada…" (409). Kode selain huruf, angka, dan tanda minus: ditolak. |
| UC-17 Lihat dan tambah Remote | Helpdesk, Admin | Customer sudah ada | 1) Buka Remote (bisa disaring per customer). 2) Tambah: customer, Site ID, lokasi, alamat, kota, provinsi, jarkom, IP LAN, PIC, telepon. 3) Simpan. | Site ID sudah ada (409), IP LAN tidak valid, atau jarkom selain VSAT/M2M: ditolak. |
| UC-18 Lihat daftar dan aktivitas pengguna | Admin | Login sebagai admin | 1) Buka menu Pengguna. 2) Sistem menampilkan akun beserta NPR dicatat, TT dibuat, tindakan bulan ini, dan tindakan terakhir. | Helpdesk membuka `/pengguna`: "Menu ini hanya untuk admin." Server juga menolak dengan 403. |
| UC-19 Tambah pengguna | Admin | Login sebagai admin | 1) Klik tambah pengguna. 2) Isi username (3 sampai 32 karakter: huruf kecil, angka, titik, minus, garis bawah), nama lengkap, peran, dan password awal (minimal 12 karakter). 3) Simpan. | Username sudah dipakai (409) atau formatnya salah: ditolak. |
| UC-20 Ubah nama dan peran | Admin | Login sebagai admin | 1) Pilih akun, menu Ubah Nama dan Peran. 2) Ubah nama lengkap atau peran. 3) Simpan. | Mengubah admin aktif terakhir menjadi helpdesk: "Harus ada minimal satu admin aktif." |
| UC-21 Nonaktifkan atau aktifkan kembali | Admin | Login sebagai admin | 1) Pilih akun, menu Nonaktifkan (atau Aktifkan Kembali). 2) Sistem menyimpan status. 3) Bila dinonaktifkan, semua sesi akun itu langsung diakhiri. | Menonaktifkan akun sendiri ditolak. Menonaktifkan admin aktif terakhir ditolak. |
| UC-22 Reset password pengguna | Admin | Login sebagai admin | 1) Pilih akun, menu Reset Password. 2) Isi password baru (minimal 12 karakter). 3) Simpan. 4) Semua sesi akun itu diakhiri, kecuali sesi admin yang sedang dipakai. | Password kurang dari 12 karakter: ditolak. |

Akun admin pertama dan reset password lewat terminal server (`node dist/server/setup.js` dan
`--reset-password`) bukan use case aplikasi web, jadi tidak digambar.

---

## 3. Activity diagram

Activity diagram menggambarkan urutan kegiatan dari awal sampai akhir. Bulatan hitam adalah titik
mulai, bulatan hitam bercincin adalah titik selesai, kotak adalah kegiatan, dan belah ketupat adalah
keputusan (pilihan ya atau tidak).

Pelaku setiap kegiatan ditandai dengan warna, dijelaskan di kotak "Keterangan warna" di pojok kiri
atas. Cara ini dipakai sebagai pengganti swimlane berbentuk kolom. Swimlane sudah dicoba, tetapi
Mermaid tidak bisa menyusunnya dengan rapi: alur NPR dan Gamas bolak-balik antara helpdesk, sistem,
dan teknisi, sehingga garis balik melingkar dan menumpuk. Dengan warna, alurnya tetap satu arah dari
atas ke bawah dan setiap kegiatan tetap jelas pelakunya. Kotak teknisi bergaris putus-putus karena
dikerjakan di luar aplikasi.

### 3.1 Login

Tiga pelaku: pengguna (biru), browser atau tampilan React (kuning), dan server, yaitu API beserta
database (hijau). Semua penolakan dari server dikirim kembali ke browser sebagai pesan, lalu pengguna
bisa mencoba lagi.

<!-- gambar: 03a-activity-login -->
```mermaid
flowchart TB
  subgraph ket["Keterangan warna"]
    direction LR
    k1["Pengguna"]:::pengguna
    k2["Browser (React)"]:::browser
    k3["Server (API dan database)"]:::sistem
  end

  mulai@{ shape: f-circ, label: "mulai" }
  p1["Buka alamat aplikasi"]:::pengguna
  b1["Kirim GET /api/me<br/>untuk memeriksa sesi"]:::browser
  s1{"Sesi berlaku dan<br/>akun aktif?"}:::sistem
  b2["Tampilkan form Login"]:::browser
  p2["Isi username dan password,<br/>klik Masuk"]:::pengguna
  b3["Kirim POST /api/login<br/>(browser menambah header Origin)"]:::browser
  s2{"Origin sama dengan<br/>alamat aplikasi?"}:::sistem
  s3{"Username dan<br/>password terisi?"}:::sistem
  s4["Hapus sesi dan catatan percobaan yang<br/>kedaluwarsa, tambah hitungan<br/>percobaan dari IP ini"]:::sistem
  s5{"Lebih dari 20<br/>percobaan dalam<br/>15 menit?"}:::sistem
  s6["Cari akun (username huruf kecil),<br/>hitung hash PBKDF2"]:::sistem
  s7{"Password<br/>cocok?"}:::sistem
  s8{"Akun aktif?"}:::sistem
  s9["Hapus catatan percobaan dan sesi lama,<br/>buat sesi baru berlaku 8 jam,<br/>kirim cookie npr_session"]:::sistem
  s10["Kirim pesan galat<br/>(400, 401, 403, atau 429)"]:::sistem
  b4["Tampilkan pesan gagal<br/>di atas tombol Masuk"]:::browser
  b5["Simpan data pengguna,<br/>tampilkan halaman yang dibuka"]:::browser
  selesai@{ shape: dbl-circ, label: " " }

  mulai --> p1 --> b1 --> s1
  s1 -->|"ya"| b5
  s1 -->|"tidak (401)"| b2 --> p2 --> b3 --> s2
  s2 -->|"ya"| s3
  s3 -->|"ya"| s4 --> s5
  s5 -->|"tidak"| s6 --> s7
  s7 -->|"ya"| s8
  s8 -->|"ya"| s9 --> b5 --> selesai
  s2 -->|"tidak"| s10
  s3 -->|"tidak"| s10
  s5 -->|"ya"| s10
  s7 -->|"tidak"| s10
  s8 -->|"tidak"| s10
  s10 --> b4 --> p2

  classDef pengguna fill:#dbe7fb,stroke:#032459,color:#14213d
  classDef browser fill:#fff1c7,stroke:#8a6d00,color:#14213d
  classDef sistem fill:#dff0e2,stroke:#2e6b36,color:#14213d
```

### 3.2 Siklus NPR

Satu NPR dimulai dari pencatatan gangguan dan berakhir saat Close. Di antaranya helpdesk bisa
mencatat Problem berkali-kali. Bila perlu teknisi, helpdesk melakukan Eskalasi Service, yang
membuat TT. Setelah teknisi melapor, helpdesk mencatat Report Teknisi. NPR tanpa TT boleh langsung
Close; NPR dengan TT baru bisa Close setelah report teknisi tercatat.

Aturan yang berlaku untuk semua tindakan (tidak digambar satu per satu supaya diagram tetap
terbaca): waktu tindakan tidak boleh di masa depan dan tidak boleh mendahului tindakan terakhir,
NPR yang sudah CLOSED tidak bisa diubah, dan lampiran maksimal 500 KB.

<!-- gambar: 03b-activity-siklus-npr -->
```mermaid
flowchart TB
  subgraph ket["Keterangan warna"]
    direction LR
    k1["Helpdesk"]:::pengguna
    k2["Sistem NPR (API dan database)"]:::sistem
    k3["Teknisi (di luar aplikasi)"]:::teknisi
  end

  mulai@{ shape: f-circ, label: "mulai" }
  h1["Buka NPR Baru: pilih jarkom, customer,<br/>remote, isi jenis gangguan,<br/>mulai gangguan, catatan"]:::pengguna
  s1["Beri nomor NPR/YYYY/MM/0001, simpan NPR<br/>(OPEN, pending kosong) dan tindakan<br/>Create NPR dalam satu batch"]:::sistem
  h2{"Tindakan<br/>berikutnya?"}:::pengguna
  h3["Pilih Pending TM atau<br/>Pending Customer, isi catatan"]:::pengguna
  s2["Simpan Problem: status PENDING,<br/>atau tetap ESKALASI bila ada TT"]:::sistem
  h4["Pilih instruksi Maintenance atau<br/>Preventive Maintenance,<br/>isi catatan NOC"]:::pengguna
  s3["Beri nomor TT/YYYY/MM/0001, simpan<br/>TT dan tindakan, status ESKALASI,<br/>pending TM (satu batch)"]:::sistem
  h5["Unduh PDF TT,<br/>kirim ke teknisi"]:::pengguna
  t1["Kunjungi site,<br/>perbaiki gangguan"]:::teknisi
  t2["Laporkan hasil<br/>ke helpdesk"]:::teknisi
  h6["Isi nama teknisi<br/>dan isi report"]:::pengguna
  s4["Simpan report ke TT,<br/>status tetap ESKALASI"]:::sistem
  h7["Isi waktu kembali online<br/>dan catatan Close"]:::pengguna
  s5{"NPR punya<br/>TT?"}:::sistem
  s6{"Report<br/>teknisi sudah<br/>ada?"}:::sistem
  s7["Tolak: report teknisi<br/>harus diisi dulu"]:::sistem
  s8{"Waktu online<br/>di antara mulai<br/>gangguan dan<br/>waktu Close?"}:::sistem
  s9["Tolak: waktu online<br/>tidak valid"]:::sistem
  s10["Simpan Close: status CLOSED,<br/>online_at dan closed_at"]:::sistem
  selesai@{ shape: dbl-circ, label: " " }

  mulai --> h1 --> s1 --> h2
  h2 -->|"Problem"| h3 --> s2 --> h2
  h2 -->|"Eskalasi Service<br/>(belum ada TT)"| h4 --> s3 --> h5 --> t1 --> t2 --> h2
  h2 -->|"Report Teknisi<br/>(sudah ada TT)"| h6 --> s4 --> h2
  h2 -->|"Close"| h7 --> s5
  s5 -->|"ya"| s6
  s5 -->|"tidak"| s8
  s6 -->|"ya"| s8
  s6 -->|"tidak"| s7 --> h2
  s8 -->|"ya"| s10 --> selesai
  s8 -->|"tidak"| s9 --> h7

  classDef pengguna fill:#dbe7fb,stroke:#032459,color:#14213d
  classDef sistem fill:#dff0e2,stroke:#2e6b36,color:#14213d
  classDef teknisi fill:#fbe2d3,stroke:#9a4a1f,color:#14213d,stroke-dasharray:5 3
```

### 3.3 TT Gamas

TT Gamas dipakai untuk gangguan yang mengenai banyak site sekaligus. Satu TT Gamas mencakup 1 sampai
200 remote. Setiap perkembangan dicatat dengan waktu, catatan, dan report teknisi bila sudah ada.
Untuk menutup, report teknisi wajib ada (diisi saat itu atau di perkembangan sebelumnya) dan waktu
kembali online wajib diisi.

<!-- gambar: 03c-activity-gamas -->
```mermaid
flowchart TB
  subgraph ket["Keterangan warna"]
    direction LR
    k1["Helpdesk"]:::pengguna
    k2["Sistem NPR (API dan database)"]:::sistem
    k3["Teknisi (di luar aplikasi)"]:::teknisi
  end

  mulai@{ shape: f-circ, label: "mulai" }
  h1["Klik TT Gamas Baru: isi lokasi penanganan,<br/>mulai gangguan, catatan,<br/>pilih remote terdampak"]:::pengguna
  s1{"1 sampai 200<br/>remote terdaftar,<br/>waktu tidak di<br/>masa depan?"}:::sistem
  s2["Tolak dengan pesan"]:::sistem
  s3["Beri nomor GAMAS/YYYY/MM/0001, simpan<br/>Gamas (OPEN), site terdampak, dan<br/>perkembangan pertama (satu batch)"]:::sistem
  h2["Unduh PDF TT Gamas,<br/>kirim ke teknisi"]:::pengguna
  t1["Tangani gangguan<br/>massal di lokasi"]:::teknisi
  t2["Laporkan perkembangan<br/>dan hasil ke helpdesk"]:::teknisi
  h3["Isi waktu perkembangan, catatan,<br/>dan report teknisi bila ada"]:::pengguna
  h4{"Centang<br/>Tutup TT<br/>Gamas?"}:::pengguna
  s4{"Waktu tidak<br/>mendahului<br/>perkembangan<br/>terakhir?"}:::sistem
  s5["Simpan perkembangan,<br/>status IN PROGRESS"]:::sistem
  h5["Isi waktu<br/>kembali online"]:::pengguna
  s6{"Waktu urut dan<br/>report teknisi ada<br/>(baru atau<br/>sebelumnya)?"}:::sistem
  s7{"Waktu online<br/>di antara mulai<br/>gangguan dan<br/>waktu Close?"}:::sistem
  s8["Tolak dengan pesan"]:::sistem
  s9["Simpan perkembangan, status CLOSED,<br/>online_at dan closed_at (satu batch)"]:::sistem
  selesai@{ shape: dbl-circ, label: " " }

  mulai --> h1 --> s1
  s1 -->|"tidak"| s2 --> h1
  s1 -->|"ya"| s3 --> h2 --> t1 --> t2 --> h3 --> h4
  h4 -->|"tidak"| s4
  s4 -->|"ya"| s5 --> t1
  s4 -->|"tidak"| s8
  h4 -->|"ya"| h5 --> s6
  s6 -->|"ya"| s7
  s6 -->|"tidak"| s8
  s7 -->|"ya"| s9 --> selesai
  s7 -->|"tidak"| s8
  s8 --> h3

  classDef pengguna fill:#dbe7fb,stroke:#032459,color:#14213d
  classDef sistem fill:#dff0e2,stroke:#2e6b36,color:#14213d
  classDef teknisi fill:#fbe2d3,stroke:#9a4a1f,color:#14213d,stroke-dasharray:5 3
```

### 3.4 Laporan SLA bulanan

SLA dihitung server setiap kali halaman Laporan SLA dibuka, tidak disimpan di database. Yang
dihitung sebagai downtime tanggung jawab TM:

- NPR yang punya TT berinstruksi **Maintenance**, dari mulai gangguan sampai kembali online, kecuali
  segmen saat NPR berstatus Pending Customer. NPR tanpa TT dan TT Preventive Maintenance tidak
  dihitung.
- TT Gamas, untuk semua site terdampak, dari mulai gangguan sampai kembali online. Gamas tidak punya
  jeda Pending Customer.

Rumusnya: SLA = (total menit periode − menit downtime) ÷ total menit periode × 100. Rincian aturan
ada di `monitoring-vsat/ATURAN-SLA.md`.

<!-- gambar: 03d-activity-sla -->
```mermaid
flowchart TB
  subgraph ket["Keterangan warna"]
    direction LR
    k1["Helpdesk"]:::pengguna
    k2["Browser (React)"]:::browser
    k3["Server (API dan database)"]:::sistem
  end

  mulai@{ shape: f-circ, label: "mulai" }
  h1["Buka Laporan SLA<br/>(bawaan: bulan ini)"]:::pengguna
  b1["Kirim GET /api/sla?month=YYYY-MM"]:::browser
  s1{"Format bulan<br/>valid?"}:::sistem
  s2["Tolak: periode bulan<br/>tidak valid (400)"]:::sistem
  s3["Tentukan periode WIB: awal bulan sampai<br/>akhir bulan, atau sampai sekarang<br/>bila bulan berjalan"]:::sistem
  s4{"Periode sudah<br/>dimulai?"}:::sistem
  s5["Semua site: total 0,<br/>SLA kosong"]:::sistem
  s6["Ambil dalam satu batch: remote,<br/>NPR ber-TT Maintenance, semua tindakan,<br/>Gamas beserta site terdampak"]:::sistem
  s7["NPR: hitung segmen tanggung jawab TM<br/>dari mulai gangguan sampai online,<br/>segmen Pending Customer dilewati"]:::sistem
  s8["Gamas: semua site terdampak dihitung<br/>dari mulai gangguan sampai online<br/>atau sampai sekarang"]:::sistem
  s9["Potong interval ke periode, gabungkan<br/>interval yang tumpang tindih per remote"]:::sistem
  s10["SLA = (total menit − downtime)<br/>÷ total menit × 100"]:::sistem
  b2["Tampilkan ringkasan, target 99,5%,<br/>jumlah site di bawah target,<br/>dan tabel per site"]:::browser
  h2["Cari, saring customer atau<br/>capaian, urutkan"]:::pengguna
  h3{"Langkah<br/>berikutnya?"}:::pengguna
  h4["Pilih bulan lain dengan tombol<br/>sebelumnya atau berikutnya"]:::pengguna
  h5["Ekspor CSV"]:::pengguna
  selesai@{ shape: dbl-circ, label: " " }

  mulai --> h1 --> b1 --> s1
  s1 -->|"ya"| s3 --> s4
  s1 -->|"tidak"| s2 --> b2
  s4 -->|"sudah"| s6 --> s7 --> s8 --> s9 --> s10 --> b2
  s4 -->|"belum"| s5 --> b2
  b2 --> h2 --> h3
  h3 -->|"ganti bulan"| h4 --> b1
  h3 -->|"ekspor"| h5 --> selesai
  h3 -->|"selesai"| selesai

  classDef pengguna fill:#dbe7fb,stroke:#032459,color:#14213d
  classDef browser fill:#fff1c7,stroke:#8a6d00,color:#14213d
  classDef sistem fill:#dff0e2,stroke:#2e6b36,color:#14213d
```

---

## 4. Sequence diagram

Sequence diagram menunjukkan pesan yang dikirim antarbagian sistem, berurutan dari atas ke bawah.
Bagian yang digambar:

- **Helpdesk**: orang yang memakai aplikasi.
- **Browser (React)**: tampilan aplikasi yang berjalan di browser.
- **API (worker)**: kode di `monitoring-vsat/worker/`. Di server Docker, permintaan masuk lewat
  `server/main.ts` lalu diteruskan ke kode worker yang sama.
- **Database**: SQLite di server Docker (lewat `server/d1.ts`) atau D1 di Cloudflare.

Tiga pemeriksaan yang muncul di diagram:

1. **Cek Origin (CSRF).** Setiap permintaan selain GET, HEAD, dan OPTIONS harus membawa header
   `Origin` yang sama dengan alamat aplikasi. Browser menambahkannya sendiri. Bila berbeda, server
   menolak dengan 403. Ini mencegah situs lain mengirim perubahan data atas nama pengguna.
2. **Cek sesi.** Setiap `/api/*` selain login, `/api/me`, dan logout mencari sesi dari cookie
   `npr_session` yang belum kedaluwarsa dan akunnya masih aktif. Bila tidak ada: 401.
3. **Batch transaksi.** Perintah yang harus berhasil bersama dikirim dalam satu batch. Di Docker,
   `server/d1.ts` membungkusnya dengan `BEGIN IMMEDIATE` … `COMMIT`, dan `ROLLBACK` bila satu
   perintah gagal. Kotak berwarna hijau di diagram menandai batch.

Kotak `break` berarti alur berhenti di situ dan server langsung mengirim pesan galat.

### 4.1 Login

<!-- gambar: 04a-sequence-login -->
```mermaid
sequenceDiagram
  autonumber
  actor H as Helpdesk
  participant B as Browser (React)
  participant A as API (worker)
  participant Database@{ "type" : "database" }

  H->>B: Buka alamat aplikasi
  B->>A: GET /api/me<br/>(cookie npr_session bila ada)
  A->>Database: Cari sesi belum kedaluwarsa<br/>dan akun aktif
  Database-->>A: Tidak ditemukan
  A-->>B: 401 Silakan login
  B-->>H: Tampilkan form Login
  H->>B: Isi username dan password,<br/>klik Masuk
  B->>A: POST /api/login {username, password}<br/>dengan header Origin dari browser
  break Origin berbeda dengan alamat aplikasi
    A-->>B: 403 Asal permintaan tidak diizinkan
  end
  break Isian kosong atau terlalu panjang
    A-->>B: 400 Isi username dan password<br/>dengan benar
  end
  rect rgb(232, 244, 234)
    Note over A,Database: Batch: bersihkan data kedaluwarsa
    A->>Database: DELETE sessions dan login_attempts<br/>yang kedaluwarsa
  end
  A->>Database: Tambah hitungan login_attempts<br/>untuk IP ini
  Database-->>A: Jumlah percobaan
  break Lebih dari 20 percobaan dalam 15 menit
    A-->>B: 429 Terlalu banyak percobaan login
  end
  A->>Database: SELECT users WHERE username<br/>(huruf kecil)
  Database-->>A: Data akun, atau kosong
  Note over A: Hitung hash PBKDF2 (100.000 putaran),<br/>tetap dihitung walau akun tidak ada
  break Akun tidak ada atau password salah
    A-->>B: 401 Username atau password salah
  end
  break Akun nonaktif
    A-->>B: 403 Akun ini sudah dinonaktifkan
  end
  A->>Database: Hapus catatan percobaan IP<br/>dan sesi lama di cookie
  A->>Database: INSERT sessions<br/>(UUID acak, user_id, berlaku 8 jam)
  A-->>B: 200 {user} + Set-Cookie npr_session<br/>(HttpOnly, SameSite=Lax)
  B-->>H: Tampilkan halaman yang dibuka
```

### 4.2 Buat NPR

<!-- gambar: 04b-sequence-buat-npr -->
```mermaid
sequenceDiagram
  autonumber
  actor H as Helpdesk
  participant B as Browser (React)
  participant A as API (worker)
  participant Database@{ "type" : "database" }

  H->>B: Klik NPR Baru
  B->>A: GET /api/master (cookie)
  Note over A: GET tidak dicek Origin
  A->>Database: Cek sesi
  A->>Database: Batch: SELECT customers dan remotes
  Database-->>A: Daftar customer dan remote
  A-->>B: 200 {customers, remotes}
  B-->>H: Tampilkan form NPR Baru
  H->>B: Pilih jarkom, customer, remote,<br/>isi jenis gangguan, mulai, catatan,<br/>lalu klik Simpan
  B->>A: POST /api/nprs (header Origin, cookie)<br/>{remote_id, remote_status, started_at, notes}
  break Origin berbeda
    A-->>B: 403 Asal permintaan tidak diizinkan
  end
  A->>Database: Cek sesi<br/>(sessions JOIN users, akun aktif)
  break Sesi tidak berlaku
    A-->>B: 401 Silakan login terlebih dahulu
  end
  A->>Database: SELECT remotes WHERE id
  break Remote tidak ada, atau isian<br/>dan waktu tidak valid
    A-->>B: 400 Pesan galat
  end
  rect rgb(232, 244, 234)
    Note over A,Database: Satu batch = satu transaksi
    A->>Database: 1. Naikkan penghitung_nomor<br/>(NPR, bulan WIB)
    A->>Database: 2. INSERT nprs, nomor dari penghitung,<br/>pending kosong, RETURNING id, number
    A->>Database: 3. INSERT actions "Create NPR"
    Database-->>A: id dan nomor NPR
  end
  A-->>B: 200 {ok, id, number}
  B-->>H: Pesan "NPR berhasil dibuat.",<br/>buka /npr/:id
```

### 4.3 Eskalasi menjadi TT

<!-- gambar: 04c-sequence-eskalasi-tt -->
```mermaid
sequenceDiagram
  autonumber
  actor H as Helpdesk
  participant B as Browser (React)
  participant A as API (worker)
  participant Database@{ "type" : "database" }

  H->>B: Di detail NPR pilih Eskalasi Service,<br/>isi instruksi, catatan NOC, waktu,<br/>lalu klik Kirim TT
  B->>A: POST /api/nprs/:id/actions<br/>{kind: "Eskalasi Service", instruction, notes,<br/>remote_status, pending_by, occurred_at}
  break Origin berbeda
    A-->>B: 403 Asal permintaan tidak diizinkan
  end
  A->>Database: Cek sesi
  break Sesi tidak berlaku
    A-->>B: 401 Silakan login terlebih dahulu
  end
  A->>Database: SELECT nprs WHERE id
  break NPR tidak ada (404) atau sudah CLOSED (400)
    A-->>B: Pesan galat
  end
  A->>Database: SELECT waktu tindakan terakhir
  break Waktu mendahului riwayat atau di masa depan
    A-->>B: 400 Waktu tindakan tidak valid
  end
  A->>Database: SELECT tickets WHERE npr_id
  break NPR sudah punya TT
    A-->>B: 409 NPR ini sudah memiliki TT
  end
  rect rgb(232, 244, 234)
    Note over A,Database: Satu batch = satu transaksi
    A->>Database: 1. Naikkan penghitung_nomor<br/>(TT, bulan WIB)
    A->>Database: 2. INSERT tickets, nomor TT<br/>dari penghitung, RETURNING number
    A->>Database: 3. INSERT actions "Eskalasi Service"<br/>(hanya bila NPR belum CLOSED)
    A->>Database: 4. UPDATE nprs:<br/>status ESKALASI, pending TM
    Database-->>A: Nomor TT
  end
  A-->>B: 200 {ok, id, number}
  B->>A: GET /api/nprs/:id (muat ulang detail)
  A->>Database: Cek sesi, baca NPR, remote,<br/>TT, dan riwayat
  A-->>B: 200 {npr, remote, ticket, actions}
  B-->>H: Pesan "TT berhasil dibuat",<br/>tombol Unduh PDF TT muncul
```

### 4.4 Close NPR

<!-- gambar: 04d-sequence-close-npr -->
```mermaid
sequenceDiagram
  autonumber
  actor H as Helpdesk
  participant B as Browser (React)
  participant A as API (worker)
  participant Database@{ "type" : "database" }

  H->>B: Di detail NPR pilih Close
  break NPR punya TT tetapi report teknisi kosong
    B-->>H: Tombol Simpan terkunci, tampil pesan
  end
  H->>B: Isi waktu tindakan, waktu kembali<br/>online, catatan, lalu klik Simpan
  B->>A: POST /api/nprs/:id/actions<br/>{kind: "Close", notes, occurred_at,<br/>online_at, remote_status, pending_by}
  break Origin berbeda
    A-->>B: 403 Asal permintaan tidak diizinkan
  end
  A->>Database: Cek sesi
  break Sesi tidak berlaku
    A-->>B: 401 Silakan login terlebih dahulu
  end
  A->>Database: SELECT nprs WHERE id,<br/>lalu waktu tindakan terakhir
  break NPR tidak ada, sudah CLOSED,<br/>atau waktu tidak urut
    A-->>B: Pesan galat (404 atau 400)
  end
  A->>Database: SELECT tickets WHERE npr_id
  break Ada TT tetapi report kosong
    A-->>B: 400 Catatan report teknisi<br/>harus diisi sebelum Close
  end
  break Waktu online di luar rentang
    A-->>B: 400 Waktu online harus antara<br/>awal gangguan dan waktu Close
  end
  rect rgb(232, 244, 234)
    Note over A,Database: Satu batch = satu transaksi
    A->>Database: 1. INSERT actions "Close"<br/>(hanya bila NPR belum CLOSED)
    A->>Database: 2. UPDATE nprs: status CLOSED,<br/>online_at, closed_at
  end
  A-->>B: 200 {ok, id}
  B->>A: GET /api/nprs/:id (muat ulang detail)
  A-->>B: 200 NPR berstatus CLOSED
  B-->>H: Pesan berhasil, form Tambah Tindakan<br/>tidak tampil lagi
```

### 4.5 Unduh PDF TT

PDF dibuat seluruhnya di browser memakai pustaka jsPDF. Server hanya mengirim data TT, tidak
membuat berkas PDF. Teknisi digambar di kiri karena hanya berhubungan dengan helpdesk.

<!-- gambar: 04e-sequence-pdf-tt -->
```mermaid
sequenceDiagram
  autonumber
  actor T as Teknisi
  actor H as Helpdesk
  participant B as Browser (React)
  participant A as API (worker)
  participant Database@{ "type" : "database" }

  H->>B: Buka menu Trouble Ticket
  B->>A: GET /api/tickets (cookie)
  Note over A: GET tidak dicek Origin
  A->>Database: Cek sesi
  break Sesi tidak berlaku
    A-->>B: 401 Silakan login terlebih dahulu
  end
  A->>Database: SELECT tickets JOIN nprs, remotes,<br/>customers (maks. 500 baris)
  Database-->>A: Baris TT beserta data site
  A-->>B: 200 {rows}
  H->>B: Klik Unduh PDF pada satu TT
  Note over B: pdfTicket(): muat jsPDF dan logo<br/>(hanya saat dibutuhkan), lalu susun kop,<br/>data TT, data site, gangguan, kotak hasil<br/>pekerjaan, tanda tangan teknisi dan helpdesk
  alt Berhasil
    B-->>H: Berkas TT-YYYY-MM-0001.pdf tersimpan
    H->>T: Kirim PDF TT (di luar aplikasi)
  else Gagal
    B-->>H: Pesan "PDF gagal dibuat.<br/>Silakan coba unduh kembali."
  end
  Note over H,B: Dari detail NPR, tombol Unduh PDF TT<br/>memakai data GET /api/nprs/:id yang<br/>sudah dimuat, tanpa permintaan baru
```

---

## 5. Class diagram

### 5.1 Class diagram versi domain

Kode NPR tidak memakai kelas: data disimpan sebagai baris tabel, dan aturannya ditulis sebagai
fungsi di `worker/domain.ts` dan `worker/pengguna.ts`. Diagram ini adalah model domain: setiap kelas
mewakili satu jenis data, atributnya mengikuti kolom tabel, dan operasinya mewakili aturan yang
dijalankan server untuk data itu.

- Garis biasa adalah asosiasi (hubungan). Angka di ujung garis adalah multiplisitas, mis. `0..1`
  berarti nol atau satu.
- Belah ketupat hitam adalah komposisi: bagian tidak ada tanpa induknya. Tindakan selalu milik satu
  NPR, perkembangan selalu milik satu Gamas.
- Tanda `+` berarti publik (bisa dipakai bagian lain), `-` berarti privat (hanya dipakai di dalam).

Pemetaan operasi ke kode:

| Operasi | Kode |
|---|---|
| `Customer.tambah`, `Remote.tambah` | `POST /api/customers`, `POST /api/remotes` |
| `Npr.buat` | `POST /api/nprs` |
| `Npr.catatProblem`, `eskalasi`, `catatReportTeknisi`, `close` | `POST /api/nprs/:id/actions` dengan `kind` sesuai |
| `Action.unduhLampiran` | `GET /api/lampiran/:id` |
| `Ticket.unduhPdf`, `Gamas.unduhPdf` | `pdfTicket()`, `pdfGamas()` di `src/pdf.ts` (di browser) |
| `Gamas.buat`, `catatPerkembangan`, `close` | `POST /api/gamas`, `POST /api/gamas/:id/actions` (`close: true` untuk menutup) |
| `User.login`, `keluar`, `gantiPassword` | `POST /api/login`, `/api/logout`, `/api/password` |
| `User.tambah`, `ubah`, `resetPassword`, `daftar` | `/api/users`, `/api/users/:id`, `/api/users/:id/password` (khusus admin) |

Perhitungan SLA bukan milik satu kelas. Fungsi `sla()` di `worker/domain.ts` membaca Remote, Npr,
Action, Ticket, dan Gamas sekaligus (lihat activity 3.4).

<!-- gambar: 05a-class-domain -->
```mermaid
classDiagram
  direction TB
  class Customer {
    +id: int
    +name: string
    +code: string
    +tambah(name, code)
  }
  class Remote {
    +id: int
    +siteId: string
    +location: string
    +address: string
    +city: string
    +province: string
    +jarkom: Jarkom
    +ipLan: string
    +picName: string
    +picPhone: string
    +tambah(customer, dataSite)
  }
  class Npr {
    +id: int
    +number: string
    +remoteStatus: StatusRemote
    +status: StatusNpr
    +pendingBy: PendingBy
    +startedAt: datetime
    +onlineAt: datetime
    +closedAt: datetime
    +lastAction: string
    +buat(remote, remoteStatus, startedAt, notes)
    +catatProblem(pendingBy, notes, waktu)
    +eskalasi(instruction, notes, waktu) Ticket
    +catatReportTeknisi(technician, report, waktu)
    +close(onlineAt, notes, waktu)
  }
  class Action {
    +id: int
    +kind: JenisTindakan
    +notes: string
    +remoteStatus: StatusRemote
    +pendingBy: PendingBy
    +occurredAt: datetime
    +attachmentName: string
    -attachmentData: string
    +unduhLampiran()
  }
  class Ticket {
    +id: int
    +number: string
    +instruction: Instruksi
    +notes: string
    +createdAt: datetime
    +report: string
    +technician: string
    +unduhPdf()
  }
  class Gamas {
    +id: int
    +number: string
    +location: string
    +notes: string
    +startedAt: datetime
    +onlineAt: datetime
    +closedAt: datetime
    +status: StatusGamas
    +report: string
    +buat(location, notes, startedAt, remotes)
    +catatPerkembangan(notes, report, waktu)
    +close(onlineAt, notes, report, waktu)
    +unduhPdf()
  }
  class GamasAction {
    +id: int
    +notes: string
    +report: string
    +occurredAt: datetime
  }
  class User {
    +id: int
    +username: string
    +fullName: string
    +peran: Peran
    +aktif: bool
    +createdAt: datetime
    -passwordHash: string
    -passwordSalt: string
    +login(username, password)
    +keluar()
    +gantiPassword(lama, baru)
    +daftar()
    +tambah(username, fullName, peran, password)
    +ubah(fullName, peran, aktif)
    +resetPassword(baru)
  }

  Customer "1" -- "0..*" Remote : memiliki
  Remote "1" -- "0..*" Npr : mengalami
  Npr "1" *-- "1..*" Action : riwayat
  Npr "1" -- "0..1" Ticket : dieskalasi menjadi
  Gamas "0..*" -- "1..200" Remote : site terdampak
  Gamas "1" *-- "1..*" GamasAction : perkembangan
  User "0..1" -- "0..*" Npr : mencatat
  User "0..1" -- "0..*" Action : mencatat
  User "0..1" -- "0..*" Gamas : mencatat
  User "0..1" -- "0..*" GamasAction : mencatat

  note for User "daftar, tambah, ubah, dan resetPassword<br/>hanya untuk peran admin"
  note for Ticket "Dibuat oleh Npr.eskalasi();<br/>report diisi oleh catatReportTeknisi()"
```

### 5.2 Nilai tetap (enumerasi)

Jenis data yang hanya boleh berisi nilai tertentu. Nama nilai ditulis persis seperti di database,
kecuali `kosong` yang berarti teks kosong. Supaya tetap terbaca di halaman laporan, delapan
enumerasi dibagi ke dua gambar.

Gambar 5.2a berisi nilai untuk NPR dan TT:

<!-- gambar: 05b-enumerasi-npr -->
```mermaid
classDiagram
  direction TB
  class StatusNpr {
    <<enumeration>>
    OPEN
    PENDING
    ESKALASI
    CLOSED
  }
  class PendingBy {
    <<enumeration>>
    kosong
    TM
    Customer
  }
  class JenisTindakan {
    <<enumeration>>
    Create NPR
    Problem
    Eskalasi Service
    Report Teknisi
    Close
  }
  class Instruksi {
    <<enumeration>>
    Maintenance
    Preventive Maintenance
  }
```

Gambar 5.2b berisi nilai untuk Remote, TT Gamas, dan akun:

<!-- gambar: 05c-enumerasi-lain -->
```mermaid
classDiagram
  direction TB
  class StatusRemote {
    <<enumeration>>
    ATM Offline
    Remote Down
    Remote Idle
    Relokasi
    Reposisi
    Maintenance
    Preventive Maintenance
    Other
  }
  class Jarkom {
    <<enumeration>>
    VSAT
    M2M
  }
  class StatusGamas {
    <<enumeration>>
    OPEN
    IN PROGRESS
    CLOSED
  }
  class Peran {
    <<enumeration>>
    admin
    helpdesk
  }
```

Perubahan status NPR menurut `worker/domain.ts`:

| Tindakan | Status sesudahnya | Pending sesudahnya |
|---|---|---|
| Create NPR | OPEN | kosong |
| Problem | PENDING, atau tetap ESKALASI bila NPR punya TT | TM atau Customer (wajib dipilih) |
| Eskalasi Service | ESKALASI | TM |
| Report Teknisi | ESKALASI | sesuai pilihan (form terisi kategori saat ini) |
| Close | CLOSED | sesuai pilihan (form terisi kategori saat ini) |

### 5.3 Diagram modul

Diagram modul menunjukkan susunan berkas program dan siapa memakai siapa. Panah berarti "memakai"
atau "memanggil". Aplikasi bisa berjalan di dua tempat dengan kode API yang sama: server sendiri
lewat Docker (dipakai di server produksi) atau Cloudflare Workers.

<!-- gambar: 05d-modul layout=elk -->
```mermaid
flowchart TB
  subgraph fe["Tampilan React: src/"]
    main["main.tsx"]
    app["App.tsx<br/>cek sesi, menu, api(), kirim(), go()"]
    pages["pages/<br/>Login, GantiPassword, Dashboard,<br/>Npr, Tiket, Gamas, Sla,<br/>Master, Pengguna"]
    bantu["lib/app.ts, lib/alamat.ts, lib/tipe.ts,<br/>useMuat.ts, peran.ts, components/"]
    pdf["pdf.ts<br/>PDF TT dan Gamas (jsPDF)"]
  end

  subgraph srv["Server Docker: server/"]
    sMain["main.ts<br/>HTTP, berkas tampilan, /api/health"]
    sD1["d1.ts<br/>antarmuka D1 di atas node:sqlite"]
    sMigrasi["migrasi.ts<br/>schema.sql dan migrations/"]
    sSetup["setup.ts<br/>admin pertama, reset password"]
    sCadangan["cadangan.ts<br/>salinan database"]
  end

  cf["Cloudflare Workers dan D1<br/>(wrangler.jsonc)"]

  subgraph be["API: worker/"]
    wIndex["index.ts<br/>cek Origin, login, sesi, rute"]
    wDomain["domain.ts<br/>simpan data, aturan, SLA"]
    wBaca["baca.ts<br/>query baca"]
    wPengguna["pengguna.ts<br/>akun dan password"]
    wSandi["sandi.ts<br/>PBKDF2"]
    wBantu["galat.ts dan<br/>shared/waktu.ts"]
  end

  db[("SQLite /data/npr.sqlite")]

  main --> app --> pages
  pages --> bantu
  pages --> pdf
  app -->|"fetch /api/*"| sMain
  app -.->|"fetch /api/*"| cf
  sMain -->|"worker.fetch(request, env)"| wIndex
  cf -.-> wIndex
  wIndex --> wDomain
  wIndex --> wPengguna
  wIndex --> wSandi
  wPengguna --> wSandi
  wDomain --> wBaca
  wDomain --> wBantu
  wBaca --> wBantu
  wPengguna --> wBantu
  sMain -->|"membuat env.DB"| sD1
  sMain --> sMigrasi
  sSetup --> sMigrasi
  sMigrasi --> sD1
  sSetup --> sD1
  sD1 --> db
  sCadangan --> db
```

Garis putus-putus adalah jalur Cloudflare. Di Docker, `server/main.ts` mengirim alamat `/api/*` ke
`worker/index.ts` dan alamat lain ke berkas tampilan hasil build (`index.html` untuk alamat halaman).

---

## 6. Perbedaan dokumen dan kode

Diagram di atas mengikuti kode. Perbedaan yang ditemukan saat mencocokkan dokumen dengan kode:

| No. | Dokumen | Isi dokumen | Isi kode | Dipakai di diagram |
|---|---|---|---|---|
| 1 | `review/REDESAIN-NPR.md` (bagian data per halaman) dan `review/HANDOVER-SESI.md` (bagian 4) | TT, Gamas, SLA, Customer, Remote, dan Pengguna dikirim sekaligus, maksimal 500 baris | Batas `LIMIT 500` hanya ada di `GET /api/tickets` dan `GET /api/gamas` (`worker/baca.ts`). `GET /api/master`, `GET /api/users`, dan `GET /api/sla` mengirim semua baris tanpa batas | Kode: "maks. 500 baris" hanya ditulis untuk TT |
| 2 | `review/RENCANA-REVISI.md` (K-02) | Tabel `penghitung_nomor` berisi jenis, tahun, bulan, nomor terakhir | Kolomnya `jenis`, `periode` (gabungan tahun-bulan `YYYY-MM`), dan `terakhir` (`migrations/0001_nomor_urut.sql`) | Kode |
| 3 | `review/RENCANA-REVISI.md` (D-6, K-02) | Nomor urut per bulan untuk NPR dan TT | Gamas juga memakai nomor urut per bulan: `GAMAS/YYYY/MM/0001` (`nomorBaru(db, "GAMAS")`) | Kode |
| 4 | `review/RENCANA-REVISI.md` (tahap 2, Database) | Kolom `created_by` di NPR, tindakan, TT, dan Gamas diganti id pengguna | `user_id` ditambahkan ke `nprs`, `actions`, `gamas`, dan `gamas_actions`. Tabel `tickets` tidak punya `created_by` maupun `user_id`; pembuat TT diketahui dari tindakan `Eskalasi Service` | Kode: `tickets` tanpa FK ke `users` |
| 5 | `review/REDESAIN-NPR.md` (tabel Pengguna) | Angka di menu Pengguna dihitung dari `actions` dan `nprs` | "Tindakan bulan ini" dan "Tindakan terakhir" juga menghitung `gamas_actions` (perkembangan Gamas) | Kode (UC-18) |
| 6 | `monitoring-vsat/PANDUAN-MULAI.md` (daftar berkas) | `schema.sql`: tabel aplikasi | `schema.sql` hanya versi awal. Tabel `penghitung_nomor` ada di migrasi 0001; kolom `peran`, `aktif`, dan `user_id` ada di migrasi 0002; kolom `created_by` di `schema.sql` dihapus oleh migrasi 0002 | Kode: ERD memakai keadaan setelah migrasi |

Perbedaan kecil di dalam kode sendiri (bukan antara dokumen dan kode), dicatat supaya tidak
membingungkan saat membaca diagram:

- `schema.sql` memberi `nprs.pending_by` nilai bawaan `'Customer'`, tetapi `POST /api/nprs` selalu
  mengisi kosong. Diagram memakai perilaku kode (pending kosong saat NPR dibuat).
- Form Close NPR mewajibkan waktu kembali online, tetapi server memakai waktu Close bila `online_at`
  tidak dikirim. Untuk Close Gamas, server ikut mewajibkannya. Diagram mengikuti alur form.
- Form lampiran menerima JPG, PNG, dan PDF, sedangkan server juga menerima WebP.

---

## 7. Cara render ulang gambar

Gambar dibuat dari blok Mermaid di dokumen ini dengan skrip `review/gambar/diagram/render-diagram.mjs`.
Setiap blok punya penanda `<!-- gambar: nama -->` tepat di atasnya; nama itu menjadi nama berkas PNG
dan SVG. Penanda boleh ditambah `layout=elk` untuk memakai tata letak ELK (dipakai di ERD dan diagram
modul karena garisnya lebih rapi); tanpa itu dipakai tata letak bawaan Mermaid (dagre).

Setelah mengubah diagram, jalankan dari folder repo (butuh Node 22 dan Playwright dengan Chromium):

```bash
npm install --prefix /tmp/alat-mermaid mermaid@11.12.2 @mermaid-js/layout-elk@0.2.0
```

```bash
ALAT=/tmp/alat-mermaid node review/gambar/diagram/render-diagram.mjs
```

Untuk merender sebagian saja, tambahkan `SAJA=01-erd,02-use-case` di depan perintah kedua.

Pengaturan render:

- Tema dasar dengan warna navy dan latar putih.
- Font Arial. Di Linux diganti Liberation Sans yang ukurannya sama, jadi lebar teks di SVG tetap pas
  saat dibuka di Windows.
- Label sebagai teks SVG biasa (tanpa `foreignObject`), supaya tetap terbaca bila SVG dimasukkan ke
  Word.
- Label garis dan multiplisitas dipindah ke lapisan paling atas, supaya tidak tertutup kotak.
- PNG dibuat dengan skala dua kali supaya tajam saat dicetak.

Bila blok Mermaid dibuka langsung di GitHub, warna dan tata letaknya mengikuti GitHub dan bisa
berbeda dari berkas PNG. Beberapa bentuk yang dipakai (titik mulai dan selesai di activity diagram,
peserta "Database" di sequence diagram) butuh Mermaid 11 yang cukup baru, jadi bisa saja tidak
tampil di penampil lain. Untuk laporan, pakai berkas PNG atau SVG.

### Ukuran gambar untuk Word

Ukuran di bawah dalam piksel layar (PNG berisi dua kali lipatnya). Halaman A4 tegak dengan margin
4-3-3-3 cm menyisakan lebar sekitar 14 cm. Diagram yang lebar atau tinggi akan mengecil, jadi
hurufnya ikut kecil.

| Gambar | Ukuran | Saran penempatan |
|---|---|---|
| 01-erd | 1606 × 1765 | Satu halaman penuh, atau halaman mendatar (landscape) |
| 02-use-case | 1079 × 1609 | Satu halaman penuh |
| 03a-activity-login | 870 × 2517 | Satu halaman penuh (gambar tinggi) |
| 03b-activity-siklus-npr | 1555 × 1650 | Satu halaman penuh, atau halaman mendatar |
| 03c-activity-gamas | 1170 × 2256 | Satu halaman penuh (gambar tinggi) |
| 03d-activity-sla | 839 × 2136 | Satu halaman penuh (gambar tinggi) |
| 04a sampai 04e (sequence) | 1252 sampai 1534 lebar | Satu halaman penuh |
| 05a-class-domain | 985 × 2011 | Satu halaman penuh |
| 05b dan 05c (enumerasi) | sekitar 830 × 300 | Selebar teks |
| 05d-modul | 1014 × 1321 | Satu halaman penuh |
