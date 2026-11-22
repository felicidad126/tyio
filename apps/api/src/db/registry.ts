import type { MixedList } from 'typeorm';
import { AuditEntryRow } from '../common/audit/audit-entry.entity.js';
import { LoginAttempt } from '../modules/auth/login-attempt.entity.js';
import { Session } from '../modules/auth/session.entity.js';
import { MasterCategory, MasterNetwork, MasterSystem } from '../modules/master/master-value.entity.js';
import { Tenant } from '../modules/tenants/tenant.entity.js';
import { User } from '../modules/users/user.entity.js';
import { TenantsUsersSessions1795092388634 } from './migrations/1795092388634-tenants-users-sessions.js';
import { AuditLog1795094119322 } from './migrations/1795094119322-audit-log.js';
import { MasterData1795154430192 } from './migrations/1795154430192-master-data.js';
import { Remotes1795193901420 } from './migrations/1795193901420-remotes.js';
import { Tickets1795244806675 } from './migrations/1795244806675-tickets.js';
import { TicketActions1795352000000 } from './migrations/1795352000000-ticket-actions.js';
import { TicketAssignee1795420000000 } from './migrations/1795420000000-ticket-assignee.js';

// Satu-satunya daftar entity dan migrasi. Aplikasi, skrip migrasi, seed, dan uji
// semuanya membaca dari sini, sehingga tidak ada dua daftar yang bisa menyimpang.
// Daftar eksplisit (bukan glob) agar aman di ESM dan di dalam image.

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- tipe dari TypeORM
type Registrable = MixedList<Function>;

export const entities: Registrable = [
  Tenant,
  User,
  Session,
  LoginAttempt,
  AuditEntryRow,
  MasterCategory,
  MasterSystem,
  MasterNetwork,
];

/** Urutan harus dipertahankan: migrasi baru selalu ditambahkan di akhir. */
export const migrations: Registrable = [
  TenantsUsersSessions1795092388634,
  AuditLog1795094119322,
  MasterData1795154430192,
  Remotes1795193901420,
  Tickets1795244806675,
  TicketActions1795352000000,
  TicketAssignee1795420000000,
];
