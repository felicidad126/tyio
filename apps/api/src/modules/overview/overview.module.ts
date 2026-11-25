import { BadRequestException, Controller, Get, Header, Module, Query } from '@nestjs/common';
import { isOverviewPeriod, type Overview, OVERVIEW_PERIOD_DEFAULT, OVERVIEW_PERIODS } from '@npr/shared';
import { CurrentScope, TenantScoped } from '../../common/tenant/tenancy.js';
import type { TenantScope } from '../../common/tenant/tenant-scope.js';
import { CurrentUser } from '../auth/auth-request.js';
import { isUuid } from '../master/master-input.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import type { User } from '../users/user.entity.js';
import { type OverviewInput, OverviewService } from './overview.service.js';

const PARAMS = ['period', 'tenantId'];

/**
 * Overview (langkah 2.1): semua peran, dalam cakupan customer-nya. `?period=7|14|30` (bawaan
 * 14, T108), `tenantId` (satu customer; customer di luar cakupan memberi angka nol, seperti
 * saringan antrean).
 */
@Controller('overview')
@TenantScoped()
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentScope() scope: TenantScope,
    @CurrentUser() user: User,
    @Query() query: Record<string, unknown>,
  ): Promise<Overview> {
    return this.overview.overview(scope, user.id, readInput(query));
  }
}

function readInput(query: Record<string, unknown>): OverviewInput {
  const unknownKeys = Object.keys(query).filter((key) => !PARAMS.includes(key));
  if (unknownKeys.length > 0) throw new BadRequestException(`Parameter tidak dikenal: ${unknownKeys.join(', ')}.`);
  const { period, tenantId } = query;
  const days = period === undefined || period === '' ? OVERVIEW_PERIOD_DEFAULT : Number(period);
  if (!isOverviewPeriod(days) || (typeof period === 'string' && !/^\d+$/.test(period))) {
    throw new BadRequestException(`period harus salah satu dari: ${OVERVIEW_PERIODS.join(', ')}.`);
  }
  if (tenantId === undefined || tenantId === '') return { period: days };
  if (!isUuid(tenantId)) throw new BadRequestException('tenantId harus id customer yang sah.');
  return { period: days, tenantId: tenantId.toLowerCase() };
}

@Module({
  imports: [TicketsModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
