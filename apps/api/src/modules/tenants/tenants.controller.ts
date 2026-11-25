import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import type { TenantSummary } from '@npr/shared';
import { CurrentScope, TenantScoped } from '../../common/tenant/tenancy.js';
import type { TenantScope } from '../../common/tenant/tenant-scope.js';
import { TenantsService, toTenantSummary } from './tenants.service.js';

export const TENANT_NOT_FOUND_MESSAGE = 'Customer tidak ditemukan.';

/** Customer yang boleh dilihat pengguna (K26). Di luar cakupan = tidak ditemukan. */
@Controller('tenants')
@TenantScoped()
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  async list(@CurrentScope() scope: TenantScope): Promise<TenantSummary[]> {
    return (await this.tenants.listVisible(scope)).map(toTenantSummary);
  }

  @Get(':id')
  async get(
    @CurrentScope() scope: TenantScope,
    // Id yang bukan UUID dijawab sama seperti id yang tidak ada.
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException(TENANT_NOT_FOUND_MESSAGE) }))
    id: string,
  ): Promise<TenantSummary> {
    const tenant = await this.tenants.findVisible(scope, id);
    if (!tenant) throw new NotFoundException(TENANT_NOT_FOUND_MESSAGE);
    return toTenantSummary(tenant);
  }
}
