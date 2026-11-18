# Server demo (staging) di server sendiri

Portal berjalan di server Anda dengan **data contoh**, untuk ditunjukkan ke customer. Server
selalu bisa diperbarui ke versi terbaru yang **lolos semua uji CI**, sementara pengembangan
fitur berjalan terus.

## Cara kerjanya

```
push ke branch claude/r0-fondasi
  → CI: lint, build, uji API, image dibangun, 38+ uji layar terhadap image itu
  → bila semua hijau: image diterbitkan ke ghcr.io/felicidad126/tyio
       tag sha-<commit>  (setiap versi)
       tag demo          (versi terbaru yang hijau)
server: deploy/scripts/server.sh perbarui
  → tarik image demo, ambil berkas compose dari commit yang sama, migrasi, start ulang
```

Versi yang gagal uji tidak pernah mendapat tag `demo`, jadi tidak bisa terpasang di server.

## Kebutuhan server

| | |
| --- | --- |
| Sistem | Linux 64-bit **x86_64/amd64** (image belum dibangun untuk ARM), mis. Ubuntu 24.04 |
| Ukuran | Perkiraan untuk demo: 2 vCPU, minimal 2 GB RAM (4 GB lebih lega), 20 GB disk kosong |
| Perangkat lunak | Docker Engine dengan plugin Compose v2, `git`, `curl`, `openssl` |
| Jaringan | Port **80** dan **443** terbuka ke arah penonton. Server perlu bisa mengakses `github.com` dan `ghcr.io` |
| Alamat | Disarankan **subdomain** (mis. `noc-demo.perusahaan.co.id`) dengan DNS A mengarah ke IP server |

Jalankan semua perintah di bawah sebagai root (atau dengan `sudo`).

Ada dua cara pasang. Pilih salah satu:
- **A. Server dengan aaPanel** (atau panel lain yang Nginx-nya sudah memakai port 80/443): panel
  mengurus domain dan SSL, portal berjalan di belakangnya.
- **B. Server kosong:** skrip memasang Caddy yang mengurus HTTPS sendiri.

Skrip menolak cara B bila port 80/443 sudah dipakai, dan menyarankan cara A.

## A. Server dengan aaPanel

Portal hanya terbuka di `127.0.0.1:8080`, jadi tidak bisa dibuka langsung dari luar. Nginx
aaPanel menerima pengunjung di 443 (SSL dari aaPanel), lalu meneruskannya ke portal. Nama menu
aaPanel bisa sedikit berbeda antarversi.

### A1. Docker dan alat dasar

```bash
docker compose version
```

Bila perintah itu menampilkan `Docker Compose version v2.x` atau lebih baru, lanjut ke A2.
Bila tidak:

```bash
apt-get update && apt-get install -y git curl openssl
curl -fsSL https://get.docker.com | sh
docker compose version
```

`get.docker.com` adalah skrip resmi Docker yang memasang Docker Engine dan plugin Compose.
Jangan jalankan bila Docker sudah dipasang lewat App Store aaPanel. Cukup pastikan
`docker compose version` jalan.

### A2. Pasang portal

```bash
git clone -b claude/r0-fondasi https://github.com/felicidad126/tyio.git /opt/tyio
cd /opt/tyio
deploy/scripts/server.sh pasang noc-demo.perusahaan.co.id --panel
```

Ganti `noc-demo.perusahaan.co.id` dengan domain Anda. Skrip mencetak akun dan kata sandi
contoh, lalu menyebut bahwa HTTPS **belum** bisa diakses. Itu wajar sampai langkah A3 selesai.

Bila port 8080 sudah dipakai aplikasi lain, pilih port lain dan pakai angka yang sama di A3:
`TYIO_APP_PORT=8081 deploy/scripts/server.sh pasang <domain> --panel`.

### A3. Situs, SSL, dan penerusan di aaPanel

1. Arahkan DNS domain (record **A**) ke IP server, lalu tunggu sampai aktif.
2. **Website → Add site.** Domain: domain Anda. FTP dan database: tidak perlu. PHP: **Static**
   (tanpa PHP).
3. Di situs itu, **SSL → Let's Encrypt.** Pilih domain → **Apply**, lalu aktifkan **Force
   HTTPS**.
4. Di situs itu, buka **Config** (berkas konfigurasi Nginx situs). Tempel potongan berikut
   tepat **di bawah baris `#SSL-END`**, lalu **Save**:

   ```nginx
       # --- Portal NOC (tyio) ---
       # Lampiran 5 x 5 MB per tindakan dan impor Excel 12 MB; bawaan Nginx hanya 1 MB.
       client_max_body_size 30m;
       # Verifikasi Let's Encrypt milik aaPanel tetap dilayani dari folder situs.
       location ^~ /.well-known/acme-challenge/ {
           allow all;
       }
       # ^~ : semua alamat lain ke portal, termasuk .js/.png yang di konfigurasi bawaan
       # aaPanel dilayani dari folder situs.
       location ^~ / {
           proxy_pass http://127.0.0.1:8080;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_read_timeout 120s;
       }
       # --- akhir Portal NOC ---
   ```

   **Jangan** memakai menu **Reverse proxy** aaPanel untuk situs ini. Menu itu membuat aturan
   `location /` kedua, sehingga Nginx menolak konfigurasinya.
5. Kembali ke server:

   ```bash
   cd /opt/tyio && deploy/scripts/server.sh status
   ```

   Harus tampil `Aplikasi: OK` dan `HTTPS: OK`. Bila tampil "API menjawab, tetapi halaman atau
   berkas aplikasi (.js/.png) tidak sampai", aturan `location` di konfigurasi situs belum
   memakai `^~` seperti di atas.

Port 8080 **tidak perlu** dibuka di firewall aaPanel. Portal sengaja hanya bisa dicapai dari
server itu sendiri.

Kenapa tiap baris itu perlu (sudah diuji dengan konfigurasi bawaan situs aaPanel):
- tanpa `client_max_body_size`, lampiran lebih dari 1 MB ditolak Nginx (413);
- dengan `location /` biasa, berkas `.js` dan `.png` portal dicari di folder situs dan tidak
  ditemukan, sehingga halaman portal rusak;
- tanpa aturan `acme-challenge`, perpanjangan SSL Let's Encrypt oleh aaPanel gagal;
- portal mempercayai tepat satu proxy di depannya (`TYIO_TRUST_PROXY_HOPS=1`, diisi skrip).
  Dengan angka lebih besar, alamat IP palsu dari header `X-Forwarded-For` ikut dipercaya,
  sehingga pembatasan percobaan login per IP bisa diakali.

## B. Server kosong (HTTPS oleh Caddy)

Pasang Docker seperti di A1, lalu:

```bash
git clone -b claude/r0-fondasi https://github.com/felicidad126/tyio.git /opt/tyio
cd /opt/tyio
deploy/scripts/server.sh pasang noc-demo.perusahaan.co.id
```

Skrip ini:
1. membuat `deploy/staging.env` berisi kata sandi database dan kata sandi akun contoh yang
   diacak untuk server ini (berkas hanya bisa dibaca pemiliknya, tidak pernah masuk git);
2. menarik image `demo` terbaru, lalu memindahkan checkout ke commit image itu;
3. menjalankan database, migrasi, aplikasi, dan Caddy (HTTPS);
4. mengisi data contoh, memeriksa portal lewat HTTPS, lalu mencetak alamat, akun, dan kata
   sandinya.

Cara A melakukan hal yang sama, kecuali Caddy.

| Alamat yang dipakai | Sertifikat | Di browser penonton |
| --- | --- | --- |
| Domain publik (DNS mengarah ke server, port 80/443 terbuka dari internet) | Let's Encrypt, otomatis dan diperpanjang sendiri | Langsung aman |
| Alamat IP: `pasang 203.0.113.10` | CA internal milik Caddy | Peringatan, sampai CA dipasang |
| Domain yang hanya ada di jaringan kantor: `pasang noc-demo.kantor.lan --sertifikat-internal` | CA internal milik Caddy | Peringatan, sampai CA dipasang |

Memasang CA internal di laptop yang dipakai untuk demo:

```bash
deploy/scripts/server.sh sertifikat > tyio-ca.crt
```

Salin `tyio-ca.crt` ke laptop itu, lalu:
- **Windows:** klik dua kali berkasnya → Install Certificate → Local Machine → "Place all
  certificates in the following store" → **Trusted Root Certification Authorities**. Tutup
  dan buka lagi browser.
- **macOS:** buka dengan Keychain Access → keychain **System** → klik dua kali sertifikat
  "Caddy Local Authority" → Trust → **Always Trust**.
- **Android/iPhone:** lebih repot. Untuk demo di ponsel, pakai domain publik.

Bila `pasang` terhenti di tengah (mis. image belum bisa ditarik), perbaiki penyebabnya lalu
jalankan perintah yang sama lagi. Konfigurasi yang sudah dibuat dipakai ulang. Ini berlaku
untuk kedua cara.

## Memperbarui ke progres terbaru

```bash
cd /opt/tyio
deploy/scripts/server.sh perbarui
```

- Data tetap, dan migrasi database berjalan otomatis. Skrip mencetak versi sebelumnya dan
  versi yang sekarang berjalan (commit, tanggal, judul), lalu memeriksa portal lewat HTTPS.
- Aplikasi start ulang selama beberapa detik. **Jangan jalankan saat demo berlangsung.** Pengguna
  yang sedang membuka portal akan melihat "Versi baru portal tersedia".
- Bila sudah versi terbaru, aplikasi tidak di-start ulang.
- Image versi lama dihapus otomatis agar disk tidak penuh.
- Opsional, perbarui otomatis tiap malam pukul 02.00 (waktu server) lewat `crontab -e` milik
  root:

  ```
  0 2 * * * cd /opt/tyio && deploy/scripts/server.sh perbarui >> /var/log/tyio-perbarui.log 2>&1
  ```

## Sebelum demo

```bash
deploy/scripts/server.sh status        # container, versi berjalan, cek HTTPS
deploy/scripts/server.sh ulang-data    # opsional: hapus semua data, isi ulang data contoh
```

`ulang-data` menghapus **semua** tiket, remote, lampiran, dan audit, termasuk yang dibuat
saat demo sebelumnya, lalu mengisi data contoh yang sama seperti baru dipasang. Sertifikat
HTTPS tidak ikut terhapus.

### Akun contoh

Kata sandi sama untuk semua akun, dicetak saat `pasang` dan `ulang-data`, dan tersimpan di
`deploy/staging.env` (`TYIO_SEED_PASSWORD`).

| Akun | Peran | Melihat |
| --- | --- | --- |
| `helpdesk.contoh` | Helpdesk | Semua customer |
| `helpdesk.merapi` | Helpdesk | Hanya Bank Merapi Sejahtera |
| `admin.contoh` | Admin (pengelola aplikasi) | Semua customer; Admin › Master data, impor remote dari Excel |

Server yang dipasang sebelum 2026-11-18 masih punya akun lama `l1.contoh`, `l2.contoh`, dan
`l1.merapi`: semuanya sudah otomatis berperan Helpdesk setelah `perbarui`, dengan kata sandi yang
sama. Nama akun baru di atas muncul setelah `ulang-data`.

Data contoh: tiga bank rekaan dengan 25 remote masing-masing, tersebar di WIB, WITA, dan WIT.
Kategori: Remote Down, Relokasi, Reposisi, Preventive Maintenance (nilai "Remote Status"
dashboard lama). Jarkom berisi nilai contoh.

### Alur demo yang disarankan (sampai langkah 2.4, peta 2.3, dan laporan rekap NPR)

1. Masuk sebagai `helpdesk.contoh`. Halaman pertama adalah **Overview**: tiket aktif per status,
   per kategori dan customer, tren 14 hari, dan remote paling sering bermasalah. Klik sebuah
   angka (mis. Pending, atau batang hari ini): daftar Tiket terbuka dengan jumlah yang sama dan
   saringannya sebagai chip. Tunjukkan **Peta remote**: titik merah = remote dengan NPR aktif;
   hilangkan centang "Normal" agar yang bermasalah menonjol, klik titik lalu **Buka remote**.
   Lalu menu **Remote**: cari, saring, dan buka detail remote.
2. **Buat tiket untuk remote ini**: data lokasi dan jaringan terisi sendiri, dan nomor NPR
   dibuat sistem.
3. Di halaman tiket, **Tambah tindakan**: pilih jenis **Cek lokasi** (minta PIC mengecek),
   lalu **Problem** (hasil cek PIC); ubah status ke Pending dengan pihak TM atau Customer; tempel
   tangkapan layar (Ctrl+V) sebagai lampiran.
4. **Koreksi** sebuah entri. Linimasa tidak bisa diubah atau dihapus.
5. Masih di tiket itu, kartu **Trouble Ticket (TT)** → **Eskalasi To SD**: sesuaikan problem
   untuk teknisi → **Buka TT**. Nomor TT dibuat sistem, status menjadi Eskalasi, dan
   linimasa mencatatnya. Tekan **Salin ringkasan TT** lalu tempel di chat (mis. Notepad):
   teks siap kirim ke Service Delivery, dan penyalinannya tercatat. Tombol Eskalasi To SD
   hilang setelah TT dibuka: satu NPR paling banyak satu TT.
6. Tutup NPR itu: **Tambah tindakan** → jenis **Close** → waktu online kembali dan catatan
   penyelesaian. Karena ada TT, pilih part yang diganti (mis. Modem) dan lampirkan laporan
   teknisi (PDF atau foto) → **Close NPR**. Status menjadi Selesai, TT ikut ditutup, dan kartu
   Gangguan menampilkan lama gangguan. Lalu **Riwayat tiket remote ini** membuka halaman remote
   dengan semua NPR-nya.
7. Buka menu **Tiket**: tab Aktif, Milik saya, Pending, Eskalasi, dan **TT aktif**, dengan
   status, pihak yang ditunggu, no. TT, dan tanda merah "≥ 7 hari" untuk NPR yang sudah lama
   down terlihat tanpa membuka tiketnya. Lalu cari potongan nomor NPR atau TT, atau nama
   lokasi, di kotak cari header.
8. **Pembaruan langsung**: buka Overview di satu jendela browser dan daftar Tiket di jendela
   lain (atau di laptop lain). Buat tiket atau tambah tindakan di jendela kedua: angka dan
   daftar di jendela pertama berubah sendiri dalam sedetik, dengan waktu "Data diterima".
   Header menampilkan "Langsung"; matikan Wi-Fi sebentar untuk menunjukkan spanduk "Koneksi
   pembaruan langsung terputus" dan penyambungan ulang otomatis.
9. **Layar dinding**: di Overview tekan **Layar dinding** (atau buka `/dinding` di TV/monitor
   kedua), klik sekali untuk layar penuh dan bunyi. Panel berganti sendiri; buat tiket dari
   laptop lain: peringatan kuning besar muncul dan berbunyi.
10. **Laporan**: rekap NPR bulan ini (jumlah, Selesai, rata-rata dan median lama gangguan, per
   customer dan kategori, part diganti, remote terbanyak). Pilih **Bulan lalu** atau saring satu
   customer; klik angka Selesai: daftar Tiket terbuka dengan jumlah yang sama. **Unduh Excel**
   lalu buka berkasnya; **Cetak / PDF** untuk versi kertas.
11. Masuk sebagai `helpdesk.merapi` untuk menunjukkan bahwa remote, tiket, dan laporan customer
   lain tidak terlihat, juga di pencarian.
12. Masuk sebagai `admin.contoh` untuk menunjukkan Master data dan **Impor dari Excel**.

Belum ada: SLA dan laporan SLA. (Gamas tidak dibuat.)
Halaman menu yang belum dibangun menjelaskan isinya dan kapan hadir.

## Bila ada masalah

```bash
deploy/scripts/server.sh log app       # atau: log db, log migrate, log caddy (cara B)
```

| Gejala | Penyebab dan jalan keluar |
| --- | --- |
| `port 80/443 di server ini sudah dipakai` | Ada web server lain (mis. aaPanel). Pakai cara A: `pasang <domain> --panel` |
| `image ... tidak bisa ditarik` | Server tidak bisa mengakses `ghcr.io`, atau paketnya privat. Paket saat ini publik dan bisa ditarik tanpa login |
| `HTTPS: BELUM bisa diakses` | Cara A: situs, SSL, atau potongan konfigurasi di A3 belum selesai. Cara B: DNS belum mengarah ke server, atau port 80/443 tertutup firewall; lihat `log caddy` |
| `API menjawab, tetapi halaman atau berkas aplikasi (.js/.png) tidak sampai` | Konfigurasi situs aaPanel belum memakai `location ^~ /` (A3) |
| Lampiran gagal diunggah (413) | `client_max_body_size 30m;` belum ada di konfigurasi situs (A3) |
| `ada perubahan lokal di checkout ini` | Ada berkas di `/opt/tyio` yang diubah tangan. Konfigurasi server hanya di `deploy/staging.env`. Lihat `git status`, lalu kembalikan dengan `git checkout -- <berkas>` |
| Header terus menampilkan "Terputus" padahal halaman bisa dibuka | Proxy menahan atau memutus koneksi `/api/stream`. Cara A: pastikan potongan konfigurasi A3 terpasang apa adanya (`proxy_http_version 1.1`, `proxy_read_timeout 120s`) dan tidak ada aturan `location` lain untuk `/api`. Periksa dari server: `curl -N -b <cookie> https://<domain>/api/stream` harus langsung menampilkan `event: ready` |
| `stack tidak sehat` | Skrip mencetak log migrasi dan aplikasi. Versi yang lama tetap berjalan bila migrasi gagal |
| Login ditolak "terlalu banyak percobaan" | Setelah 5 kali gagal per akun atau 20 kali per alamat IP dalam 15 menit. Tunggu 15 menit |

## Batasan: hanya untuk data contoh

Server ini **belum boleh berisi data asli customer**. Yang belum ada:
- backup dan latihan restore (langkah 0.6);
- pemisahan peran database (aplikasi saat ini juga pemilik tabel audit);
- review keamanan independen sebelum produksi.

Repo ini publik, jadi image aplikasi di GHCR juga bisa ditarik siapa pun. Image tidak berisi
data atau rahasia. Kata sandi hanya ada di `deploy/staging.env` di server.
