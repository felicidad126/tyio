# Checklist kepatuhan bank / OJK

Status setiap butir per **2026-11-19** (akhir langkah 0.6). Rencana R-I mensyaratkan butir yang
berlaku dipenuhi sebelum R1 naik ke produksi. Perbarui status dan bukti setiap ada perubahan.

> **Bukan nasihat hukum.** Rujukan di bawah diringkas dari halaman resmi OJK dan ringkasan pihak
> ketiga, dicek 2026-11-19. Teks lengkapnya perlu dibaca tim kepatuhan/hukum, dan persyaratan
> tiap bank customer (kuesioner vendor, perjanjian) bisa lebih ketat.

## Posisi portal

- Portal dioperasikan perusahaan NOC sebagai **pihak penyedia jasa TI (PPJTI)** bagi bank
  customer. Kewajiban POJK/PADK melekat pada **bank**; bank meneruskannya kepada kita lewat
  perjanjian dan penilaian vendor. Checklist ini menyiapkan bukti yang akan diminta bank.
- Portal **tidak menyimpan data nasabah atau data kartu** (R-I). Yang disimpan: data remote
  (lokasi ATM/cabang dan jaringannya), alert, tiket, Gamas, jejak audit, serta nama dan kontak
  staf NOC dan PIC lokasi. Nama dan kontak itu **data pribadi**, jadi UU PDP berlaku.

## Status

`Terpenuhi` · `Sebagian` · `Belum` · `Menunggu hosting` (bergantung pada keputusan hosting) ·
`Perlu konfirmasi` (bergantung pada customer atau hukum).

### A. Lokasi data dan pemulihan bencana

| # | Butir | Rujukan | Status | Bukti / catatan | Langkah berikut |
| --- | --- | --- | --- | --- | --- |
| A1 | Database, backup, dan lampiran disimpan di pusat data di Indonesia | POJK 11/2022 (penempatan sistem elektronik di Indonesia) | Menunggu hosting | Belum ada server | Pilih hosting di Indonesia (rekomendasi rencana: server internal) |
| A2 | Salinan backup di lokasi kedua (pusat pemulihan bencana) di Indonesia | POJK 11/2022 | Menunggu hosting | Backup hanya di server yang sama | Tentukan lokasi kedua; tambah penyalinan otomatis |
| A3 | Backup terjadwal dan terenkripsi | POJK 11/2022 (rencana pemulihan bencana) | Terpenuhi | Service `backup` harian, GPG kunci publik, retensi 30 hari ([backup.md](../operasi/backup.md)); diuji CI setiap push | Pasang di server staging/produksi |
| A4 | Rencana pemulihan diuji paling sedikit 1× setahun dan terdokumentasi | POJK 11/2022 | Sebagian | Latihan restore otomatis (CI) dan lokal, tercatat di [backup.md](../operasi/backup.md#riwayat-latihan-restore) | Latihan di server sungguhan; tetapkan jadwal (usul: tiap 3 bulan) |
| A5 | RPO dan RTO ditetapkan dan disepakati customer | Praktik DRP; diminta bank | Belum | Usulan RPO ≤ 24 jam; RTO diukur tiap latihan | Sepakati dengan customer |
| A6 | Backup tidak bisa dibuka dari server yang dibobol | Kerahasiaan data bank | Sebagian | Server hanya memegang kunci publik | Tunjuk dua pemegang kunci privat |

### B. Keamanan akses

| # | Butir | Rujukan | Status | Bukti / catatan | Langkah berikut |
| --- | --- | --- | --- | --- | --- |
| B1 | Kata sandi di-hash kuat; percobaan login gagal dibatasi | SEOJK 29/2022 (pengendalian akses) | Terpenuhi | argon2id, 5 gagal/email dan 20/IP per 15 menit (langkah 0.3, T19, T22) | — |
| B2 | Sesi berakhir otomatis | SEOJK 29/2022 | Terpenuhi | 30 menit idle, maks 12 jam (K28) | — |
| B3 | Akses sesuai peran dan customer; data antar customer terisolasi | POJK 11/2022 (kerahasiaan data bank) | Sebagian | Peran L1/L2/admin, isolasi tenant diuji di setiap endpoint (0.4, T28) | Hak akses rinci per peran (R8) |
| B4 | Autentikasi berlapis (MFA) atau SSO | SEOJK 29/2022 | Belum | — | R8 (T5) |
| B5 | TLS di semua koneksi | R-I | Menunggu hosting | Cookie sesi sudah Secure di staging/produksi | Pasang TLS bersama server |
| B6 | Pengerasan server: patch, firewall, akses administrasi terbatas | SEOJK 29/2022 | Menunggu hosting | Database tidak membuka port ke luar (compose staging) | Bersama server |

### C. Jejak audit dan pemantauan

| # | Butir | Rujukan | Status | Bukti / catatan | Langkah berikut |
| --- | --- | --- | --- | --- | --- |
| C1 | Setiap perubahan data tercatat: siapa, kapan, apa, dari mana; tidak bisa diubah | R-F, R-I | Sebagian | Trigger audit, tulisan tanpa pelaku ditolak, `audit_log` hanya-tambah (0.4, T24–T26) | Peran database terpisah agar pemilik DB pun tidak bisa mematikan trigger (1.7) |
| C2 | Tercatat siapa **melihat** data | R-I | Belum | Login/logout sudah tercatat | Sebelum produksi |
| C3 | Lama penyimpanan jejak audit ditetapkan | Kebijakan bank | Perlu konfirmasi | Sekarang disimpan tanpa batas | Tetapkan bersama customer |
| C4 | Kegagalan backup terlihat dan ada peringatan | Praktik operasi | Sebagian | Status `unhealthy` di compose | Peringatan ke operator (R5 atau pemantauan server) |

### D. Ketahanan dan keamanan siber

| # | Butir | Rujukan | Status | Bukti / catatan | Langkah berikut |
| --- | --- | --- | --- | --- | --- |
| D1 | Uji keamanan berkala (uji penetrasi) | SEOJK 29/2022 | Belum | — | Sebelum produksi (R8) |
| D2 | Prosedur penanganan insiden, termasuk memberi tahu bank customer cukup cepat agar bank bisa melapor ke OJK | SEOJK 29/2022 (pelaporan insiden) | Belum | — | Tulis prosedur dan kontak tiap customer |
| D3 | Dependensi dipin dan diperiksa | SEOJK 29/2022 (keamanan rantai pasok) | Sebagian | Versi dipin persis, action CI dipin SHA, versi baru dipakai setelah ≥ 2 minggu (T23) | Pemindaian kerentanan otomatis |
| D4 | Perubahan teruji dan tercatat sebelum dipasang | POJK 11/2022 (manajemen perubahan) | Terpenuhi | CI: lint, build, uji API, uji layar, latihan restore; perubahan lewat pull request | — |

### E. Pelindungan data pribadi (UU 27/2022)

| # | Butir | Rujukan | Status | Bukti / catatan | Langkah berikut |
| --- | --- | --- | --- | --- | --- |
| E1 | Tidak menyimpan data nasabah atau data kartu | R-I | Terpenuhi | Tidak ada di skema; dijaga di setiap rilis | Periksa ulang di R1 (form tiket) |
| E2 | Inventaris data pribadi yang disimpan dan tujuannya | UU 27/2022 | Belum | — | Daftar: staf NOC, PIC lokasi (R1) |
| E3 | Kata sandi tidak pernah tersimpan atau tercatat dalam bentuk asli | UU 27/2022 (keamanan data) | Terpenuhi | Hash argon2id; audit hanya mencatat "berubah" (T19, T24) | — |
| E4 | Prosedur pemberitahuan kegagalan pelindungan data | UU 27/2022 Pasal 46 (pengendali: 3×24 jam) | Belum | — | Prosedur internal; sebagai pemroses data bank, beri tahu bank lebih cepat dari tenggatnya |

### F. Hubungan dengan bank customer (PPJTI)

| # | Butir | Rujukan | Status | Bukti / catatan | Langkah berikut |
| --- | --- | --- | --- | --- | --- |
| F1 | Perjanjian memuat komitmen menjaga kerahasiaan data bank dan nasabah | POJK 11/2022 Pasal 30; PADK 1/2026 | Perlu konfirmasi | — | Periksa perjanjian tiap customer |
| F2 | Hasil audit TI oleh auditor independen disampaikan berkala ke bank | POJK 11/2022 Pasal 30 | Belum | — | Rencanakan bersama manajemen |
| F3 | Persyaratan vendor tiap bank (kuesioner, kebijakan internal bank) | PADK 1/2026 (kebijakan bank atas PPJTI) | Perlu konfirmasi | — | Minta kuesioner/persyaratan dari tiap customer |

### G. Operasional

| # | Butir | Rujukan | Status | Bukti / catatan | Langkah berikut |
| --- | --- | --- | --- | --- | --- |
| G1 | Pengembangan, staging, produksi terpisah; rilis lewat staging | R-G | Sebagian | Dev dan konfigurasi staging ada; staging diuji di CI | Server staging (hosting) |
| G2 | Dokumentasi operasi | — | Terpenuhi | Untuk R0: [menjalankan.md](../operasi/menjalankan.md), [backup.md](../operasi/backup.md) | Diperbarui tiap rilis |

## Rekap

| Status | Jumlah |
| --- | --- |
| Terpenuhi | 7 |
| Sebagian | 7 |
| Belum | 8 |
| Menunggu hosting | 4 |
| Perlu konfirmasi | 3 |
| **Jumlah butir** | **29** |

## Rujukan

- POJK 11/POJK.03/2022 tentang Penyelenggaraan Teknologi Informasi oleh Bank Umum:
  [halaman OJK](https://ojk.go.id/id/regulasi/Pages/Penyelenggaraan-Teknologi-Informasi-oleh-Bank-Umum.aspx),
  [Pasal 30 (kerja sama dengan PPJTI)](https://pasal.id/peraturan/pojk/peraturan-ojk-no-11-pojk-03-2022-tahun-2022/pasal-30)
- PADK OJK 1 Tahun 2026 (pelaksana POJK 11/2022, berlaku 1 Maret 2026; mencabut SEOJK 21/SEOJK.03/2017):
  [halaman OJK](https://ojk.go.id/id/regulasi/Pages/PADK-1-Tahun-2026-Penyelenggaraan-Teknologi-Informasi-oleh-Bank-Umum.aspx)
- SEOJK 29/SEOJK.03/2022 tentang Ketahanan dan Keamanan Siber bagi Bank Umum:
  [halaman OJK](https://ojk.go.id/id/regulasi/Pages/Ketahanan-dan-Keamanan-Siber-Bagi-Bank-Umum.aspx)
- UU 27/2022 tentang Pelindungan Data Pribadi:
  [Pasal 46 (pemberitahuan kegagalan pelindungan data)](https://pasal.id/peraturan/uu/uu-no-27-tahun-2022/pasal-46)
