import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { OpenTicketsResponse, SessionUser, TicketListResponse, TicketResponse } from '@tyio/shared';
import type { Actor } from '../../common/audit/actor.js';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { CurrentTenantAccess, TenantScoped } from '../../common/tenant/tenant-policy.js';
import { CurrentActor, CurrentUser, RequireModule } from '../auth/auth.decorators.js';
import { parseCreateTicket } from './ticket-input.js';
import { parseTicketListQuery } from './ticket-list-query.js';
import { TicketsService } from './tickets.service.js';

/** Tiket NPR: dibuat dan dibaca oleh peran yang boleh membuka modul Tiket, per customer. */
@TenantScoped()
@RequireModule('tiket')
@Controller()
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post('tickets')
  async create(
    @CurrentTenantAccess() access: TenantAccess,
    @CurrentUser() user: SessionUser,
    @CurrentActor() actor: Actor,
    @Body() body: unknown,
  ): Promise<TicketResponse> {
    return { ticket: await this.tickets.create(access, user.id, parseCreateTicket(body), actor) };
  }

  @Get('tickets')
  async list(
    @CurrentTenantAccess() access: TenantAccess,
    @CurrentUser() user: SessionUser,
    @Query() query: Record<string, unknown>,
  ): Promise<TicketListResponse> {
    return this.tickets.list(access, user.id, parseTicketListQuery(query));
  }

  @Get('tickets/:id')
  async get(
    @CurrentTenantAccess() access: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketResponse> {
    return { ticket: await this.tickets.get(access, id) };
  }

  @Get('remotes/:id/open-tickets')
  async openForRemote(
    @CurrentTenantAccess() access: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OpenTicketsResponse> {
    return { tickets: await this.tickets.openForRemote(access, id) };
  }
}
