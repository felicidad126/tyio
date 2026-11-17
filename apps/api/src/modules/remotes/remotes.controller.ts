import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  REMOTE_IMPORT_FIELDS,
  REMOTE_IMPORT_MAX_ROWS,
  type RemoteImportField,
  type RemoteImportRequest,
  type RemoteImportResult,
  type RemoteListResponse,
  type RemoteResponse,
} from '@tyio/shared';
import type { Actor } from '../../common/audit/actor.js';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { AllTenants, CurrentTenantAccess, TenantScoped } from '../../common/tenant/tenant-policy.js';
import { CurrentActor, RequireModule } from '../auth/auth.decorators.js';
import { parseRemoteListQuery } from './remote-query.js';
import { RemotesService } from './remotes.service.js';

/** Daftar dan detail remote untuk semua peran, terbatas pada customer yang boleh dilihat. */
@TenantScoped()
@RequireModule('remote')
@Controller('remotes')
export class RemotesController {
  constructor(private readonly remotes: RemotesService) {}

  @Get()
  async list(
    @CurrentTenantAccess() access: TenantAccess,
    @Query() query: Record<string, unknown>,
  ): Promise<RemoteListResponse> {
    return this.remotes.list(access, parseRemoteListQuery(query));
  }

  @Get(':id')
  async get(
    @CurrentTenantAccess() access: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RemoteResponse> {
    return { remote: await this.remotes.get(access, id) };
  }
}

/** Daftar remote adalah ranah admin (K18): impor untuk customer mana pun. */
@RequireModule('admin')
@AllTenants('Impor remote untuk customer mana pun; khusus admin dengan akses semua customer (K18).')
@Controller('admin/remotes')
export class RemotesAdminController {
  constructor(private readonly remotes: RemotesService) {}

  @Post('import')
  async import(@Body() body: unknown, @CurrentActor() actor: Actor): Promise<RemoteImportResult> {
    return this.remotes.import(parseImportRequest(body), actor);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bentuk isian impor dari web. Isi tiap sel diperiksa kemudian, per baris. */
function parseImportRequest(body: unknown): RemoteImportRequest {
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const { tenantId, rows, dryRun } = input;
  if (typeof tenantId !== 'string' || !UUID.test(tenantId)) throw invalid('Pilih customer.');
  if (typeof dryRun !== 'boolean') throw invalid('dryRun harus true atau false.');
  if (!Array.isArray(rows) || rows.length === 0) throw invalid('File tidak berisi baris remote.');
  if (rows.length > REMOTE_IMPORT_MAX_ROWS) {
    throw invalid(`Paling banyak ${REMOTE_IMPORT_MAX_ROWS.toLocaleString('id-ID')} baris per impor.`);
  }
  return {
    tenantId,
    dryRun,
    rows: rows.map((row: unknown, index) => {
      const { row: number, values } = (row ?? {}) as { row?: unknown; values?: unknown };
      if (!Number.isInteger(number) || (number as number) < 1 || typeof values !== 'object' || values === null) {
        throw invalid(`Baris ke-${index + 1} tidak berbentuk { row, values }.`);
      }
      for (const [key, value] of Object.entries(values)) {
        if (!REMOTE_IMPORT_FIELDS.includes(key as RemoteImportField) || typeof value !== 'string') {
          throw invalid(`Baris ${number as number}: kolom ${key} tidak dikenal atau bukan teks.`);
        }
      }
      return { row: number as number, values: values as Partial<Record<RemoteImportField, string>> };
    }),
  };
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ statusCode: HttpStatus.BAD_REQUEST, message });
}
