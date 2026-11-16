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
| `.github/workflows/ci.yml` | CI: lint, build, uji di setiap push |

## Perintah

```bash
pnpm install          # pasang dependensi (lockfile wajib ikut di-commit)
pnpm lint             # ESLint seluruh repo; peringatan pun dianggap gagal
pnpm build            # cek tipe + build semua paket (shared lebih dulu)
pnpm test             # semua uji
pnpm test:api health  # uji API yang path berkasnya memuat "health"
```

Urutan pada clone baru: `pnpm install` → `pnpm build` → `pnpm test`. API memakai hasil build
`packages/shared/dist`, jadi uji API butuh build lebih dulu.

Menjalankan API hasil build: `pnpm build && node apps/api/dist/main.js` (port dari `PORT`,
bawaan 3000), lalu buka `http://localhost:3000/health`.

## Catatan penting

- **Lint tanpa informasi tipe.** Lint bisa jalan sebelum build; pemeriksaan tipe dikerjakan
  `pnpm build` (tsc untuk API dan shared, vue-tsc untuk web).
- **Cache Vitest tidak ikut basi saat tsconfig berubah.** Vitest 5 menyimpan hasil transform
  di `node_modules/.vitest-cache`. Setelah mengubah `tsconfig*.json`, jalankan
  `pnpm test:api --clearCache` sebelum menguji lagi.
- **Dependensi dipin persis** (tanpa `^`/`~`). Bawaan pnpm 11+ juga menolak versi yang terbit
  kurang dari 1 hari dan memblokir install script dependensi; izinkan per paket lewat
  `allowBuilds` di `pnpm-workspace.yaml` hanya bila memang perlu.
- **Rahasia tidak pernah masuk repo.** Berkas `.env*` diabaikan git; contoh nilai kelak di
  `.env.example`.
