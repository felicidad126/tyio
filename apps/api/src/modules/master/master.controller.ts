import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreateMasterValue,
  type CustomerRecord,
  MASTER_KINDS_WITH_CODE,
  type MasterKind,
  type MasterValue,
  type UpdateMasterValue,
} from '@tyio/shared';
import type { AuditActor } from '../../common/audit/audit-context.js';
import { CurrentScope, TenantScoped } from '../../common/tenant/tenancy.js';
import type { TenantScope } from '../../common/tenant/tenant-scope.js';
import { CurrentActor } from '../auth/auth-request.js';
import { RequireRole } from '../auth/roles.guard.js';
import { TENANT_NOT_FOUND_MESSAGE } from '../tenants/tenants.controller.js';
import { isUuid, readActive, readBody, readCode, readName, readTenantId } from './master-input.js';
import { MasterService, notFoundMessage } from './master.service.js';

/**
 * Endpoint yang sama untuk kategori, system, dan jarkom (`/api/master/<jenis>`).
 * Semua peran yang login boleh membaca (pilihan di formulir tiket); hanya admin yang
 * mengubah, dan hanya untuk customer dalam cakupannya.
 */
abstract class MasterValuesController {
  protected constructor(
    protected readonly master: MasterService,
    protected readonly kind: MasterKind,
  ) {}

  /** `?tenantId=` menyaring satu customer; customer di luar cakupan menghasilkan daftar kosong. */
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentScope() scope: TenantScope, @Query('tenantId') tenantId: unknown): Promise<MasterValue[]> {
    if (tenantId !== undefined && !isUuid(tenantId)) return Promise.resolve([]);
    return this.master.listValues(this.kind, scope, tenantId?.toLowerCase());
  }

  @Post()
  @RequireRole('admin')
  create(
    @CurrentScope() scope: TenantScope,
    @CurrentActor() actor: AuditActor,
    @Body() body: unknown,
  ): Promise<MasterValue> {
    const withCode = MASTER_KINDS_WITH_CODE.includes(this.kind);
    const record = readBody(body, withCode ? ['tenantId', 'name', 'code'] : ['tenantId', 'name']);
    const input: CreateMasterValue = {
      tenantId: readTenantId(record.tenantId, TENANT_NOT_FOUND_MESSAGE),
      name: readName(record.name),
      ...(withCode ? { code: readCode(record.code) } : {}),
    };
    return this.master.createValue(this.kind, scope, actor, input);
  }

  @Patch(':id')
  @RequireRole('admin')
  update(
    @CurrentScope() scope: TenantScope,
    @CurrentActor() actor: AuditActor,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MasterValue> {
    const valueId = this.readId(id);
    const record = readBody(body, ['name', 'active']);
    const patch: UpdateMasterValue = {
      ...(record.name !== undefined ? { name: readName(record.name) } : {}),
      ...(record.active !== undefined ? { active: readActive(record.active) } : {}),
    };
    return this.master.updateValue(this.kind, scope, actor, valueId, patch);
  }

  @Delete(':id')
  @RequireRole('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentScope() scope: TenantScope,
    @CurrentActor() actor: AuditActor,
    @Param('id') id: string,
  ): Promise<void> {
    return this.master.deleteValue(this.kind, scope, actor, this.readId(id));
  }

  /** Id yang bukan UUID dijawab seperti id yang tidak ada (T29). */
  private readId(id: string): string {
    if (!isUuid(id)) throw new NotFoundException(notFoundMessage(this.kind));
    return id.toLowerCase();
  }
}

@Controller('master/kategori')
@TenantScoped()
export class MasterCategoriesController extends MasterValuesController {
  constructor(master: MasterService) {
    super(master, 'kategori');
  }
}

@Controller('master/system')
@TenantScoped()
export class MasterSystemsController extends MasterValuesController {
  constructor(master: MasterService) {
    super(master, 'system');
  }
}

@Controller('master/jarkom')
@TenantScoped()
export class MasterNetworksController extends MasterValuesController {
  constructor(master: MasterService) {
    super(master, 'jarkom');
  }
}

/**
 * Daftar customer untuk admin, termasuk yang nonaktif. Admin yang dibatasi hanya melihat
 * customer-nya; mengubah daftar customer hanya boleh admin semua customer (T44).
 */
@Controller('master/customer')
@TenantScoped()
@RequireRole('admin')
export class MasterCustomersController {
  constructor(private readonly master: MasterService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentScope() scope: TenantScope): Promise<CustomerRecord[]> {
    return this.master.listCustomers(scope);
  }

  @Post()
  create(
    @CurrentScope() scope: TenantScope,
    @CurrentActor() actor: AuditActor,
    @Body() body: unknown,
  ): Promise<CustomerRecord> {
    const record = readBody(body, ['code', 'name']);
    return this.master.createCustomer(scope, actor, { code: readCode(record.code), name: readName(record.name) });
  }

  @Patch(':id')
  update(
    @CurrentScope() scope: TenantScope,
    @CurrentActor() actor: AuditActor,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<CustomerRecord> {
    const tenantId = readTenantId(id, TENANT_NOT_FOUND_MESSAGE);
    const record = readBody(body, ['name', 'active']);
    return this.master.updateCustomer(scope, actor, tenantId, {
      ...(record.name !== undefined ? { name: readName(record.name) } : {}),
      ...(record.active !== undefined ? { active: readActive(record.active) } : {}),
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentScope() scope: TenantScope,
    @CurrentActor() actor: AuditActor,
    @Param('id') id: string,
  ): Promise<void> {
    return this.master.deleteCustomer(scope, actor, readTenantId(id, TENANT_NOT_FOUND_MESSAGE));
  }
}
