import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@tyio/shared';
import { NoTenantData } from '../../common/tenant/tenant-policy.js';
import { Public } from '../auth/auth.decorators.js';
import { HealthService } from './health.service.js';

@NoTenantData('Status layanan saja, tanpa data customer.')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Publik: dipanggil pemeriksa kesehatan container dan pemantau dari luar. */
  @Public()
  @Get()
  check(): Promise<HealthResponse> {
    return this.health.check();
  }
}
