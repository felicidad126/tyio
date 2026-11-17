import { AuditEntryEntity } from '../common/audit/audit-entry.entity.js';
import { LoginFailureEntity } from '../modules/auth/login-failure.entity.js';
import { SessionEntity } from '../modules/auth/session.entity.js';
import {
  JarkomEntity,
  SystemEntity,
  TicketCategoryEntity,
} from '../modules/master/master.entities.js';
import { RemoteEntity } from '../modules/remotes/remote.entity.js';
import { TenantEntity } from '../modules/tenants/tenant.entity.js';
import { UserTenantEntity } from '../modules/users/user-tenant.entity.js';
import { UserEntity } from '../modules/users/user.entity.js';
import { AuthAwal1794826197546 } from './migrations/1794826197546-auth-awal.js';
import { AuditLog1794888560196 } from './migrations/1794888560196-audit-log.js';
import { MasterData1794908015332 } from './migrations/1794908015332-master-data.js';
import { Remotes1794910075612 } from './migrations/1794910075612-remotes.js';

// Satu-satunya daftar entity dan migrasi. Aplikasi, skrip migrasi, seed, dan uji
// semuanya membaca dari sini, sehingga tidak ada dua daftar yang bisa menyimpang.
// Daftar eksplisit (bukan glob) agar aman di ESM dan di dalam image.

export const entities = [
  TenantEntity,
  UserEntity,
  UserTenantEntity,
  SessionEntity,
  LoginFailureEntity,
  AuditEntryEntity,
  TicketCategoryEntity,
  SystemEntity,
  JarkomEntity,
  RemoteEntity,
];

/** Urutan harus dipertahankan: migrasi baru selalu ditambahkan di akhir. */
export const migrations = [
  AuthAwal1794826197546,
  AuditLog1794888560196,
  MasterData1794908015332,
  Remotes1794910075612,
];
