import { LoginFailureEntity } from '../modules/auth/login-failure.entity.js';
import { SessionEntity } from '../modules/auth/session.entity.js';
import { TenantEntity } from '../modules/tenants/tenant.entity.js';
import { UserTenantEntity } from '../modules/users/user-tenant.entity.js';
import { UserEntity } from '../modules/users/user.entity.js';
import { AuthAwal1794826197546 } from './migrations/1794826197546-auth-awal.js';

// Satu-satunya daftar entity dan migrasi. Aplikasi, skrip migrasi, seed, dan uji
// semuanya membaca dari sini, sehingga tidak ada dua daftar yang bisa menyimpang.
// Daftar eksplisit (bukan glob) agar aman di ESM dan di dalam image.

export const entities = [
  TenantEntity,
  UserEntity,
  UserTenantEntity,
  SessionEntity,
  LoginFailureEntity,
];

/** Urutan harus dipertahankan: migrasi baru selalu ditambahkan di akhir. */
export const migrations = [AuthAwal1794826197546];
