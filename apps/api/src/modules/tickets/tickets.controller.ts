import { BadRequestException, Body, Controller, Get, Header, NotFoundException, Param, Post, Query } from '@nestjs/common';
import {
  isRemoteRegion,
  isTicketStatus,
  MASTER_NAME_MAX_LENGTH,
  QUEUE_DATE_PATTERN,
  REMOTE_HISTORY_PAGE_SIZE_DEFAULT,
  REMOTE_HISTORY_PAGE_SIZE_MAX,
  REMOTE_REGIONS,
  type RemoteTicketHistoryPage,
  TICKET_DESCRIPTION_MAX_LENGTH,
  TICKET_PAGE_SIZE_DEFAULT,
  TICKET_PAGE_SIZE_MAX,
  TICKET_QUEUE_SORTS,
  TICKET_QUEUE_STATUS_ALL,
  TICKET_QUEUE_VIEWS,
  type TicketDetail,
  type TicketQueuePage,
  type TicketQueueSort,
  type TicketQueueView,
  type TicketSummary,
} from '@tyio/shared';
import type { AuditActor } from '../../common/audit/audit-context.js';
import { CurrentScope, TenantScoped } from '../../common/tenant/tenancy.js';
import type { TenantScope } from '../../common/tenant/tenant-scope.js';
import { CurrentActor, CurrentUser } from '../auth/auth-request.js';
import type { User } from '../users/user.entity.js';
import { type TicketQueueFilters, TicketQueueService } from './list/ticket-queue.service.js';
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
  constructor(
    private readonly tickets: TicketsService,
    private readonly queue: TicketQueueService,
  ) {}

  /**
   * Antrean NPR (langkah 1.5): `?view=semua|saya|pending|eskalasi|siap` (T82), saringan
   * `tenantId`, `categoryId`, `systemId`, `status`, `q`, urutan `sort=mulai|terbaru` (T83),
   * `page`, `pageSize`. Id saringan yang formatnya salah memberi hasil kosong. Saringan untuk
   * angka Overview (2.1, `TicketQueueFilter`): `status=semua`, `categoryName`, `remoteId`,
   * `region`, `createdFrom`/`createdTo`, `closedFrom`/`closedTo` (tanggal WIB).
   */
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @CurrentScope() scope: TenantScope,
    @CurrentUser() user: User,
    @Query() query: Record<string, unknown>,
  ): Promise<TicketQueuePage> {
    const filters = readQueueFilters(query);
    if (!filters) {
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: TICKET_PAGE_SIZE_DEFAULT,
        counts: { semua: 0, saya: 0, pending: 0, eskalasi: 0, siap: 0 },
      };
    }
    return this.queue.list(scope, user.id, filters);
  }

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

/** Riwayat NPR sebuah remote untuk halaman remote (1.6, T101): `?page=`, `pageSize`. */
@Controller('remotes/:remoteId/tickets')
@TenantScoped()
export class RemoteTicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @CurrentScope() scope: TenantScope,
    @Param('remoteId') remoteId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<RemoteTicketHistoryPage> {
    const unknownKeys = Object.keys(query).filter((key) => !['page', 'pageSize'].includes(key));
    if (unknownKeys.length > 0) throw new BadRequestException(`Parameter tidak dikenal: ${unknownKeys.join(', ')}.`);
    const page = positiveInt(query.page, 'page', 100_000) ?? 1;
    const pageSize = positiveInt(query.pageSize, 'pageSize', REMOTE_HISTORY_PAGE_SIZE_MAX) ?? REMOTE_HISTORY_PAGE_SIZE_DEFAULT;
    const history = isUuid(remoteId)
      ? await this.tickets.historyOfRemote(scope, remoteId.toLowerCase(), page, pageSize)
      : null;
    if (!history) throw new NotFoundException(REMOTE_NOT_FOUND_MESSAGE);
    return history;
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

const QUEUE_PARAMS = [
  'view',
  'tenantId',
  'categoryId',
  'categoryName',
  'systemId',
  'status',
  'remoteId',
  'region',
  'q',
  'createdFrom',
  'createdTo',
  'closedFrom',
  'closedTo',
  'sort',
  'page',
  'pageSize',
];

/** Saringan antrean; `null` bila ada id saringan yang tidak mungkin cocok (hasil kosong). */
function readQueueFilters(query: Record<string, unknown>): TicketQueueFilters | null {
  const unknownKeys = Object.keys(query).filter((key) => !QUEUE_PARAMS.includes(key));
  if (unknownKeys.length > 0) throw new BadRequestException(`Saringan tidak dikenal: ${unknownKeys.join(', ')}.`);
  const { view, status, q, sort, page, pageSize, categoryName, region } = query;

  if (view !== undefined && !(TICKET_QUEUE_VIEWS as readonly unknown[]).includes(view)) {
    throw new BadRequestException(`view harus salah satu dari: ${TICKET_QUEUE_VIEWS.join(', ')}.`);
  }
  if (sort !== undefined && !(TICKET_QUEUE_SORTS as readonly unknown[]).includes(sort)) {
    throw new BadRequestException(`sort harus salah satu dari: ${TICKET_QUEUE_SORTS.join(', ')}.`);
  }
  if (status !== undefined && status !== '' && status !== TICKET_QUEUE_STATUS_ALL && !isTicketStatus(status)) {
    throw new BadRequestException('Status tidak dikenal.');
  }
  if (region !== undefined && region !== '' && !isRemoteRegion(region)) {
    throw new BadRequestException(`region harus salah satu dari: ${REMOTE_REGIONS.join(', ')}.`);
  }
  const filters: TicketQueueFilters = {
    view: (view as TicketQueueView | undefined) ?? 'semua',
    sort: (sort as TicketQueueSort | undefined) ?? 'mulai',
    page: positiveInt(page, 'page', 100_000) ?? 1,
    pageSize: positiveInt(pageSize, 'pageSize', TICKET_PAGE_SIZE_MAX) ?? TICKET_PAGE_SIZE_DEFAULT,
  };
  if (isTicketStatus(status) || status === TICKET_QUEUE_STATUS_ALL) filters.status = status;
  if (isRemoteRegion(region)) filters.region = region;
  if (categoryName !== undefined) {
    if (typeof categoryName !== 'string' || categoryName.length > MASTER_NAME_MAX_LENGTH) {
      throw new BadRequestException(`Nama kategori paling panjang ${MASTER_NAME_MAX_LENGTH} karakter.`);
    }
    if (categoryName.trim() !== '') filters.categoryName = categoryName.trim();
  }
  for (const [from, to] of [
    ['createdFrom', 'createdTo'],
    ['closedFrom', 'closedTo'],
  ] as const) {
    const start = queueDate(query[from], from);
    const end = queueDate(query[to], to);
    if (start && end && start > end) throw new BadRequestException(`${from} tidak boleh sesudah ${to}.`);
    if (start) filters[from] = start;
    if (end) filters[to] = end;
  }
  if (q !== undefined) {
    if (typeof q !== 'string' || q.length > 100) throw new BadRequestException('Kata kunci paling panjang 100 karakter.');
    if (q.trim() !== '') filters.q = q.trim();
  }
  for (const key of ['tenantId', 'categoryId', 'systemId', 'remoteId'] as const) {
    const value = query[key];
    if (value === undefined || value === '') continue;
    if (!isUuid(value)) return null;
    filters[key] = value.toLowerCase();
  }
  return filters;
}

/** Tanggal saringan `YYYY-MM-DD` (WIB) yang benar-benar ada di kalender; kosong = tanpa saringan. */
function queueDate(value: unknown, name: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  const valid =
    typeof value === 'string' &&
    QUEUE_DATE_PATTERN.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid) throw new BadRequestException(`${name} harus tanggal YYYY-MM-DD yang sah.`);
  return value;
}

function positiveInt(value: unknown, name: string, max: number): number | undefined {
  if (value === undefined || value === '') return undefined;
  const number = typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : NaN;
  if (!(number >= 1 && number <= max)) throw new BadRequestException(`${name} harus bilangan 1–${max}.`);
  return number;
}
