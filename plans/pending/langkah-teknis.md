# Portal NOC Terpusat — Langkah teknis per rilis

Induk: [portal-noc-terpusat.md](portal-noc-terpusat.md) (keputusan K1–K14, rekomendasi R-A s.d. R-I — disetujui).
Status: **DRAFT — menunggu persetujuan sebelum kode pertama ditulis.**

Cara baca: tiap langkah satu alur utuh (data → API → layar), berukuran S atau M, dengan
kriteria terima, perintah verifikasi, dan langkah yang harus selesai lebih dulu.
Langkah yang semua pendahulunya selesai boleh dikerjakan paralel.

## A. Keputusan teknis turunan

| # | Keputusan | Alasan |
| --- | --- | --- |
| T1 | Satu repo (monorepo pnpm): `apps/api`, `apps/web`, `packages/shared`, `deploy/`, `docs/` | Satu versi, satu rilis; tipe data dipakai bersama depan–belakang |
| T2 | API NestJS, satu modul per domain di `apps/api/src/modules/<nama>` | Monolit modular (R-A) |
| T3 | PostgreSQL + TypeORM dengan migrasi; setiap migrasi punya jalur turun | Rilis bisa dibatalkan |
| T4 | Web Vue 3 + Vite + Pinia + Vue Router, komponen Tabler, PWA lewat plugin Vite | Tampilan admin siap pakai, mudah dirawat |
| T5 | Login sesi dengan cookie httpOnly; kata sandi di-hash argon2; SSO menyusul di R8 | Lebih sederhana dan lebih aman daripada token di browser |
| T6 | Data langsung ke layar memakai SSE (server-sent events) | Cukup untuk layar 24/7; lebih sederhana daripada WebSocket |
| T7 | Pekerjaan latar (notifikasi, SLA, laporan) memakai antrean berbasis PostgreSQL | Tidak menambah komponen baru (R-B) |
| T8 | Lampiran disimpan di volume disk yang ikut backup; nama berkas diacak | Paling sederhana; bisa dipindah ke penyimpanan objek kelak |
| T9 | Setiap tabel domain punya `tenant_id`; penyaringan tenant dipasang di satu tempat (lapisan repositori), bukan di tiap query | Satu titik kebocoran yang dijaga dan diuji |
| T10 | Linimasa tiket hanya-tambah: tidak ada UPDATE/DELETE pada tabel tindakan | R-F |
| T11 | Uji: Vitest + database PostgreSQL asli untuk API; Playwright untuk alur layar | Uji di jahitan tinggi, bukan mock |
| T12 | Waktu `timestamptz` UTC; zona tampilan mengikuti lokasi remote, dengan pilihan zona pengguna | R-H |

Perintah verifikasi yang dipakai di bawah: `pnpm test:api <pola>` (uji API),
`pnpm e2e <berkas>` (uji layar), `pnpm lint`, `pnpm build`.

## B. Rilis

### R0 — Fondasi
Selesai bila: aplikasi bisa dipasang di perangkat, login jalan, backup bisa di-restore.

**0.1 Kerangka repo dan pipeline (S)**
- Terima: `pnpm build` dan `pnpm lint` lulus di repo kosong; CI menjalankan keduanya + uji di setiap push.
- Verifikasi: `pnpm lint && pnpm build && pnpm test:api health`
- Berkas: `package.json`, `pnpm-workspace.yaml`, `apps/api/`, `apps/web/`, `packages/shared/`, `.github/workflows/ci.yml`
- Uji di: endpoint `/health` · Menunggu: tidak ada

**0.2 Lingkungan lokal dan staging (S)**
- Terima: satu perintah menyalakan API + web + database dengan data dummy; staging dipasang dari artefak CI yang sama.
- Verifikasi: `pnpm dev:up && pnpm e2e smoke`
- Berkas: `deploy/compose.dev.yml`, `deploy/compose.staging.yml`, `apps/api/src/seed/`, `docs/operasi/menjalankan.md`
- Uji di: halaman login terbuka · Menunggu: 0.1

**0.3 Tenant, pengguna, login (M)**
- Terima: login/logout dengan sesi; pengguna terikat ke tenant dan peran (L1, L2, L3, admin); percobaan login gagal dibatasi.
- Verifikasi: `pnpm test:api auth && pnpm e2e auth`
- Berkas: `apps/api/src/modules/{tenants,users,auth}/`, `apps/web/src/pages/login/`, migrasi awal
- Uji di: `POST /auth/login`, alur login di browser · Menunggu: 0.2

**0.4 Isolasi tenant dan audit log (M)**
- Terima: pengguna tenant A tidak bisa membaca data tenant B lewat API mana pun; setiap perubahan data tercatat (siapa, kapan, apa, dari mana).
- Verifikasi: `pnpm test:api tenant-isolation audit`
- Berkas: `apps/api/src/common/{tenant,audit}/`
- Uji di: uji lintas-tenant yang berjalan terhadap semua endpoint terdaftar · Menunggu: 0.3

**0.5 Kerangka PWA dan navigasi (S)**
- Terima: aplikasi bisa dipasang di desktop dan ponsel; menu Overview · Alert · Tiket · Gamas · Remote · Laporan · Dokumen · Admin tampil sesuai peran; layout dipakai dari 375px sampai layar dinding.
- Verifikasi: `pnpm e2e shell`
- Berkas: `apps/web/src/{layouts,router,stores}/`, manifest PWA
- Uji di: navigasi per peran · Menunggu: 0.3

**0.6 Backup, restore, dan checklist kepatuhan (S)**
- Terima: backup terjadwal terenkripsi; latihan restore ke server bersih berhasil dan terdokumentasi; checklist bank/OJK terisi dengan status tiap butir.
- Verifikasi: `deploy/scripts/latihan-restore.sh` (keluar 0 bila data hasil restore cocok)
- Berkas: `deploy/scripts/`, `docs/operasi/backup.md`, `docs/kepatuhan/checklist.md`
- Uji di: latihan restore · Menunggu: 0.2 · **Butuh: keputusan hosting**

### R1 — Remote + Tiket
Selesai bila: satu gangguan tercatat dari awal sampai ditutup tanpa sistem lama.

**1.1 Master data: customer, kategori, system, jarkom (S)**
- Terima: admin mengelola daftar; nilai tidak bisa dihapus bila sudah dipakai (hanya dinonaktifkan).
- Verifikasi: `pnpm test:api master`
- Berkas: `apps/api/src/modules/master/`, `apps/web/src/pages/admin/master/`
- Menunggu: 0.4, 0.5

**1.2 Remote: daftar, detail, impor (M)**
- Terima: remote menyimpan identitas, lokasi (alamat, kota, provinsi, koordinat, zona waktu), jaringan (IP SNMP, IP LAN, user IP/ID), kontak terstruktur, kanwil/kanca, tanggal online, status; impor dari Excel dengan laporan baris gagal; daftar bisa dicari dan disaring untuk ribuan baris.
- Verifikasi: `pnpm test:api remotes && pnpm e2e remotes`
- Berkas: `apps/api/src/modules/remotes/`, `apps/web/src/pages/remotes/`
- Uji di: impor 5.000 baris dummy, pencarian · Menunggu: 1.1

**1.3 Buat tiket (M)**
- Terima: pilih remote → data lokasi dan jaringan terisi otomatis dan hanya-baca; nomor `NPR/JARKOM/CUSTOMER/TAHUN/BULAN/urut` dibuat sistem tanpa bentrok saat dua operator menyimpan bersamaan; remote dengan tiket terbuka memberi peringatan.
- Verifikasi: `pnpm test:api tickets.create && pnpm e2e ticket-create`
- Berkas: `apps/api/src/modules/tickets/`, `apps/web/src/pages/tickets/new/`
- Uji di: `POST /tickets` termasuk uji serentak · Menunggu: 1.2

**1.4 Linimasa tindakan dan mesin status (M)**
- Terima: tindakan hanya bisa ditambah; koreksi adalah entri baru yang merujuk entri lama; perpindahan status hanya lewat jalur yang sah; pending wajib memilih pihak (Customer/TM) dan alasan; lampiran lewat klik atau tempel; nomor tiket customer punya kolom sendiri.
- Verifikasi: `pnpm test:api tickets.actions tickets.status && pnpm e2e ticket-detail`
- Berkas: `apps/api/src/modules/tickets/{actions,status}/`, `apps/web/src/pages/tickets/detail/`
- Uji di: tabel transisi status · Menunggu: 1.3 · **Butuh: alur status disetujui user**

**1.5 Antrean tiket dan pencarian global (M)**
- Terima: daftar dengan filter tersimpan (milik saya, pending, eskalasi), kolom status dan pending menonjol; pencarian global menemukan no. NPR, no. TT, no. tiket customer, nama remote.
- Verifikasi: `pnpm test:api tickets.list search && pnpm e2e ticket-queue`
- Berkas: `apps/web/src/pages/tickets/list/`, `apps/api/src/modules/search/`
- Menunggu: 1.4

**1.5b Open Ticket (TT) ke Service Delivery (M)** — dipindah dari 3.2 (K16)
- Terima: dari NPR aktif, operator membuat TT bernomor `TT/…` berisi problem jarkom dan lokasi; TT tampil di linimasa NPR yang sama; satu NPR bisa punya lebih dari satu TT; daftar TT aktif terpisah dari daftar NPR aktif.
- Verifikasi: `pnpm test:api trouble-tickets && pnpm e2e tt`
- Berkas: `apps/api/src/modules/trouble-tickets/`, `apps/web/src/pages/tickets/tt/`
- Menunggu: 1.4

**1.6 Penutupan oleh L2/L3 dan halaman riwayat remote (S)**
- Terima: L1 tidak bisa menutup (ditolak API, bukan hanya tombol disembunyikan); penutupan wajib isi penyebab dan penyelesaian; halaman remote menampilkan seluruh riwayat tiketnya.
- Verifikasi: `pnpm test:api tickets.close && pnpm e2e ticket-close`
- Menunggu: 1.4

**1.7 Produksi pertama (M)**
- Terima: dua server dengan replika database; latihan pindah ke server cadangan berhasil; pemantauan dari luar aktif; TLS di semua koneksi.
- Verifikasi: `deploy/scripts/latihan-failover.sh` + uji asap di produksi
- Berkas: `deploy/compose.prod.yml`, `docs/operasi/{rilis,failover}.md`
- Menunggu: 0.6, 1.6 · **Butuh: server produksi**

### R2 — Overview + monitor 24/7
Selesai bila: angka Overview cocok dengan daftar tiket; layar dinding jalan 24 jam tanpa disentuh.

**2.1 Ringkasan dan analitik kejadian (M)**
- Terima: jumlah tiket per status, per kategori, per customer; tren harian; remote paling sering bermasalah; setiap angka bisa diklik menuju daftar yang jumlahnya sama persis.
- Verifikasi: `pnpm test:api overview` (angka dibandingkan dengan query daftar)
- Berkas: `apps/api/src/modules/overview/`, `apps/web/src/pages/overview/`
- Menunggu: 1.5

**2.2 Pembaruan langsung dan alert di dashboard (S)**
- Terima: tiket baru/berubah muncul tanpa muat ulang; koneksi putus terlihat jelas dan menyambung sendiri; setiap panel menampilkan "data terakhir diterima".
- Verifikasi: `pnpm test:api stream && pnpm e2e live-update`
- Berkas: `apps/api/src/modules/stream/`, `apps/web/src/composables/useStream.ts`
- Menunggu: 2.1

**2.3 Peta remote (M)**
- Terima: marker berkelompok, warna sesuai status, klik menuju remote; lancar dengan ribuan titik.
- Verifikasi: `pnpm e2e map`
- Berkas: `apps/web/src/pages/overview/map/`
- Menunggu: 2.1 · **Belum jelas: sumber ubin peta bila jaringan NOC tertutup dari internet**

**2.4 Mode layar dinding (S)**
- Terima: tanpa interaksi, teks terbaca dari jauh, berputar antarpanel, bunyi saat kejadian kritis, tidak keluar sesi sendiri, pulih sendiri setelah jaringan putus.
- Verifikasi: `pnpm e2e wall` + uji rendam 24 jam di staging
- Berkas: `apps/web/src/pages/wall/`
- Menunggu: 2.2

### R3 — Gamas + laporan teknisi
Selesai bila: satu Gamas menutup banyak tiket sekaligus; TT tercatat di linimasa tiket.

**3.1 Gamas: buat, tautkan, tutup (M)**
- Terima: Gamas menyimpan waktu mulai/selesai, durasi, penyebab, troubleshooting, penyelesaian; remote dan tiket bisa ditautkan massal; menutup Gamas menawarkan penutupan tiket anak.
- Verifikasi: `pnpm test:api gamas && pnpm e2e gamas`
- Berkas: `apps/api/src/modules/gamas/`, `apps/web/src/pages/gamas/`
- Menunggu: 1.6 · **Butuh: sesi detail Gamas**

**3.2 Penugasan teknisi pada TT (S)** — TT dasar sudah dibuat di 1.5b
- Terima: eskalasi ke lapangan membuat TT bernomor `TT/…`; tindakan TT tampil di linimasa tiket yang sama; satu tiket bisa punya lebih dari satu TT.
- Verifikasi: `pnpm test:api trouble-tickets && pnpm e2e tt`
- Berkas: `apps/api/src/modules/trouble-tickets/`
- Menunggu: 1.5b · **Butuh: arti Eskalasi To NOC**

**3.3 Laporan lapangan di ponsel (M)**
- Terima: teknisi mengisi laporan dan foto dari ponsel; isian tersimpan saat sinyal hilang dan terkirim saat tersambung.
- Verifikasi: `pnpm e2e field-report` (dengan simulasi offline)
- Berkas: `apps/web/src/pages/field/`
- Menunggu: 3.2 · **Butuh: keputusan apakah teknisi ikut login**

### R4 — SLA + Laporan
Selesai bila: laporan bulanan dihasilkan tanpa olah manual di Excel.

**4.1 Aturan SLA dan jam berjalan (M)**
- Terima: aturan per tenant/kategori; jam berhenti saat pending sesuai aturan; hitung mundur tampil di antrean dan detail; pelanggaran tercatat. Jam dihitung dari linimasa, bukan disimpan sebagai angka.
- Verifikasi: `pnpm test:api sla` (tabel skenario waktu)
- Berkas: `apps/api/src/modules/sla/`
- Menunggu: 1.4 · **Butuh: sesi aturan SLA**

**4.2 Template laporan dan ekspor (M)**
- Terima: laporan NPR, Gamas, SLA, dan teknisi dengan filter periode/customer/kategori; ekspor Excel dan PDF; laporan besar dikerjakan di latar dan diunduh saat siap.
- Verifikasi: `pnpm test:api reports && pnpm e2e reports`
- Berkas: `apps/api/src/modules/reports/`, `apps/web/src/pages/reports/`
- Menunggu: 4.1, 3.1 · **Butuh: contoh laporan wajib**

### R5 — Notifikasi
Selesai bila: notifikasi sampai cepat dan tidak dobel.

**5.1 Mesin notifikasi dan pusat notifikasi di aplikasi (M)**
- Terima: kejadian (tiket baru, eskalasi, SLA hampir lewat, Gamas) menjadi notifikasi lewat antrean; kiriman gagal dicoba ulang; satu kejadian satu notifikasi per penerima per kanal.
- Verifikasi: `pnpm test:api notifications`
- Berkas: `apps/api/src/modules/notifications/`
- Menunggu: 2.2

**5.2 Kanal Telegram dan email (S + S)**
- Terima: bot mengirim ke grup per tenant/shift; email memakai template; pengguna mengatur kanal yang diterima.
- Verifikasi: `pnpm test:api notifications.telegram notifications.email` (dengan penerima tiruan)
- Menunggu: 5.1 · **Butuh: akun bot dan server email**

### R6 — Alert otomatis
Selesai bila: remote turun di alat monitoring → kandidat muncul; pulih → tiket diperbarui.

**6.0 Uji coba sambungan (S, eksperimen)**
- Terima: satu alert nyata dari alat SNMP dan satu dari sistem VSAT berhasil diterima di staging; bentuk datanya terdokumentasi.
- Verifikasi: catatan di `docs/integrasi/sumber-alert.md`
- Menunggu: 0.2 (boleh mulai sejak R0) · **Butuh: nama produk + akses**

**6.1 Pintu masuk alert dan kandidat tiket (M)**
- Terima: alert dipetakan ke remote lewat IP/ID; disimpan dengan waktu kejadian dan waktu diterima; alert berulang menempel ke kandidat/tiket yang terbuka; alert yang tidak cocok dengan remote mana pun masuk daftar tersendiri.
- Verifikasi: `pnpm test:api alerts.ingest alerts.dedup`
- Berkas: `apps/api/src/modules/alerts/`
- Menunggu: 6.0, 1.4

**6.2 Verifikasi L1, debounce, pemulihan (M)**
- Terima: L1 mengubah kandidat jadi tiket atau menandai bukan gangguan dengan alasan; gangguan lebih singkat dari ambang tidak menjadi kandidat; alert pulih memperbarui tiket yang sama.
- Verifikasi: `pnpm test:api alerts.verify alerts.debounce && pnpm e2e alerts`
- Berkas: `apps/web/src/pages/alerts/`
- Menunggu: 6.1

**6.3 Dugaan penyebab dan saran Gamas (M)**
- Terima: kandidat diberi dugaan (link / perangkat / listrik / cuaca) dari gabungan data SNMP dan VSAT; banyak remote turun dalam satu jendela waktu pada hub/wilayah yang sama memunculkan saran Gamas.
- Verifikasi: `pnpm test:api alerts.classify alerts.gamas-suggest`
- Menunggu: 6.2, 3.1

### R7 — Integrasi customer
**7.1 API tiket per tenant (M)** — kunci API per tenant, pembuatan tiket yang aman diulang (kunci idempoten), nomor tiket customer tersimpan, batas laju. Verifikasi: `pnpm test:api public-api`. Menunggu: 6.1.
**Belum jelas:** bentuk sistem customer; dirinci saat ada kebutuhan eksternal nyata.

### R8 — Go-live penuh
**8.1 Hak akses rinci (M)** — matriks izin per peran, diuji per endpoint. Menunggu: sesi hak akses.
**8.2 SSO (S)** — bila tersedia. **8.3 Dokumen dan runbook (M)** — berkas bersama, runbook tertaut ke kategori tiket.
**8.4 Pengerasan dan uji beban (M)** — tinjauan keamanan, uji beban dengan data setara satu tahun.
**8.5 Pelatihan dan pemadaman sistem lama (S).**

## C. Urutan dan titik periksa

```
0.1 → 0.2 → 0.3 → 0.4 ─┬→ 1.1 → 1.2 → 1.3 → 1.4 ─┬→ 1.5 → 2.1 → 2.2 → 2.4
              └→ 0.5 ──┘                         ├→ 1.6 → 1.7       └→ 5.1 → 5.2
        0.2 → 0.6                                ├→ 3.1 ┐  2.1 → 2.3
        0.2 → 6.0 (eksperimen, paralel)          ├→ 3.2 → 3.3
                                                 ├→ 4.1 → 4.2
                                                 └→ 6.1 → 6.2 → 6.3 → 7.1
```

Titik periksa dengan user: setelah 0.5 (kerangka terlihat), 1.4 (alur tiket), 1.7 (produksi
pertama), 2.4 (layar dinding), lalu di akhir tiap rilis.

Langkah paling berisiko dikerjakan paling awal di rilisnya: 0.4 (isolasi tenant),
1.3 (penomoran serentak), 1.4 (mesin status), 6.0 (sambungan ke alat yang belum dikenal).

## D. Yang harus tersedia agar tidak tertahan

| Dibutuhkan | Untuk langkah | Dari |
| --- | --- | --- |
| Keputusan hosting + server staging | 0.6 | Anda |
| Alur status tiket disetujui | 1.4 | Sesi dengan user |
| Server produksi (dua unit) | 1.7 | Anda |
| Detail Gamas, arti eskalasi/Take Action | 3.1, 3.2 | Sesi dengan user |
| Aturan SLA, contoh laporan wajib | 4.1, 4.2 | Sesi dengan user |
| Akun bot Telegram, server email | 5.2 | Anda |
| Nama produk + akses alat SNMP dan sistem VSAT | 6.0 | Tim NOC |
| Matriks hak akses | 8.1 | Sesi dengan user |

Langkah 0.1–0.5 dan 1.1–1.3 tidak bergantung pada siapa pun dan bisa mulai begitu disetujui.

## E. Selalu / Tidak pernah (teknis)
- Selalu: migrasi punya jalur turun; aturan izin ditegakkan di API; setiap endpoint baru ikut uji isolasi tenant; rilis lewat staging.
- Tidak pernah: UPDATE/DELETE pada linimasa; rahasia (kata sandi, token) di dalam repo; data kartu/nasabah di portal; komponen infrastruktur baru tanpa keputusan tercatat.

## Progres
| Langkah | Status |
| --- | --- |
| Semua | Belum mulai — menunggu persetujuan |
