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
| `admin.contoh` | Admin | Semua customer; Admin › Master data, impor remote dari Excel |
| `l2.contoh` | L2 NOC | Semua customer |
| `l1.contoh` | L1 Monitoring | Semua customer |
| `l1.merapi` | L1 Monitoring | Hanya Bank Merapi Sejahtera |

Data contoh: tiga bank rekaan dengan 25 remote masing-masing, tersebar di WIB, WITA, dan WIT.
Kategori: Remote Down, Relokasi, Reposisi, Preventive Maintenance (nilai "Remote Status"
dashboard lama). Jarkom berisi nilai contoh.

### Alur demo yang disarankan (sampai langkah 1.5)

1. Masuk sebagai `l1.contoh`. Tunjukkan menu, lalu **Remote**: cari, saring, dan buka detail
   remote.
2. **Buat tiket untuk remote ini**: data lokasi dan jaringan terisi sendiri, dan nomor NPR
   dibuat sistem.
3. Di halaman tiket, **Tambah tindakan**: pilih jenis **Cek lokasi** (minta PIC mengecek),
   lalu **Problem** (hasil cek PIC); ubah status ke Pending dengan pihak TM atau Customer; tempel
   tangkapan layar (Ctrl+V) sebagai lampiran.
4. **Koreksi** sebuah entri. Linimasa tidak bisa diubah atau dihapus.
5. Buka menu **Tiket**: tab Aktif, Milik saya, dan Pending, dengan status, pihak yang
   ditunggu, dan tanda merah "≥ 7 hari" untuk NPR yang sudah lama down terlihat tanpa membuka
   tiketnya. Lalu cari potongan nomor tiket atau nama lokasi
   di kotak cari header.
6. Masuk sebagai `l1.merapi` untuk menunjukkan bahwa remote dan tiket customer lain tidak
   terlihat, juga di pencarian.
7. Masuk sebagai `admin.contoh` untuk menunjukkan Master data dan **Impor dari Excel**.

Belum ada: TT ke Service Delivery, penutupan tiket, Overview, SLA, dan laporan. (Gamas tidak
dibuat.)
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
| `stack tidak sehat` | Skrip mencetak log migrasi dan aplikasi. Versi yang lama tetap berjalan bila migrasi gagal |
| Login ditolak "terlalu banyak percobaan" | Setelah 5 kali gagal per akun atau 20 kali per alamat IP dalam 15 menit. Tunggu 15 menit |

## Batasan: hanya untuk data contoh

Server ini **belum boleh berisi data asli customer**. Yang belum ada:
- backup dan latihan restore (langkah 0.6);
- pemisahan peran database (aplikasi saat ini juga pemilik tabel audit);
- review keamanan independen sebelum produksi.

Repo ini publik, jadi image aplikasi di GHCR juga bisa ditarik siapa pun. Image tidak berisi
data atau rahasia. Kata sandi hanya ada di `deploy/staging.env` di server.
