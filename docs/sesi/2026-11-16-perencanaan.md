# Catatan sesi — 2026-11-16 — Perencanaan portal NOC terpusat

Sesi: https://claude.ai/code/session_01Sh2gyMt7AHtttz59kLT2aA
Branch: `claude/portal-noc-terpusat` (dibuat dari `main` di `f4b31e6`)
Hasil utama:
- [Rencana induk](../../plans/pending/network-problem-report.md)
- [Langkah teknis per rilis](../../plans/pending/langkah-teknis.md)

## 1. Alur sesi

1. Repo `tyio` dibuat manual oleh user (sesi cloud tidak bisa membuat repo), lalu ditautkan ke sesi.
2. User mengirim 5 screenshot dashboard lama (menu NPR/Gamas/Remote, form New NPR, daftar NPR)
   dan meminta rencana portal ticketing terpusat untuk tim NOC/SOC, tanpa config, dengan
   referensi cara mengemas dashboard multifungsi.
3. Riset + rencana v1 → ditambah 5 screenshot (detail tiket, Add Action, Report NPR).
4. User menjawab 15 pertanyaan → rencana v2 dengan fase rilis R0–R8.
5. User mengusulkan arsitektur MQTT/TimescaleDB/HA. Dinilai: sebagian diterima (HA, keamanan,
   dua timestamp, debounce, peta), sebagian ditunda karena bergantung pada agent di site.
6. User mengonfirmasi sumber data = SNMP dari NOC + sistem VSAT → rencana v3.
7. User menyetujui rekomendasi dan urutan rilis → langkah teknis per rilis ditulis.
8. Branch sesi dibuat; catatan ini ditulis.

## 2. Jawaban dan keputusan user (kata-kata user diringkas)

| Topik | Jawaban |
| --- | --- |
| Stack | Belum tahu; harus sangat mudah dikelola, operasional, ramah pengguna; PWA sangat disarankan |
| Sistem lama | Ganti total; mulai dari data kosong/dummy |
| Contoh data lama | Tidak bisa diberikan |
| SLA | Dibahas di langkah berikutnya |
| Alur tiket | Cari referensi dulu; penutup tiket pasti L2–L3 |
| Gamas | Gangguan massal; Gamas List berisi kapan terjadi, lama penanganan, troubleshooting, penyelesaian; detail di fase berikutnya |
| Arti Take Action, hak akses | Dibahas saat bertemu user |
| Home | Ringkasan semua monitoring dan analitik kejadian |
| Alat monitoring | Sudah ada SNMP dari NOC dan sistem VSAT; perlu tiket otomatis dari alert, dikoreksi manusia |
| Monitoring ATM | Lebih ke perangkat user; user saat ini adalah end user bank |
| Agent di site | Belum pasti |
| Sistem customer | Bila ada kebutuhan eksternal, tiket dibuat otomatis per tenant |
| Notifikasi | Bot Telegram, email, dan alert di dashboard (tampil 24/7 di monitor) |
| Laporan | Dibuatkan template |
| Istilah | Jarkom = Jaringan Komputer; System, TM, SD dibahas nanti |
| Rekomendasi R-A s.d. R-I + urutan rilis | **Disetujui** |

## 3. Yang ditunda dengan sengaja

- MQTT, store-and-forward, sertifikat per perangkat — hanya bila ada agent di site.
- TimescaleDB — hanya bila portal menyimpan metrik sendiri; PostgreSQL biasa cukup untuk kejadian.
- Kubernetes — bertentangan dengan syarat mudah dikelola; produksi memakai dua server + replika.
- Monitoring kesehatan mesin ATM — wilayah bank.

## 4. Masih terbuka

**Dari Anda:** keputusan hosting (internal/cloud) · dua server produksi · akun bot Telegram dan
server email · nama produk alat SNMP dan sistem VSAT (apakah "Jupiter" = Hughes JUPITER?) dan
cara keduanya mengirim alert keluar.

**Sesi dengan user:** alur status tiket · aturan SLA · detail Gamas · arti Take Action dan
Eskalasi To NOC / To SD · hak akses per peran · arti System, TM, SD · contoh laporan wajib.

**Screenshot yang belum ada:** Home, Gamas List/Report, List Remote, Service Level Agreement,
List Report Teknisi, Shared, menu profil.

**Belum dikonfirmasi:** keputusan teknis turunan T1–T12 di langkah-teknis.md (diambil dari
rekomendasi yang disetujui); sumber ubin peta bila jaringan NOC tertutup dari internet.

## 5. Langkah berikutnya

Mulai langkah **0.1 Kerangka repo dan pipeline** di branch `claude/portal-noc-terpusat`,
lalu 0.2 → 0.3 → 0.4 / 0.5 dan 1.1 → 1.3 (tidak bergantung pada pihak lain).
Titik periksa pertama dengan user: setelah 0.5 (kerangka terlihat).

### Prompt untuk melanjutkan

> Lanjutkan proyek portal NOC terpusat di repo `felicidad126/tyio`, branch
> `claude/portal-noc-terpusat`. Baca `docs/sesi/2026-11-16-perencanaan.md`,
> `plans/pending/network-problem-report.md`, dan `plans/pending/langkah-teknis.md`.
> Kerjakan langkah 0.1 sesuai kriteria terima dan perintah verifikasinya, lalu perbarui
> tabel Progres.

## Catatan privasi

Nama orang, nomor telepon, dan alamat IP yang terlihat di screenshot tidak disalin ke repo.
