import { BadRequestException, Controller, Get, Header, Module, Query } from '@nestjs/common';
import { type GlobalSearchResult, SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH } from '@npr/shared';
import { CurrentScope, TenantScoped } from '../../common/tenant/tenancy.js';
import type { TenantScope } from '../../common/tenant/tenant-scope.js';
import { SearchService } from './search.service.js';

/** Pencarian global di bilah atas (langkah 1.5). Semua peran, dalam cakupan customer-nya. */
@Controller('search')
@TenantScoped()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** `?q=`: kurang dari 2 huruf dijawab kosong, lebih dari 100 ditolak. */
  @Get()
  @Header('Cache-Control', 'no-store')
  async find(@CurrentScope() scope: TenantScope, @Query('q') q: unknown): Promise<GlobalSearchResult> {
    if (q !== undefined && typeof q !== 'string') throw new BadRequestException('q harus berupa teks.');
    const text = (q ?? '').trim();
    if (text.length > SEARCH_MAX_LENGTH) {
      throw new BadRequestException(`Kata kunci paling panjang ${SEARCH_MAX_LENGTH} karakter.`);
    }
    if (text.length < SEARCH_MIN_LENGTH) return { tickets: [], troubleTickets: [], remotes: [] };
    return this.search.search(scope, text);
  }
}

@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
