# Tyio — Portal NOC Terpusat

Rencana: [plans/pending/portal-noc-terpusat.md](plans/pending/portal-noc-terpusat.md) ·
Langkah teknis dan progres: [plans/pending/langkah-teknis.md](plans/pending/langkah-teknis.md)

## Kebutuhan

- **Node.js 26** (LTS, lihat `.nvmrc`). `nvm use` atau `fnm use` membaca berkas ini.
- **pnpm 12.21.0**, dipin di `packageManager` pada `package.json`. pnpm versi lain yang
  terpasang akan mengunduh dan memakai versi ini secara otomatis.

## Struktur

| Folder | Isi |
| --- | --- |
| `apps/api` | API NestJS 12 (ESM). Satu modul per domain di `src/modules/<nama>` |
| `apps/web` | Antarmuka Vue 3 + Vite (kelak PWA) |
| `packages/shared` | Tipe dan konstanta yang dipakai API dan web |
| `deploy/` | Dockerfile (satu image API + web), compose dev dan staging |
| `docs/operasi/` | Cara menjalankan dan mengoperasikan |
| `docs/pengembangan/` | Aturan untuk kode baru, mis. [isolasi tenant dan audit](docs/pengembangan/tenant-dan-audit.md) |
| `.github/workflows/ci.yml` | CI: lint, build, uji, dan uji asap image lewat compose staging di setiap push |

## Perintah

```bash
pnpm install          # pasang dependensi (lockfile wajib ikut di-commit)
pnpm dev:up           # Docker: Postgres + migrasi + seed + aplikasi di http://localhost:8080
pnpm lint             # ESLint seluruh repo; peringatan pun dianggap gagal
pnpm build            # cek tipe + build semua paket (shared lebih dulu)
pnpm test             # semua uji (uji API memakai Postgres dari dev:up)
pnpm test:api health  # uji API yang path berkasnya memuat "health"
pnpm e2e smoke auth shell  # uji layar (Playwright) terhadap aplikasi yang sedang jalan
pnpm dev:down         # hentikan stack dev (dev:reset juga menghapus datanya)
```

Urutan pada clone baru: `pnpm install` → `pnpm dev:up` → `pnpm build` → `pnpm test`.
Uji API butuh Postgres asli (database `tyio_test`) dan hasil build `packages/shared/dist`.

Akun dummy untuk login di lokal: `dewi@noc.example` (L1), `arif@noc.example` (L2),
`admin@noc.example` (admin), kata sandi `sandi-dev-tyio`.

Cara menjalankan, variabel lingkungan, akun, staging, dan jaringan kantor dengan proxy TLS:
[docs/operasi/menjalankan.md](docs/operasi/menjalankan.md).

## Catatan penting

- **Lint tanpa informasi tipe.** Lint bisa jalan sebelum build; pemeriksaan tipe dikerjakan
  `pnpm build` (tsc untuk API dan shared, vue-tsc untuk web).
- **Cache Vitest tidak ikut basi saat tsconfig berubah.** Vitest 5 menyimpan hasil transform
  di `node_modules/.vitest-cache`. Setelah mengubah `tsconfig*.json`, jalankan
  `pnpm test:api --clearCache` sebelum menguji lagi.
- **Dependensi dipin persis** (tanpa `^`/`~`). Bawaan pnpm 11+ juga menolak versi yang terbit
  kurang dari 1 hari dan memblokir install script dependensi; izinkan per paket lewat
  `allowBuilds` di `pnpm-workspace.yaml` hanya bila memang perlu.
- **Rahasia tidak pernah masuk repo.** Berkas `.env*`, `*.env`, dan `deploy/certs/` diabaikan
  git; hanya contoh `*.env.example` yang boleh di-commit. Kredensial `tyio`/`tyio` di
  `deploy/compose.dev.yml` khusus Postgres dev lokal yang terikat ke 127.0.0.1.
