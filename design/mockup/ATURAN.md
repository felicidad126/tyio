# Aturan bersama mockup

Berlaku untuk semua layar di `project/`. Sumber keputusan: [rencana induk](../../plans/pending/portal-noc-terpusat.md)
(K1–K25) dan [langkah teknis](../../plans/pending/langkah-teknis.md). Bila mockup dan aturan ini
berbeda, aturan ini yang benar dan mockup yang diperbaiki.

## 1. Peran dan tim (K20, K23, K24)

| Peran | Siapa | Di mockup |
| --- | --- | --- |
| L1 Monitoring | Pengguna utama dashboard | Dewi A., Rudi H. |
| L2 NOC | Tujuan "Eskalasi To NOC" | Arif S., Sari P. |
| Admin | Mengatur SLA, master remote, pengguna | — |
| SD (Service Delivery) | Tim kunjungan teknisi, **tidak login** | Hanya disebut di isi TT dan hasil kunjungan |

- L3 belum ada. Jangan menulis "L3" atau "L2/L3"; tulis "L2".
- SD tidak pernah menjadi penanggung, tidak muncul di menu, dan tidak menerima notifikasi di portal.
- Teks peran di bilah atas: "L1 Monitoring · Shift Siang" atau "L2 NOC · Shift Siang". Di daftar cukup "Dewi A. · L1".

## 2. NPR dan TT (K15, K16, K18, K21, K25; langkah 1.5b, 1.6, 3.3)

- **NPR** = catatan downtime satu remote beserta penyebabnya, tanpa kunjungan (paling sering listrik padam).
- **TT** = eskalasi NPR ke SD untuk problem jarkom di lokasi; pasti ada kunjungan teknisi.
  Satu NPR boleh punya nol atau lebih TT. TT tampil di linimasa NPR induknya.
- Halaman Tiket punya **dua daftar terpisah**: NPR aktif dan TT aktif.
- Tombol global di bilah atas bernama **"Buat NPR"** (bukan "Buat tiket").
- **Penutupan:** L1 boleh menutup NPR yang tidak punya TT. NPR yang punya TT, dan TT itu sendiri,
  hanya ditutup L2. Aturan ini ditegakkan API; di mockup tombolnya mati dengan alasan tertulis.
- TT tidak bisa ditutup sebelum hasil kunjungan SD dicatat oleh L1/L2.
- Sampai R5, TT diteruskan ke SD lewat tombol **"Salin ringkasan TT"** (no. TT, remote, lokasi,
  problem, kontak). Setiap salin tercatat di linimasa.
- "Eskalasi To NOC" = eskalasi L1 → L2.
- Aturan SLA dan data master remote hanya diubah admin. Operator hanya melihat; jangan ada
  tombol ubah untuk operator.

## 3. Label status — teks dan warna persis ini di semua layar

| Objek | Label | Latar | Teks |
| --- | --- | --- | --- |
| NPR | Kandidat | `#ebe7fb` | `#4a37a3` |
| NPR | Terbuka | `#dfeafb` | `#0b4f99` |
| NPR | Dikerjakan | `#d5f0ec` | `#0d5c55` |
| NPR | Pending · Customer, Pending · TM | `#fcefd2` | `#7a4a00` |
| NPR | Eskalasi · L2, Eskalasi · SD | `#fde4d5` | `#9a3d0d` |
| NPR | Pulih · siap ditutup | `#dcf2e1` | `#1b6430` |
| NPR | Ditutup, Bukan gangguan | `#eaedf1` | `#454f5c` |
| TT | Menunggu SD | `#fde4d5` | `#9a3d0d` |
| TT | Hasil masuk | `#dcf2e1` | `#1b6430` |
| TT | Ditutup | `#eaedf1` | `#454f5c` |
| Gamas | Saran | `#ebe7fb` | `#4a37a3` |
| Gamas | Aktif | `#fde4d5` | `#9a3d0d` |
| Gamas | Selesai | `#dcf2e1` | `#1b6430` |
| Gamas | Ditolak | `#eaedf1` | `#454f5c` |
| Remote | Up · Down · Data lama | titik `#1f8a3f` · `#c42b2b` · ikon jam abu | — |

Chip sisa SLA: aman `1 j 34 m` (abu + ikon jam), hampir lewat `18 m` (kuning + ikon jam, sisa ≤ 25%),
lewat `Lewat 25 m` (merah + ikon peringatan), jeda `Jeda 2 j 10 m` (abu + ikon jeda), `Terpenuhi`
(hijau + ikon centang). Warna tidak pernah sendirian: selalu ada teks, dan ikon bila ada.

## 4. Satuan waktu

- **Nilai durasi** (chip, sel tabel, angka ringkasan): `m`, `j`, `h` → "18 m", "2 j 05 m", "1 h 4 j".
- **Di kalimat dan waktu relatif:** `mnt`, `jam`, `hari` → "14 mnt lalu", "menunggu 7 mnt", "sejak 2 jam".
- Jam selalu dengan zona: "17:51 WITA". Zona mengikuti lokasi remote.

## 5. Komponen

- **Pil** hanya dua ukuran, radius penuh, huruf 12 px tebal 600:
  S = tinggi 22 px, padding 0 8 px (daftar, tabel, tag); M = tinggi 26 px (judul halaman, chip SLA).
  Tidak ada huruf di bawah 12 px di layar kerja; layar dinding minimal 19 px.
- **Satu tombol utama per layar** (biru penuh `#066fd1`) untuk aksi utama halaman itu.
  Tombol global "Buat NPR" bergaya sekunder: latar putih, garis `#c9d0d9`, teks `#182433`.
- Tombol yang labelnya mirip tidak boleh bersebelahan (contoh: "Buka Gamas" vs "Tolak saran").
  Aksi yang berdampak ke banyak tiket atau customer meminta konfirmasi yang menyebut akibatnya.
- **Badge sidebar:** Alert 9 · Tiket 48 · Gamas 2 (1 aktif + 1 saran).
- **Area klik:** minimal 32 px di desktop, 44 px di ponsel. Baris tabel yang membuka detail bisa
  diklik di seluruh barisnya; tautan nomor tetap ada untuk keyboard.

## 6. Warna merah

Merah hanya untuk yang harus ditindak sekarang: SLA lewat, remote Down, saran atau dugaan Gamas,
banner kritis, dan angka "SLA sudah lewat". Tren dan informasi ("naik 14 dalam 1 jam",
"+1 saran baru") memakai teks biasa (`#182433` atau `#536173`) dengan ikon panah bila perlu.

## 7. Grafik

- Warna status tidak dipakai untuk seri grafik.
- Tiket baru per hari: Remote Down `#2a78d6`, Corrective `#86b6ef`, Preventive `#c3cdd9`;
  celah putih 2 px antarsegmen; selalu ada legenda dan tombol tampilan tabel.
- Bilah status up/down dibedakan juga oleh **tinggi** (down = penuh, lambat = ¾, up = ½),
  karena hijau–merah tidak terbedakan bagi deuteranopia (ΔE 3,1).

## 8. Data bersama — angka harus cocok antar layar

- **Sekarang:** Senin 16 Nov 2026, 16:58 WIB · 17:58 WITA · 18:58 WIT.
- **Customer (bank samaran):** Bank Nusa (BNA), Bank Andalas (BAD), Bank Selaras (BSL), BPD Timur (BPT).
- **Remote:** 4.812 total, 37 down. Sulawesi 17/612 (diduga Gamas hub Palu-1) · Sumatera 6/1.104 ·
  Jawa 5/1.876 · Kalimantan 3/548 (Gamas aktif Balikpapan) · Papua 3/207 · Bali & Nusa Tenggara 2/301 · Maluku 1/164.
- **NPR terbuka 48:** 12 pending, 5 eskalasi (2 ke L2, 3 ke SD), 3 pulih · siap ditutup.
  SLA kurang dari 1 jam: 5, dua di antaranya sudah lewat.
- **TT aktif 4:** TT …/0019 (NPR …/0061 Bandara Sentani), TT …/0087 (NPR …/0396 Pelabuhan Tual),
  dan dua TT dari NPR Corrective di Samarinda Seberang dan Pasar Tomohon. Nomor persisnya mengikuti data di `Tiket.dc.html`.
- **Alert menunggu verifikasi 9** (terlama 7 mnt). Saran Gamas hub Palu-1: 14 remote = 13 alert + 1 NPR (…/0421), mulai 16:41 WITA.
- **Gamas aktif 1:** GMS/2026/11/0007, listrik padam PLN Balikpapan Utara, 3 remote.
