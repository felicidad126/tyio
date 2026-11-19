import { randomBytes, randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { auditedTransaction } from '../src/common/audit/audit-context.js';
import { type NewUser, saveUser } from '../src/modules/users/user-accounts.js';

// Data uji unik per pemanggilan: berkas uji berjalan paralel terhadap satu database,
// jadi tidak ada uji yang boleh bergantung pada email atau kode customer yang tetap.

export const TEST_PASSWORD = 'sandi-uji-yang-panjang';

export function uniqueEmail(prefix = 'uji'): string {
  return `${prefix}-${randomUUID()}@noc.example`;
}

/** Kode customer acak yang sah: huruf besar/angka, 2–10 karakter. */
export function uniqueTenantCode(): string {
  return `T${randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Tulisan langsung dari uji, dicatat di audit seperti perbaikan manual oleh operator.
 * Tabel yang diaudit menolak perubahan tanpa konteks ini.
 */
export function asOperator<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return auditedTransaction(dataSource, { source: 'manual', label: 'uji otomatis' }, work);
}

export function operatorQuery(dataSource: DataSource, sql: string, params: unknown[] = []): Promise<unknown> {
  return asOperator(dataSource, (manager) => manager.query(sql, params));
}

export async function insertTenant(
  dataSource: DataSource,
  name: string,
  options: { active?: boolean } = {},
): Promise<{ id: string; code: string; name: string }> {
  const code = uniqueTenantCode();
  const rows = (await operatorQuery(
    dataSource,
    'INSERT INTO tenants (code, name, active) VALUES ($1, $2, $3) RETURNING id',
    [code, name, options.active ?? true],
  )) as Array<{ id: string }>;
  const id = rows[0]?.id;
  if (!id) throw new Error('Tenant uji gagal dibuat.');
  return { id, code, name };
}

/** Pengguna uji dengan email unik; seperti dibuat lewat perintah CLI. */
export async function insertUser(
  dataSource: DataSource,
  overrides: Partial<NewUser> = {},
): Promise<{ id: string; email: string }> {
  const input: NewUser = {
    email: uniqueEmail(),
    name: 'Pengguna Uji',
    role: 'l1',
    password: TEST_PASSWORD,
    ...overrides,
  };
  const user = await auditedTransaction(dataSource, { source: 'cli', label: 'uji otomatis' }, (manager) =>
    saveUser(manager, input),
  );
  return { id: user.id, email: user.email };
}
