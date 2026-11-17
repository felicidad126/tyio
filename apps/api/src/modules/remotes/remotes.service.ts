import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type JarkomRef,
  REMOTE_PAGE_SIZE,
  type RemoteContact,
  type RemoteDetail,
  type RemoteImportRequest,
  type RemoteImportResult,
  type RemoteListQuery,
  type RemoteListResponse,
  type RemoteSummary,
  type TenantRef,
} from '@tyio/shared';
import { DataSource, In, QueryFailedError } from 'typeorm';
import { type Actor, withActor } from '../../common/audit/actor.js';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { TenantScopedRepository } from '../../common/tenant/tenant-scoped.repository.js';
import { JarkomEntity } from '../master/master.entities.js';
import { TenantEntity } from '../tenants/tenant.entity.js';
import { type JarkomLookup, parseImportRow, type RemoteImportable } from './remote-import.js';
import { likePattern } from './remote-query.js';
import { type Remote, RemoteEntity, REMOTE_SEARCH_EXPRESSION } from './remote.entity.js';

const INSERT_CHUNK = 500;
const LOOKUP_CHUNK = 1000;

@Injectable()
export class RemotesService {
  private readonly remotes: TenantScopedRepository<Remote>;

  constructor(private readonly dataSource: DataSource) {
    this.remotes = new TenantScopedRepository(dataSource.getRepository(RemoteEntity), 'tenantId');
  }

  /** Satu halaman daftar remote yang boleh dilihat, urut Site ID. */
  async list(access: TenantAccess, query: RemoteListQuery & { page: number }): Promise<RemoteListResponse> {
    const qb = this.remotes.query(access, 'r');
    if (query.q) qb.andWhere(`${REMOTE_SEARCH_EXPRESSION('r')} ILIKE :q`, { q: likePattern(query.q) });
    if (query.tenantId) qb.andWhere('r.tenantId = :tenantId', { tenantId: query.tenantId });
    if (query.province) qb.andWhere('r.province = :province', { province: query.province });
    if (query.jarkomId) qb.andWhere('r.jarkomId = :jarkomId', { jarkomId: query.jarkomId });
    if (query.status) qb.andWhere('r.status = :status', { status: query.status });

    const total = await qb.getCount();
    const rows = await qb
      .orderBy('r.siteId', 'ASC')
      .offset((query.page - 1) * REMOTE_PAGE_SIZE)
      .limit(REMOTE_PAGE_SIZE)
      .getMany();
    const refs = await this.refsFor(rows);
    return { items: rows.map((r) => toSummary(r, refs)), total, page: query.page, pageSize: REMOTE_PAGE_SIZE };
  }

  /** 404 juga untuk remote customer lain, agar keberadaannya tidak terungkap (T27). */
  async get(access: TenantAccess, id: string): Promise<RemoteDetail> {
    const row = await this.remotes.query(access, 'r').andWhere('r.id = :id', { id }).getOne();
    if (!row) {
      throw new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, message: 'Remote tidak ditemukan.' });
    }
    return toDetail(row, await this.refsFor([row]));
  }

  /**
   * Impor dua tahap: `dryRun` hanya melaporkan; simpan dilakukan dalam satu transaksi dan
   * hanya bila tidak ada baris yang gagal. Remote dengan Site ID yang sudah ada diperbarui.
   */
  async import(request: RemoteImportRequest, actor: Actor): Promise<RemoteImportResult> {
    const tenant = await this.dataSource.getRepository(TenantEntity).findOneBy({ id: request.tenantId });
    if (!tenant) throw invalid('Customer tidak ditemukan.');
    if (!tenant.active) {
      throw invalid(`Customer ${tenant.name} nonaktif; aktifkan dulu di Admin › Master data.`);
    }
    const jarkoms = new Map<string, JarkomLookup>(
      (await this.dataSource.getRepository(JarkomEntity).find()).map((j) => [j.code, j]),
    );

    // Periksa setiap baris, termasuk Site ID kembar di dalam file.
    const failed: RemoteImportResult['failed'] = [];
    const valid: Array<Partial<RemoteImportable> & { siteId: string }> = [];
    const seen = new Map<string, number>();
    for (const { row, values } of request.rows) {
      const { record, errors } = parseImportRow(values, jarkoms);
      if (record.siteId) {
        const first = seen.get(record.siteId);
        if (first !== undefined) {
          errors.unshift({ column: 'Site ID', message: `Site ID ${record.siteId} sudah ada di baris ${first}.` });
        } else seen.set(record.siteId, row);
      }
      if (errors.length > 0) failed.push({ row, errors });
      else valid.push(record as Partial<RemoteImportable> & { siteId: string });
    }

    // Bandingkan dengan remote yang sudah ada: baru, berubah, atau sama.
    const existing = await this.existingBySiteId(tenant.id, valid.map((v) => v.siteId));
    const toInsert: Array<Partial<Remote>> = [];
    const toUpdate: Array<{ id: string; changes: Partial<RemoteImportable> }> = [];
    let unchanged = 0;
    for (const record of valid) {
      const current = existing.get(record.siteId);
      if (!current) {
        toInsert.push({ status: 'aktif', contacts: [], ...record, tenantId: tenant.id });
        continue;
      }
      const changes = changedFields(current, record);
      if (Object.keys(changes).length === 0) unchanged++;
      else toUpdate.push({ id: current.id, changes });
    }

    const result: RemoteImportResult = {
      created: toInsert.length,
      updated: toUpdate.length,
      unchanged,
      failed,
      saved: false,
    };
    if (request.dryRun) return result;
    if (failed.length > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message: `${failed.length} baris gagal; tidak ada yang disimpan.`,
          ...result,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    try {
      await withActor(this.dataSource, actor, async (m) => {
        const repo = m.getRepository(RemoteEntity);
        for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
          await repo.insert(toInsert.slice(i, i + INSERT_CHUNK));
        }
        for (const { id, changes } of toUpdate) {
          await repo.update(id, changes);
        }
      });
    } catch (error) {
      // Impor lain untuk customer yang sama baru saja menambah Site ID yang sama.
      if (error instanceof QueryFailedError && (error.driverError as { code?: string }).code === '23505') {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          message: 'Data remote berubah saat impor berjalan. Periksa ulang file, lalu impor lagi.',
        });
      }
      throw error;
    }
    return { ...result, saved: true };
  }

  private async existingBySiteId(tenantId: string, siteIds: string[]): Promise<Map<string, Remote>> {
    const found = new Map<string, Remote>();
    const repo = this.dataSource.getRepository(RemoteEntity);
    for (let i = 0; i < siteIds.length; i += LOOKUP_CHUNK) {
      const rows = await repo.findBy({ tenantId, siteId: In(siteIds.slice(i, i + LOOKUP_CHUNK)) });
      for (const row of rows) found.set(row.siteId, row);
    }
    return found;
  }

  /** Customer dan jarkom untuk sekumpulan remote, dalam dua query (bukan satu per baris). */
  private async refsFor(rows: Remote[]): Promise<Refs> {
    const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
    const jarkomIds = [...new Set(rows.map((r) => r.jarkomId))];
    const [tenants, jarkoms] = await Promise.all([
      tenantIds.length ? this.dataSource.getRepository(TenantEntity).findBy({ id: In(tenantIds) }) : [],
      jarkomIds.length ? this.dataSource.getRepository(JarkomEntity).findBy({ id: In(jarkomIds) }) : [],
    ]);
    return {
      tenants: new Map(tenants.map(({ id, code, name }) => [id, { id, code, name }])),
      jarkoms: new Map(jarkoms.map(({ id, code, name }) => [id, { id, code, name }])),
    };
  }
}

interface Refs {
  tenants: Map<string, TenantRef>;
  jarkoms: Map<string, JarkomRef>;
}

function changedFields(current: Remote, record: Partial<RemoteImportable>): Partial<RemoteImportable> {
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const before = current[key as keyof Remote];
    if (comparable(key, before) !== comparable(key, value)) changes[key] = value;
  }
  return changes as Partial<RemoteImportable>;
}

/** jsonb menyusun ulang urutan kunci objek, jadi kontak dibandingkan per isi, bukan per teks JSON. */
function comparable(key: string, value: unknown): string {
  if (key === 'contacts' && Array.isArray(value)) {
    return JSON.stringify((value as RemoteContact[]).map((c) => [c.name, c.role, c.phone, c.email]));
  }
  return JSON.stringify(value ?? null);
}

function toSummary(row: Remote, refs: Refs): RemoteSummary {
  const tenant = refs.tenants.get(row.tenantId);
  const jarkom = refs.jarkoms.get(row.jarkomId);
  if (!tenant || !jarkom) throw new Error(`Rujukan remote ${row.id} tidak lengkap`);
  return {
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    tenant,
    jarkom,
    city: row.city,
    province: row.province,
    status: row.status,
  };
}

function toDetail(row: Remote, refs: Refs): RemoteDetail {
  return {
    ...toSummary(row, refs),
    address: row.address,
    timeZone: row.timeZone,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    ipSnmp: row.ipSnmp,
    ipLan: row.ipLan,
    userIp: row.userIp,
    userId: row.userId,
    kanwil: row.kanwil,
    kanca: row.kanca,
    onlineDate: row.onlineDate,
    contacts: row.contacts,
  };
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ statusCode: HttpStatus.BAD_REQUEST, message });
}
