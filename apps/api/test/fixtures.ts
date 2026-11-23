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

/**
 * Potongan SQL untuk entri pindah status yang disisipkan langsung dengan status tujuan `$3`:
 * ke Ditutup harus entri `tutup` dengan penyebab (langkah 1.6), selain itu `catatan`.
 */
export const CLOSE_KIND = `CASE WHEN $3::text = 'ditutup' THEN 'tutup' ELSE 'catatan' END`;
export const CLOSE_CAUSE = `CASE WHEN $3::text = 'ditutup' THEN 'lainnya' END`;

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
  overrides: {
    code?: string;
    name?: string;
    networkId?: string;
    city?: string;
    active?: boolean;
    zone?: 'WIB' | 'WITA' | 'WIT';
  } = {},
): Promise<{ id: string; code: string; name: string; networkId: string }> {
  const networkId = overrides.networkId ?? (await insertMasterValue(dataSource, 'jarkom', tenantId)).id;
  const code = overrides.code ?? `R-${randomBytes(4).toString('hex').toUpperCase()}`;
  const name = overrides.name ?? `Remote ${code}`;
  const rows = (await operatorQuery(
    dataSource,
    `INSERT INTO remotes (tenant_id, code, name, network_id, time_zone, city, active)
     VALUES ($1, $2, $3, $4, $7, $5, $6) RETURNING id`,
    [tenantId, code, name, networkId, overrides.city ?? null, overrides.active ?? true, overrides.zone ?? 'WIB'],
  )) as Array<{ id: string }>;
  const id = rows[0]?.id;
  if (!id) throw new Error('Remote uji gagal dibuat.');
  return { id, code, name, networkId };
}

/**
 * NPR uji yang disisipkan langsung (seperti perbaikan manual); nomornya dibuat trigger
 * database seperti NPR dari API. Remote, kategori, system, dan pembuat dibuat baru bila
 * tidak diberikan.
 */
export async function insertTicket(
  dataSource: DataSource,
  tenantId: string,
  overrides: { remoteId?: string; description?: string } = {},
): Promise<{ id: string; number: string; remoteId: string }> {
  const remoteId = overrides.remoteId ?? (await insertRemote(dataSource, tenantId)).id;
  const category = await insertMasterValue(dataSource, 'kategori', tenantId);
  const system = await insertMasterValue(dataSource, 'system', tenantId);
  const user = await insertUser(dataSource);
  const rows = (await operatorQuery(
    dataSource,
    `INSERT INTO tickets (tenant_id, remote_id, network_id, category_id, system_id, description, started_at, created_by)
     SELECT $1, r.id, r.network_id, $3, $4, $5, now(), $6 FROM remotes r WHERE r.id = $2
     RETURNING id, number`,
    [tenantId, remoteId, category.id, system.id, overrides.description ?? 'NPR uji', user.id],
  )) as Array<{ id: string; number: string }>;
  const ticket = rows[0];
  if (!ticket) throw new Error('NPR uji gagal dibuat.');
  return { ...ticket, remoteId };
}

/**
 * Tindakan "catatan" beserta satu lampiran teks, disisipkan langsung dalam satu transaksi
 * (lampiran hanya bisa ditambahkan bersama entrinya). Pembuatnya pembuat NPR.
 */
export async function insertNoteWithAttachment(
  dataSource: DataSource,
  ticketId: string,
  content = 'isi lampiran uji',
): Promise<{ actionId: string; attachmentId: string }> {
  return asOperator(dataSource, async (manager) => {
    const [action] = (await manager.query(
      `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, created_by)
       SELECT tenant_id, id, 'catatan', 'Catatan uji', now(), created_by FROM tickets WHERE id = $1
       RETURNING id`,
      [ticketId],
    )) as Array<{ id: string }>;
    if (!action) throw new Error('Tindakan uji gagal dibuat.');
    const bytes = Buffer.from(content);
    const [attachment] = (await manager.query(
      `INSERT INTO ticket_attachments (tenant_id, ticket_id, action_id, file_name, content_type, size_bytes,
                                       sha256, content, created_by)
       SELECT tenant_id, id, $2, 'uji.txt', 'text/plain', $3, encode(sha256($4), 'hex'), $4, created_by
         FROM tickets WHERE id = $1
       RETURNING id`,
      [ticketId, action.id, bytes.length, bytes],
    )) as Array<{ id: string }>;
    if (!attachment) throw new Error('Lampiran uji gagal dibuat.');
    return { actionId: action.id, attachmentId: attachment.id };
  });
}

/** TT uji untuk NPR yang ada, disisipkan langsung; nomor dibuat trigger database. */
export async function insertTroubleTicket(
  dataSource: DataSource,
  ticketId: string,
  problem = 'Modem VSAT tidak sinkron',
): Promise<{ id: string; number: string }> {
  const rows = (await operatorQuery(
    dataSource,
    `INSERT INTO trouble_tickets (tenant_id, ticket_id, remote_id, network_id, problem, created_by)
     SELECT tenant_id, id, remote_id, network_id, $2, created_by FROM tickets WHERE id = $1
     RETURNING id, number`,
    [ticketId, problem],
  )) as Array<{ id: string; number: string }>;
  const tt = rows[0];
  if (!tt) throw new Error('TT uji gagal dibuat.');
  return tt;
}

/** Pindahkan NPR (selain ke Ditutup) lewat entri `catatan` yang disisipkan langsung oleh pembuatnya. */
export async function moveTicketDirect(dataSource: DataSource, ticketId: string, to: string): Promise<void> {
  await operatorQuery(
    dataSource,
    `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to, created_by)
     SELECT tenant_id, id, 'catatan', 'Pindah status', now(), status, $2, created_by FROM tickets WHERE id = $1`,
    [ticketId, to],
  );
}

/**
 * Tutup TT langsung lewat entri `tt_ditutup` (langkah 1.6), seperti perbaikan manual.
 * Penutupnya harus L2/admin (K21); bila tidak diberikan, dibuat pengguna L2 baru.
 */
export async function closeTroubleTicketDirect(
  dataSource: DataSource,
  troubleTicketId: string,
  options: { closedBy?: string; resolution?: string } = {},
): Promise<void> {
  const closedBy = options.closedBy ?? (await insertUser(dataSource, { role: 'l2', name: 'Penutup TT' })).id;
  await operatorQuery(
    dataSource,
    `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, trouble_ticket_id, created_by)
     SELECT tenant_id, ticket_id, 'tt_ditutup', $2, now(), id, $3 FROM trouble_tickets WHERE id = $1`,
    [troubleTicketId, options.resolution ?? 'Teknisi SD mengganti modem; remote stabil', closedBy],
  );
}

/**
 * Tutup NPR langsung (pindah ke Pulih bila perlu, lalu entri `tutup`), seperti perbaikan
 * manual. Penutup bawaan pembuat NPR (L1); NPR yang punya TT butuh `closedBy` L2/admin (K21).
 */
export async function closeTicketDirect(
  dataSource: DataSource,
  ticketId: string,
  options: { closedBy?: string; cause?: string; resolution?: string } = {},
): Promise<void> {
  await asOperator(dataSource, async (manager) => {
    const [ticket] = (await manager.query('SELECT status FROM tickets WHERE id = $1', [ticketId])) as Array<{
      status: string;
    }>;
    if (ticket && ticket.status !== 'pulih') {
      await manager.query(
        `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to, created_by)
         SELECT tenant_id, id, 'catatan', 'Remote pulih', now(), status, 'pulih', created_by FROM tickets WHERE id = $1`,
        [ticketId],
      );
    }
    await manager.query(
      `INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to, close_cause,
                                   created_by)
       SELECT tenant_id, id, 'tutup', $2, now(), 'pulih', 'ditutup', $3, coalesce($4::uuid, created_by)
         FROM tickets WHERE id = $1`,
      [ticketId, options.resolution ?? 'Listrik kembali menyala', options.cause ?? 'listrik', options.closedBy ?? null],
    );
  });
}

/** Berkas .xlsx dari baris-baris sel (baris pertama = judul kolom). */
export async function buildXlsx(rows: Array<Array<string | number | Date | null>>): Promise<Buffer> {
  const { default: writeXlsxFile } = await import('write-excel-file/node');
  return writeXlsxFile(rows, { dateFormat: 'yyyy-mm-dd' }).toBuffer();
}
