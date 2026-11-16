import type { MixedList } from 'typeorm';

// Satu-satunya daftar entity dan migrasi. Aplikasi, skrip migrasi, seed, dan uji
// semuanya membaca dari sini, sehingga tidak ada dua daftar yang bisa menyimpang.
// Daftar eksplisit (bukan glob) agar aman di ESM dan di dalam image.

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- tipe dari TypeORM
type Registrable = MixedList<Function>;

export const entities: Registrable = [];

/** Urutan harus dipertahankan: migrasi baru selalu ditambahkan di akhir. */
export const migrations: Registrable = [];
