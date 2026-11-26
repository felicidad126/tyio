# Prompt pembaruan NPR di server (tampilan baru)

Prompt untuk agent browser yang punya akses ke Terminal aaPanel di server pemilik.
Tujuannya memasang tampilan baru (Tailwind + shadcn/ui) di **kp.helonoia.com**.

Yang berubah:

- **Tampilan:** seluruh tampilan aplikasi diganti.
- **Server:**
  - Daftar NPR sekarang bisa diurutkan per kolom.
  - Ada angka tambahan untuk Customer, Remote, Pengguna, dan Gamas.
  - Tidak ada perubahan struktur database, jadi tidak ada migrasi baru.

---

```text
Kamu membantu memperbarui aplikasi NPR (Network Problem Report) di server
pemilik lewat Terminal aaPanel yang sudah terbuka di browser. Aplikasi
berjalan di Docker, folder /opt/monitoring-vsat, branch Rev-NPR-Tyio,
alamat https://kp.helonoia.com (container npr-kp-app-1, port 127.0.0.1:3000).

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
GitHub, dan ada folder monitoring-vsat/src/pages. Jika "git status"
menunjukkan perubahan lokal yang menghalangi pull, berhenti dan laporkan
daftar berkasnya.

LANGKAH 4. Build ulang dan jalankan
  cd /opt/monitoring-vsat/monitoring-vsat
  docker compose up -d --build
(Build beberapa menit karena ada pustaka tampilan baru.) Lalu:
  docker compose ps
  curl -s http://127.0.0.1:3000/api/health
Harapan: npr-kp-app-1 berstatus "healthy" (ulangi setelah 30 detik jika
masih "starting") dan curl menampilkan {"ok":true}. Pastikan container
lain dari LANGKAH 1 masih berjalan:
  docker ps --format '{{.Names}} {{.Status}}'

LANGKAH 5. Periksa di browser (https://kp.helonoia.com)
Minta pemilik server login sendiri. Lalu periksa, tanpa mengubah data:
a. Halaman Login: panel navy di kiri, tulisan "Lupa password? Chat mimin
   yaa." di tengah bawah tombol Masuk.
b. Setelah login: sidebar navy dengan menu Dashboard, NPR, Trouble Ticket,
   TT Gamas, Laporan SLA, Customer, Remote, (Pengguna untuk admin).
c. Buka setiap menu. Catat jika ada pesan merah, halaman kosong putih,
   atau tulisan "Memuat data…" yang tidak hilang setelah 10 detik.
d. Di NPR: klik judul kolom "No. NPR" dua kali; urutan berbalik.
   Buka tombol Filter; ada pilihan Status, Customer, Tanggal Mulai.
e. Jika ada NPR ber-TT: buka detailnya, klik "Unduh PDF TT"; berkas PDF
   terunduh dan berisi kop PT. Tangara Mitrakom.
f. Perkecil jendela browser selebar HP (sekitar 400 px) atau buka di HP:
   menu muncul lewat tombol ☰ dan tabel berubah menjadi kartu.

LANGKAH 6. Laporan
Laporkan untuk setiap langkah: berhasil atau tidak, keluaran penting
(commit, status container, hasil health), dan temuan dari pemeriksaan
browser beserta halaman tempat ditemukan. Jangan sertakan password atau
isi cookie.

Jika pembaruan gagal dan aplikasi tidak bisa dibuka, kembalikan ke commit
sebelumnya (dari LANGKAH 1) lalu build ulang:
  cd /opt/monitoring-vsat && git checkout <commit-langkah-1>
  cd monitoring-vsat && docker compose up -d --build
lalu laporkan. Data tetap aman karena volume tidak dihapus.
```
