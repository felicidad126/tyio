# Prompt pasang NPR di server untuk agent browser

Salin teks di dalam kotak ke agent browser yang membuka aaPanel (dan, untuk
langkah 0, dasbor Cloudflare tempat DNS helonoia.com dikelola). Jangan tulis
password admin di prompt: agent akan berhenti dan meminta Anda mengetiknya
sendiri.

```text
Tugasmu: memasang aplikasi web NPR (Network Problem Report, aplikasi Kerja
Praktek) di server ini lewat aaPanel yang terbuka di browser. Aplikasi
berjalan di Docker dan dibuka lewat subdomain baru.

Subdomain baru: kp.helonoia.com
IP server: 43.173.12.150

ATURAN PENTING
- JANGAN mengubah, menghentikan, atau memulai ulang aplikasi lain:
  container npr-prod-*, tyio-staging-*, mengundang-*, dan situs
  helonoia.com, invitation.helonoia.com, npr.helonoia.com,
  revnpr.helonoia.com. Jangan mengedit konfigurasi Nginx situs-situs itu.
- Jangan memakai port selain 127.0.0.1:3000 untuk aplikasi ini.
- Jangan pernah menjalankan "docker compose down -v", "docker system
  prune", atau menghapus volume.
- Jangan menghapus folder /opt/monitoring-vsat; perbarui saja.
- Jika ada langkah yang gagal, berhenti di langkah itu, salin pesan
  errornya persis, dan laporkan. Jangan mencoba-coba perbaikan lain.
- Saat diminta password admin, BERHENTI dan minta pemilik server
  mengetiknya sendiri di terminal. Jangan membuat password sendiri dan
  jangan menuliskannya di laporan.

LANGKAH 0. Buat DNS (dasbor Cloudflare)
DNS helonoia.com dikelola di Cloudflare. Per 26 November 2026,
kp.helonoia.com belum ada.
a. Buka dasbor Cloudflare, domain helonoia.com, menu DNS > Records.
b. Lihat record revnpr.helonoia.com sebagai contoh: tipe A ke
   43.173.12.150 dengan Proxy status "DNS only" (awan abu-abu).
c. Tambah record: Type A, Name kp, IPv4 43.173.12.150, Proxy status
   DNS only (awan abu-abu), TTL Auto. Simpan.
d. JANGAN mengubah atau menghapus record lain.
Jika kamu tidak punya akses ke dasbor Cloudflare, berhenti dan minta
pemilik membuat record di atas.

LANGKAH 1. Cek DNS
Di Terminal aaPanel jalankan:
  getent hosts kp.helonoia.com
Harapan: menampilkan 43.173.12.150. Jika belum, tunggu 2–5 menit lalu
ulangi. Jika tetap kosong setelah 15 menit, berhenti dan laporkan.

LANGKAH 2. Perbarui kode
  cd /opt/monitoring-vsat
  git status --short | head
  git fetch origin Rev-NPR-Tyio
  git checkout Rev-NPR-Tyio
  git pull --ff-only
  git log --oneline -3
Harapan: commit teratas sama dengan commit terbaru branch Rev-NPR-Tyio di
GitHub, dan ada berkas monitoring-vsat/PASANG-SERVER.md.
Jika "git status" menunjukkan perubahan lokal yang menghalangi pull,
berhenti dan laporkan daftar berkasnya.

LANGKAH 3. Isi alamat publik
  cd /opt/monitoring-vsat/monitoring-vsat
  echo "ALAMAT_PUBLIK=https://kp.helonoia.com" > .env
  cat .env

LANGKAH 4. Build dan jalankan container
  docker compose up -d --build
(Build pertama beberapa menit.) Lalu:
  docker compose ps
  curl -s http://127.0.0.1:3000/api/health
Harapan: container npr-kp-app-1 berstatus "healthy" (ulangi docker
compose ps setelah 30 detik jika masih "starting"), dan curl menampilkan
{"ok":true}. Pastikan juga container lain tetap berjalan:
  docker ps --format '{{.Names}} {{.Status}}'

LANGKAH 5. Akun admin pertama
  docker compose exec app node dist/server/setup.js
Isi username dan nama lengkap sesuai permintaan pemilik server. Saat
muncul "Password admin", BERHENTI dan minta pemilik server mengetik
passwordnya sendiri. Harapan setelah selesai: "Akun admin … dibuat."

LANGKAH 6. Situs reverse proxy di aaPanel
a. Menu Website, tambah situs baru: domain kp.helonoia.com, tanpa database,
   tanpa FTP, PHP "Static" (atau pilihan setara tanpa PHP).
b. Buka pengaturan situs itu, bagian Reverse proxy, tambah proxy:
   nama bebas (mis. npr-kp), target URL http://127.0.0.1:3000,
   kirim domain $host. Simpan.
c. Bagian SSL: ajukan sertifikat Let's Encrypt untuk kp.helonoia.com, lalu
   aktifkan Force HTTPS.
d. Di Terminal, cek:
   curl -s -o /dev/null -w "%{http_code}\n" https://kp.helonoia.com/
   curl -s https://kp.helonoia.com/api/health
   Harapan: 200 dan {"ok":true}.

LANGKAH 7. Cek di browser
a. Buka https://kp.helonoia.com di tab baru. Harapan: halaman login aplikasi
   (tulisan "PT. Tangara Mitrakom"), dengan gembok HTTPS.
b. Minta pemilik server login dengan akun admin, atau login jika pemilik
   sudah memberikan passwordnya kepadamu secara langsung.
c. Harapan: Dashboard terbuka. Buka menu NPR, klik "+ NPR Baru".
   Jika belum ada customer/remote, buka menu Customer dan tambah satu
   customer percobaan, lalu menu Remote dan tambah satu remote. Simpan.
   Harapan: pesan "Data berhasil disimpan." (bukan "Asal permintaan tidak
   diizinkan").

LANGKAH 8. Cadangan otomatis
a. Jalankan sekali:
   cd /opt/monitoring-vsat/monitoring-vsat && docker compose exec -T app node dist/server/cadangan.js
   Harapan: "Cadangan dibuat: /data/cadangan/npr-….sqlite"
b. Menu Cron aaPanel: tambah tugas jenis Shell Script, setiap hari pukul
   01.30, nama "Cadangan NPR", isi perintah yang sama dengan langkah 8a.

LAPORAN
Tulis per langkah: Lulus/Gagal, apa yang terlihat, dan pesan error persis
jika gagal. Sertakan keluaran "git log --oneline -3", "docker compose ps",
dan "docker ps --format '{{.Names}} {{.Status}}'". Jangan sertakan
password.
```
