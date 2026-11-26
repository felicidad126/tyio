# Prompt pemasangan pembaruan otomatis NPR (sekali saja)

Prompt untuk agent browser yang punya akses ke Terminal aaPanel di server pemilik.
Dijalankan **sekali** untuk memasang pembaruan otomatis di **kp.helonoia.com**.

Setelah terpasang:

- Setiap push ke branch `Rev-NPR-Tyio` diperiksa workflow **NPR** di GitHub Actions.
- Server memeriksa GitHub setiap 5 menit dan memasang commit yang lulus, dengan cadangan
  database lebih dulu. Bila aplikasi tidak sehat, server kembali ke commit sebelumnya.
- Agent browser hanya diperlukan untuk perubahan besar (migrasi database, Dockerfile,
  docker-compose, atau commit bertanda `[manual]`), memakai `review/PROMPT-PERBARUI-SERVER.md`.

Commit yang dipasang lewat prompt ini mengubah Dockerfile dan docker-compose.yml (versi
commit tampil di `/api/health`), jadi pemasangan pertama ini memang manual.

---

```text
Kamu membantu memasang pembaruan otomatis aplikasi NPR (Network Problem
Report) di server pemilik lewat Terminal aaPanel yang sudah terbuka di
browser. Aplikasi berjalan di Docker, folder /opt/monitoring-vsat, branch
Rev-NPR-Tyio, alamat https://kp.helonoia.com (container npr-kp-app-1, port
127.0.0.1:3000).

ATURAN (WAJIB):
- Jangan menyentuh container, cron, atau situs lain: npr-prod-*,
  tyio-staging-*, mengundang-*, helonoia.com, invitation.helonoia.com,
  npr.helonoia.com, revnpr.helonoia.com. Jangan mengubah atau menghapus
  tugas cron yang sudah ada (mis. cadangan harian).
- Jangan menjalankan "docker compose down -v" dan jangan menghapus volume
  apa pun (data NPR ada di volume npr-kp_npr-data).
- Jangan menjalankan demo.js.
- Jangan menulis, menebak, atau menyimpan password apa pun. Pembaruan
  otomatis tidak memerlukan token atau kunci apa pun.
- Jika satu langkah tidak sesuai harapan, BERHENTI dan laporkan apa
  adanya (perintah, keluaran, dan langkah ke berapa).

LANGKAH 1. Catat keadaan awal
  docker ps --format '{{.Names}} {{.Status}}'
  cd /opt/monitoring-vsat && git log --oneline -1
  crontab -l
Catat daftar container, commit, dan isi crontab untuk laporan.

LANGKAH 2. Pastikan alat yang dibutuhkan ada
  command -v git docker curl flock
Harapan: keempatnya menampilkan lokasi berkas. Jika ada yang kosong,
berhenti dan laporkan.

LANGKAH 3. Cadangkan database
  cd /opt/monitoring-vsat/monitoring-vsat
  docker compose exec -T app node dist/server/cadangan.js
Harapan: pesan cadangan berhasil dibuat beserta nama berkasnya.

LANGKAH 4. Ambil kode terbaru
  cd /opt/monitoring-vsat
  git status --short | head
  git fetch origin Rev-NPR-Tyio
  git checkout Rev-NPR-Tyio
  git pull --ff-only
  git log --oneline -3
  ls -l monitoring-vsat/scripts/perbarui-otomatis.sh
Harapan: commit teratas sama dengan commit terbaru branch Rev-NPR-Tyio di
GitHub, dan berkas perbarui-otomatis.sh ada dengan izin eksekusi (-rwx).
Jika izin eksekusi tidak ada, jalankan:
  chmod +x monitoring-vsat/scripts/perbarui-otomatis.sh

LANGKAH 5. Build ulang dengan versi commit
  cd /opt/monitoring-vsat/monitoring-vsat
  NPR_VERSI=$(git rev-parse --short=7 HEAD) docker compose up -d --build
  docker compose ps
  curl -s http://127.0.0.1:3000/api/health
  git rev-parse --short=7 HEAD
Harapan: npr-kp-app-1 berstatus "healthy" (ulangi setelah 30 detik jika
masih "starting"), dan curl menampilkan {"ok":true,"versi":"<commit>"}
dengan <commit> sama dengan keluaran git rev-parse. Pastikan container lain
dari LANGKAH 1 masih berjalan:
  docker ps --format '{{.Names}} {{.Status}}'

LANGKAH 6. Coba skrip tanpa mengubah apa pun
  /opt/monitoring-vsat/monitoring-vsat/scripts/perbarui-otomatis.sh --coba
Harapan: "Sudah terbaru: <commit>." Jika muncul pesan lain, berhenti dan
laporkan pesannya.

LANGKAH 7. Tambah tugas cron di aaPanel
Buka menu Cron di aaPanel, tambah tugas baru:
  - Jenis: Shell Script
  - Nama: NPR pembaruan otomatis
  - Jadwal: setiap 5 menit (N Minutes = 5)
  - Isi skrip:
      /opt/monitoring-vsat/monitoring-vsat/scripts/perbarui-otomatis.sh
Simpan. Jangan mengubah tugas cron lain.

LANGKAH 8. Pastikan cron berjalan
Tunggu sekitar 6 menit, lalu:
  cat /var/lib/npr-perbarui/cek-terakhir
  cat /var/log/npr-perbarui.log 2>/dev/null | tail -5
Harapan: cek-terakhir berisi waktu beberapa menit terakhir (WIB). Log boleh
kosong, karena saat sudah terbaru skrip tidak mencatat apa pun.

LANGKAH 9. Laporan
Laporkan untuk setiap langkah: berhasil atau tidak, keluaran penting
(commit, status container, isi /api/health, keluaran --coba, isi
cek-terakhir), dan tugas cron yang dibuat. Jangan sertakan password atau
isi cookie.

Jika langkah 5 gagal dan aplikasi tidak bisa dibuka, kembalikan ke commit
sebelumnya (dari LANGKAH 1) lalu build ulang:
  cd /opt/monitoring-vsat && git checkout <commit-langkah-1>
  cd monitoring-vsat && docker compose up -d --build
lalu laporkan, dan jangan tambahkan tugas cron. Data tetap aman karena
volume tidak dihapus.
```

---

## Mematikan pembaruan otomatis

- Sementara: `mkdir -p /var/lib/npr-perbarui && touch /var/lib/npr-perbarui/jeda`.
  Lanjutkan dengan `rm /var/lib/npr-perbarui/jeda`.
- Permanen: hapus tugas cron "NPR pembaruan otomatis" di aaPanel.
