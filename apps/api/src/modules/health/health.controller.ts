import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@tyio/shared';
import { Public } from '../auth/auth-request.js';
import { HealthService } from './health.service.js';

// Publik: dipakai healthcheck container dan pemantauan dari luar, tanpa sesi.
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): Promise<HealthResponse> {
    return this.health.check();
  }
}
