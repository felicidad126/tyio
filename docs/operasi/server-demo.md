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
| Ukuran | Perkiraan untuk demo: 2 vCPU, minimal 2 GB RAM (4 GB lebih lega), 20 GB disk |
| Perangkat lunak | Docker Engine dengan plugin Compose v2, `git`, `curl`, `openssl` |
| Jaringan | Port **80** dan **443** terbuka ke arah penonton. Server perlu bisa mengakses `github.com` dan `ghcr.io` |
| Alamat | Disarankan **subdomain** (mis. `noc-demo.perusahaan.co.id`) dengan DNS A mengarah ke IP server |

Memasang Docker di Ubuntu: ikuti https://docs.docker.com/engine/install/ubuntu/ (paket
`docker-ce` dan `docker-compose-plugin`). Jalankan skrip sebagai root, atau sebagai pengguna
anggota grup `docker`.

## Pasang pertama kali

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

Bila terhenti di tengah (mis. image belum bisa ditarik), perbaiki penyebabnya lalu jalankan
perintah yang sama lagi. Konfigurasi yang sudah dibuat dipakai ulang.

### Sertifikat HTTPS

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

## Memperbarui ke progres terbaru

```bash
cd /opt/tyio
deploy/scripts/server.sh perbarui
```

- Data tetap, dan migrasi database berjalan otomatis. Skrip mencetak versi sebelumnya dan
  versi yang sekarang berjalan (commit, tanggal, judul).
- Aplikasi start ulang selama beberapa detik. **Jangan jalankan saat demo berlangsung.** Pengguna
  yang sedang membuka portal akan melihat "Versi baru portal tersedia".
- Bila sudah versi terbaru, tidak ada yang diubah.
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
Kategori dari dashboard lama; System dan Jarkom berisi nilai contoh.

### Alur demo yang disarankan (sampai langkah 1.4)

1. Masuk sebagai `l1.contoh`. Tunjukkan menu, lalu **Remote**: cari, saring, dan buka detail
   remote.
2. **Buat tiket untuk remote ini**: data lokasi dan jaringan terisi sendiri, dan nomor NPR
   dibuat sistem.
3. Di halaman tiket, **Tambah tindakan**: ubah status, pending dengan pihak dan alasan, lalu
   tempel tangkapan layar (Ctrl+V) sebagai lampiran.
4. **Koreksi** sebuah entri. Linimasa tidak bisa diubah atau dihapus.
5. Masuk sebagai `l1.merapi` untuk menunjukkan bahwa remote dan tiket customer lain tidak
   terlihat.
6. Masuk sebagai `admin.contoh` untuk menunjukkan Master data dan **Impor dari Excel**.

Belum ada: daftar/antrean tiket (1.5), TT ke Service Delivery, penutupan tiket, Overview,
Gamas, SLA, dan laporan. Halaman menu yang belum dibangun menjelaskan isinya dan kapan hadir.

## Bila ada masalah

```bash
deploy/scripts/server.sh log app       # atau: log caddy, log db, log migrate
```

| Gejala | Penyebab dan jalan keluar |
| --- | --- |
| `image ... tidak bisa ditarik` | Paket di GHCR masih privat. Di GitHub: profil → Packages → `tyio` → Package settings → Change visibility → Public. Atau login dengan token yang punya izin `read:packages`: `docker login ghcr.io -u <pengguna-github>` |
| `HTTPS: BELUM bisa diakses` (domain publik) | DNS belum mengarah ke server, atau port 80/443 tertutup firewall. Lihat `log caddy`. Setelah diperbaiki, Caddy mencoba lagi sendiri |
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
