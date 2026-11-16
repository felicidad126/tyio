# Portal NOC Terpusat (Tyio) — Rencana

Ticket: belum ada (repo masih kosong, tracker belum ditentukan)
Status: **DRAFT — menunggu jawaban pertanyaan & persetujuan.** Belum ada kode atau config yang dibuat.

## 1. Latar belakang

Perusahaan bergerak di monitoring jaringan ATM / VSAT. Tim NOC/SOC memakai dashboard
"Network Problem Report" untuk mencatat gangguan per remote (site ATM/VSAT) milik customer
(mis. bank). Portal baru menggantikan/menyatukan dashboard itu menjadi satu pintu kerja
(*centralized*): tiket, gangguan massal, data remote, SLA, laporan, dan dokumen bersama.

## 2. Yang terbaca dari dashboard existing (5 screenshot)

| Menu | Sub-menu | Tafsiran saya (perlu dikonfirmasi) |
| --- | --- | --- |
| Home | — | Halaman awal |
| NPR | New NPR, Detail NPR, Report NPR, Service Level Agreement, List Report Teknisi | Tiket gangguan per remote + laporan + SLA + laporan teknisi lapangan |
| Gamas | Gamas List, Report | Gangguan massal (satu penyebab, banyak remote) |
| Remote | List Remote | Master data site/remote |
| Shared | (isi belum terlihat) | Dokumen/berkas bersama |
| Profil user | (isi belum terlihat) | Akun |

**Form New NPR:** Category, Customer, Remote Name, Remote Status, Jarkom, Address, Province,
City, Date & Time, NPR Number, Created By, Notes.

**Tabel Detail NPR:** No, No. NPR, No. TT, Customer, Remote Name, System, Date/Time,
Last Action, Category, Status, Pending By, Created By, Action. Filter: customer, kategori
(contoh: Corrective Maintenance), system, pencarian bebas.

**Kelemahan yang terlihat (bahan perbaikan):**
- Navigasi disusun per *modul*, bukan per *pekerjaan*. Operator harus tahu harus buka menu mana.
- Address/Province/City/Jarkom diketik ulang di form, padahal itu atribut remote — seharusnya
  terisi otomatis begitu remote dipilih.
- Tidak terlihat antrean kerja ("apa yang harus saya kerjakan sekarang"), hitung mundur SLA,
  atau hubungan NPR ↔ Gamas.
- Tabel 13 kolom tanpa prioritas visual; status dan "Pending By" tidak menonjol.

### Tambahan dari screenshot gelombang 2 (detail tiket, Add Action, Report NPR)

**Halaman detail tiket** = kepala "Remote Information" + dua linimasa:
- Kepala: Remote Info (Name berupa ID remote, Location, City, Province) · Status (Status,
  Type mis. ATM, Escalate) · Contact (Name, Phone, Position) · Problem (Failure, Cause,
  Pending) · Network Details (IP SNMP, IP LAN, User IP).
- Linimasa TT: No, Date/Time, Taken Action, Teknisi.
- Linimasa NPR: Date/Time, Taken Action, Status, Category Pending, Pending Desc.,
  Device Failure, Prob. Cause, File, Created By, Delete.

**Form Add Action:** kiri "Process Methods" (NPR No, IP SNMP, IP LAN #1/#2, User IP #1/#2,
User ID #1/#2, Pengelola, Alamat/Telp, Remote Status); kanan "Results of the Process"
(Take Action: Cek Lokasi / Problem / Eskalasi To NOC / Bebas / Eskalasi To SD / Close;
Date/Time; unggah berkas dengan klik atau tempel; Notes; Status; Category Pending;
Pending By TM / Customer; penanda bendera).

**Report NPR:** filter customer, rentang tanggal, system, kategori, status, pencarian; ekspor
Excel; kolom NPR No, Notiket, Customer, Remote Name, Start, Close, Location, Category, System,
Status; baris bisa dibuka untuk melihat rincian tindakan.

**Yang sekarang jelas:**
- Penomoran: `JENIS/JARKOM/CUSTOMER/TAHUN/BULAN/urut` (NPR/… dan TT/…).
- **TT = Trouble Ticket internal** yang dibuat dari NPR saat dieskalasi untuk penugasan
  teknisi — bukan nomor tiket pihak luar (koreksi asumsi awal).
- Status tiket: PENDING, ESKALASI, CLOSE. Pending By: Customer atau TM (pihak internal).
- Kategori: Remote Down, Corrective Maintenance, Preventive Maintenance.
- "System" = platform satelit/layanan yang dipakai remote.
- Nomor tiket milik customer saat ini diketik di teks bebas pada catatan tindakan.

**Kelemahan tambahan:**
- Setiap baris tindakan punya tombol hapus, dan tanggal tindakan bisa diubah bebas — jejak
  audit dan perhitungan SLA tidak bisa dipercaya.
- Data master remote (IP, pengelola, alamat) bisa diubah dari form tindakan.
- Kolom kontak dipakai untuk catatan bebas (tanggal online, kanwil, kanca) — butuh kolom
  terstruktur sendiri.
- Nomor tiket customer tidak punya kolom, jadi tidak bisa dicari atau dilaporkan.
- Hasil ping ditempel sebagai teks mentah; Failure/Cause di kepala sering kosong.
- "Take Action" dan "Status" tumpang tindih (Close ada di keduanya).

**Implikasi desain:**
- Detail tiket: kepala remote ringkas (hanya-baca, tautan ke halaman remote), satu linimasa
  gabungan NPR + TT, dan form tindakan singkat yang hanya berisi hasil tindakan.
- Tindakan tidak bisa dihapus; koreksi dicatat sebagai entri baru. Waktu diisi sistem,
  waktu kejadian boleh diisi terpisah.
- Kolom terstruktur: nomor tiket customer, penyebab, perangkat rusak, kanwil/kanca,
  tanggal online.
- Jenis tindakan menentukan status berikutnya (satu pilihan, bukan dua).

## 3. Referensi: cara mengemas dashboard multifungsi yang terpusat

Ringkasan riset (sumber di bagian 9). Sebagian besar sumber adalah blog vendor/praktisi,
jadi diperlakukan sebagai panduan praktik, bukan standar resmi.

1. **"Single pane of glass" adalah arah, bukan satu layar berisi segalanya.** Layar yang
   dijejali terlalu banyak informasi justru diabaikan. Tujuannya informasi yang bisa
   ditindaklanjuti dengan cepat.
2. **Fokus bergeser seiring kematangan NOC:** mula-mula menyatukan alarm/event dan tiket,
   kemudian wawasan operasional (beban kerja, kinerja, SLA).
3. **Seluruh dashboard — dan tiap kelompoknya — terlihat sekaligus** tanpa scroll; warna dan
   bentuk dipakai dengan makna tetap (merah = butuh tindakan, bukan dekorasi).
4. **Tampilan per peran, bukan satu dashboard dengan tombol disembunyikan.** Halaman awal
   tiap peran berisi angka dan aksi cepat miliknya.
5. **Sidebar vertikal untuk hierarki dalam;** kelompokkan secara logis, tata letak konsisten.
6. **Alur ITIL:** deteksi → kategorisasi → penugasan → kontrol SLA → diagnosis → resolusi →
   tinjauan pasca-insiden. *Major incident* punya jalur sendiri (= Gamas). Jeda SLA harus
   beralasan dan tercatat (= "Pending By").
7. **Runbook/basis pengetahuan** supaya penanganan tidak mengandalkan ingatan operator.
8. **Adopsi:** dashboard gagal bila tim tidak dilatih; perlu peninjauan metrik berkala.
9. **Produk pembanding untuk pola (bukan untuk dipasang):** GLPI dan iTop (ITSM + CMDB/aset,
   SLA), Zammad (helpdesk), Zabbix (monitoring). Polanya: tiket selalu menempel ke *aset*.

### Prinsip pengemasan yang diusulkan untuk portal ini

- **Satu entitas pusat: Remote.** Tiket, Gamas, SLA, laporan teknisi, riwayat, dan dokumen
  semuanya menempel ke remote. Halaman remote = "rekam medis" site.
- **Tiga lapis layar:** (a) *Overview* — kondisi sekarang, (b) *Antrean kerja* — daftar yang
  bisa ditindak, (c) *Detail* — satu tiket/remote lengkap dengan linimasa.
- **Navigasi per pekerjaan:** Overview · Tiket · Gamas · Remote · Laporan · Dokumen · Admin.
- **Aksi global selalu ada:** pencarian (no. NPR, no. TT, nama remote) dan tombol "Buat tiket".
- **Status + SLA selalu terlihat** di setiap baris dan setiap detail tiket.
- **Jejak audit:** setiap perubahan status tercatat siapa dan kapan.

## 4. Peta modul (usulan)

| Modul | Isi | Asal di sistem lama |
| --- | --- | --- |
| Overview | Tiket terbuka per status/prioritas, SLA hampir lewat, Gamas aktif, antrean saya | Home |
| Tiket (NPR) | Daftar + filter tersimpan, buat tiket, detail dengan linimasa tindakan | New/Detail NPR |
| Gamas | Insiden massal, daftar remote terdampak, tiket anak yang tertaut | Gamas List |
| Remote | Master data site, status, jarkom, lokasi, riwayat gangguan | List Remote |
| Kunjungan teknisi | Laporan lapangan yang tertaut ke tiket | List Report Teknisi |
| SLA | Aturan per customer/kategori, pemantauan, pelanggaran | Service Level Agreement |
| Laporan | Rekap NPR, Gamas, SLA; ekspor | Report NPR, Gamas Report |
| Dokumen | Berkas bersama, runbook | Shared |
| Admin | User, peran, master customer/kategori/system | (belum terlihat) |

## 5. Fase

Urutan: risiko tertinggi dulu, tiap fase satu alur utuh dari data sampai layar.
Langkah detail (file, perintah verifikasi) baru bisa ditulis setelah stack diputuskan.

### Fase 0 — Penemuan (tanpa kode)
Terverifikasi bila: semua menu lama terpetakan, glosarium disetujui, pertanyaan bagian 6 terjawab.
- Kumpulkan screenshot sisanya (Home, Detail tiket, Gamas, Remote, Shared, SLA, Report, profil).
- Glosarium: NPR, TT, Gamas, Jarkom, Remote, System, Pending By, Last Action.
- Daftar peran dan apa yang boleh dilakukan tiap peran.
- Alur status tiket dan aturan SLA yang berlaku sekarang.

### Fase 1 — Arsitektur informasi & desain
Terverifikasi bila: peta halaman + wireframe 3 layar inti (Overview, Antrean tiket, Detail tiket)
disetujui.
- Peta halaman, navigasi, model data konseptual (Remote sebagai pusat).
- Arah visual + sistem desain (warna status, tipografi, kepadatan tabel).

### Fase 2 — Fondasi
Terverifikasi bila: login berjalan, peran membatasi menu, master data bisa dikelola.
- Kerangka aplikasi, autentikasi, peran, master Customer/Remote/Kategori/System.

### Fase 3 — Tiket NPR (alur inti)
Terverifikasi bila: operator bisa buat tiket dari remote (alamat terisi otomatis), memperbarui
tindakan, menunda dengan alasan, menutup; semua tercatat di linimasa.

### Fase 4 — Overview & SLA
Terverifikasi bila: Overview menampilkan angka yang cocok dengan daftar tiket; SLA menghitung
mundur dan berhenti saat tiket ditunda.

### Fase 5 — Gamas
Terverifikasi bila: satu Gamas bisa menautkan banyak remote/tiket dan menutupnya sekaligus.

### Fase 6 — Kunjungan teknisi, Laporan, Dokumen
Terverifikasi bila: laporan lama (Report NPR, Gamas Report, List Report Teknisi) bisa
dihasilkan ulang dari portal baru dan diekspor.

### Fase 7 — Migrasi data & peluncuran
Terverifikasi bila: data lama termuat, tim sudah dilatih, sistem lama bisa dibaca saja.

## 6. Pertanyaan yang harus dijawab sebelum mulai

Setiap pertanyaan punya rekomendasi; jawab "ya" = setuju rekomendasi.

1. **Ganti total atau berdampingan?** Rekomendasi: portal baru menggantikan yang lama, data
   lama dimigrasi di Fase 7.
2. **Stack.** Sistem lama pakai apa (terlihat seperti PHP + Bootstrap + DataTables)? Rekomendasi:
   tentukan setelah tahu kemampuan tim yang akan merawat dan tempat hosting.
3. **Hosting.** Server sendiri (on-premise/jaringan internal) atau cloud? Rekomendasi: ikuti
   aturan customer bank — kemungkinan besar internal.
4. **Integrasi monitoring.** Apakah tiket dibuat otomatis dari alarm (NMS/Zabbix/lainnya)?
   Rekomendasi: versi pertama tiket manual, tetapi model data disiapkan untuk sumber otomatis.
5. **Pengguna di luar NOC.** Apakah teknisi lapangan dan customer ikut login? Rekomendasi:
   versi pertama hanya NOC/SOC + admin; teknisi menyusul di Fase 6.
6. **"SOC".** Apakah ada tiket keamanan yang alurnya berbeda dari gangguan jaringan?
   Rekomendasi: tidak di versi pertama.
7. **Eskalasi.** Apa beda "Eskalasi To NOC" dan "Eskalasi To SD", dan kapan TT dibuat?
   Rekomendasi: TT dibuat otomatis saat tiket dieskalasi ke teknisi lapangan.
7a. **Hapus tindakan.** Setuju tindakan tidak bisa dihapus, hanya dikoreksi oleh entri baru
   (admin tetap bisa membatalkan dengan alasan)? Rekomendasi: ya.
7b. **Nomor tiket customer.** Setuju dijadikan kolom tersendiri yang bisa dicari? Rekomendasi: ya.
8. **Bahasa antarmuka.** Rekomendasi: Indonesia, dengan istilah teknis tetap (NPR, Gamas, SLA).
9. **Notifikasi.** Perlu email/WhatsApp/Telegram saat SLA hampir lewat? Rekomendasi: tidak di
   versi pertama.
10. **Nama & tampilan.** Pakai identitas perusahaan yang ada atau tampilan baru?

### Asumsi saya (koreksi bila salah)
1. NPR = satu tiket gangguan untuk satu remote.
2. Gamas = gangguan massal yang membawahi banyak remote/NPR.
3. Jarkom = jenis jaringan komunikasi remote (mis. VSAT, M2M).
4. "System" di tabel = layanan/platform yang dipakai remote.
5. "Pending By" = pihak yang sedang ditunggu, dan menghentikan jam SLA.
6. Jumlah pengguna puluhan, bukan ribuan; jumlah remote ribuan.
7. Pemakaian utama di layar desktop/monitor NOC, bukan ponsel.

## 7. Belum ditentukan
- Fase 2–7: struktur file, perintah verifikasi, titik uji — menunggu keputusan stack.
- Aturan SLA sebenarnya (target per customer/kategori) — menunggu Fase 0.
- Isi menu Shared dan profil — menunggu screenshot.
- Migrasi: bentuk dan kualitas data lama belum diketahui.

## 8. Selalu / Tidak pernah
- Selalu: setiap tiket menempel ke satu remote; setiap perubahan status tercatat; status dan
  SLA terlihat di daftar.
- Tidak pernah (versi pertama): membuat ulang NMS/alat monitoring; aplikasi ponsel; portal
  customer; menyalin kode atau config dari sistem lama.

## 9. Sumber
- https://inoc.com/blog/noc-dashboards
- https://www.inoc.com/blog/noc-best-practices-10-ways-to-improve-your-operation
- https://www.inoc.com/blog/incident-management-the-foundation-of-a-successful-noc
- https://www.inoc.com/blog/itil-service-operation
- https://firstwave.com/whitepapers/a-single-pane-of-glass-with-opcharts-and-nmis
- https://medium.com/site-reliability-engineering-leadership/the-single-pain-of-glass-6e42930e966
- https://app.site24x7.com/blog/network-monitoring-custom-dashboard
- https://www.orbix.studio/blogs/multi-tenant-dashboard-design
- https://fanruan.com/en/blog/dashboard-navigation-best-practices
- https://manageengine.com/products/service-desk/itil-incident-management-guide.html
- https://www.servicenow.com/community/itsm-articles/incident-management-best-practice/ta-p/2304946
- https://www.nocobase.com/en/blog/open-source-ticketing-systems

## Progres
| Fase | Status |
| --- | --- |
| 0 Penemuan | Berjalan — 10 screenshot diterima; belum ada: Home, Gamas, List Remote, SLA, List Report Teknisi, Shared, profil |
| 1–7 | Belum mulai |
