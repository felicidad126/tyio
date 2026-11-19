import type { MixedList } from 'typeorm';
import { AuditEntryRow } from '../common/audit/audit-entry.entity.js';
import { LoginAttempt } from '../modules/auth/login-attempt.entity.js';
import { Session } from '../modules/auth/session.entity.js';
import { Tenant } from '../modules/tenants/tenant.entity.js';
import { User } from '../modules/users/user.entity.js';
import { TenantsUsersSessions1795092388634 } from './migrations/1795092388634-tenants-users-sessions.js';
import { AuditLog1795094119322 } from './migrations/1795094119322-audit-log.js';

// Satu-satunya daftar entity dan migrasi. Aplikasi, skrip migrasi, seed, dan uji
// semuanya membaca dari sini, sehingga tidak ada dua daftar yang bisa menyimpang.
// Daftar eksplisit (bukan glob) agar aman di ESM dan di dalam image.

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- tipe dari TypeORM
type Registrable = MixedList<Function>;

export const entities: Registrable = [Tenant, User, Session, LoginAttempt, AuditEntryRow];

/** Urutan harus dipertahankan: migrasi baru selalu ditambahkan di akhir. */
export const migrations: Registrable = [TenantsUsersSessions1795092388634, AuditLog1795094119322];
