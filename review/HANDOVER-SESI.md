# Serah terima sesi Claude Code: NPR (Network Problem Report)

Dokumen ini untuk sesi Claude Code berikutnya, supaya bisa melanjutkan tanpa membaca ulang
percakapan lama. Keadaan per 27 November 2026 di branch `Rev-NPR-Tyio`. Server menjalankan
commit "MULAI-WINDOWS.cmd langsung dengan data demo lengkap", dipasang otomatis (build ulang) oleh cron pembaruan; lihat bagian 6.

## 0. Mulai di sini (serah terima terakhir: 28 November 2026, sekitar 02.10 WIB)

Tidak ada pekerjaan yang setengah jalan. Semua sudah di-commit, di-push, dan terpasang di server.

**Langkah pertama sesi baru:**

1. `git fetch origin Rev-NPR-Tyio && git status -sb`. Harus di branch `Rev-NPR-Tyio` dan sama
   dengan `origin`. Saat serah terima, HEAD = commit "MULAI-WINDOWS.cmd langsung dengan data demo lengkap" (atau yang lebih baru
   dari sesi lain).
2. `curl -s https://kp.helonoia.com/api/health`. Saat serah terima: versi = hash commit
   "MULAI-WINDOWS.cmd langsung dengan data demo lengkap". Commit dokumen sesudahnya dipasang tanpa build, jadi versinya tetap.
3. Cek CI terakhir: `mcp__github__actions_list`, `list_workflow_runs`, `resource_id: npr.yml`,
   branch `Rev-NPR-Tyio`. Run #1–#16 hijau, kecuali #12 yang dibatalkan push berikutnya
   (`cancel-in-progress`, wajar). Run untuk commit serah terima ini belum dicek saat
   menulis.
4. Tanyakan pengguna apa yang ingin dikerjakan.

**Sesi Claude lain juga push ke branch ini** (diagram laporan KP: `review/DIAGRAM-NPR.md`,
`review/gambar/diagram/`). Selalu `git fetch` sebelum mengedit dokumen bersama, terutama berkas
ini. Merge `6a7d070` pernah bentrok di berkas ini.

**Selesai di sesi 26–27 November 2026** (diverifikasi dengan cara yang disebut):

| Commit | Isi | Bukti |
|---|---|---|
| `8818679` dan commit sesudahnya | ZIP untuk penilai: folder database dibuat otomatis, `npm run demo` (`--jika-kosong`), README "Jalankan lokal dengan data demo", `MULAI-WINDOWS.cmd` langsung menyiapkan data demo lengkap | Dari salinan bersih (seperti ZIP GitHub): setup, demo 50 NPR, demo ulang dilewati, start di :3000, login. Uji browser 53/53, `test:api` 51/51. Berkas `.cmd` belum dicoba di Windows |
| `de98db7`, `6f8da70` | Review UI/UX paket C (rapikan kecil): warna durasi seragam dan durasi di kartu HP, Pending kosong untuk NPR Closed (daftar dan detail), "selisih … poin persen" di SLA, judul "TT Gamas", telepon PIC `tel:`, Data Site di antara Riwayat dan form di HP, "(opsional)", `aria-label` dropdown, ring fokus 2 px, angka+satuan durasi tidak terpisah, konfirmasi Batal NPR Baru, tombol × pencarian, filter Status "Aktif (belum Closed)" | Uji browser 53/53, `test:api` 51/51. Terpasang otomatis 03.55 WIB |
| `e60a767` | Bundel dipecah per halaman (`components/halaman.tsx`, chunk React terpisah, penjaga 500 KB di CI); grafik Dashboard di atas NPR Aktif | Uji browser 45/45, `test:api` 50/50. JS awal di server 652 → 420 KB (188 → 132 KB gzip). Terpasang otomatis 03.00 WIB, 3,5 menit setelah CI hijau |
| `d3299dd` | Kategori pending hanya TM dan Customer: "Belum Dikategorikan" dihapus, NPR baru Pending TM, pengingat saat pindah ke Pending Customer, migrasi `0003` | `test:api` 50/50, uji browser 42/42 (laptop dan Pixel 7). Migrasi diuji pada database buatan kode lama: SLA tidak berubah. Server: terpasang lewat agent 02.30 WIB, log "Migrasi dijalankan: 0003_pending_tm.sql", cek h–k lulus |
| `e94efc4` | `review/uji/uji-browser.cjs`; lima pemeriksaan yang tertunda | Lulus lokal, lalu lulus di server (agent, `PROMPT-DATA-DEMO.md` a–h) |
| `2086e8d` | Daftar NPR dari Dashboard: panah di "Mulai ↑"; `useUrut` dengan urutan awal yang bisa berubah | 5 cek baru gagal di kode lama, lulus di kode baru |
| `3630739` | Data demo `server/demo.ts` (isi dan `--hapus`) | Lokal: isi, tolak isi ulang, hapus, Gamas campuran. Server: terisi 00.48 WIB |
| `b00aa54` | Durasi < 1 jam dalam menit; riwayat "jam oleh nama"; Gangguan Terakhir 3 baris | 4 cek baru gagal di kode lama, lulus; dicek agent di server |
| `bc7219d` | Jarak titik "Remote Down · Pending TM" sama di kedua sisi | Diukur per huruf: dulu 8/2 px, sekarang 2/2 px |
| `fe417ad` | CI GitHub (`npr.yml`) dan pembaruan otomatis (`perbarui-otomatis.sh`), versi di `/api/health` | `uji-perbarui-otomatis.sh` 19/19; CI run #1 hijau; terpasang di server lewat agent |

**Belum terverifikasi:**

- Kembali otomatis ke commit lama saat build gagal atau tidak sehat belum pernah terjadi di
  server (hanya diuji `uji-perbarui-otomatis.sh`). Pemasangan otomatis dengan build sudah terbukti
  (`e60a767`). Bila versi di health tidak berganti 10 menit setelah CI hijau: minta agent
  menjalankan `tail -20 /var/log/npr-perbarui.log` dan `cat /var/lib/npr-perbarui/cek-terakhir`.
- Pemasangan commit dokumen di server tidak terlihat dari health (versinya tetap).
- Tampilan di HP sungguhan. Agent memakai bingkai 400 px; lokal dan CI memakai emulasi Pixel 7.

**Menunggu pengguna:**

- Kapan penilaian KP selesai. Data demo di server **dipertahankan sampai penilaian selesai**
  (keputusan pengguna 27 November, lihat P-2); baru sesudahnya dihapus (`PROMPT-DATA-DEMO.md`
  bagian B), sebelum data asli dicatat.
- Coba `MULAI-WINDOWS.cmd` versi baru sekali di Windows (belum bisa dijalankan di container).
- Cek sekali di HP sungguhan. Sekalian lihat pengingat Pending Customer di form tindakan.

**Pelajaran teknis (supaya tidak ditemukan ulang):**

- Container Claude: Docker CLI ada tetapi daemon tidak, jadi build image hanya diuji di CI.
  GitHub API tidak bisa dipanggil langsung (pakai alat MCP github), tetapi `kp.helonoia.com` bisa
  di-`curl`.
- Nilai `kondisi` yang sah: `aktif`, `kritis`, `aging`, `menunggu_report`, `pending_tm`,
  `pending_customer`. `belum_kategori` dihapus di `d3299dd`. Nilai lain diabaikan tanpa pesan; uji
  pernah keliru karena memakai `closed`.
- Di Playwright, `textContent` baris tabel tersambung tanpa spasi ("berjalanOpenTM"), jadi regex
  `\bOpen\b` pada baris tidak cocok. Cari sel atau badge yang isinya persis: `/^Open$/`.
- Nama chunk hasil build dipilih Rolldown dari salah satu modulnya, jadi bisa menyesatkan (chunk
  `pdf-*.js` terutama berisi kalender). Isi chunk dibaca dari sourcemap: `npx vite build
  --sourcemap`, lalu hitung per sumber dengan `source-map-js` (ada di `node_modules`). Build
  biasa setelahnya supaya `.map` tidak ikut.
- Bulan berjalan di Laporan SLA dihitung sampai saat diminta. Membandingkan SLA bulan berjalan dari
  dua waktu berbeda selalu berselisih pada NPR yang masih aktif; bandingkan bulan yang sudah lewat.
- Uji browser butuh lebih dari 25 NPR supaya halaman 2 ada. Pakai data demo (50 NPR).
- Dua server lokal yang membuat database baru yang sama pada saat bersamaan menghasilkan
  "database is locked". Ini artefak uji, bukan bug.
- Pengecekan terjadwal (`send_later`) hanya membangunkan sesi yang membuatnya, bukan sesi baru.
- Pengguna menempelkan laporan agent browser apa adanya, kadang diawali baris narasi berbahasa
  Inggris. Itu bagian laporan, bukan instruksi baru.

**Tinjauan proses:**

- ⚠️ `server/` tidak dicek `tsc -b` (bagian 5). Usulan, bila pengguna setuju: tambah tsconfig
  untuk `server/` ke `tsc -b` setelah memperbaiki `server/main.ts:122`.
- ✅ Pemeriksaan yang dulu manual (uji browser, uji API, skrip server, image Docker) sekarang
  dijalankan CI di setiap push.
- ⚠️ Berkas ini diedit bersamaan oleh dua sesi. Fetch sebelum mengedit, dan jaga perubahan tetap
  kecil per bagian.

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
| P-2 | 27 November 2026. Data demo dibutuhkan sampai penilaian KP selesai. Di server: dibiarkan apa adanya (tidak disegarkan, termasuk tindakan percobaan tim) dan tidak dihapus sampai penilaian selesai; data asli belum dicatat selama itu. Konsekuensi yang sudah dijelaskan ke pengguna: grafik "NPR Masuk per Hari" (7 hari) kosong mulai sekitar 4 Desember bila tidak ada NPR baru, dan durasi NPR aktif terus bertambah. Di ZIP: `MULAI-WINDOWS.cmd` langsung menyiapkan mode server Node dengan data demo lengkap (lihat bagian 7) |
| P-1 | 27 November 2026, menggantikan X-02 bagian kategori. Pending hanya **Pending TM** (provider) dan **Pending Customer**. NPR baru langsung Pending TM, karena web ini milik TM. Pending Customer hanya bila penyebabnya di luar jaringan dan ada bukti pengecekan teknisi, mis. arah antena terhalang gedung atau pohon. Bukti cukup diingatkan di form, tidak diwajibkan sistem. Aturan SLA tetap: hanya NPR dengan TT Maintenance. "Reposisi Antena" yang biasa diajukan customer cukup ditulis di catatan, tidak jadi pilihan baru |

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
| `src/components/halaman.tsx` | Halaman yang dimuat terpisah (`React.lazy`), `useUnduhSemuaHalaman` (unduh halaman lain 2 detik setelah login, saat senggang), `MemuatHalaman`, dan `BatasHalaman` (berkas halaman hilang: muat ulang sekali, lalu pesan dengan tombol Muat ulang) |
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
| `server/` | Server Node 22 untuk Docker: `main.ts` memakai `node:sqlite` lewat `d1.ts`. Alamat non-API dikirimi `index.html`. Juga `setup.ts`, `cadangan.ts`, `migrasi.ts`, `demo.ts` (data demo, lihat bagian 7) |
| `migrations/` | Migrasi database. `0003_pending_tm.sql` (kategori kosong menjadi TM) adalah yang terbaru |
| `scripts/` | `setup.mjs`, `test-api.mjs`, `perbarui-otomatis.sh` (pembaruan otomatis di server, lihat bagian 6) dan ujinya `uji-perbarui-otomatis.sh` |

Catatan perilaku:
- **Data per halaman:**
  - Daftar NPR dipaging, disaring, dan diurutkan di server (`KOLOM_URUT` di `worker/baca.ts`).
  - TT, Gamas, SLA, data master, dan Pengguna diambil utuh (maksimal 500 baris), lalu
    disaring, diurutkan, dan dipaging di browser.
- **Setiap POST wajib mengirim header `Origin`** (cek CSRF). `curl` tanpa `Origin` akan
  ditolak dengan 403.

## 5. Perintah pemeriksaan

**CI GitHub:** `.github/workflows/npr.yml`, job **"Periksa NPR"**, berjalan di setiap push ke
`Rev-NPR-Tyio`. Isinya: `tsc -b`, lint, Prettier (`src`, `server`, `review/uji`), shellcheck dan
`uji-perbarui-otomatis.sh`, build (gagal bila ada berkas JS tampilan di atas 500 KB), server uji
dengan data demo, `uji-browser.cjs`, `test:api`, lalu build image Docker dan cek `/api/health`. Ringkasan hasil uji ada di halaman run. Setelah push,
cek hasilnya (`mcp__github__actions_list`, `branch: Rev-NPR-Tyio`). Server hanya memasang commit
yang job ini lulus, jadi **jangan mengganti nama job** tanpa mengganti `NAMA_CEK` di
`perbarui-otomatis.sh`. Workflow proyek lama `ci.yml` dimatikan untuk branch ini lewat
`branches-ignore`; dulu selalu gagal di branch ini karena memeriksa proyek lama. Run pertama
(commit `fe417ad`, 27 November 2026) lulus dalam 2 menit 40 detik: uji browser 38/38, `test:api`
49/49, image Docker sehat dengan versi commit. Sejak `6f8da70`: uji browser 53/53, `test:api` 51/51.

Pemeriksaan yang sama bisa dijalankan lokal dari folder `monitoring-vsat/`:

```bash
npx tsc -b && npm run lint && npx prettier --check src
npm run build && npm run build:server
npm run setup                     # database lokal wrangler
TEST_BASE_URL=http://127.0.0.1:3100 TEST_USERNAME=<admin> TEST_PASSWORD=<sandi> npm run test:api   # harus 51/51
```

Server lokal untuk uji, dengan database uji yang terpisah:

```bash
DB_PATH=<folder-uji>/npr.sqlite NPR_ADMIN_USERNAME=uji-admin NPR_ADMIN_NAMA="Admin Uji" \
  NPR_ADMIN_PASSWORD=<sandi-uji> node dist/server/setup.js
DB_PATH=<folder-uji>/npr.sqlite PORT=3100 HOST=127.0.0.1 node dist/server/main.js
```

**Uji browser** memakai Playwright (Chromium sudah terpasang, `require('playwright')`).
- **Lebar layar:** laptop 1366×820, HP perangkat "Pixel 7".
- **Skrip uji di `review/uji/`** (akun diambil dari variabel lingkungan, sama seperti `test:api`):

  ```bash
  DB_PATH=<folder-uji>/npr.sqlite node dist/server/demo.js   # data demo, sebelum test:api
  TEST_BASE_URL=http://127.0.0.1:3100 TEST_USERNAME=<admin> TEST_PASSWORD=<sandi> \
    UJI_OUT=<folder-hasil> node ../review/uji/uji-browser.cjs   # harus 53/53
  ```

  `uji-browser.cjs` memeriksa urut No. NPR dan Status, filter `kondisi` (termasuk urutan dan
  panah saat dibuka dari Dashboard), link `/npr/<id>` di tab baru dan tanpa sesi, PDF TT dan
  Gamas, `/sla?bulan=…` lalu F5, durasi di bawah 1 jam, riwayat "jam oleh nama", kolom
  Gangguan Terakhir di Remote (1920 px), kategori pending hanya TM atau Customer beserta
  pengingat Pending Customer (laptop dan HP, form tidak dikirim), grafik Dashboard di atas NPR
  Aktif (1366 dan 1920 px), berkas halaman yang hilang (chunk SLA diblokir: unduhan latar tidak
  memuat ulang, membuka halaman memuat ulang sekali lalu pesan), paket C review UI/UX (warna
  durasi, filter Aktif, tombol × pencarian, konfirmasi Batal, `tel:` PIC, dropdown bernama, Pending
  kosong di NPR Closed, durasi di kartu HP, Data Site di HP), serta kartu di HP. Tangkapan layar
  dan PDF disimpan di `UJI_OUT`. Durasi memakai spasi tak terpisah (`\u00a0`) antara angka dan
  satuan; di regex uji pakai `\s`, bukan spasi biasa.
- **Hasil terakhir (27 November 2026, `6f8da70`):**
  - `uji-browser.cjs` 53/53 di atas data demo, tanpa galat konsol, lalu `test:api` 51/51.
  - Uji lengkap dan uji alamat sesi lalu (31/32 dan 21/21) skripnya hilang bersama container.
    Sebagian besar isinya sekarang tercakup di `uji-browser.cjs`.
- **Folder `server/` tidak dicek `tsc -b`** (tidak ada di tsconfig mana pun, hanya di-build
  Vite). Cek manual dengan tsconfig sementara (`types: ["node"]` + `worker-configuration.d.ts`,
  include `server`, `worker`, `shared`). Satu galat lama: `server/main.ts:122` (3 argumen ke
  `worker.fetch`). Tidak mengganggu build.
- **Catatan menulis skrip uji:**
  - Menu sidebar dan breadcrumb sekarang berupa `<a>`, bukan `<button>`.
  - Toast sonner yang terbaru ada di urutan pertama (`.first()`).
  - Galat 401 di konsol saat cek sesi atau saat salah password memang wajar.

## 6. Server produksi

- **Alamat:** https://kp.helonoia.com, lewat reverse proxy aaPanel ke `127.0.0.1:3000`.
- **Container:** `npr-kp-app-1`.
- **Folder:** `/opt/monitoring-vsat`, dengan `docker-compose.yml` di `monitoring-vsat/`.
- **Volume data:** `npr-kp_npr-data`, dipasang di `/data`. Cadangan disimpan di `/data/cadangan/`.
- **Commit yang berjalan:** `6f8da70`, sehat. Dipasang otomatis 27 November 2026 pukul 03.55
  WIB, 4 menit setelah CI hijau. Pemasangan otomatis dengan build pertama: `e60a767` pukul 03.00
  WIB. Sebelumnya `dc554a4`
  dipasang manual lewat agent pukul 02.30 WIB karena migrasi `0003` (cadangan
  `npr-20261127-0230.sqlite`).
- **Cek dari sesi Claude:** `curl -s https://kp.helonoia.com/api/health` bisa dijalankan dari
  container Claude dan menampilkan `{"ok":true,"versi":"<commit>"}`. Commit yang hanya mengubah
  dokumen dipasang tanpa build, jadi versinya tetap commit build terakhir.
- **Data:** berisi **data demo sementara** sejak 27 November 2026 pukul 00.48 WIB, dicatat atas
  nama akun admin "mimin": 6 customer, 20 remote, 50 NPR, 19 TT, 4 Gamas. Belum ada data asli.
  Cadangan kosong sebelum demo: `npr-20261127-0048-sebelum-demo.sqlite`. Data demo
  **dipertahankan sampai penilaian KP selesai** (P-2), lalu dihapus (`review/PROMPT-DATA-DEMO.md`
  bagian B) sebelum data asli mulai dicatat.
- **Sudah dicoba pengguna lain:** sejak 27 November pukul 01.02 WIB, akun helpdesk lain menambah
  tindakan di NPR demo dan menutup satu NPR demo. Itu wajar untuk masa percobaan. Semua
  NPR di site demo, termasuk tindakan mereka, ikut terhapus oleh `--hapus`. NPR yang dicatat di
  customer asli tidak ikut terhapus, tetapi nomornya akan melanjutkan nomor demo
  (mis. `NPR/2026/11/0027`), bukan mulai dari 0001.
- **Cara pembaruan:** Claude tidak punya akses langsung ke server.
  - **Otomatis** (dipasang sekali lewat `review/PROMPT-PASANG-CD.md`): cron aaPanel menjalankan
    `scripts/perbarui-otomatis.sh` tiap 5 menit. Commit baru yang job "Periksa NPR"-nya lulus
    dipasang: cadangan, `git merge --ff-only`, build dengan `NPR_VERSI`, lalu `/api/health` harus
    menunjukkan commit baru. Bila tidak sehat, server kembali ke commit lama dan commit itu tidak
    dicoba lagi. Log: `/var/log/npr-perbarui.log`; tanda cron hidup:
    `/var/lib/npr-perbarui/cek-terakhir`; jeda: berkas `/var/lib/npr-perbarui/jeda`.
  - **Manual lewat agent browser** (`review/PROMPT-PERBARUI-SERVER.md`) hanya untuk perubahan
    besar: `migrations/`, `schema.sql`, `Dockerfile`, `docker-compose.yml`, atau pesan commit
    berisi `[manual]`. Tambahkan di bawah prompt apa yang berubah dan apa yang dicek.
  - **Pembaruan manual terakhir: `d3299dd`** (migrasi `0003`), selesai 27 November 2026 pukul
    02.30 WIB. Log server mencatat "Commit dc554a4 berisi perubahan besar … Perlu pembaruan lewat
    agent browser", jadi aturan perubahan besar terbukti bekerja. Agent memakai
    `PROMPT-PERBARUI-SERVER.md` ditambah catatan khusus: cek baris "Migrasi dijalankan" di
    `docker compose logs app`, lalu cek tampilan yang berubah. Pola ini bisa dipakai lagi untuk
    migrasi berikutnya.
  - **Status pemasangan otomatis:** terpasang 27 November 2026 sekitar pukul 01.55 WIB. Tugas
    cron aaPanel "NPR pembaruan otomatis" (Shell Script, tiap 5 menit, user root). Cron terbukti
    berjalan (`cek-terakhir` 02.00.01 WIB). Crontab juga berisi tugas lain (aaPanel dan pihak
    lain); jangan diubah.
  - **Jam server memakai UTC+8**, jadi waktu di daftar Cron aaPanel tampil satu jam lebih maju
    daripada WIB. Log skrip, `cek-terakhir`, dan nama cadangan tetap memakai WIB.
- **Reset password akun** (pengguna mengetik sendiri password barunya):

  ```bash
  cd /opt/monitoring-vsat/monitoring-vsat
  docker compose exec app node dist/server/setup.js --reset-password
  ```

## 7. Yang belum selesai atau perlu dicek

Pemeriksaan berikut dulu tertunda karena data di server masih kosong. Semuanya sudah lulus di
server lokal (`uji-browser.cjs`) dan **di kp.helonoia.com dengan data demo** (laporan agent
browser 27 November 2026, pemeriksaan a–h `PROMPT-DATA-DEMO.md`, tanpa error konsol):
- urutan kolom "No. NPR" (naik, turun, dan halaman 2 melanjutkan urutan);
- Unduh PDF TT dan PDF Gamas (dari daftar, detail, dan kartu HP; isi PDF dicek: kop, tabel,
  tanda tangan);
- kartu NPR di HP;
- link `/npr/<id>` dibuka di tab baru, juga tanpa sesi (setelah login langsung ke NPR itu);
- `/sla?bulan=…` lalu F5.

Sisa: tampilan HP di server dicek agent di bingkai selebar 400 px, bukan HP sungguhan. Di lokal
sudah lulus dengan emulasi Pixel 7. Pengguna disarankan mengecek sekali di HP sungguhan.

Sudah diperbaiki atas permintaan pengguna: daftar NPR dari Dashboard (`/npr?kondisi=…`) tanpa
urutan yang dipilih tetap terlama dulu, tetapi panahnya sekarang di "Mulai ↑" (dulu "No. NPR ↓"),
dan pilihan urutan di HP tertulis "Mulai Gangguan, Terlama". `useUrut` sekarang memakai urutan
awal selama pengguna belum memilih, dan urutan awal itu boleh berubah. Sekalian membereskan bug
lama: dulu "No. NPR terbaru" tidak bisa dipilih selama filter Dashboard aktif. Server masih
menerima `urut=terlama` supaya tab lama yang belum dimuat ulang tidak rusak.

Juga atas permintaan pengguna (tangkapan layar kolom Gangguan Terakhir):
- `lama()` di `components/npr.tsx` menulis durasi di bawah 1 jam dalam menit ("48 menit"),
  bukan "0 jam". Berlaku di Dashboard, daftar dan detail NPR, Gamas, dan Remote.
- Tanda "·" tetap dipakai di antara label pendek, tetapi tidak lagi tepat setelah jam
  ("11.09 ·" terbaca seperti salah ketik; strip terbaca seperti rentang waktu):
  - riwayat NPR dan Gamas: "22 Nov 2026, 21.02 oleh Admin Uji";
  - Gangguan Terakhir di Remote: jam dan "Selesai dalam …" / "Masih aktif" (oranye) di baris
    sendiri.
  - Baris status riwayat NPR "Remote Down · Pending TM" sekarang satu teks, sehingga jarak kiri
    dan kanan titik sama (dulu 8 px dan 2 px karena jarak flex).

**Data demo** (`server/demo.ts`, atas permintaan pengguna, keputusan: di server, sementara,
nama bank fiktif):
- `node dist/server/demo.js` mengisi 6 customer bank fiktif (Swastamita, Lembayung, Pramudita,
  Baskara, Sagara, Jenggala), 20 remote, 50 NPR (40 Closed, 4 Eskalasi, 4 Pending, 2 Open),
  19 TT, dan 4 Gamas sejak awal bulan lalu.
- Data masuk lewat `domain()` yang sama dengan API. `Date.now` dimundurkan ke waktu tiap
  kejadian, jadi nomor mengikuti bulan kejadian (gangguan Oktober = `NPR/2026/10/…`).
- Menolak berjalan bila sudah ada NPR atau Gamas. Mencadangkan database lebih dulu.
  `--jika-kosong` melewatinya tanpa galat (kode keluar 0); dipakai `MULAI-WINDOWS.cmd`.
- `npm run demo` = `node dist/server/demo.js`. Folder database dibuat otomatis oleh
  `DatabaseD1` (`server/d1.ts`, `8818679`); dulu `setup:server` gagal di salinan baru dari ZIP
  karena `data/` belum ada. CI sengaja memakai folder database yang belum ada.
- **ZIP untuk penilai** (`https://github.com/felicidad126/tyio/archive/refs/heads/Rev-NPR-Tyio.zip`,
  repo publik, tanpa login): aplikasi di folder `monitoring-vsat/`. `MULAI-WINDOWS.cmd`
  (CRLF) mengecek Node.js 22.13+, `npm install` dan build bila belum ada, `setup:server` (akun
  admin saat pertama), `npm run demo -- --jika-kosong`, membuka http://127.0.0.1:3000, lalu
  `npm start`. Tiap langkahnya diuji di Linux dari salinan bersih; berkas `.cmd`-nya sendiri
  belum dijalankan di Windows. Mode pengembang (`npm run setup` + `npm run dev`, port 5173)
  memakai database Cloudflare lokal terpisah yang hanya berisi 3 bank dan 6 site.
- `--hapus` menghapus data demo saja (dikenali dari kode + nama customer demo), menyetel ulang
  penghitung nomor, dan membiarkan akun serta data lain. Gamas campuran hanya kehilangan site
  demonya. Dijalankan di server setelah penilaian KP selesai, sebelum data asli dicatat (P-2).
- `review/uji/isi-data-uji.mjs` dihapus karena sudah digantikan `demo.js`.

`REVIEW-NPR.md` (baris 230 dan 628) masih memuat password demo lama dari kode asli, sebagai
bukti temuan. Pengguna sudah memastikan akun di server tidak memakai password itu (27 November
2026), jadi teksnya dibiarkan. Tidak perlu ditanyakan lagi.

Catatan lain yang terbuka (dikerjakan hanya bila diminta):
- Pengguna boleh melihat isi cadangan pukul 14:51 bila ingin memastikan customer dan remote yang
  hilang antara 14:51 dan 18:09. Kemungkinan besar itu data uji yang sengaja dihapus.
- Tanda "—" untuk sel kosong di tabel masih dipakai. Ganti bila pengguna menganggapnya AI slop.
- Di lebar laptop (< 1536 px) panel "Pihak yang Ditunggu" tetap di bawah tabel NPR Aktif. Di
  layar lebar ia sejajar dengan grafik. Pindahkan ke atas bila pengguna meminta.
- Proxy aaPanel untuk kp.helonoia.com menimpa `Cache-Control` berkas `/assets/` menjadi
  `max-age=60` tanpa ETag (aplikasi mengirim `max-age=31536000, immutable`). Browser mengunduh
  ulang JS setiap lewat 60 detik. Perbaikannya di pengaturan situs aaPanel (cache/expires reverse
  proxy), lewat agent, bila pengguna setuju.
- Dokumen diagram laporan KP sudah disesuaikan dengan kategori pending dan pemuatan halaman
  (`9da89d7`). `PROMPT-UJI-BROWSER.md` ditulis ulang sesuai tampilan sekarang (label, kategori
  pending, alamat per halaman, HP); semua langkahnya sudah dicoba di server lokal berisi data demo.
  Kotak Pending di detail NPR Closed sudah diperbaiki (`6f8da70`). Prompt itu belum memuat
  langkah untuk perubahan paket C (filter Aktif, tombol ×, konfirmasi Batal, `tel:`).

**Review UI/UX 27 November 2026** (dari pengguna, akun Admin, desktop ±1500 px dan HP 375 px).
Semua temuan Tinggi sudah dicocokkan dengan kode dan memang ada. Pengguna memilih paket C saja;
paket lain menunggu keputusan:

| Paket | Temuan | Status |
|---|---|---|
| A. Data benar | T4: tab Close masih menampilkan Status Remote dan "Pending oleh", "Kembali Online" terisi jam sekarang, tombol generik "Simpan Tindakan", catatan info di bawah; tab Eskalasi masih menampilkan pilihan Pending lama (server tetap menyimpan TM). T1: NPR Baru tidak memperingatkan site yang masih punya NPR aktif (`npr_aktif` sudah ada di data remote) | Belum. **Jangan** ikuti saran "setel Status Remote ke normal/online" saat Close: nilai itu menimpa kolom Gangguan NPR. Lebih tepat sembunyikan |
| B. Navigasi | T3: baris tabel `<tr onClick>`, tidak bisa buka tab baru atau dipakai keyboard (pakai pola `<a>` seperti sidebar). T2: filter, cari, urutan, halaman hilang saat Back (hanya `?kondisi=` di alamat; `param` hanya satu nilai). S1: buka TT pindah ke menu NPR | Belum |
| C. Rapikan kecil | S4, S5 sebagian, R3, R4, R5, R6, R8, R9, R10 | Selesai (`de98db7`, `6f8da70`). R8 tooltip site Gamas sudah ada sebelumnya |
| D. Fitur baru | S2 (hubungan NPR–Gamas–Remote), S3 (rincian SLA per site; catatan "belum dihitung SLA" di NPR tanpa TT), S6 (satukan cara menutup NPR dan Gamas), R1 (skeleton), R2 (cari Site ID di NPR Baru), R7 (huruf 12 → 13–14 px) | Belum; bahas satu per satu |

Catatan dari review yang sengaja tidak diikuti: "17,29% di bawah target" salah hitung (selisih
poin persen, bukan persen), jadi ditulis "selisih 17,29 poin persen". Kolom "Pending" tetap
bernama Pending (istilah kerja pengguna, keputusan P-1). Status bahasa Inggris (Open, Pending,
Closed) vs Gamas "Ditangani" belum diubah (D-8: istilah kerja tetap).

## 8. Dokumen lain di `review/`

| Berkas | Isi |
|---|---|
| `REVIEW-NPR.md` | Hasil review lengkap (kode K-, UI U-, UX X-, humanizer H-, ganti nama R-) |
| `PENJELASAN-REVIEW.md` | Penjelasan review untuk pembaca awam |
| `RENCANA-REVISI.md` | Keputusan D-1…D-8, T-1…T-6, dan tahap pengerjaan |
| `REDESAIN-NPR.md` | Aturan visual, pola tabel, ringkasan per halaman, catatan pemindahan UI |
| `DIAGRAM-NPR.md` | Diagram perancangan untuk laporan KP (ERD, use case, activity, sequence, class, modul). Sumber draw.io (`.drawio`), PNG, SVG, dan skrip ekspor `render-drawio.mjs` di `gambar/diagram/` |
| `PROMPT-*.md` | Prompt untuk agent browser: uji, cek server, pasang server, pasang pembaruan otomatis (`PASANG-CD`), perbarui server manual, data demo |
| `uji/` | Uji browser Playwright `uji-browser.cjs` (lihat bagian 5) |

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
- **Pilihan berdampak:** pertanyaan pilihan dengan opsi yang disarankan ("Recommended") diterima
  baik. Pengguna biasanya memilih saran.
- **Server:** perubahan kecil lewat CI dan pembaruan otomatis. Agent browser hanya untuk
  perubahan besar. Setelah push kode, kabari pengguna ketika CI hijau dan versi di `/api/health`
  sudah berganti.
