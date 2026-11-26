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

Isi username, nama lengkap, dan password (minimal 12 karakter). Akun lain
dibuat lewat menu Pengguna di aplikasi. Tambahkan `--contoh` jika ingin data
bank dan site contoh untuk percobaan.

Ganti password satu akun dari terminal (misalnya admin lupa password):

```sh
docker compose exec app node dist/server/setup.js --reset-password
```

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

```sh
cd /opt/monitoring-vsat && git pull --ff-only
cd monitoring-vsat && docker compose up -d --build
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
