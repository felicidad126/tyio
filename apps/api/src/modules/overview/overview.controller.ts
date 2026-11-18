import { BadRequestException, Controller, Get, HttpStatus, Query } from '@nestjs/common';
import type { OverviewResponse, SessionUser } from '@tyio/shared';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { CurrentTenantAccess, TenantScoped } from '../../common/tenant/tenant-policy.js';
import { CurrentUser, RequireModule } from '../auth/auth.decorators.js';
import { OverviewService } from './overview.service.js';

/** Overview (2.1): ringkasan tiket aktif dan analitik kejadian untuk customer yang boleh dilihat. */
@TenantScoped()
@RequireModule('overview')
@Controller('overview')
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  async get(
    @CurrentTenantAccess() access: TenantAccess,
    @CurrentUser() user: SessionUser,
    @Query() raw: Record<string, unknown>,
  ): Promise<OverviewResponse> {
    const unknown = Object.keys(raw)[0];
    if (unknown !== undefined) {
      throw new BadRequestException({ statusCode: HttpStatus.BAD_REQUEST, message: `Parameter tidak dikenal: ${unknown}.` });
    }
    return this.overview.get(access, user.id);
  }
}
