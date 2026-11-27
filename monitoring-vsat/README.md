# NPR — Network Problem Report

Aplikasi tugas Kerja Praktek, Universitas Dian Nusantara.

Baca **PANDUAN-MULAI.md** untuk panduan lengkap, dan **ATURAN-SLA.md** untuk aturan perhitungan simulasi SLA.

## Jalankan lokal

Windows: ekstrak ke folder baru dan klik dua kali **MULAI-WINDOWS.cmd**.

Atau melalui terminal:

```sh
npm install
npm run setup
npm run dev
```

Saat `npm run setup` pertama kali, Anda diminta membuat akun admin (username, nama lengkap, dan password minimal 12 karakter). Akun lain dibuat oleh admin lewat menu Pengguna. Database baru berisi 3 bank dan 6 site fiktif; NPR, TT, dan Gamas dibuat melalui aplikasi.

## Data demo lengkap

ZIP hanya berisi kode, tanpa data dari server. Untuk mencoba dengan data contoh yang lengkap (6 bank, 20 site, 50 NPR, 19 TT, dan 4 TT Gamas, semuanya fiktif), jalankan aplikasi sebagai server Node (Node.js 22.13 atau lebih baru). Jalankan satu per satu di folder ini:

```sh
npm install
npm run build
npm run build:server
npm run setup:server
npm run demo
npm start
```

Lalu buka http://127.0.0.1:3000 dan login dengan akun admin yang dibuat saat `setup:server`. Database tersimpan di `data/npr.sqlite` (folder dibuat otomatis) dan terpisah dari database `npm run dev`. `npm run demo` menolak berjalan bila sudah ada NPR atau TT Gamas, dan mencadangkan database lebih dulu ke `data/cadangan/`. Data demo bisa dihapus lagi dengan `npm run demo -- --hapus`; akun dan data lain tidak ikut terhapus.

## Server sendiri (Docker)

Untuk server Linux dengan Docker (misalnya dengan aaPanel), aplikasi berjalan sebagai server Node.js dengan database SQLite, tanpa Cloudflare. Langkah lengkapnya di **PASANG-SERVER.md**:

```sh
echo "ALAMAT_PUBLIK=https://npr.contoh.id" > .env
docker compose up -d --build
docker compose exec app node dist/server/setup.js
```

Tanpa Docker: `npm run build && npm run build:server`, lalu `npm run setup:server` dan `npm start` (Node.js 22.13 atau lebih baru).

## Deployment Cloudflare

```sh
npx wrangler login
npm run setup:remote
npm run deploy
```

Isi `database_id` di wrangler.jsonc dengan ID database D1 Anda sebelum deploy. Setup remote meminta data akun admin jika belum ada admin. Setup aman diulang, tidak menghapus data, dan tidak menimpa akun yang sudah ada. Untuk mengganti password satu akun gunakan `npm run password:remote`.

## Validasi

```sh
npm run build
npm run lint
```

Untuk uji API dengan server lokal berjalan (membuat data QA lokal). Uji memakai akun admin lokal; isi lewat variabel lingkungan atau ketik saat diminta:

```sh
TEST_USERNAME=admin TEST_PASSWORD=... npm run test:api
```

Frontend React + TypeScript + Vite; backend Cloudflare Workers; database D1; PDF menggunakan jsPDF. Dua peran: admin (termasuk mengelola akun) dan helpdesk. Monitoring awal manual; tidak ada ping atau konfigurasi perangkat.
