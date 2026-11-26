# Prompt pembaruan server dan pengisian data demo NPR

Prompt untuk agent browser yang punya akses ke Terminal aaPanel di server pemilik.
Tujuannya memperbarui **kp.helonoia.com** ke commit terbaru, lalu mengisi data demo
sementara supaya aplikasi bisa dicoba dan diperiksa sebelum data asli masuk.

Yang berubah sejak pembaruan terakhir (`9741ddc`):

- **Daftar NPR dari Dashboard:** panah urut sekarang di kolom "Mulai ↑", sesuai urutan yang
  tampil (gangguan terlama dulu). Di HP, pilihan urutan tertulis "Mulai Gangguan, Terlama".
- **Perintah data demo baru:** `node dist/server/demo.js` dan `--hapus`.
- Tidak ada perubahan struktur database, jadi tidak ada migrasi baru.

Isi data demo:

- 6 customer bank fiktif, 20 remote;
- sekitar 50 NPR (Open, Pending, Eskalasi, Closed) dengan kasus gangguan yang umum, 19 TT,
  dan 4 TT Gamas, sejak awal bulan lalu sampai sekarang.

Data demo **harus dihapus sebelum data asli mulai dicatat** (bagian B di bawah).

---

## A. Perbarui dan isi data demo

```text
Kamu membantu memperbarui aplikasi NPR (Network Problem Report) di server
pemilik lewat Terminal aaPanel yang sudah terbuka di browser, lalu mengisi
data demo. Aplikasi berjalan di Docker, folder /opt/monitoring-vsat, branch
Rev-NPR-Tyio, alamat https://kp.helonoia.com (container npr-kp-app-1, port
127.0.0.1:3000).

ATURAN (WAJIB):
- Jangan menyentuh container atau situs lain: npr-prod-*, tyio-staging-*,
  mengundang-*, helonoia.com, invitation.helonoia.com, npr.helonoia.com,
  revnpr.helonoia.com.
- Jangan menjalankan "docker compose down -v" dan jangan menghapus volume
  apa pun (data NPR ada di volume npr-kp_npr-data).
- Jangan menulis, menebak, atau menyimpan password apa pun. Jika perlu
  login, minta pemilik server mengetik sendiri.
- Jika satu langkah tidak sesuai harapan, BERHENTI dan laporkan apa
  adanya (perintah, keluaran, dan langkah ke berapa).

LANGKAH 1. Catat keadaan awal
  docker ps --format '{{.Names}} {{.Status}}'
  cd /opt/monitoring-vsat && git log --oneline -1
Catat daftar container dan commit saat ini untuk laporan.

LANGKAH 2. Cadangkan database sebelum memperbarui
  cd /opt/monitoring-vsat/monitoring-vsat
  docker compose exec -T app node dist/server/cadangan.js
Harapan: pesan cadangan berhasil dibuat beserta nama berkasnya.

LANGKAH 3. Ambil kode terbaru
  cd /opt/monitoring-vsat
  git status --short | head
  git fetch origin Rev-NPR-Tyio
  git checkout Rev-NPR-Tyio
  git pull --ff-only
  git log --oneline -3
Harapan: commit teratas sama dengan commit terbaru branch Rev-NPR-Tyio di
GitHub, dan ada berkas monitoring-vsat/server/demo.ts. Jika "git status"
menunjukkan perubahan lokal yang menghalangi pull, berhenti dan laporkan
daftar berkasnya.

LANGKAH 4. Build ulang dan jalankan
  cd /opt/monitoring-vsat/monitoring-vsat
  docker compose up -d --build
  docker compose ps
  curl -s http://127.0.0.1:3000/api/health
Harapan: npr-kp-app-1 berstatus "healthy" (ulangi setelah 30 detik jika
masih "starting") dan curl menampilkan {"ok":true}. Pastikan container
lain dari LANGKAH 1 masih berjalan:
  docker ps --format '{{.Names}} {{.Status}}'

LANGKAH 5. Isi data demo
  cd /opt/monitoring-vsat/monitoring-vsat
  docker compose exec -T app node dist/server/demo.js
Harapan, kurang lebih:
  Cadangan dibuat: /data/cadangan/npr-....-sebelum-demo.sqlite
  Data demo diisi atas nama <nama admin> (<username>):
  - 6 customer, 20 remote
  - NPR: 40 CLOSED, 4 ESKALASI, 2 OPEN, 4 PENDING
  - 19 TT, 4 TT Gamas
Jika muncul "Database sudah berisi NPR atau TT Gamas" atau "Customer demo
sudah ada", BERHENTI dan laporkan. Jangan menghapus data apa pun.

LANGKAH 6. Periksa di browser (https://kp.helonoia.com)
Minta pemilik server login sendiri. Lalu periksa, tanpa mengubah data:
a. Dashboard: kartu "NPR Aktif" sekitar 10, ada daftar NPR aktif, grafik
   7 hari terisi, dan satu Gamas aktif (Garut).
b. NPR: nomor bulan lalu berawalan NPR/<tahun>/<bulan lalu>/. Klik judul
   kolom "No. NPR" dua kali; urutan berbalik.
c. Dari Dashboard, klik kartu "Aktif Lebih dari 48 Jam": daftar NPR
   terbuka dengan panah di kolom "Mulai" (↑), bukan di "No. NPR".
d. Buka satu NPR yang punya TT, klik "Unduh PDF TT": PDF terunduh berisi
   kop PT. Tangara Mitrakom, tabel data site, dan kotak tanda tangan.
e. TT Gamas: buka satu Gamas, klik "Unduh PDF": PDF terunduh.
f. Laporan SLA: mundur satu bulan; tabel site terisi dan ada site "Di
   Bawah Target". Tekan F5: bulan yang sama tetap tampil.
g. Buka detail satu NPR, salin alamatnya (/npr/<angka>), buka di tab
   baru: NPR yang sama langsung tampil.
h. Perkecil jendela selebar HP (sekitar 400 px) atau buka di HP: menu
   lewat tombol ☰ dan daftar NPR, TT, Gamas tampil sebagai kartu.
Catat jika ada pesan merah, halaman kosong putih, atau "Memuat data…"
yang tidak hilang setelah 10 detik.

LANGKAH 7. Laporan
Laporkan untuk setiap langkah: berhasil atau tidak, keluaran penting
(commit, status container, hasil health, keluaran demo.js), dan temuan
pemeriksaan browser beserta halamannya. Jangan sertakan password atau
isi cookie.

Jika pembaruan gagal dan aplikasi tidak bisa dibuka, kembalikan ke commit
sebelumnya (dari LANGKAH 1) lalu build ulang:
  cd /opt/monitoring-vsat && git checkout <commit-langkah-1>
  cd monitoring-vsat && docker compose up -d --build
lalu laporkan. Data tetap aman karena volume tidak dihapus.
```

---

## B. Hapus data demo (nanti, sebelum data asli dicatat)

Jalankan ketika aplikasi akan mulai dipakai untuk data asli. Perintah ini hanya menghapus
customer demo beserta remote, NPR, TT, dan Gamas-nya, lalu nomor dokumen kembali mulai dari
0001. Akun pengguna dan data lain tidak ikut terhapus.

```text
Di Terminal aaPanel server pemilik (aturan sama seperti bagian A: jangan
menyentuh container lain, jangan "docker compose down -v", jangan menulis
password):

  cd /opt/monitoring-vsat/monitoring-vsat
  docker compose exec -T app node dist/server/demo.js --hapus

Harapan:
  Cadangan dibuat: /data/cadangan/npr-....-sebelum-hapus-demo.sqlite
  Data demo dihapus: 6 customer, 50 NPR beserta TT-nya, dan 4 TT Gamas.
  Akun pengguna dan data lain tidak diubah.

Lalu minta pemilik login dan periksa: Dashboard "NPR Aktif" 0, menu
Customer tidak lagi berisi Bank Swastamita, Lembayung, Pramudita, Baskara,
Sagara, atau Jenggala, dan akun di menu Pengguna masih lengkap. Laporkan
keluarannya apa adanya.
```

Angka NPR pada pesan hapus bisa berbeda bila ada NPR yang ditambahkan ke site demo selama
masa percobaan; NPR itu ikut terhapus karena site-nya milik customer demo.
