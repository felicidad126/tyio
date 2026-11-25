import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  REMOTE_PAGE_SIZE_DEFAULT,
  REMOTE_PAGE_SIZE_MAX,
  type RemoteDetail,
  type RemoteImportReport,
  type RemoteMap,
  type RemotePage,
  XLSX_MIME,
} from '@tyio/shared';
import type { Request } from 'express';
import type { AuditActor } from '../../common/audit/audit-context.js';
import { CurrentScope, NoTenantData, TenantScoped } from '../../common/tenant/tenancy.js';
import type { TenantScope } from '../../common/tenant/tenant-scope.js';
import { CurrentActor } from '../auth/auth-request.js';
import { RequireRole } from '../auth/roles.guard.js';
import { isUuid, readTenantId } from '../master/master-input.js';
import { TENANT_NOT_FOUND_MESSAGE } from '../tenants/tenants.controller.js';
import {
  REMOTE_NOT_FOUND_MESSAGE,
  type RemoteCriteria,
  type RemoteFilters,
  RemotesService,
} from './remotes.service.js';

/** Daftar dan halaman remote: semua peran membaca, dalam cakupan customer-nya. */
@Controller('remotes')
@TenantScoped()
export class RemotesController {
  constructor(private readonly remotes: RemotesService) {}

  /**
   * `?q=` mencari kode, nama, kota, provinsi, kanwil, kanca, pengelola, dan IP;
   * `?tenantId=`, `?networkId=`, `?active=true|false`, `?hasCoordinates=true|false` (2.3)
   * menyaring; `?page=`, `?pageSize=`.
   */
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@CurrentScope() scope: TenantScope, @Query() query: Record<string, unknown>): Promise<RemotePage> {
    const filters = parseFilters(query);
    if (filters === null) {
      // Id customer/jarkom yang formatnya salah: tidak ada yang cocok, sama seperti id asing.
      return { items: [], total: 0, page: 1, pageSize: REMOTE_PAGE_SIZE_DEFAULT };
    }
    return this.remotes.list(scope, filters);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async get(@CurrentScope() scope: TenantScope, @Param('id') id: string): Promise<RemoteDetail> {
    const remote = isUuid(id) ? await this.remotes.get(scope, id.toLowerCase()) : null;
    if (!remote) throw new NotFoundException(REMOTE_NOT_FOUND_MESSAGE);
    return remote;
  }
}

/**
 * Peta remote (langkah 2.3, T140–T143): semua peran, dalam cakupan customer-nya. Saringan sama
 * dengan daftar remote (`q`, `tenantId`, `networkId`, `active`); bawaan hanya remote aktif.
 */
@Controller('remote-map')
@TenantScoped()
export class RemoteMapController {
  constructor(private readonly remotes: RemotesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async map(@CurrentScope() scope: TenantScope, @Query() query: Record<string, unknown>): Promise<RemoteMap> {
    if (query.page !== undefined || query.pageSize !== undefined || query.hasCoordinates !== undefined) {
      throw new BadRequestException('Peta tidak memakai page, pageSize, atau hasCoordinates.');
    }
    const filters = parseFilters(query);
    if (filters === null) return { points: [], withoutCoordinates: 0 };
    const criteria: RemoteCriteria = {
      q: filters.q,
      tenantId: filters.tenantId,
      networkId: filters.networkId,
      active: filters.active ?? true,
    };
    return this.remotes.map(scope, criteria);
  }
}

/** Impor remote dari Excel; hanya admin, untuk customer dalam cakupannya. */
@Controller('remote-import')
@RequireRole('admin')
export class RemoteImportController {
  constructor(private readonly remotes: RemotesService) {}

  /** Templat kosong; tidak berisi data customer. */
  @Get('template')
  @NoTenantData()
  async template(): Promise<StreamableFile> {
    return new StreamableFile(await this.remotes.template(), {
      type: XLSX_MIME,
      disposition: 'attachment; filename="templat-impor-remote.xlsx"',
    });
  }

  /**
   * Isi permintaan adalah berkas .xlsx itu sendiri (Content-Type xlsx).
   * `?tenantId=` customer tujuan; `?mode=preview` (bawaan) atau `?mode=save`.
   */
  @Post()
  @TenantScoped()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async import(
    @CurrentScope() scope: TenantScope,
    @CurrentActor() actor: AuditActor,
    @Req() request: Request,
    @Query('tenantId') tenantId: unknown,
    @Query('mode') mode: unknown,
    @Body() body: unknown,
  ): Promise<RemoteImportReport> {
    if (!request.is(XLSX_MIME) || !Buffer.isBuffer(body) || body.length === 0) {
      throw new UnsupportedMediaTypeException('Kirim berkas Excel (.xlsx) dari templat impor remote.');
    }
    if (mode !== undefined && mode !== 'preview' && mode !== 'save') {
      throw new BadRequestException('mode harus preview atau save.');
    }
    return this.remotes.import(
      scope,
      actor,
      readTenantId(tenantId, TENANT_NOT_FOUND_MESSAGE),
      body,
      mode === 'save' ? 'save' : 'preview',
    );
  }
}

function parseFilters(query: Record<string, unknown>): RemoteFilters | null {
  const { q, tenantId, networkId, active, hasCoordinates, page, pageSize } = query;
  const filters: RemoteFilters = { page: 1, pageSize: REMOTE_PAGE_SIZE_DEFAULT };

  if (q !== undefined) {
    if (typeof q !== 'string' || q.length > 100) throw new BadRequestException('Kata kunci paling panjang 100 karakter.');
    if (q.trim() !== '') filters.q = q.trim();
  }
  for (const [key, value] of [['tenantId', tenantId], ['networkId', networkId]] as const) {
    if (value === undefined || value === '') continue;
    if (!isUuid(value)) return null;
    filters[key] = value.toLowerCase();
  }
  if (active !== undefined && active !== '') {
    if (active !== 'true' && active !== 'false') throw new BadRequestException('active harus true atau false.');
    filters.active = active === 'true';
  }
  if (hasCoordinates !== undefined && hasCoordinates !== '') {
    if (hasCoordinates !== 'true' && hasCoordinates !== 'false') {
      throw new BadRequestException('hasCoordinates harus true atau false.');
    }
    filters.hasCoordinates = hasCoordinates === 'true';
  }
  filters.page = positiveInt(page, 'page', 1, 100_000) ?? 1;
  filters.pageSize = positiveInt(pageSize, 'pageSize', 1, REMOTE_PAGE_SIZE_MAX) ?? REMOTE_PAGE_SIZE_DEFAULT;
  return filters;
}

function positiveInt(value: unknown, name: string, min: number, max: number): number | undefined {
  if (value === undefined || value === '') return undefined;
  const number = typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : NaN;
  if (!(number >= min && number <= max)) throw new BadRequestException(`${name} harus bilangan ${min}–${max}.`);
  return number;
}
