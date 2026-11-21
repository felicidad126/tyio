import { BadRequestException, Body, Controller, Get, Header, NotFoundException, Param, Post } from '@nestjs/common';
import { TICKET_DESCRIPTION_MAX_LENGTH, type TicketDetail, type TicketSummary } from '@tyio/shared';
import type { AuditActor } from '../../common/audit/audit-context.js';
import { CurrentScope, TenantScoped } from '../../common/tenant/tenancy.js';
import type { TenantScope } from '../../common/tenant/tenant-scope.js';
import { CurrentActor } from '../auth/auth-request.js';
import { isUuid, readBody } from '../master/master-input.js';
import { REMOTE_NOT_FOUND_MESSAGE } from '../remotes/remotes.service.js';
import {
  CATEGORY_NOT_FOUND_MESSAGE,
  type CreateTicketInput,
  SYSTEM_NOT_FOUND_MESSAGE,
  TICKET_NOT_FOUND_MESSAGE,
  TicketsService,
} from './tickets.service.js';

/**
 * NPR (langkah 1.3). Semua peran yang login (L1, L2, admin) boleh membuat dan membaca NPR
 * customer dalam cakupannya. Pembuat, customer, dan jarkom diambil dari sesi dan remote,
 * bukan dari isi permintaan.
 */
@Controller('tickets')
@TenantScoped()
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  /**
   * Bila remote masih punya NPR terbuka dan `acknowledgeOpenTickets` tidak `true`, dijawab
   * 409 berisi daftar NPR terbuka itu (`OpenTicketsConflict`), tanpa menyimpan apa pun.
   */
  @Post()
  @Header('Cache-Control', 'no-store')
  create(
    @CurrentScope() scope: TenantScope,
    @CurrentActor() actor: AuditActor,
    @Body() body: unknown,
  ): Promise<TicketDetail> {
    return this.tickets.create(scope, actor, readCreateTicket(body));
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async get(@CurrentScope() scope: TenantScope, @Param('id') id: string): Promise<TicketDetail> {
    const ticket = isUuid(id) ? await this.tickets.get(scope, id.toLowerCase()) : null;
    if (!ticket) throw new NotFoundException(TICKET_NOT_FOUND_MESSAGE);
    return ticket;
  }
}

/** NPR terbuka sebuah remote, untuk peringatan di formulir dan halaman remote. */
@Controller('remotes/:remoteId/open-tickets')
@TenantScoped()
export class RemoteOpenTicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@CurrentScope() scope: TenantScope, @Param('remoteId') remoteId: string): Promise<TicketSummary[]> {
    const tickets = isUuid(remoteId) ? await this.tickets.openTicketsOfRemote(scope, remoteId.toLowerCase()) : null;
    if (!tickets) throw new NotFoundException(REMOTE_NOT_FOUND_MESSAGE);
    return tickets;
  }
}

const CREATE_FIELDS = [
  'remoteId',
  'categoryId',
  'systemId',
  'startedAt',
  'description',
  'acknowledgeOpenTickets',
] as const;

/** Zona wajib ditulis (`Z` atau `+08:00`), agar waktu tidak ditafsirkan menurut jam server. */
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function readCreateTicket(body: unknown): CreateTicketInput {
  const record = readBody(body, CREATE_FIELDS);

  // Remote yang formatnya salah dijawab seperti remote yang tidak ada (T29).
  if (!isUuid(record.remoteId)) throw new NotFoundException(REMOTE_NOT_FOUND_MESSAGE);
  if (record.categoryId === undefined || record.categoryId === '') {
    throw new BadRequestException('Kategori wajib dipilih.');
  }
  if (!isUuid(record.categoryId)) throw new BadRequestException(CATEGORY_NOT_FOUND_MESSAGE);
  if (record.systemId === undefined || record.systemId === '') {
    throw new BadRequestException('System wajib dipilih.');
  }
  if (!isUuid(record.systemId)) throw new BadRequestException(SYSTEM_NOT_FOUND_MESSAGE);

  if (typeof record.description !== 'string' || record.description.trim() === '') {
    throw new BadRequestException('Keterangan wajib diisi.');
  }
  const description = record.description.trim();
  if (description.length > TICKET_DESCRIPTION_MAX_LENGTH) {
    throw new BadRequestException(`Keterangan paling panjang ${TICKET_DESCRIPTION_MAX_LENGTH} karakter.`);
  }

  let startedAt: Date | null = null;
  if (record.startedAt !== undefined && record.startedAt !== null && record.startedAt !== '') {
    const parsed = typeof record.startedAt === 'string' && ISO_WITH_ZONE.test(record.startedAt)
      ? new Date(record.startedAt)
      : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Mulai gangguan harus berupa tanggal dan jam yang sah.');
    }
    startedAt = parsed;
  }

  const acknowledge = record.acknowledgeOpenTickets;
  if (acknowledge !== undefined && typeof acknowledge !== 'boolean') {
    throw new BadRequestException('acknowledgeOpenTickets harus true atau false.');
  }

  return {
    remoteId: record.remoteId.toLowerCase(),
    categoryId: record.categoryId.toLowerCase(),
    systemId: record.systemId.toLowerCase(),
    startedAt,
    description,
    acknowledgeOpenTickets: acknowledge === true,
  };
}
