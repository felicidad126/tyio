import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@tyio/shared';
import { NoTenantData } from '../../common/tenant/tenancy.js';
import { Public } from '../auth/auth-request.js';
import { HealthService } from './health.service.js';

// Publik: dipakai healthcheck container dan pemantauan dari luar, tanpa sesi.
@Public()
@NoTenantData()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): Promise<HealthResponse> {
    return this.health.check();
  }
}
