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

const MASTER_TABLES = {
  kategori: 'master_categories',
  system: 'master_systems',
  jarkom: 'master_networks',
} as const;

/** Nilai master uji milik satu customer; jarkom diberi kode acak. */
export async function insertMasterValue(
  dataSource: DataSource,
  kind: keyof typeof MASTER_TABLES,
  tenantId: string,
  name = `Nilai ${randomBytes(3).toString('hex')}`,
): Promise<{ id: string; name: string; code: string | null }> {
  const code = kind === 'jarkom' ? uniqueTenantCode() : null;
  const columns = code ? '(tenant_id, name, code) VALUES ($1, $2, $3)' : '(tenant_id, name) VALUES ($1, $2)';
  const rows = (await operatorQuery(
    dataSource,
    `INSERT INTO ${MASTER_TABLES[kind]} ${columns} RETURNING id`,
    code ? [tenantId, name, code] : [tenantId, name],
  )) as Array<{ id: string }>;
  const id = rows[0]?.id;
  if (!id) throw new Error('Nilai master uji gagal dibuat.');
  return { id, name, code };
}

/** Remote uji milik satu customer, dengan jarkom baru milik customer yang sama. */
export async function insertRemote(
  dataSource: DataSource,
  tenantId: string,
  overrides: { code?: string; name?: string; networkId?: string; city?: string; active?: boolean } = {},
): Promise<{ id: string; code: string; name: string; networkId: string }> {
  const networkId = overrides.networkId ?? (await insertMasterValue(dataSource, 'jarkom', tenantId)).id;
  const code = overrides.code ?? `R-${randomBytes(4).toString('hex').toUpperCase()}`;
  const name = overrides.name ?? `Remote ${code}`;
  const rows = (await operatorQuery(
    dataSource,
    `INSERT INTO remotes (tenant_id, code, name, network_id, time_zone, city, active)
     VALUES ($1, $2, $3, $4, 'WIB', $5, $6) RETURNING id`,
    [tenantId, code, name, networkId, overrides.city ?? null, overrides.active ?? true],
  )) as Array<{ id: string }>;
  const id = rows[0]?.id;
  if (!id) throw new Error('Remote uji gagal dibuat.');
  return { id, code, name, networkId };
}

/** Berkas .xlsx dari baris-baris sel (baris pertama = judul kolom). */
export async function buildXlsx(rows: Array<Array<string | number | Date | null>>): Promise<Buffer> {
  const { default: writeXlsxFile } = await import('write-excel-file/node');
  return writeXlsxFile(rows, { dateFormat: 'yyyy-mm-dd' }).toBuffer();
}
