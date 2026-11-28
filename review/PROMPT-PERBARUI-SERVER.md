# Prompt pembaruan manual NPR di server

Prompt untuk agent browser yang punya akses ke Terminal aaPanel di server pemilik.

Pembaruan rutin di **kp.helonoia.com** sudah otomatis (lihat `PROMPT-PASANG-CD.md`).
Prompt ini dipakai untuk **perubahan besar** yang sengaja tidak dipasang otomatis:

- perubahan di `migrations/` atau `schema.sql` (struktur database);
- perubahan `Dockerfile` atau `docker-compose.yml`;
- commit yang pesannya berisi `[manual]`.

Log `/var/log/npr-perbarui.log` di server mencatat "Perlu pembaruan lewat agent browser"
untuk commit seperti itu. Sebelum memberikan prompt ini, tambahkan di bawahnya apa yang
berubah dan apa yang perlu diperiksa di browser.

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

LANGKAH 2. Jeda pembaruan otomatis, lalu cadangkan database
  mkdir -p /var/lib/npr-perbarui && touch /var/lib/npr-perbarui/jeda
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
  NPR_VERSI=$(git rev-parse --short=7 HEAD) docker compose up -d --build
  docker compose ps
  curl -s http://127.0.0.1:3000/api/health
  git rev-parse --short=7 HEAD
Harapan: npr-kp-app-1 berstatus "healthy" (ulangi setelah 30 detik jika
masih "starting") dan curl menampilkan {"ok":true,"versi":"<commit>"}
dengan <commit> sama dengan keluaran git rev-parse. Pastikan container
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
g. Alamat per halaman:
   - Klik menu NPR: alamat browser menjadi https://kp.helonoia.com/npr.
   - Klik menu Laporan SLA, lalu tekan tombol Back browser: kembali ke NPR,
     bukan keluar dari aplikasi.
   - Di Laporan SLA, mundur satu bulan: alamat berakhir ?bulan=YYYY-MM.
     Tekan F5: bulan yang sama tetap tampil.
   - Jika ada NPR: buka detailnya (alamat /npr/<angka>), salin alamatnya,
     buka di tab baru: NPR yang sama langsung tampil.
   - Buka https://kp.helonoia.com/alamat-asal: kembali ke Dashboard.

LANGKAH 6. Lanjutkan pembaruan otomatis
  rm /var/lib/npr-perbarui/jeda
  /opt/monitoring-vsat/monitoring-vsat/scripts/perbarui-otomatis.sh --coba
Harapan: "Sudah terbaru: <commit>."

LANGKAH 7. Laporan
Laporkan untuk setiap langkah: berhasil atau tidak, keluaran penting
(commit, status container, hasil health), dan temuan dari pemeriksaan
browser beserta halaman tempat ditemukan. Jangan sertakan password atau
isi cookie.

Jika pembaruan gagal dan aplikasi tidak bisa dibuka, kembalikan ke commit
sebelumnya (dari LANGKAH 1) lalu build ulang:
  cd /opt/monitoring-vsat && git checkout <commit-langkah-1>
  cd monitoring-vsat && NPR_VERSI=$(git rev-parse --short=7 HEAD) docker compose up -d --build
lalu laporkan. Biarkan berkas jeda tetap ada sampai pemilik memutuskan.
Data tetap aman karena volume tidak dihapus.
```
