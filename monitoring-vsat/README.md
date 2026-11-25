# Monitoring VSAT & M2M

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

Saat `npm run setup` pertama kali, Anda diminta membuat akun admin (username, nama lengkap, dan password minimal 12 karakter). Akun lain dibuat oleh admin lewat menu Pengguna. Database baru berisi customer/remote fiktif; NPR dan TT dibuat melalui aplikasi.

## Deployment

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
