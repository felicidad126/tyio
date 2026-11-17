import { BadRequestException, Controller, Get, HttpStatus, Query } from '@nestjs/common';
import {
  canOpenModule,
  SEARCH_LIMIT,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  type SearchResponse,
  type SessionUser,
} from '@tyio/shared';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { CurrentTenantAccess, TenantScoped } from '../../common/tenant/tenant-policy.js';
import { CurrentUser } from '../auth/auth.decorators.js';
import { RemotesService } from '../remotes/remotes.service.js';
import { TicketsService } from '../tickets/tickets.service.js';

/**
 * Pencarian global di header (1.5): tiket (no. NPR, no. tiket customer, remote-nya) dan remote
 * (Site ID, nama, kota, kanca), masing-masing paling banyak SEARCH_LIMIT terbaru. Setiap jenis
 * hanya dicari bila peran pengguna boleh membuka modulnya; data dibatasi customer seperti
 * daftar Tiket dan Remote.
 */
@TenantScoped()
@Controller('search')
export class SearchController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly remotes: RemotesService,
  ) {}

  @Get()
  async search(
    @CurrentTenantAccess() access: TenantAccess,
    @CurrentUser() user: SessionUser,
    @Query() raw: Record<string, unknown>,
  ): Promise<SearchResponse> {
    const q = parseSearchQuery(raw);
    const [tickets, remotes] = await Promise.all([
      canOpenModule(user.role, 'tiket')
        ? this.tickets.list(access, user.id, { view: 'semua', q, page: 1 }, SEARCH_LIMIT)
        : null,
      canOpenModule(user.role, 'remote') ? this.remotes.list(access, { q, page: 1 }, SEARCH_LIMIT) : null,
    ]);
    return {
      q,
      tickets: tickets?.items ?? [],
      ticketTotal: tickets?.total ?? 0,
      remotes: remotes?.items ?? [],
      remoteTotal: remotes?.total ?? 0,
    };
  }
}

export function parseSearchQuery(raw: Record<string, unknown>): string {
  const unknown = Object.keys(raw).find((key) => key !== 'q');
  if (unknown) throw invalid(`Parameter tidak dikenal: ${unknown}.`);
  if (raw.q !== undefined && typeof raw.q !== 'string') throw invalid('Parameter q hanya boleh satu nilai.');
  const q = (raw.q ?? '').trim();
  if (q.length < SEARCH_MIN_LENGTH) throw invalid(`Ketik paling sedikit ${SEARCH_MIN_LENGTH} karakter untuk mencari.`);
  if (q.length > SEARCH_MAX_LENGTH) throw invalid(`Pencarian paling banyak ${SEARCH_MAX_LENGTH} karakter.`);
  return q;
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ statusCode: HttpStatus.BAD_REQUEST, message });
}
