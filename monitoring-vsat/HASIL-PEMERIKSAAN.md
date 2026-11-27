# Hasil pemeriksaan paket

- `npm run build`: berhasil (TypeScript, bundle frontend dan Workers).
- `npm run lint`: berhasil, tanpa error.
- Uji integrasi API: 20 pemeriksaan berhasil, mencakup autentikasi, sesi, logout, origin, customer/remote, NPR, TT, report wajib, PM, Gamas, dan SLA.
- Uji tampilan DOM: login dengan backend asli, membuka 9 menu, dan mengirim form New NPR berhasil tanpa error JavaScript.
- Perhitungan SLA diuji untuk satu bulan penuh WIB, Pending Customer, PM, dan tumpang tindih Gamas/NPR.
- Pemeriksaan pada database lokal saja. Data QA tidak disertakan dalam ZIP.
- Browser Chromium tidak dapat dijalankan di lingkungan pemeriksaan karena pembatasan socket. Uji DOM tidak membuktikan kesempurnaan visual atau unduhan PDF di browser; lakukan uji penerimaan di Chrome laptop melalui alur dalam PANDUAN-MULAI.md.
- Belum dideploy ke akun Cloudflare. Pengguna menjalankan langkah hosting pada panduan dengan akun miliknya.

## Uji penerimaan di laptop

1. Login salah -> popup; login benar -> Dashboard; refresh tetap masuk.
2. Pilih Customer dan remote pada New NPR -> alamat, kota, provinsi, IP LAN dan PIC otomatis.
3. Submit NPR -> Detail NPR -> Problem/Pending Customer -> Close tanpa TT.
4. NPR lain -> Eskalasi Service -> Maintenance -> Send Trouble Ticket -> unduh PDF; isi report teknisi sebelum Close.
5. TT PM tidak menambah downtime SLA.
6. Buat Gamas untuk beberapa site -> PDF -> report -> Close.
7. Report NPR -> filter tanggal/status/customer -> CSV dan histori.
8. Laporan SLA -> pilih bulan dan ekspor CSV.
9. Logout -> kembali ke login.
