import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  REMOTE_PAGE_SIZE_DEFAULT,
  REMOTE_PAGE_SIZE_MAX,
  TROUBLE_TICKET_CONTACT_MAX_LENGTH,
  TROUBLE_TICKET_PROBLEM_MAX_LENGTH,
  TICKET_RESOLUTION_MAX_LENGTH,
  type TicketTimeline,
  type TroubleTicketCopied,
  type TroubleTicketPage,
} from '@npr/shared';
import type { AuditActor } from '../../common/audit/audit-context.js';
import { CurrentScope, TenantScoped } from '../../common/tenant/tenancy.js';
import type { TenantScope } from '../../common/tenant/tenant-scope.js';
import { CurrentActor, CurrentUser } from '../auth/auth-request.js';
import type { User } from '../users/user.entity.js';
import { isUuid, readBody } from '../master/master-input.js';
import { TicketActionsService } from '../tickets/actions/ticket-actions.service.js';
import { TICKET_NOT_FOUND_MESSAGE, TicketsService } from '../tickets/tickets.service.js';
import {
  type CreateTroubleTicketInput,
  TROUBLE_TICKET_NOT_FOUND_MESSAGE,
  type TroubleTicketFilters,
  TroubleTicketsService,
} from './trouble-tickets.service.js';

/** Buat TT dari NPR (langkah 1.5b). Jawaban: NPR terbaru (dengan TT-nya) dan linimasanya. */
@Controller('tickets/:ticketId/trouble-tickets')
@TenantScoped()
export class TicketTroubleTicketsController {
  constructor(
    private readonly troubleTickets: TroubleTicketsService,
    private readonly tickets: TicketsService,
    private readonly actions: TicketActionsService,
  ) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  async create(
    @CurrentScope() scope: TenantScope,
    @CurrentActor() actor: AuditActor,
    @Param('ticketId') ticketId: string,
    @Body() body: unknown,
  ): Promise<TicketTimeline> {
    if (!isUuid(ticketId)) throw new NotFoundException(TICKET_NOT_FOUND_MESSAGE);
    const id = ticketId.toLowerCase();
    await this.troubleTickets.create(scope, actor, id, readCreate(body));
    const [ticket, actions] = await Promise.all([this.tickets.get(scope, id), this.actions.list(scope, id)]);
    if (!ticket || !actions) throw new NotFoundException(TICKET_NOT_FOUND_MESSAGE);
    return { ticket, actions };
  }
}

/** Daftar TT aktif, pencatatan salin ringkasan (K25), dan penutupan TT (1.6). */
@Controller('trouble-tickets')
@TenantScoped()
export class TroubleTicketsController {
  constructor(
    private readonly troubleTickets: TroubleTicketsService,
    private readonly tickets: TicketsService,
    private readonly actions: TicketActionsService,
  ) {}

  /** `?tenantId=`, `q` (no. TT, no. NPR, kode/nama remote), `page`, `pageSize`. */
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@CurrentScope() scope: TenantScope, @Query() query: Record<string, unknown>): Promise<TroubleTicketPage> {
    const filters = readFilters(query);
    if (!filters) return { items: [], total: 0, page: 1, pageSize: REMOTE_PAGE_SIZE_DEFAULT };
    return this.troubleTickets.list(scope, filters);
  }

  /** Dipanggil peramban setelah ringkasan TT berhasil disalin ke clipboard. */
  @Post(':id/copied')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async copied(
    @CurrentScope() scope: TenantScope,
    @CurrentActor() actor: AuditActor,
    @Param('id') id: string,
  ): Promise<TroubleTicketCopied> {
    if (!isUuid(id)) throw new NotFoundException(TROUBLE_TICKET_NOT_FOUND_MESSAGE);
    return this.troubleTickets.markCopied(scope, actor, id.toLowerCase());
  }

  /**
   * Tutup TT: hanya L2/admin (K21). Isi: `{ resolution }` = hasil kunjungan / penyelesaian
   * (T100). Jawaban: NPR induk terbaru dan linimasanya.
   */
  @Post(':id/close')
  @Header('Cache-Control', 'no-store')
  async close(
    @CurrentScope() scope: TenantScope,
    @CurrentActor() actor: AuditActor,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<TicketTimeline> {
    if (!isUuid(id)) throw new NotFoundException(TROUBLE_TICKET_NOT_FOUND_MESSAGE);
    const record = readBody(body, ['resolution']);
    if (typeof record.resolution !== 'string' && record.resolution !== undefined && record.resolution !== null) {
      throw new BadRequestException('Hasil kunjungan / penyelesaian harus berupa teks.');
    }
    const resolution = typeof record.resolution === 'string' ? record.resolution.trim() : '';
    if (resolution === '') throw new BadRequestException('Hasil kunjungan / penyelesaian wajib diisi.');
    if (resolution.length > TICKET_RESOLUTION_MAX_LENGTH) {
      throw new BadRequestException(`Hasil kunjungan / penyelesaian paling panjang ${TICKET_RESOLUTION_MAX_LENGTH} karakter.`);
    }
    const ticketId = await this.troubleTickets.close(scope, actor, user.role, id.toLowerCase(), resolution);
    const [ticket, actions] = await Promise.all([this.tickets.get(scope, ticketId), this.actions.list(scope, ticketId)]);
    if (!ticket || !actions) throw new NotFoundException(TICKET_NOT_FOUND_MESSAGE);
    return { ticket, actions };
  }
}

function readCreate(body: unknown): CreateTroubleTicketInput {
  const record = readBody(body, ['problem', 'contact']);
  if (typeof record.problem !== 'string' || record.problem.trim() === '') {
    throw new BadRequestException('Problem jarkom wajib diisi.');
  }
  const problem = record.problem.trim();
  if (problem.length > TROUBLE_TICKET_PROBLEM_MAX_LENGTH) {
    throw new BadRequestException(`Problem jarkom paling panjang ${TROUBLE_TICKET_PROBLEM_MAX_LENGTH} karakter.`);
  }
  let contact: string | null = null;
  if (record.contact !== undefined && record.contact !== null) {
    if (typeof record.contact !== 'string') throw new BadRequestException('Kontak di lokasi harus berupa teks.');
    contact = record.contact.trim() || null;
    if (contact && contact.length > TROUBLE_TICKET_CONTACT_MAX_LENGTH) {
      throw new BadRequestException(`Kontak di lokasi paling panjang ${TROUBLE_TICKET_CONTACT_MAX_LENGTH} karakter.`);
    }
  }
  return { problem, contact };
}

function readFilters(query: Record<string, unknown>): TroubleTicketFilters | null {
  const unknownKeys = Object.keys(query).filter((key) => !['tenantId', 'q', 'page', 'pageSize'].includes(key));
  if (unknownKeys.length > 0) throw new BadRequestException(`Saringan tidak dikenal: ${unknownKeys.join(', ')}.`);
  const filters: TroubleTicketFilters = {
    page: positiveInt(query.page, 'page', 100_000) ?? 1,
    pageSize: positiveInt(query.pageSize, 'pageSize', REMOTE_PAGE_SIZE_MAX) ?? REMOTE_PAGE_SIZE_DEFAULT,
  };
  const { tenantId, q } = query;
  if (q !== undefined) {
    if (typeof q !== 'string' || q.length > 100) throw new BadRequestException('Kata kunci paling panjang 100 karakter.');
    if (q.trim() !== '') filters.q = q.trim();
  }
  if (tenantId !== undefined && tenantId !== '') {
    if (!isUuid(tenantId)) return null;
    filters.tenantId = tenantId.toLowerCase();
  }
  return filters;
}

function positiveInt(value: unknown, name: string, max: number): number | undefined {
  if (value === undefined || value === '') return undefined;
  const number = typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : NaN;
  if (!(number >= 1 && number <= max)) throw new BadRequestException(`${name} harus bilangan 1–${max}.`);
  return number;
}
