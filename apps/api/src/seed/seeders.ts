import { PASSWORD_MIN_LENGTH, type Role } from '@tyio/shared';
import type { TyioEnv } from '../config.js';
import { saveUser } from '../modules/users/user-accounts.js';
import type { Seeder } from './seed.js';

// Data dummy per modul, dijalankan berurutan oleh `node dist/seed/run.js`.
// Nama bank samaran (K19, K22); sama dengan data di mockup (design/mockup/ATURAN.md §8).

export const SEED_TENANTS: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'BNA', name: 'Bank Nusa' },
  { code: 'BAD', name: 'Bank Andalas' },
  { code: 'BSL', name: 'Bank Selaras' },
  { code: 'BPT', name: 'BPD Timur' },
];

/** Domain `.example` dicadangkan untuk contoh (RFC 2606), jadi tidak pernah dikirimi email. */
export const SEED_USERS: ReadonlyArray<{
  email: string;
  name: string;
  role: Role;
  tenantCodes?: readonly string[];
}> = [
  { email: 'admin@noc.example', name: 'Admin NOC', role: 'admin' },
  { email: 'dewi@noc.example', name: 'Dewi A.', role: 'l1' },
  // Contoh akses terbatas (K26): hanya dua customer.
  { email: 'rudi@noc.example', name: 'Rudi H.', role: 'l1', tenantCodes: ['BNA', 'BAD'] },
  { email: 'arif@noc.example', name: 'Arif S.', role: 'l2' },
  { email: 'sari@noc.example', name: 'Sari P.', role: 'l2' },
];

/** Kata sandi semua akun dummy di lingkungan development dan test. Bukan rahasia. */
export const DEV_SEED_PASSWORD = 'sandi-dev-tyio';

/**
 * Kata sandi akun dummy: dari SEED_USER_PASSWORD bila diisi; bawaan hanya di development
 * dan test. Staging wajib mengisinya, karena staging bisa dibuka orang lain.
 */
export function seedUserPassword(env: TyioEnv, source: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = source.SEED_USER_PASSWORD;
  if (fromEnv) {
    if (fromEnv.length < PASSWORD_MIN_LENGTH) {
      throw new Error(`SEED_USER_PASSWORD minimal ${PASSWORD_MIN_LENGTH} karakter.`);
    }
    return fromEnv;
  }
  if (env === 'development' || env === 'test') return DEV_SEED_PASSWORD;
  throw new Error(
    `SEED_USER_PASSWORD wajib diisi (minimal ${PASSWORD_MIN_LENGTH} karakter) untuk seed pengguna di ${env}.`,
  );
}

/** `userPassword` dibaca saat seeder pengguna berjalan, bukan saat daftar disusun. */
export function createSeeders(options: { userPassword: () => string }): Seeder[] {
  return [
    {
      name: 'tenant',
      run: async (manager) => {
        for (const tenant of SEED_TENANTS) {
          await manager.query(
            `INSERT INTO tenants (code, name) VALUES ($1, $2)
             ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, active = true, updated_at = now()`,
            [tenant.code, tenant.name],
          );
        }
      },
    },
    {
      name: 'pengguna',
      run: async (manager) => {
        const password = options.userPassword();
        for (const user of SEED_USERS) {
          await saveUser(manager, { ...user, password }, { replaceExisting: true });
        }
      },
    },
  ];
}
