import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { GlobalSearchResult, SearchRemoteHit, SearchTicketHit, TicketStatus } from '@tyio/shared';
import type { DataSource } from 'typeorm';
import { applyTenantScope, type TenantScope } from '../../common/tenant/tenant-scope.js';

export const SEARCH_TICKET_LIMIT = 8;
export const SEARCH_REMOTE_LIMIT = 5;

/**
 * Pencarian global (langkah 1.5, T84): no. NPR, no. tiket customer, dan kode/nama remote,
 * termasuk NPR yang sudah ditutup. No. TT menyusul di 1.5b. Lewat cakupan customer (T9).
 * Urutan: cocok persis dulu, lalu NPR yang masih berjalan, lalu yang terbaru.
 */
@Injectable()
export class SearchService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async search(scope: TenantScope, q: string): Promise<GlobalSearchResult> {
    // Huruf %, _, dan \ di kata kunci dicari apa adanya, bukan sebagai pola.
    const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const exact = q.toLowerCase();

    const tickets = await applyTenantScope(
      this.dataSource
        .createQueryBuilder()
        .from('tickets', 'tk')
        .innerJoin('remotes', 'r', 'r.id = tk.remote_id')
        .innerJoin('tenants', 't', 't.id = tk.tenant_id')
        .select([
          'tk.id AS id',
          'tk.number AS number',
          'tk.status AS status',
          'tk.customer_ticket_number AS customer_ticket_number',
          't.name AS customer_name',
          'r.code AS remote_code',
          'r.name AS remote_name',
        ])
        .where(
          `(tk.number ILIKE :pattern OR tk.customer_ticket_number ILIKE :pattern
            OR r.code ILIKE :pattern OR r.name ILIKE :pattern)`,
          { pattern },
        ),
      scope,
      'tk.tenant_id',
    )
      .orderBy('(lower(tk.number) = :exact OR lower(tk.customer_ticket_number) = :exact)', 'DESC')
      .addOrderBy(`(tk.status <> 'ditutup')`, 'DESC')
      .addOrderBy('tk.created_at', 'DESC')
      .setParameter('exact', exact)
      .limit(SEARCH_TICKET_LIMIT)
      .getRawMany<{
        id: string;
        number: string;
        status: TicketStatus;
        customer_ticket_number: string | null;
        customer_name: string;
        remote_code: string;
        remote_name: string;
      }>();

    const remotes = await applyTenantScope(
      this.dataSource
        .createQueryBuilder()
        .from('remotes', 'r')
        .innerJoin('tenants', 't', 't.id = r.tenant_id')
        .select(['r.id AS id', 'r.code AS code', 'r.name AS name', 'r.city AS city', 't.name AS customer_name'])
        .where('(r.code ILIKE :pattern OR r.name ILIKE :pattern)', { pattern }),
      scope,
      'r.tenant_id',
    )
      .orderBy('(lower(r.code) = :exact)', 'DESC')
      .addOrderBy('r.code')
      .setParameter('exact', exact)
      .limit(SEARCH_REMOTE_LIMIT)
      .getRawMany<{ id: string; code: string; name: string; city: string | null; customer_name: string }>();

    return {
      tickets: tickets.map(
        (row): SearchTicketHit => ({
          id: row.id,
          number: row.number,
          status: row.status,
          customerTicketNumber: row.customer_ticket_number,
          customerName: row.customer_name,
          remote: { code: row.remote_code, name: row.remote_name },
        }),
      ),
      remotes: remotes.map(
        (row): SearchRemoteHit => ({
          id: row.id,
          code: row.code,
          name: row.name,
          city: row.city,
          customerName: row.customer_name,
        }),
      ),
    };
  }
}
