# Prototipe Redesain NPR

Prototipe tampilan baru aplikasi **Network Problem Report (NPR)**, PT. Tangara Mitrakom.
Isinya hanya tampilan dengan **data contoh**: tidak ada server, tidak ada database, dan
tidak ada data asli. Fitur sama dengan aplikasi di `../monitoring-vsat`. Yang dirapikan
hanya tampilannya.

Catatan keputusan desain dan cara memindahkannya ke aplikasi ada di
[`../review/REDESAIN-NPR.md`](../review/REDESAIN-NPR.md).

## Melihat prototipe

Buka `redesain-npr.html` langsung di browser. Berkas ini sudah berisi semua kode
dan tidak perlu server.

Tombol di pojok kanan bawah mengganti isi:

- **Data Contoh**: tampilan dengan data.
- **Kosong**: tampilan saat belum ada data.

Untuk melihat halaman Login, klik nama akun di kanan atas lalu pilih **Keluar**.
Password apa pun diterima, kecuali `salah` yang dipakai untuk menampilkan pesan gagal.

## Mengubah prototipe

```bash
npm install          # sekali saja
npm run dev          # mode pengembangan (Vite)
npm run cek          # pemeriksaan TypeScript
npm run bundel       # membuat ulang redesain-npr.html (Parcel + inline)
```

Teknologi yang dipakai: React 18, TypeScript, Tailwind CSS 3.4, komponen shadcn/ui
(Radix), ikon Lucide, notifikasi sonner, dan kalender react-day-picker.

## Susunan berkas

| Berkas | Isi |
|---|---|
| `src/App.tsx` | Kerangka: sidebar, menu HP, topbar, breadcrumb, perpindahan halaman |
| `src/components/npr.tsx` | Komponen dasar: `PageHeader`, `Panel`, `StatusBadge`, `InfoList`, `FieldLabel`, `EmptyState` |
| `src/components/tabel.tsx` | Bagian tabel bersama: `Toolbar` (cari + Filter), `BarisRingkasan` (jumlah + chip), `KepalaUrut` (sort naik/turun), `useUrut`, `urutkan` |
| `src/components/tanggal.tsx` | `TanggalInput` (ketik dd/mm/yyyy atau kalender) dan `WaktuInput` (tanggal + jam 24 jam) |
| `src/components/sandi.tsx` | `InputSandi` (password dengan tombol tampilkan) |
| `src/pages/*.tsx` | Satu berkas per halaman |
| `src/lib/data.ts` | Data contoh (customer, remote, NPR, TT, Gamas, SLA, pengguna) |
| `src/components/ui/` | Komponen shadcn/ui bawaan |
