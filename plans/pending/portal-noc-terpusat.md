# Portal NOC Terpusat (Tyio) — Rencana

Ticket: belum ada (tracker belum ditentukan)
Status: **Rekomendasi bagian 5 dan urutan rilis bagian 8 DISETUJUI.** Langkah teknis per rilis: [langkah-teknis.md](langkah-teknis.md).
Kode dimulai di branch `claude/r0-fondasi` (langkah 0.1–0.3 selesai); progres rinci di langkah-teknis.md.

## 1. Latar belakang

Perusahaan bergerak di monitoring jaringan ATM / VSAT. Tim NOC/SOC memakai dashboard
"Network Problem Report" untuk mencatat gangguan per remote (site ATM/VSAT) milik customer.
Portal baru **menggantikan total** dashboard itu dan menjadi satu pintu kerja: alert, tiket,
gangguan massal, data remote, SLA, laporan, dokumen, dan tampilan monitor 24/7.

## 2. Keputusan yang sudah diambil

| # | Keputusan | Sumber |
| --- | --- | --- |
| K1 | Ganti total; mulai dari data kosong/dummy. Tidak ada migrasi data lama. | User |
| K2 | Contoh data lama tidak tersedia; model data disusun dari screenshot. | User |
| K3 | Portal berbentuk PWA; harus mudah dikelola dan dioperasikan, tampilan ramah pengguna. | User |
| K4 | Tiket hanya boleh ditutup oleh L2–L3. **Diperjelas oleh K21.** | User |
| K5 | Gamas = gangguan massal. Gamas List mencatat kapan terjadi, lama penanganan, troubleshooting yang dikerjakan, dan penyelesaiannya. | User |
| K6 | Home = ringkasan monitoring dan analitik kejadian. | User |
| K7 | Tiket dibuat otomatis dari alert monitoring, lalu dikoreksi/diverifikasi manusia. | User |
| K8 | Sistem customer eksternal bisa membuat tiket otomatis sesuai tenant. | User |
| K9 | Notifikasi: bot Telegram, email, dan alert di dashboard (ditampilkan 24/7 di monitor). | User |
| K10 | Laporan memakai template yang kita buat. | User |
| K11 | Jarkom = Jaringan Komputer. | User |
| K12 | Sumber data status remote: SNMP/ping dari NOC dan sistem monitoring VSAT yang sudah ada. Portal menerima alert dari sana, tidak mengumpulkan metrik sendiri. | User |
| K13 | Monitoring perangkat ATM (mesin) ada di sisi bank sebagai end user; di luar lingkup versi ini. | User (tafsiran saya, perlu dikonfirmasi) |
| K14 | Agent di site ATM belum pasti; tidak direncanakan. Bila kelak dipilih, menjadi rilis tersendiri setelah R6. | User |
| K15 | Menu NPR: New NPR = buat NPR baru; Detail NPR = NPR yang masih aktif; Report NPR = riwayat (aktif maupun sudah close). | User (operator NOC) |
| K16 | **NPR ≠ TT.** Open NPR = catatan downtime suatu lokasi beserta penyebabnya (paling sering listrik padam), tanpa kunjungan. Open Ticket (TT) = eskalasi ke tim Service Delivery (SD), pasti ada kunjungan teknisi, untuk problem jarkom di lokasi. | User (operator NOC) |
| K17 | SD = Service Delivery. | User (operator NOC) |
| K18 | SLA dan master List Remote adalah ranah admin, bukan operator. | User (operator NOC) |
| K19 | Data awal: remote dummy + nama bank sebagai customer. | User (operator NOC) |
| K20 | **Tingkatan tim:** L1 = tim monitoring (pengguna utama dashboard, paling sering memantau); L2 = NOC; SD = Service Delivery (kunjungan teknisi). "Eskalasi To NOC" = eskalasi dari L1 ke L2. Isi L3 belum diketahui. | User |
| K21 | **Penutupan:** L1 boleh menutup NPR yang tidak punya TT (mis. listrik padam lalu pulih). NPR yang punya TT, dan TT itu sendiri, hanya ditutup L2 ke atas. | User |
| K22 | Data dummy memakai nama bank samaran dulu. | User |
| K23 | Tim SD tidak login ke portal; SD menerima TT lewat notifikasi. Hasil kunjungan dicatat L1/L2 di linimasa TT. | User |
| K24 | Peran L3 dibahas nanti; R0 hanya memasang L1, L2, admin. | User |
| K25 | Sampai R5, TT diteruskan ke SD secara manual lewat tombol "salin ringkasan TT"; notifikasi otomatis ke SD menyusul di R5. | User |

**Ditunda ke sesi berikutnya (bersama user):** aturan SLA, detail Gamas, arti pilihan
Take Action ("Bebas", "Cek Lokasi"), hak akses per peran, arti System / TM / SD.

## 3. Yang terbaca dari dashboard lama (10 screenshot)

**Menu:** Home · NPR (New NPR, Detail NPR, Report NPR, Service Level Agreement,
List Report Teknisi) · Gamas (Gamas List, Report) · Remote (List Remote) · Shared · profil.

**Form New NPR:** Category, Customer, Remote Name, Remote Status, Jarkom, Address, Province,
City, Date & Time, NPR Number, Created By, Notes.

**Daftar NPR:** No. NPR, No. TT, Customer, Remote Name, System, Date/Time, Last Action,
Category, Status, Pending By, Created By, Action. Filter: customer, kategori, system, pencarian.

**Detail tiket:** kepala "Remote Information" (Remote Info, Status, Contact, Problem,
Network Details) + linimasa TT (Date/Time, Taken Action, Teknisi) + linimasa NPR (Date/Time,
Taken Action, Status, Category Pending, Pending Desc., Device Failure, Prob. Cause, File,
Created By, Delete).

**Form Add Action:** data remote (NPR No, IP SNMP, IP LAN, User IP, User ID, Pengelola,
Alamat/Telp, Remote Status) + hasil (Take Action: Cek Lokasi / Problem / Eskalasi To NOC /
Bebas / Eskalasi To SD / Close; Date/Time; unggah berkas klik atau tempel; Notes; Status;
Category Pending; Pending By TM / Customer; bendera).

**Report NPR:** filter customer, rentang tanggal, system, kategori, status; ekspor Excel;
baris bisa dibuka untuk rincian tindakan.

**Yang jelas dari data:**
- Penomoran `JENIS/JARKOM/CUSTOMER/TAHUN/BULAN/urut` untuk NPR dan TT.
- TT = Trouble Ticket, dibuat dari NPR saat dieskalasi ke tim Service Delivery untuk kunjungan teknisi (K16).
- Status: PENDING, ESKALASI, CLOSE. Pending By: Customer atau TM.
- Kategori: Remote Down, Corrective Maintenance, Preventive Maintenance.

**Kelemahan yang diperbaiki di portal baru:**
- Navigasi per modul, bukan per pekerjaan; tidak ada antrean kerja atau hitung mundur SLA.
- Alamat/kota/provinsi/jarkom diketik ulang, padahal atribut remote.
- Tindakan bisa dihapus dan tanggalnya bisa diubah bebas — jejak audit dan SLA tidak andal.
- Data master remote bisa diubah dari form tindakan.
- Kolom kontak dipakai untuk catatan bebas; nomor tiket customer tidak punya kolom.
- "Take Action" dan "Status" tumpang tindih.

## 4. Referensi

Sebagian besar sumber adalah blog vendor/praktisi: panduan praktik, bukan standar resmi.

### 4.1 Cara mengemas dashboard multifungsi yang terpusat
1. "Single pane of glass" adalah arah, bukan satu layar berisi segalanya; layar yang terlalu
   penuh diabaikan.
2. Seluruh dashboard dan tiap kelompoknya terlihat sekaligus; warna punya makna tetap.
3. Tampilan per peran, bukan satu dashboard dengan tombol disembunyikan.
4. Sidebar vertikal untuk hierarki dalam; pengelompokan logis dan konsisten.
5. Fokus bergeser seiring kematangan: dari menyatukan alert + tiket ke wawasan operasional.
6. Runbook/basis pengetahuan dan pelatihan menentukan adopsi.

### 4.2 Alur tiket bertingkat (L1–L3)
- L1 = kontak pertama dan perbaikan dasar; L2 = analisis lebih dalam; L3 = ahli/arsitektur.
- Eskalasi terjadi saat L1 tidak selesai dalam jendela waktu yang disepakati (contoh vendor:
  15–30 menit); catatan, hasil tes, dan grafik ikut berpindah bersama tiket.
- Catatan serah terima terstruktur: apa yang sudah dicoba, dampak, akses yang dibutuhkan,
  apa yang sudah disampaikan ke customer.
- Sumber berbeda pendapat soal siapa yang menutup tiket; keputusan kita K4 + K21.
- Alur ITIL: deteksi → kategorisasi → penugasan → kontrol SLA → diagnosis → resolusi →
  tinjauan pasca-insiden. Jeda SLA harus beralasan dan tercatat.

**Usulan alur status (bahan diskusi dengan user):**

```
Alert masuk ──► KANDIDAT ──(L1 verifikasi)──► TERBUKA ──► DIKERJAKAN ──► SELESAI ──(L2/L3)──► DITUTUP
                   │                             │  ▲          │
                   └─► BUKAN GANGGUAN            ▼  │          ▼
                       (alarm palsu)           PENDING       ESKALASI (L2 / L3 / teknisi → TT)
                                          (Customer / TM)
```

### 4.3 Alat monitoring: apa yang dipakai di industri
- **Monitoring ATM komersial** (SIX Monitoring, MAXIMUS, FSS ATM Monitor, Diebold Nixdorf
  AllConnect, KIXOperator, NCR Atleos) memantau *kesehatan terminal* lewat agen di mesin atau
  feed dari switch. Itu wilayah bank/pengelola ATM, bukan lapisan jaringan kita. Klaim skala
  mereka berasal dari materi pemasaran dan tidak diverifikasi.
- **Lapisan jaringan** (yang relevan untuk kita) umumnya memakai NMS umum: Zabbix, LibreNMS,
  PRTG. Ketiganya bisa ICMP dan SNMP. Zabbix dan PRTG punya proxy/probe untuk lokasi
  terpencil; PRTG berbayar per sensor sehingga mahal untuk ribuan remote.
- **VSAT:** hub biasanya punya NMS bawaan vendor dengan protokol sendiri; telemetri modem/hub
  bisa butuh MIB vendor atau poller khusus. (Sebagian adalah inferensi saya.)
- **Pola alert → tiket:** ID event dari NMS jadi kunci korelasi; pemulihan memperbarui tiket
  yang sama, bukan membuat tiket baru; ID tiket harus ikut di setiap pembaruan agar tidak
  dobel; kunci deduplikasi sebaiknya host + item, bukan ID trigger.

## 5. Rekomendasi yang butuh "ya"

**R-A. Bentuk sistem: satu aplikasi (monolit modular), satu database.**
Paling mudah dikelola: satu yang di-deploy, satu yang di-backup, satu log. Modul dipisah di
dalam kode, bukan menjadi banyak layanan.

**R-B. Stack:** antarmuka web PWA (Vue 3), API TypeScript (NestJS), database PostgreSQL,
dijalankan dengan Docker Compose. Pengembangan, staging, dan pilot cukup satu server.
**Produksi memakai dua server** (utama + cadangan dengan replika database), backup
terenkripsi di lokasi lain, dan pemantauan dari luar terhadap portal itu sendiri.
Kubernetes tidak dipakai karena bertentangan dengan syarat mudah dikelola. Alasan: satu bahasa di depan dan belakang,
PostgreSQL cukup untuk tiket + laporan + antrean pekerjaan di tahap awal, dan seluruh sistem
bisa dipindah/di-restore sebagai satu paket. Komponen tambahan (antrean terpisah, cache)
baru ditambahkan bila terbukti perlu.

**R-C. Portal tidak terikat pada satu alat monitoring.** Portal punya satu "pintu masuk
alert" yang seragam; alat apa pun mengirim ke sana. Kandidat pertama: Zabbix (sumber terbuka,
ICMP + SNMP, proxy untuk lokasi jauh, tanpa biaya per sensor). Pilihan final setelah tahu
merek hub/modem VSAT yang dipakai.

**R-D. Alert menjadi tiket KANDIDAT, bukan tiket penuh.** L1 memverifikasi: benar gangguan →
jadi tiket; alarm palsu → ditandai dengan alasan. Alert berulang untuk remote yang sama
menempel ke tiket yang masih terbuka. Banyak remote turun bersamaan → portal menyarankan Gamas.

**R-E. Multi-tenant sejak awal.** Setiap customer = tenant; setiap remote, tiket, dan laporan
punya tenant. Penomoran mengikuti pola lama. Ini murah dipasang di awal, mahal bila menyusul.

**R-F. Jejak audit tidak bisa dihapus.** Tindakan dikoreksi dengan entri baru; waktu
pencatatan diisi sistem, waktu kejadian diisi terpisah.

**R-H. Waktu dan sumber data.** Semua waktu disimpan dalam UTC dan ditampilkan sesuai
WIB/WITA/WIT. Setiap alert menyimpan waktu kejadian dan waktu diterima, supaya "remote turun"
bisa dibedakan dari "datanya belum sampai".

**R-I. Keamanan dan kepatuhan sebagai syarat produksi.** TLS di semua koneksi; tidak ada data
kartu atau nasabah yang masuk ke portal; audit log siapa melihat dan mengubah apa; SSO bila
bank/perusahaan punya; checklist kebijakan bank dan ketentuan OJK (manajemen risiko TI,
lokasi data) dipenuhi sebelum R1 naik ke produksi.

**R-G. Tiga lingkungan:** pengembangan (data dummy) → staging (uji bersama user) → produksi.
Setiap rilis lewat staging dan disetujui user sebelum naik ke produksi.

## 6. Prinsip pengemasan

- **Remote sebagai pusat:** alert, tiket, Gamas, SLA, kunjungan teknisi, dan dokumen menempel
  ke remote. Halaman remote = rekam medis site.
- **Tiga lapis layar:** Overview (kondisi sekarang) → Antrean (yang harus ditindak) → Detail.
- **Dua mode tampilan:** mode kerja (operator, padat, bisa diklik) dan mode monitor 24/7
  (layar dinding, tanpa interaksi, teks besar, berputar otomatis, berbunyi saat alert kritis).
- **Navigasi per pekerjaan:** Overview · Alert · Tiket · Gamas · Remote · Laporan · Dokumen · Admin.
- **Aksi global:** pencarian (no. NPR, no. TT, no. tiket customer, nama remote) dan "Buat tiket".
- **Status + SLA selalu terlihat** di setiap baris dan detail.

## 7. Peta modul

| Modul | Isi | Asal di sistem lama |
| --- | --- | --- |
| Overview | Ringkasan monitoring + analitik kejadian; mode monitor 24/7 | Home |
| Alert | Alert masuk, verifikasi, kandidat tiket, saran Gamas | (baru) |
| Tiket (NPR) | Antrean, buat tiket, detail dengan satu linimasa NPR + TT | New/Detail NPR |
| Gamas | Kapan terjadi, durasi, remote terdampak, troubleshooting, penyelesaian | Gamas List |
| Remote | Master data site, jaringan, kontak, riwayat gangguan | List Remote |
| Kunjungan teknisi | TT dan laporan lapangan | List Report Teknisi |
| SLA | Aturan, hitung mundur, pelanggaran | Service Level Agreement |
| Laporan | Template laporan, ekspor Excel/PDF | Report NPR, Gamas Report |
| Notifikasi | Di dashboard, Telegram, email | (baru) |
| Dokumen | Berkas bersama, runbook | Shared |
| Integrasi | Pintu masuk alert, API tiket untuk sistem customer | (baru) |
| Admin | Tenant, user, peran, master kategori/system | (belum terlihat) |

## 8. Fase rilis (deploy)

Setiap rilis: dibangun dengan data dummy → naik ke staging → diuji user → naik ke produksi.
Tiap rilis berguna sendiri dan bisa dibatalkan tanpa merusak rilis sebelumnya.
Langkah teknis per rilis (file, perintah verifikasi) ditulis setelah R-A s.d. R-G disetujui.

| Rilis | Isi | Selesai bila | Bergantung pada |
| --- | --- | --- | --- |
| **R0 Fondasi** | Tiga lingkungan, kerangka PWA, login, peran dasar L1/L2/L3/admin, tenant, backup otomatis, audit log, checklist kepatuhan bank/OJK | Aplikasi bisa dipasang di perangkat, login jalan, backup bisa di-restore | Hosting diputuskan |
| **R1 Remote + Tiket** | Master remote, buat tiket (data remote terisi otomatis), linimasa tindakan, antrean, penutupan oleh L2/L3, pencarian | Satu gangguan bisa dicatat dari awal sampai ditutup tanpa sistem lama | R0, alur status disetujui |
| **R2 Overview + monitor 24/7** | Ringkasan dan analitik kejadian, peta remote berwarna status, mode layar dinding, alert di dashboard, indikator "data terakhir diterima" | Angka Overview cocok dengan daftar tiket; layar dinding jalan 24 jam tanpa disentuh | R1 |
| **R3 Gamas + laporan teknisi** | Gamas dengan remote terdampak dan tiket anak; pencatatan hasil kunjungan SD oleh L1/L2 (TT dasar pindah ke R1, lihat K16; SD tidak login, K23) | Satu Gamas menutup banyak tiket sekaligus; TT tercatat di linimasa tiket | R1, sesi Gamas |
| **R4 SLA + Laporan** | Aturan SLA, hitung mundur, jeda saat pending; template laporan + ekspor | Laporan bulanan dihasilkan tanpa olah manual di Excel | R1, sesi SLA |
| **R5 Notifikasi** | Bot Telegram dan email: tiket baru, eskalasi, SLA hampir lewat, Gamas | Notifikasi sampai dalam hitungan detik dan tidak dobel | R4 untuk SLA |
| **R6 Alert otomatis** | Pintu masuk alert dari SNMP/ping NOC dan dari sistem VSAT, kandidat tiket, verifikasi L1, deduplikasi, debounce untuk gangguan sesaat (rain fade), dugaan penyebab (link / perangkat / listrik / cuaca), saran Gamas | Remote turun di alat monitoring → kandidat muncul; pulih → tiket diperbarui | Akses ke alat SNMP dan sistem VSAT yang ada |
| **R7 Integrasi customer** | API pembuatan tiket per tenant, nomor tiket customer tersinkron | Sistem customer uji membuat tiket di tenant yang benar | R6, kebutuhan eksternal nyata |
| **R8 Go-live penuh** | Hak akses rinci, dokumen/runbook, pengerasan keamanan, pelatihan, sistem lama dimatikan | Semua shift bekerja di portal baru selama satu periode laporan | Sesi hak akses |

**Urutan dan alasannya:** R1 lebih dulu karena semua modul lain bergantung pada tiket dan
remote. R2 segera setelahnya karena layar 24/7 adalah yang paling terlihat oleh tim. R6
(alert otomatis) sengaja belakangan: paling berisiko, bergantung pada alat yang belum dipilih,
dan tiket manual harus sudah stabil sebelum dibanjiri alert.

**Yang bisa berjalan paralel:** R3 dan R4 setelah R1; riset alat monitoring (untuk R6) sejak R0.

## 9. Pertanyaan yang masih terbuka

Gerbang sekarang (jawab "ya" = setuju rekomendasi):
1. Setuju R-A s.d. R-G di bagian 5?
2. **Hosting:** server internal/on-premise atau cloud? Rekomendasi: satu server internal
   (aturan customer bank biasanya mengharuskan), dengan backup ke lokasi kedua.
3. **Urutan rilis** di bagian 8 sudah sesuai prioritas, atau ada yang harus lebih dulu?
4. **Alat monitoring yang ada:** nama produk alat SNMP di NOC dan sistem VSAT (apakah
   "Jupiter" = Hughes JUPITER?), dan apakah keduanya bisa mengirim alert keluar (webhook,
   SNMP trap, email, atau API). Ini menentukan bentuk R6.

Sesi berikutnya bersama user: aturan SLA · detail Gamas · arti Take Action · hak akses per
peran · arti System, TM, SD · isi laporan wajib · screenshot Home, Gamas, List Remote, SLA,
List Report Teknisi, Shared.

### Asumsi saya (koreksi bila salah)
1. NPR = satu catatan downtime untuk satu remote; satu NPR bisa punya nol atau lebih TT.
2. "Pending By" menghentikan jam SLA.
3. Pengguna puluhan orang; remote ribuan; tersebar di seluruh Indonesia.
4. Mode kerja dipakai di desktop; PWA di ponsel terutama untuk notifikasi dan teknisi.
5. Koneksi di ruang NOC stabil; mode offline hanya dibutuhkan teknisi lapangan (R3).
6. Antarmuka berbahasa Indonesia dengan istilah teknis tetap (NPR, TT, Gamas, SLA).

## 10. Belum ditentukan
- Langkah teknis per rilis — menunggu persetujuan bagian 5.
- Aturan SLA, alur Gamas, hak akses rinci — menunggu sesi dengan user.
- Alat monitoring dan merek hub/modem VSAT — riset berjalan sejak R0.
- Bentuk integrasi sistem customer (R7) — kabur sampai ada kebutuhan eksternal nyata.

### Sengaja ditunda (bukan ditolak)
- MQTT + store-and-forward + sertifikat per perangkat: hanya relevan bila ada agent di site (K14).
- TimescaleDB: hanya relevan bila portal menyimpan metrik sendiri. Selama metrik tinggal di
  alat monitoring dan portal menyimpan kejadian naik/turun, PostgreSQL biasa cukup; ekstensi
  ini bisa ditambahkan kemudian tanpa ganti database.
- Monitoring kesehatan mesin ATM: milik bank (K13).

## 11. Selalu / Tidak pernah
- Selalu: setiap tiket menempel ke satu remote dan satu tenant; setiap perubahan tercatat;
  status dan SLA terlihat di daftar; setiap rilis lewat staging.
- Tidak pernah: membuat ulang alat monitoring; menyalin kode/config sistem lama; memigrasi
  data lama; menghapus jejak tindakan; menaikkan ke produksi tanpa uji user.

## 12. Sumber
- https://inoc.com/blog/noc-dashboards
- https://www.inoc.com/blog/noc-best-practices-10-ways-to-improve-your-operation
- https://www.inoc.com/blog/incident-management-the-foundation-of-a-successful-noc
- https://inoc.com/blog/itil-incident-management
- https://firstwave.com/whitepapers/a-single-pane-of-glass-with-opcharts-and-nmis
- https://medium.com/site-reliability-engineering-leadership/the-single-pain-of-glass-6e42930e966
- https://www.orbix.studio/blogs/multi-tenant-dashboard-design
- https://fanruan.com/en/blog/dashboard-navigation-best-practices
- https://extnoc.com/learn/general/it-support-tiers
- https://docs.meghnacloud.com/docs/Resources/ticket-management
- https://blog.happyfox.com/ticket-escalation
- https://www.kommunicate.io/learning-center/ticket-escalation-process
- https://www.six-group.com/en/products-services/banking-services/atm-services/managed-services/monitoring.html
- https://www.maximusinfoware.in/offerings/atm-monitoring
- https://fsstech.com/fssmonitoring
- https://www.ir.com/guides/atm-monitoring-software
- https://www.zabbix.com/br/network_monitoring
- https://cloudzy.com/blog/self-hosted-prtg-solarwinds-alternatives/
- https://www.rfwireless-world.com/tutorials/vsat-nms-network-management-system-tutorial
- https://oneuptime.com/docs/as-markdown/en/integrations/zabbix
- https://support.site24x7.com/portal/en/kb/articles/preventing-duplicate-tickets-with-webhooks
- https://www.zabbix.com/forum/zabbix-help/468200-duplicate-triggers-and-alerts?p=468215

## Progres
| Rilis | Status |
| --- | --- |
| Penemuan | Berjalan — 10 screenshot, 14 keputusan tercatat |
| R0 Fondasi | Berjalan — 0.1–0.3 selesai (0.1–0.2 di `main` lewat PR #1); lihat Progres di langkah-teknis.md |
| R1–R8 | Belum mulai |
