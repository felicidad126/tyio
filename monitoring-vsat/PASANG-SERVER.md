# Memasang NPR di server sendiri (Docker + aaPanel)

Panduan ini untuk server Linux dengan Docker dan Nginx yang dikelola aaPanel.
Aplikasi berjalan di dalam container, hanya terbuka di `127.0.0.1:3000`, lalu
dibuka dari luar lewat situs reverse proxy di aaPanel. Node.js tidak perlu
dipasang di server.

Isi container:

- tampilan (React) dan server Node.js dalam satu image `npr-kp`;
- database SQLite di volume Docker `npr-kp_npr-data` (`/data/npr.sqlite` di
  dalam container);
- zona waktu WIB.

## 1. Ambil kode

```sh
cd /opt
git clone -b Rev-NPR-Tyio https://github.com/felicidad126/tyio.git monitoring-vsat
# Jika folder sudah ada:
cd /opt/monitoring-vsat && git fetch origin Rev-NPR-Tyio && git checkout Rev-NPR-Tyio && git pull --ff-only
```

Folder aplikasinya `/opt/monitoring-vsat/monitoring-vsat`.

## 2. Isi alamat publik

Buat berkas `.env` di folder aplikasi, berisi alamat yang akan dibuka pengguna
(tanpa garis miring di akhir):

```sh
cd /opt/monitoring-vsat/monitoring-vsat
echo "ALAMAT_PUBLIK=https://npr.contoh.id" > .env
```

Alamat ini dipakai untuk memeriksa asal permintaan dan cookie login. Jika
salah, tombol Simpan akan ditolak dengan pesan "Asal permintaan tidak
diizinkan."

## 3. Build dan jalankan

```sh
docker compose up -d --build
docker compose ps          # tunggu sampai status "healthy"
curl -s http://127.0.0.1:3000/api/health   # hasil: {"ok":true}
```

Build pertama memerlukan beberapa menit dan akses internet ke registry npm.

## 4. Buat akun admin pertama

```sh
docker compose exec app node dist/server/setup.js
```

Isi username, nama lengkap, dan password (minimal 12 karakter). Password
tidak tampil di layar dan diminta dua kali. Akun lain
dibuat lewat menu Pengguna di aplikasi. Tambahkan `--contoh` jika ingin data
bank dan site contoh untuk percobaan.

Ganti password satu akun dari terminal (misalnya admin lupa password):

```sh
docker compose exec app node dist/server/setup.js --reset-password
```

### Data demo

Untuk mencoba aplikasi sebelum data asli masuk: 6 customer bank fiktif,
20 remote, sekitar 50 NPR (Open, Pending, Eskalasi, Closed) dengan kasus
gangguan yang umum, TT, dan 4 TT Gamas, sejak awal bulan lalu.

```sh
docker compose exec -T app node dist/server/demo.js          # isi
docker compose exec -T app node dist/server/demo.js --hapus  # hapus
```

- Pengisian hanya berjalan bila database belum berisi NPR atau TT Gamas.
- Data dicatat atas nama akun admin pertama.
- `--hapus` menghapus customer demo beserta remote, NPR, TT, dan Gamas-nya,
  lalu nomor dokumen kembali mulai dari 0001. Akun pengguna dan data lain
  tidak ikut terhapus. Jalankan sebelum data asli mulai dicatat.
- Kedua perintah membuat cadangan lebih dulu di `/data/cadangan/`.

## 5. Situs di aaPanel

1. DNS: buat A record untuk subdomain, mengarah ke IP server.
2. aaPanel, menu **Website**: tambah situs dengan domain tersebut, tanpa
   database dan tanpa FTP, PHP "Static".
3. Pengaturan situs, **Reverse proxy**: tambah proxy dengan target
   `http://127.0.0.1:3000`, kirim domain `$host`.
4. Pengaturan situs, **SSL**: Let's Encrypt, lalu aktifkan **Force HTTPS**.
5. Buka alamatnya di browser dan login dengan akun admin.

## 6. Cadangan database

```sh
docker compose exec -T app node dist/server/cadangan.js
```

Cadangan disimpan di `/data/cadangan/` di dalam container (30 terakhir).
Untuk menyalin ke folder server:

```sh
docker compose cp app:/data/cadangan ./cadangan
```

Agar berjalan otomatis setiap hari, tambahkan perintah pertama di menu
**Cron** aaPanel (jenis Shell Script), diawali
`cd /opt/monitoring-vsat/monitoring-vsat &&`.

## 7. Memperbarui aplikasi

### Otomatis (disarankan)

Setiap push ke branch `Rev-NPR-Tyio` diperiksa workflow **NPR** di GitHub
Actions: cek tipe, lint, build, uji API, uji browser dengan data demo, dan
build image Docker. Server memeriksa GitHub setiap 5 menit dan memasang commit
baru yang lulus: cadangan database, `git pull`, build ulang, lalu
`/api/health` harus sehat dan menunjukkan commit baru. Bila tidak sehat, server
kembali ke commit sebelumnya.

Pasang sekali di menu **Cron** aaPanel (jenis Shell Script, setiap 5 menit):

```sh
/opt/monitoring-vsat/monitoring-vsat/scripts/perbarui-otomatis.sh
```

- Coba tanpa mengubah apa pun: tambahkan `--coba`.
- Catatan kejadian: `/var/log/npr-perbarui.log`. Waktu cek terakhir:
  `/var/lib/npr-perbarui/cek-terakhir`.
- Commit yang terpasang: `curl -s http://127.0.0.1:3000/api/health` menampilkan
  `{"ok":true,"versi":"<commit>"}`.
- Jeda sementara: `mkdir -p /var/lib/npr-perbarui && touch /var/lib/npr-perbarui/jeda`.
  Lanjutkan dengan `rm /var/lib/npr-perbarui/jeda`.
- **Tidak dipasang otomatis** (perlu cara manual di bawah): perubahan di
  `migrations/`, `schema.sql`, `Dockerfile`, `docker-compose.yml`, atau commit
  yang pesannya berisi `[manual]`. Log mencatat "Perlu pembaruan lewat agent
  browser".

### Manual

```sh
mkdir -p /var/lib/npr-perbarui && touch /var/lib/npr-perbarui/jeda
cd /opt/monitoring-vsat && git pull --ff-only
cd monitoring-vsat && docker compose exec -T app node dist/server/cadangan.js
NPR_VERSI=$(git rev-parse --short=7 HEAD) docker compose up -d --build
rm /var/lib/npr-perbarui/jeda
```

Perubahan struktur database (folder `migrations/`) dijalankan otomatis saat
container mulai. Data tetap ada di volume.

## Perintah lain

| Keperluan | Perintah |
| --- | --- |
| Lihat log | `docker compose logs -f app` |
| Mulai ulang | `docker compose restart app` |
| Hentikan | `docker compose down` (data tetap ada) |

Jangan jalankan `docker compose down -v`: perintah itu menghapus volume
database.
