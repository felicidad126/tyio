import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  type RemoteContact,
  type RemoteDetail,
  type RemoteImportReport,
  type RemoteMap,
  type RemotePage,
  type RemoteSummary,
  type RemoteZone,
} from '@npr/shared';
import { readSheet } from 'read-excel-file/node';
import writeXlsxFile from 'write-excel-file/node';
import type { DataSource, EntityManager, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { type AuditActor, applyAuditActor } from '../../common/audit/audit-context.js';
import { applyTenantScope, scopeIncludes, type TenantScope } from '../../common/tenant/tenant-scope.js';
import { isInUseError, postgresError } from '../master/master-input.js';
import { TENANT_NOT_FOUND_MESSAGE } from '../tenants/tenants.controller.js';
import {
  type CellValue,
  IMPORT_COLUMNS,
  ImportFileError,
  type NetworkOption,
  parseRemoteImport,
  type RemoteInput,
} from './remote-import.parser.js';

export const REMOTE_NOT_FOUND_MESSAGE = 'Remote tidak ditemukan.';

/** Saringan remote yang sama untuk daftar dan peta (langkah 2.3). */
export interface RemoteCriteria {
  q?: string;
  tenantId?: string;
  networkId?: string;
  active?: boolean;
  /** `false` = hanya remote yang belum punya koordinat (T143). */
  hasCoordinates?: boolean;
}

export interface RemoteFilters extends RemoteCriteria {
  page: number;
  pageSize: number;
}

interface SummaryRow {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  network_code: string;
  network_name: string;
  city: string | null;
  province: string | null;
  time_zone: RemoteZone;
  kanwil: string | null;
  kanca: string | null;
  ip_snmp: string | null;
  active: boolean;
}

interface DetailRow extends SummaryRow {
  network_id: string;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  ip_lan: string | null;
  user_ip: string | null;
  user_ident: string | null;
  manager: string | null;
  online_since: string | null;
  contacts: RemoteContact[];
}

/**
 * Remote per customer (langkah 1.2). Semua baca lewat cakupan customer pengguna (T9);
 * remote di luar cakupan diperlakukan seperti tidak ada (T29). Impor menulis lewat konteks
 * audit (T25) dalam satu transaksi.
 */
@Injectable()
export class RemotesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(scope: TenantScope, filters: RemoteFilters): Promise<RemotePage> {
    const query = this.filtered(scope, filters);
    const total = await query.clone().select('count(*)::int', 'total').getRawOne<{ total: number }>();
    const rows = await query
      .select(SUMMARY_COLUMNS)
      .orderBy('r.code')
      .addOrderBy('r.tenant_id')
      .offset((filters.page - 1) * filters.pageSize)
      .limit(filters.pageSize)
      .getRawMany<SummaryRow>();
    return {
      items: rows.map(toSummary),
      total: total?.total ?? 0,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  /**
   * Peta remote (langkah 2.3): remote yang cocok dengan saringan dan punya koordinat, beserta
   * jumlah NPR berjalan (T141), dan banyaknya remote cocok tanpa koordinat (T143). Saringannya
   * sama dengan daftar, jadi angka di peta sama dengan jumlah di daftar.
   */
  async map(scope: TenantScope, criteria: RemoteCriteria): Promise<RemoteMap> {
    const missing = await this.filtered(scope, { ...criteria, hasCoordinates: false })
      .select('count(*)::int', 'n')
      .getRawOne<{ n: number }>();
    const rows = await this.filtered(scope, { ...criteria, hasCoordinates: true })
      .leftJoin(
        (sub: SelectQueryBuilder<ObjectLiteral>) =>
          sub
            .from('tickets', 'tk')
            .select('tk.remote_id', 'remote_id')
            .addSelect('count(*)::int', 'open')
            .where(`tk.status <> 'ditutup'`)
            .groupBy('tk.remote_id'),
        'o',
        'o.remote_id = r.id',
      )
      .select(['r.id AS id', 'r.code AS code', 'r.name AS name', 'r.latitude AS latitude', 'r.longitude AS longitude'])
      .addSelect('coalesce(o.open, 0)::int', 'open')
      .orderBy('r.code')
      .addOrderBy('r.tenant_id')
      .getRawMany<{ id: string; code: string; name: string; latitude: string; longitude: string; open: number }>();
    return {
      points: rows.map((row) => [row.id, row.code, row.name, Number(row.latitude), Number(row.longitude), row.open]),
      withoutCoordinates: missing?.n ?? 0,
    };
  }

  /** Remote dalam cakupan customer pengguna (T9) yang cocok dengan saringan; alias `r` dan `n`. */
  private filtered(scope: TenantScope, criteria: RemoteCriteria): SelectQueryBuilder<ObjectLiteral> {
    const query = applyTenantScope(
      this.dataSource
        .createQueryBuilder()
        .from('remotes', 'r')
        .innerJoin('master_networks', 'n', 'n.id = r.network_id'),
      scope,
      'r.tenant_id',
    );
    if (criteria.tenantId) query.andWhere('r.tenant_id = :tenantId', { tenantId: criteria.tenantId });
    if (criteria.networkId) query.andWhere('r.network_id = :networkId', { networkId: criteria.networkId });
    if (criteria.active !== undefined) query.andWhere('r.active = :active', { active: criteria.active });
    if (criteria.hasCoordinates !== undefined) {
      query.andWhere(criteria.hasCoordinates ? 'r.latitude IS NOT NULL' : 'r.latitude IS NULL');
    }
    if (criteria.q) {
      // Huruf %, _, dan \ di kata kunci dicari apa adanya, bukan sebagai pola.
      const pattern = `%${criteria.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      query.andWhere(
        `(r.code ILIKE :pattern OR r.name ILIKE :pattern OR r.city ILIKE :pattern OR r.province ILIKE :pattern
          OR r.kanwil ILIKE :pattern OR r.kanca ILIKE :pattern OR r.manager ILIKE :pattern
          OR host(r.ip_snmp) LIKE :pattern OR host(r.ip_lan) LIKE :pattern)`,
        { pattern },
      );
    }
    return query;
  }

  async get(scope: TenantScope, id: string): Promise<RemoteDetail | null> {
    const row = await applyTenantScope(
      this.dataSource
        .createQueryBuilder()
        .from('remotes', 'r')
        .innerJoin('master_networks', 'n', 'n.id = r.network_id')
        .select([
          ...SUMMARY_COLUMNS,
          'r.network_id AS network_id',
          'r.address AS address',
          'r.latitude::text AS latitude',
          'r.longitude::text AS longitude',
          'host(r.ip_lan) AS ip_lan',
          'host(r.user_ip) AS user_ip',
          'r.user_ident AS user_ident',
          'r.manager AS manager',
          "to_char(r.online_since, 'YYYY-MM-DD') AS online_since",
          'r.contacts AS contacts',
        ])
        .where('r.id = :id', { id }),
      scope,
      'r.tenant_id',
    ).getRawOne<DetailRow>();
    if (!row) return null;
    return {
      ...toSummary(row),
      networkId: row.network_id,
      address: row.address,
      latitude: row.latitude === null ? null : Number(row.latitude),
      longitude: row.longitude === null ? null : Number(row.longitude),
      ipLan: row.ip_lan,
      userIp: row.user_ip,
      userIdent: row.user_ident,
      manager: row.manager,
      onlineSince: row.online_since,
      contacts: row.contacts,
    };
  }

  /**
   * Impor remote dari berkas .xlsx untuk satu customer (T50, T51). `preview` menjalankan
   * semuanya di dalam transaksi lalu membatalkannya, sehingga angka pratinjau sama persis
   * dengan hasil simpan. `save` menyimpan baris yang benar saja; kode yang sudah ada
   * memperbarui remote itu.
   */
  async import(
    scope: TenantScope,
    actor: AuditActor,
    tenantId: string,
    file: Buffer,
    mode: 'preview' | 'save',
  ): Promise<RemoteImportReport> {
    if (!scopeIncludes(scope, tenantId)) throw new NotFoundException(TENANT_NOT_FOUND_MESSAGE);
    const [tenant] = (await this.dataSource.query('SELECT id FROM tenants WHERE id = $1 AND active', [
      tenantId,
    ])) as Array<{ id: string }>;
    if (!tenant) throw new NotFoundException(TENANT_NOT_FOUND_MESSAGE);

    const rows = await readRows(file);
    const networks = new Map<string, NetworkOption>(
      (
        (await this.dataSource.query('SELECT id, code, active FROM master_networks WHERE tenant_id = $1', [
          tenantId,
        ])) as Array<{ id: string; code: string; active: boolean }>
      ).map((network) => [network.code, { id: network.id, active: network.active }]),
    );

    let parsed;
    try {
      parsed = parseRemoteImport(rows, networks, todayInIndonesia());
    } catch (error) {
      if (error instanceof ImportFileError) throw new BadRequestException(error.message);
      throw error;
    }

    const counts = await this.inTransaction(actor, mode === 'save', (manager) =>
      upsertRemotes(manager, tenantId, parsed.valid.map((item) => item.remote), parsed.columns),
    );
    return { mode, totalRows: parsed.totalRows, ...counts, failed: parsed.failed };
  }

  /** Templat impor: sheet "Remote" berisi judul kolom saja, sheet "Petunjuk" berisi aturannya. */
  async template(): Promise<Buffer> {
    const bold = (value: string) => ({ value, fontWeight: 'bold' as const });
    return writeXlsxFile([
      {
        sheet: 'Remote',
        data: [IMPORT_COLUMNS.map((column) => bold(column.title))],
        columns: IMPORT_COLUMNS.map((column) => ({ width: Math.max(14, column.title.length + 4) })),
        stickyRowsCount: 1,
      },
      {
        sheet: 'Petunjuk',
        data: [
          [bold('Kolom'), bold('Wajib'), bold('Petunjuk'), bold('Contoh')],
          ...IMPORT_COLUMNS.map((column) => [
            column.title,
            column.required ? 'Wajib' : '',
            column.hint,
            column.example,
          ]),
          [],
          ['Isi data di sheet "Remote", satu remote per baris, mulai baris 2. Judul kolom jangan diubah.'],
          ['Satu berkas untuk satu customer; customer dipilih saat impor.'],
          ['Baris dengan kode remote yang sudah ada memperbarui remote itu. Sel yang dikosongkan mengosongkan data itu.'],
          ['Kolom opsional boleh dihapus dari berkas: kolom yang tidak ada tidak mengubah data remote yang sudah tersimpan.'],
        ],
        columns: [{ width: 22 }, { width: 8 }, { width: 80 }, { width: 28 }],
        stickyRowsCount: 1,
      },
    ]).toBuffer();
  }

  /** Transaksi dengan konteks audit; dibatalkan di akhir bila `commit` false (pratinjau). */
  private async inTransaction<T>(
    actor: AuditActor,
    commit: boolean,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await applyAuditActor(runner.manager, actor);
      const result = await work(runner.manager);
      if (commit) await runner.commitTransaction();
      else await runner.rollbackTransaction();
      return result;
    } catch (error) {
      await runner.rollbackTransaction();
      if (isInUseError(postgresError(error))) {
        throw new ConflictException('Data jarkom berubah saat impor berjalan. Ulangi impor.');
      }
      throw error;
    } finally {
      await runner.release();
    }
  }
}

const SUMMARY_COLUMNS = [
  'r.id AS id',
  'r.tenant_id AS tenant_id',
  'r.code AS code',
  'r.name AS name',
  'n.code AS network_code',
  'n.name AS network_name',
  'r.city AS city',
  'r.province AS province',
  'r.time_zone AS time_zone',
  'r.kanwil AS kanwil',
  'r.kanca AS kanca',
  'host(r.ip_snmp) AS ip_snmp',
  'r.active AS active',
];

function toSummary(row: SummaryRow): RemoteSummary {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    name: row.name,
    networkCode: row.network_code,
    networkName: row.network_name,
    city: row.city,
    province: row.province,
    zone: row.time_zone,
    kanwil: row.kanwil,
    kanca: row.kanca,
    ipSnmp: row.ip_snmp,
    active: row.active,
  };
}

/**
 * Kolom remote yang ditulis impor: [kolom database, tipe, kolom berkas yang mengisinya].
 * Saat memperbarui, kolom database hanya diubah bila salah satu kolom berkasnya ada di
 * berkas (T52), sehingga berkas berisi sebagian kolom tidak mengosongkan data lain.
 */
const WRITE_COLUMNS: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ['name', 'text', ['name']],
  ['network_id', 'uuid', ['network']],
  ['active', 'boolean', ['status']],
  ['time_zone', 'text', ['zone']],
  ['address', 'text', ['address']],
  ['city', 'text', ['city']],
  ['province', 'text', ['province']],
  ['latitude', 'numeric', ['latitude', 'longitude']],
  ['longitude', 'numeric', ['latitude', 'longitude']],
  ['kanwil', 'text', ['kanwil']],
  ['kanca', 'text', ['kanca']],
  ['ip_snmp', 'inet', ['ipSnmp']],
  ['ip_lan', 'inet', ['ipLan']],
  ['user_ip', 'inet', ['userIp']],
  ['user_ident', 'text', ['userIdent']],
  ['manager', 'text', ['manager']],
  ['online_since', 'date', ['onlineSince']],
  ['contacts', 'jsonb', ['contact1Name', 'contact1Role', 'contact1Phone', 'contact2Name', 'contact2Role', 'contact2Phone']],
];

/**
 * Satu pernyataan untuk semua baris: tambah yang baru, perbarui yang berubah, lewati yang
 * sama persis (tidak menambah catatan audit kosong).
 */
async function upsertRemotes(
  manager: EntityManager,
  tenantId: string,
  remotes: RemoteInput[],
  fileColumns: ReadonlySet<string>,
): Promise<{ created: number; updated: number; unchanged: number }> {
  if (remotes.length === 0) return { created: 0, updated: 0, unchanged: 0 };
  const records = remotes.map((remote) => ({
    code: remote.code,
    name: remote.name,
    network_id: remote.networkId,
    active: remote.active,
    time_zone: remote.zone,
    address: remote.address,
    city: remote.city,
    province: remote.province,
    latitude: remote.latitude,
    longitude: remote.longitude,
    kanwil: remote.kanwil,
    kanca: remote.kanca,
    ip_snmp: remote.ipSnmp,
    ip_lan: remote.ipLan,
    user_ip: remote.userIp,
    user_ident: remote.userIdent,
    manager: remote.manager,
    online_since: remote.onlineSince,
    contacts: remote.contacts,
  }));
  const names = WRITE_COLUMNS.map(([name]) => name);
  // Kolom wajib (nama, jarkom, zona) selalu ada di berkas, jadi daftar ini tidak pernah kosong.
  const updatable = WRITE_COLUMNS.filter(([, , keys]) => keys.some((key) => fileColumns.has(key))).map(
    ([name]) => name,
  );
  const rows = (await manager.query(
    `INSERT INTO remotes (tenant_id, code, ${names.join(', ')})
     SELECT $1, x.code, ${names.map((name) => `x.${name}`).join(', ')}
     FROM jsonb_to_recordset($2::jsonb) AS x(code text, ${WRITE_COLUMNS.map(([n, t]) => `${n} ${t}`).join(', ')})
     ON CONFLICT (tenant_id, code) DO UPDATE
       SET ${updatable.map((name) => `${name} = EXCLUDED.${name}`).join(', ')}, updated_at = now()
       WHERE (${updatable.map((name) => `remotes.${name}`).join(', ')})
             IS DISTINCT FROM (${updatable.map((name) => `EXCLUDED.${name}`).join(', ')})
     RETURNING (xmax = 0) AS inserted`,
    [tenantId, JSON.stringify(records)],
  )) as Array<{ inserted: boolean }>;
  const created = rows.filter((row) => row.inserted).length;
  const updated = rows.length - created;
  return { created, updated, unchanged: remotes.length - rows.length };
}

async function readRows(file: Buffer): Promise<CellValue[][]> {
  try {
    return (await readSheet(file)) as CellValue[][];
  } catch {
    throw new BadRequestException('Berkas tidak bisa dibaca sebagai Excel (.xlsx). Pakai templat dari portal.');
  }
}

/** Tanggal hari ini di zona paling timur Indonesia (WIT), agar "hari ini" di mana pun sah. */
function todayInIndonesia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jayapura' }).format(new Date());
}
