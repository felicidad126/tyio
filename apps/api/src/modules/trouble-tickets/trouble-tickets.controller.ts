import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { SessionUser, TicketResponse, TroubleTicketSummaryResponse } from '@tyio/shared';
import type { Actor } from '../../common/audit/actor.js';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { CurrentTenantAccess, TenantScoped } from '../../common/tenant/tenant-policy.js';
import { CurrentActor, CurrentUser, RequireModule } from '../auth/auth.decorators.js';
import { TroubleTicketsService } from './trouble-tickets.service.js';
import { parseOpenTroubleTicket } from './tt-input.js';

/** TT (1.5b): dibuka dari NPR lewat "Eskalasi To SD"; ringkasannya disalin untuk SD. */
@TenantScoped()
@RequireModule('tiket')
@Controller('tickets/:id/tt')
export class TroubleTicketsController {
  constructor(private readonly tt: TroubleTicketsService) {}

  @Post()
  async open(
    @CurrentTenantAccess() access: TenantAccess,
    @CurrentUser() user: SessionUser,
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<TicketResponse> {
    return { ticket: await this.tt.open(access, id, user.id, parseOpenTroubleTicket(body), actor) };
  }

  @Post('salin')
  @HttpCode(200)
  async summary(
    @CurrentTenantAccess() access: TenantAccess,
    @CurrentUser() user: SessionUser,
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TroubleTicketSummaryResponse> {
    return this.tt.summary(access, id, user.id, actor);
  }
}
