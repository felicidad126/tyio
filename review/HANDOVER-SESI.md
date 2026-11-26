# Serah terima sesi Claude Code: NPR (Network Problem Report)

Dokumen ini untuk sesi Claude Code berikutnya, supaya bisa melanjutkan tanpa membaca ulang
percakapan lama. Keadaan per 26 November 2026, commit `9741ddc` di branch `Rev-NPR-Tyio`.

## 1. Proyek singkat

- **Proyek:** tugas Kerja Praktek di PT. Tangara Mitrakom, Universitas Dian Nusantara.
- **Aplikasi:** program "Monitoring VSAT & M2M" yang direview, direvisi, lalu diganti nama
  menjadi **NPR (Network Problem Report)**. Dipakai helpdesk untuk:
  - mencatat gangguan per site (NPR);
  - eskalasi ke teknisi (Trouble Ticket);
  - gangguan massal (TT Gamas);
  - laporan SLA bulanan.
- **Kode aplikasi:** folder `monitoring-vsat/`. Folder lain di repo (`apps/`, `packages/`,
  `deploy/` dan seterusnya) milik proyek lama dan tidak disentuh.
- **Bahasa:** semua balasan ke pengguna, label tampilan, komentar kode, dan pesan commit memakai
  Bahasa Indonesia.

## 2. Aturan wajib (dari pengguna)

1. **Branch:**
   - Kerjakan hanya di branch `Rev-NPR-Tyio`.
   - Jangan merge ke `main` dan jangan membuat pull request.
   - Jangan mengubah `main` atau branch lain. Branch ini harus tetap terpisah.
2. **Data rahasia:** repo ini publik.
   - Jangan menulis password, isi cookie, atau ID database asli di kode, dokumen, atau prompt.
     ID D1 di `wrangler.jsonc` sengaja diisi `ISI_ID_DATABASE`.
   - Nama asli tidak ditulis. Nickname "mimin" boleh dipakai.
3. **Server pemilik:**
   - Jangan menyentuh container atau situs lain: `npr-prod-*`, `tyio-staging-*`,
     `mengundang-*`, helonoia.com, invitation.helonoia.com, npr.helonoia.com,
     revnpr.helonoia.com.
   - Jangan pernah menjalankan `docker compose down -v` dan jangan menghapus volume.
4. **Setelah setiap kelompok perubahan:**
   - Jalankan pemeriksaan di bagian 5.
   - Uji di browser pada lebar laptop dan HP.
   - Laporkan hasilnya apa adanya, termasuk yang gagal.
   - Commit dengan pesan berbahasa Indonesia, lalu push ke `Rev-NPR-Tyio`.
5. **Tampilan:**
   - Hindari tampilan "AI slop": tanpa gradien ungu, tanpa banyak teks di tengah, tanpa sudut
     membulat seragam di mana-mana, tanpa font Inter, tanpa tanda pisah panjang (—) di judul.
   - Huruf awal besar, sisanya kecil ("Tanggal mulai", bukan "TANGGAL MULAI").
   - Tata letak harus rapi dan konsisten: kolom tabel tidak bergeser saat filter diganti.
6. **Perubahan tampilan tidak boleh mengubah fitur,** kecuali pengguna memintanya.

## 3. Keputusan yang sudah diambil

| Kode | Keputusan |
|---|---|
| D-1 b | Label akademik hanya di halaman Login |
| D-3 c | Akun per orang (admin dan helpdesk), bukan akun bersama |
| D-4 b | HP didukung: menu ☰ dan daftar berubah menjadi kartu |
| D-7 b | PDF TT dan Gamas memakai kop, tabel, dan tanda tangan |
| D-8 a | Label berbahasa Indonesia |
| T-5 | Tanpa `react-router`; alamat per halaman memakai History API |
| T-6 | Temuan di luar D-1…D-8 tidak dikerjakan |
| K-06 | Awalnya tidak dikerjakan (T-4). Akhirnya dikerjakan atas permintaan pengguna (commit `9741ddc`) |
| UI | Opsi a: Tailwind 3.4 + shadcn/ui, dipindah dari prototipe `redesain-npr/` |

Rincian keputusan ada di `review/RENCANA-REVISI.md`. Temuan review ada di `review/REVIEW-NPR.md`.

## 4. Peta kode `monitoring-vsat/`

### Tampilan

| Berkas | Isi |
|---|---|
| `src/App.tsx` | Kerangka aplikasi: cek sesi `/api/me`, sidebar, laci menu HP, breadcrumb, menu akun, judul tab, `go()`, `gantiParam()`, `kirim()`, dan Back/Forward browser |
| `src/lib/alamat.ts` | Pemetaan alamat ↔ halaman (lihat tabel di bawah) |
| `src/lib/app.ts` | `AppCtx` dan `useApp()`: `page`, `param`, `go`, `gantiParam`, `user`, `api`, `versi`, `kirim`, `sibuk`, `galat` |
| `src/lib/tipe.ts` | Tipe data API, helper `keIso`, `sekarangWib`, `unduhCsv` (aman dari formula injection) |
| `src/pages/` | Satu berkas per halaman: `Login`, `GantiPassword`, `Dashboard`, `Npr` (daftar, baru, detail), `Tiket`, `Gamas`, `Sla`, `Master` (Customer, Remote), `Pengguna` |
| `src/components/tabel.tsx` | Pola tabel bersama: `Toolbar`, `BarisRingkasan`, `KepalaUrut`, `useUrut`, `urutkan`, helper tanggal |
| `src/components/tanggal.tsx` | `TanggalInput` (ketik dd/mm/yyyy atau pilih dari kalender) dan `WaktuInput` (tanggal + jam 24 jam, WIB) |
| `src/components/ui/` | Komponen shadcn/ui |
| `src/useMuat.ts` | `useMuat(path, api, versi)`: memuat ulang data saat `versi` naik setelah simpan |

Alamat per halaman (`src/lib/alamat.ts`):

| Halaman | Alamat |
|---|---|
| Dashboard | `/` |
| Daftar NPR | `/npr`, atau `/npr?kondisi=…` dari kartu Dashboard |
| NPR baru, detail NPR | `/npr/baru`, `/npr/:id` |
| Trouble Ticket | `/tt` |
| TT Gamas | `/gamas`, `/gamas/:id` |
| Laporan SLA | `/sla?bulan=YYYY-MM` |
| Customer | `/customer` |
| Remote | `/remote?customer=:id` |
| Pengguna | `/pengguna` |

Filter yang ikut di alamat dibaca langsung dari `param`, tidak disimpan di state terpisah.
Menggantinya memakai `gantiParam()`, yang memakai `replaceState` sehingga tidak menambah
riwayat Back.

### Server

| Berkas | Isi |
|---|---|
| `worker/` | API (Cloudflare Workers + D1): `index.ts` (rute), `baca.ts` (query baca), `domain.ts` (hitung SLA), `pengguna.ts` (akun), `sandi.ts` |
| `server/` | Server Node 22 untuk Docker: `main.ts` memakai `node:sqlite` lewat `d1.ts`. Alamat non-API dikirimi `index.html`. Juga `setup.ts`, `cadangan.ts`, `migrasi.ts` |
| `migrations/` | Migrasi database. Belum ada migrasi baru sejak `0002` |
| `scripts/` | `setup.mjs`, `test-api.mjs` |

Catatan perilaku:
- **Data per halaman:**
  - Daftar NPR dipaging, disaring, dan diurutkan di server (`KOLOM_URUT` di `worker/baca.ts`).
  - TT, Gamas, SLA, data master, dan Pengguna diambil utuh (maksimal 500 baris), lalu
    disaring, diurutkan, dan dipaging di browser.
- **Setiap POST wajib mengirim header `Origin`** (cek CSRF). `curl` tanpa `Origin` akan
  ditolak dengan 403.

## 5. Perintah pemeriksaan

Jalankan dari folder `monitoring-vsat/`:

```bash
npx tsc -b && npm run lint && npx prettier --check src
npm run build && npm run build:server
npm run setup                     # database lokal wrangler
TEST_BASE_URL=http://127.0.0.1:3100 TEST_USERNAME=<admin> TEST_PASSWORD=<sandi> npm run test:api   # harus 49/49
```

Server lokal untuk uji, dengan database uji yang terpisah:

```bash
DB_PATH=<folder-uji>/npr.sqlite NPR_ADMIN_USERNAME=uji-admin NPR_ADMIN_NAMA="Admin Uji" \
  NPR_ADMIN_PASSWORD=<sandi-uji> node dist/server/setup.js
DB_PATH=<folder-uji>/npr.sqlite PORT=3100 HOST=127.0.0.1 node dist/server/main.js
```

**Uji browser** memakai Playwright (Chromium sudah terpasang, `require('playwright')`).
- **Lebar layar:** laptop 1366×820, HP perangkat "Pixel 7".
- **Skrip uji:** skrip sesi lalu ada di scratchpad dan hilang bersama container, jadi buat ulang
  bila perlu.
- **Hasil terakhir:**
  - Uji lengkap 31/32. Satu yang gagal, "sort Status (server)", gagal karena database uji
    hanya punya 1 NPR, bukan bug.
  - Uji alamat 21/21.
- **Catatan menulis skrip uji:**
  - Menu sidebar dan breadcrumb sekarang berupa `<a>`, bukan `<button>`.
  - Toast sonner yang terbaru ada di urutan pertama (`.first()`).
  - Galat 401 di konsol saat cek sesi atau saat salah password memang wajar.

## 6. Server produksi

- **Alamat:** https://kp.helonoia.com, lewat reverse proxy aaPanel ke `127.0.0.1:3000`.
- **Container:** `npr-kp-app-1`.
- **Folder:** `/opt/monitoring-vsat`, dengan `docker-compose.yml` di `monitoring-vsat/`.
- **Volume data:** `npr-kp_npr-data`, dipasang di `/data`. Cadangan disimpan di `/data/cadangan/`.
- **Commit yang berjalan:** `9741ddc`, sehat. Cadangan terakhir dibuat sebelum pembaruan:
  `npr-20261126-1838.sqlite`.
- **Data:** masih kosong (0 NPR, 0 TT).
- **Cara pembaruan:** Claude tidak punya akses langsung ke server. Pembaruan dikerjakan agent
  browser milik pengguna lewat Terminal aaPanel, memakai prompt `review/PROMPT-PERBARUI-SERVER.md`:
  1. cadangan;
  2. `git pull --ff-only`;
  3. `docker compose up -d --build`;
  4. cek health;
  5. pemeriksaan browser a–g.
- **Reset password akun** (pengguna mengetik sendiri password barunya):

  ```bash
  cd /opt/monitoring-vsat/monitoring-vsat
  docker compose exec app node dist/server/setup.js --reset-password
  ```

## 7. Yang belum selesai atau perlu dicek

Pemeriksaan berikut tertunda karena data di server masih kosong:
- urutan kolom "No. NPR";
- Unduh PDF TT dan PDF Gamas;
- kartu NPR di HP;
- link `/npr/<id>` dibuka di tab baru;
- `/sla?bulan=…` lalu F5.

Pengguna sudah diberi daftar cek manual. Tunggu laporannya setelah data asli masuk.

Catatan lain yang terbuka (dikerjakan hanya bila diminta):
- Pengguna boleh melihat isi cadangan pukul 14:51 bila ingin memastikan customer dan remote yang
  hilang antara 14:51 dan 18:09. Kemungkinan besar itu data uji yang sengaja dihapus.
- Tanda "—" untuk sel kosong di tabel masih dipakai. Ganti bila pengguna menganggapnya AI slop.
- Bundel JavaScript lebih dari 500 KB (peringatan Vite). Belum dipecah.

## 8. Dokumen lain di `review/`

| Berkas | Isi |
|---|---|
| `REVIEW-NPR.md` | Hasil review lengkap (kode K-, UI U-, UX X-, humanizer H-, ganti nama R-) |
| `PENJELASAN-REVIEW.md` | Penjelasan review untuk pembaca awam |
| `RENCANA-REVISI.md` | Keputusan D-1…D-8, T-1…T-6, dan tahap pengerjaan |
| `REDESAIN-NPR.md` | Aturan visual, pola tabel, ringkasan per halaman, catatan pemindahan UI |
| `DIAGRAM-NPR.md` | Diagram perancangan untuk laporan KP (ERD, use case, activity, sequence, class, modul) dalam Mermaid. Gambar PNG/SVG dan skrip render di `gambar/diagram/` |
| `PROMPT-*.md` | Prompt untuk agent browser: uji, cek server, pasang server, perbarui server |

Prototipe desain ada di `redesain-npr/`. Jalankan `npm run bundel` di sana untuk menghasilkan
`redesain-npr.html`. Prototipe ini sudah dipindahkan ke aplikasi; folder ini disimpan sebagai
rujukan.

## 9. Gaya kerja yang disukai pengguna

- **Bahasa:** Indonesia, santai tetapi jelas. Pengguna sering memberi masukan singkat berupa
  tangkapan layar.
- **Cara bertanya:** untuk pilihan yang berdampak (mis. fitur baru, mengubah keputusan lama),
  jelaskan manfaatnya dengan contoh nyata, beri saran, lalu tanya "Mau saya kerjakan?" sebelum
  mulai.
- **Laporan akhir:** isinya
  - apa yang berubah;
  - hasil pemeriksaan dengan angka (mis. 49/49);
  - commit yang di-push;
  - langkah pembaruan server bila perlu.
