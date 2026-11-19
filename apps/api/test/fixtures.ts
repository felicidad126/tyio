import { randomBytes, randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';

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

export async function insertTenant(
  dataSource: DataSource,
  name: string,
  options: { active?: boolean } = {},
): Promise<{ id: string; code: string; name: string }> {
  const code = uniqueTenantCode();
  const rows: Array<{ id: string }> = await dataSource.query(
    'INSERT INTO tenants (code, name, active) VALUES ($1, $2, $3) RETURNING id',
    [code, name, options.active ?? true],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Tenant uji gagal dibuat.');
  return { id, code, name };
}
