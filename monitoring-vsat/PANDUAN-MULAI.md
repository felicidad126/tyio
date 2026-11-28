# NPR — Network Problem Report: Panduan Mulai

Proyek Kerja Praktek: Perancangan Sistem Monitoring dan Pelaporan Gangguan Jaringan VSAT Berbasis Web pada PT. Tangara Mitrakom.

## Cara cepat di Windows

Pasang Node.js 22.13 atau lebih baru. Ekstrak ZIP ke folder baru, lalu klik dua kali `MULAI-WINDOWS.cmd`. Saat pertama, skrip memasang dependensi dan menyiapkan aplikasi (beberapa menit), meminta akun admin, lalu mengisi data demo lengkap: 6 bank, 20 site, 50 NPR, 19 TT, dan 4 TT Gamas, semuanya fiktif. Browser terbuka di http://127.0.0.1:3000 (tekan F5 bila belum tampil). Biarkan jendela skrip terbuka selama aplikasi dipakai; berikutnya cukup klik dua kali lagi, data yang sudah ada tidak ditimpa. Cara lewat terminal ada di README.md, bagian "Jalankan lokal dengan data demo".

Bagian A di bawah adalah mode pengembang (`npm run dev`), dengan database terpisah yang hanya berisi bank dan site contoh, tanpa NPR.

## A. Buka proyek lengkap (mode pengembang)

1. Pada terminal proyek lama, tekan Ctrl+C untuk menghentikan web.
2. Ekstrak ZIP ini ke folder BARU, misalnya Documents/monitoring-vsat-lengkap. Simpan proyek lama sebagai cadangan; tidak perlu menyalin file satu per satu.
3. Di VS Code pilih File > Open Folder, lalu pilih folder yang berisi package.json.
4. Pilih Terminal > New Terminal.
5. Jalankan perintah ini satu per satu; tunggu tiap perintah selesai:

```powershell
npm install
npm run setup
npm run dev
```

6. Buka alamat Local yang muncul, biasanya http://localhost:5173/.
7. Saat `npm run setup` pertama kali, isi username, nama lengkap, dan password (minimal 12 karakter) untuk akun admin. Login dengan akun itu. Akun helpdesk lain dibuat lewat menu Pengguna.

`npm run setup` membuat tabel, menjalankan migrasi database, mengisi bank/site fiktif, dan meminta data akun admin jika belum ada admin. Perintah ini aman diulang: tidak menghapus tiket dan tidak menimpa akun yang sudah ada. Tidak perlu Laragon/phpMyAdmin. Database lokal paket ini terpisah dari folder proyek lama. ZIP tidak membawa data sesi atau database lokal proyek lama.

## B. Coba alur dari awal sampai selesai

1. Buka Customer & Remote. Tambah customer bank fiktif, kemudian tambah remote VSAT atau M2M. Isikan alamat, kota, provinsi, IP LAN dummy, dan pengelola/PIC.
2. Buat NPR: pilih jaringan, customer, dan remote; alamat mengikuti remote. Pilih jenis gangguan, waktu mulai, dan catatan awal. Nomor NPR final dibuat oleh server saat disimpan supaya tidak bertabrakan.
3. Buka detail NPR. Tambah Problem untuk mencatat follow-up PIC. Pilih Pending Customer atau Pending TM sesuai pihak yang ditunggu.
4. Untuk gangguan jaringan yang membutuhkan kunjungan, pilih Eskalasi Service; isi instruksi Maintenance atau Preventive Maintenance dan catatan pemeriksaan NOC. Simpan TT, kemudian unduh PDF untuk diserahkan kepada tim service secara manual. Aplikasi tidak otomatis mengirim email/WhatsApp.
5. Catat perkembangan melalui NPR. Isi Report Teknisi berupa catatan (nama teknisi disertakan jika tersedia).
6. Setelah kembali online, tutup NPR dengan waktu pulih yang benar. NPR yang memiliki TT harus mempunyai report sebelum ditutup. NPR tanpa TT dapat ditutup tanpa report teknisi.
7. Untuk gangguan massal, buka TT Gamas, pilih site terdampak dan lokasi penanganan/data center dummy. Tambahkan perkembangan, report, dan waktu pulih sebelum Close; unduh PDF TT Gamas.
8. Lihat Report NPR/histori, gunakan filter, dan unduh CSV (dapat dibuka Excel). Ekspor berupa CSV, bukan format XLSX.
9. Lihat laporan SLA berdasarkan bulan. Periksa asumsi di bagian D.

## C. Hosting di Cloudflare

Kerjakan setelah pengujian lokal selesai. Buat database D1 bernama `monitoring-vsat-db` di akun Cloudflare (`npx wrangler d1 create monitoring-vsat-db`), lalu isi `database_id` di wrangler.jsonc dengan ID yang dicetak.

1. Hentikan server lokal dengan Ctrl+C atau gunakan terminal baru.
2. Login Cloudflare:

```powershell
npx wrangler login
```

3. Siapkan database Cloudflare:

```powershell
npm run setup:remote
```

Jika belum ada admin di database Cloudflare, isi username, nama, dan password admin (minimal 12 karakter, input terlihat di terminal). Data bank/site dummy diisi, tetapi tiket uji lokal tidak diunggah. Akun yang sudah ada tidak ditimpa. Jika perlu mengganti password satu akun, jalankan `npm run password:remote`; semua sesi akun itu akan diakhiri.

4. Periksa build lalu deploy:

```powershell
npm run build
npm run deploy
```

5. Buka URL workers.dev yang muncul. Jika Workers meminta pendaftaran subdomain, ikuti pengaturan akun Cloudflare. Login dengan akun admin yang dibuat untuk database remote.
6. Coba login, buat satu NPR dummy, refresh, logout, dan login lagi pada URL online.

Tidak memerlukan domain berbayar untuk menggunakan subdomain workers.dev. Ketersediaan/kuota mengikuti ketentuan akun Cloudflare; cek dashboard jika ada permintaan pengaturan atau batas pemakaian. Dokumen teknis: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/ dan https://developers.cloudflare.com/d1/get-started/.

## D. Batas lingkup dan aturan laporan

- Dua peran: admin (semua menu, termasuk mengelola akun) dan helpdesk (semua menu kecuali Pengguna). NOC dan teknisi memberi informasi di luar aplikasi; helpdesk yang menginput hasilnya.
- Semua customer/site/PIC awal fiktif. Monitoring perangkat dilakukan di luar aplikasi. Aplikasi tidak melakukan ping, SNMP, atau mendeteksi downtime otomatis.
- Remote Status adalah jenis masalah/kegiatan, berbeda dari status proses NPR (Open, Pending, Eskalasi, Closed).
- Maintenance berarti gangguan jaringan. PM berarti perawatan tanpa downtime SLA.
- SLA adalah simulasi akademik ketersediaan per site per bulan, bukan kontrak resmi perusahaan. Target 99,5% adalah parameter demonstrasi.
- Rumus: (menit layanan periode - menit downtime yang dihitung) / menit layanan periode x 100%. Waktu layanan diasumsikan 24 jam setiap hari. Bulan berjalan dibatasi sampai waktu saat laporan diminta; bulan lampau memakai seluruh bulan, bulan mendatang tidak punya waktu observasi.
- Gunakan waktu gangguan/pulih sebenarnya, bukan waktu pengetikan report. Pending Customer dikecualikan sesuai riwayat. Perhitungan rinci di ATURAN-SLA.md.
- Gamas dihitung per site. Interval yang bertumpuk digabung agar tidak dua kali dihitung.
- Waktu input dan tampilan menggunakan WIB (UTC+7), termasuk periode SLA. Timestamp disimpan dalam UTC.
- PDF dibuat di browser. CSV dibuka melalui Excel. Dokumen yang dibuat tidak dikirim kepada orang lain secara otomatis.
- Lampiran pendukung dibatasi ukuran dan jenis; gunakan gambar/PDF simulasi. Jangan unggah data rahasia kantor.

## E. Jika ada kendala

- `npm` tidak dikenal: instal Node.js LTS, lalu tutup dan buka VS Code kembali.
- PowerShell menolak npm.ps1: ganti profil terminal menjadi Command Prompt, atau gunakan `npm.cmd` menggantikan `npm`.
- Port 5173 dipakai: gunakan alamat Local lain yang dicetak Vite, atau hentikan terminal proyek lama.
- Login gagal: pastikan menjalankan `npm run setup` pada folder proyek yang benar. Password lokal dan remote dapat berbeda.
- Ganti password lokal: `npm run password:local`, masukkan password baru, kemudian login lagi.
- Tabel tidak ditemukan: hentikan server, jalankan `npm run setup`, lalu `npm run dev`.
- API malah menampilkan halaman login: pastikan assets.run_worker_first berisi `/api/*` di wrangler.jsonc, lalu mulai ulang server.
- Memeriksa kode: `npm run build` dan `npm run lint`.
- Uji otomatis API (khusus lokal; membuat data pengujian): jalankan web di satu terminal, lalu `npm run test:api` di terminal lain. Masukkan username dan password admin lokal saat diminta.

## F. Struktur singkat

- src/: tampilan React, login dan seluruh halaman.
- worker/: API dan aturan bisnis backend.
- schema.sql: tabel aplikasi.
- seed-data.sql: bank dan remote fiktif.
- scripts/setup.mjs: persiapan database dan akun.
- wrangler.jsonc: konfigurasi deployment Cloudflare D1/Workers.

Jangan unggah node_modules, .wrangler, .dev.vars, atau berkas token/kredensial ke repository publik.
