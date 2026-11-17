import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { TenantListResponse, TenantResponse } from '@tyio/shared';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { CurrentTenantAccess, TenantScoped } from '../../common/tenant/tenant-policy.js';
import { TenantsService } from './tenants.service.js';

@TenantScoped()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  async list(@CurrentTenantAccess() access: TenantAccess): Promise<TenantListResponse> {
    return { tenants: await this.tenants.list(access) };
  }

  @Get(':id')
  async get(
    @CurrentTenantAccess() access: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TenantResponse> {
    return { tenant: await this.tenants.get(access, id) };
  }
}
