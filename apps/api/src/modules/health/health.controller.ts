import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@tyio/shared';
import { Public } from '../auth/auth.decorators.js';
import { HealthService } from './health.service.js';

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
