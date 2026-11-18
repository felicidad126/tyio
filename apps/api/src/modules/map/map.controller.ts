import { BadRequestException, Controller, Get, HttpStatus, Query } from '@nestjs/common';
import type { MapResponse, MapStatesResponse } from '@tyio/shared';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { CurrentTenantAccess, TenantScoped } from '../../common/tenant/tenant-policy.js';
import { RequireModule } from '../auth/auth.decorators.js';
import { MapService } from './map.service.js';

/** Peta remote (2.3) di Overview dan layar dinding; dibatasi customer seperti daftar Remote. */
@TenantScoped()
@RequireModule('overview')
@Controller('map')
export class MapController {
  constructor(private readonly map: MapService) {}

  @Get()
  async get(@CurrentTenantAccess() access: TenantAccess, @Query() raw: Record<string, unknown>): Promise<MapResponse> {
    noParameters(raw);
    return this.map.get(access);
  }

  /** Kondisi terkini saja (kecil), untuk memperbarui warna titik saat ada kabar perubahan. */
  @Get('states')
  async states(@CurrentTenantAccess() access: TenantAccess, @Query() raw: Record<string, unknown>): Promise<MapStatesResponse> {
    noParameters(raw);
    return this.map.states(access);
  }
}

function noParameters(raw: Record<string, unknown>): void {
  const unknown = Object.keys(raw)[0];
  if (unknown !== undefined) {
    throw new BadRequestException({ statusCode: HttpStatus.BAD_REQUEST, message: `Parameter tidak dikenal: ${unknown}.` });
  }
}
