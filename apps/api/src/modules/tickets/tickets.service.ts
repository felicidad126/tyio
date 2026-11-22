import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  OPEN_TICKET_STATUSES,
  type OpenTicketsConflict,
  TICKET_STARTED_CLOCK_SKEW_MINUTES,
  TICKET_STARTED_MAX_AGE_DAYS,
  type TicketDetail,
  type TicketStatus,
  type TicketSummary,
} from '@tyio/shared';
import type { DataSource, EntityManager, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { type AuditActor, auditedTransaction } from '../../common/audit/audit-context.js';
import { applyTenantScope, type TenantScope } from '../../common/tenant/tenant-scope.js';
import { REMOTE_NOT_FOUND_MESSAGE, RemotesService } from '../remotes/remotes.service.js';

export const TICKET_NOT_FOUND_MESSAGE = 'NPR tidak ditemukan.';
export const CATEGORY_NOT_FOUND_MESSAGE = 'Kategori tidak ditemukan di customer remote ini.';
export const SYSTEM_NOT_FOUND_MESSAGE = 'System tidak ditemukan di customer remote ini.';
export const OPEN_TICKETS_MESSAGE =
  'Remote ini masih punya NPR terbuka. Periksa dulu; bila gangguannya berbeda, konfirmasi untuk tetap membuat NPR baru.';

/** Masukan yang sudah dibaca controller; id sudah berformat UUID huruf kecil. */
export interface CreateTicketInput {
  remoteId: string;
  categoryId: string;
  systemId: string;
  startedAt: Date | null;
  description: string;
  acknowledgeOpenTickets: boolean;
}

interface RemoteRow {
  id: string;
  tenant_id: string;
  code: string;
  active: boolean;
  network_id: string;
  tenant_name: string;
  tenant_active: boolean;
}

interface SummaryRow {
  id: string;
  number: string;
  status: TicketStatus;
  category_name: string;
  started_at: Date;
  created_at: Date;
  created_by_name: string;
  description: string;
}

interface DetailRow extends SummaryRow {
  tenant_id: string;
  remote_id: string;
  category_id: string;
  system_id: string;
  system_name: string;
  network_id: string;
  network_code: string;
  network_name: string;
  created_by: string;
  customer_ticket_number: string | null;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * NPR (langkah 1.3). Semua baca lewat cakupan customer pengguna (T9); NPR dan remote di
 * luar cakupan diperlakukan seperti tidak ada (T29). Pembuatan NPR satu transaksi
 * beraudit (T25): kunci baris remote → periksa NPR terbuka → simpan (nomor dibuat database).
 */
@Injectable()
export class TicketsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly remotes: RemotesService,
  ) {}

  async create(scope: TenantScope, actor: AuditActor, input: CreateTicketInput): Promise<TicketDetail> {
    const id = await auditedTransaction(this.dataSource, actor, async (manager) => {
      // Kunci baris remote sampai transaksi selesai: dua operator yang membuat NPR untuk
      // remote yang sama diproses bergantian, sehingga yang kedua pasti melihat NPR yang
      // pertama (peringatan NPR terbuka tidak bisa terlewat karena waktu yang bersamaan).
      // NO KEY UPDATE tidak menghalangi tiket lain yang merujuk remote ini.
      const remote = await applyTenantScope(
        manager
          .createQueryBuilder()
          .from('remotes', 'r')
          .innerJoin('tenants', 't', 't.id = r.tenant_id')
          .select([
            'r.id AS id',
            'r.tenant_id AS tenant_id',
            'r.code AS code',
            'r.active AS active',
            'r.network_id AS network_id',
            't.name AS tenant_name',
            't.active AS tenant_active',
          ])
          .where('r.id = :id', { id: input.remoteId })
          .setLock('for_no_key_update', undefined, ['r']),
        scope,
        'r.tenant_id',
      ).getRawOne<RemoteRow>();
      if (!remote) throw new NotFoundException(REMOTE_NOT_FOUND_MESSAGE);
      if (!remote.tenant_active) {
        throw new BadRequestException(`Customer ${remote.tenant_name} nonaktif; NPR baru tidak bisa dibuat.`);
      }
      if (!remote.active) {
        throw new BadRequestException(
          `Remote ${remote.code} nonaktif; NPR baru tidak bisa dibuat. Admin bisa mengaktifkannya lewat impor.`,
        );
      }

      await requireActiveValue(manager, 'master_categories', remote.tenant_id, input.categoryId, {
        missing: CATEGORY_NOT_FOUND_MESSAGE,
        inactive: (name) => `Kategori ${name} sudah dinonaktifkan. Pilih kategori lain.`,
      });
      await requireActiveValue(manager, 'master_systems', remote.tenant_id, input.systemId, {
        missing: SYSTEM_NOT_FOUND_MESSAGE,
        inactive: (name) => `System ${name} sudah dinonaktifkan. Pilih system lain.`,
      });

      const [{ now }] = (await manager.query('SELECT now() AS now')) as [{ now: Date }];
      if (input.startedAt) checkStartedAt(input.startedAt, now);

      if (!input.acknowledgeOpenTickets) {
        const openTickets = await openTicketsOf(manager, remote.id);
        if (openTickets.length > 0) {
          const body: OpenTicketsConflict = { statusCode: 409, message: OPEN_TICKETS_MESSAGE, openTickets };
          throw new ConflictException(body);
        }
      }

      // Nomor dibuat trigger database saat INSERT (assign_number): bulan dari waktu dibuat
      // menurut zona remote, urut dari penghitung per jarkom per customer per bulan.
      const [created] = (await manager.query(
        `INSERT INTO tickets (tenant_id, remote_id, network_id, category_id, system_id,
                              description, started_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, LEAST(coalesce($7::timestamptz, now()), now()), $8)
         RETURNING id`,
        [
          remote.tenant_id,
          remote.id,
          remote.network_id,
          input.categoryId,
          input.systemId,
          input.description,
          input.startedAt?.toISOString() ?? null,
          actor.userId,
        ],
      )) as Array<{ id: string }>;
      if (!created) throw new Error('NPR gagal disimpan.');
      return created.id;
    });

    const ticket = await this.get(scope, id);
    if (!ticket) throw new Error('NPR yang baru disimpan tidak terbaca.');
    return ticket;
  }

  async get(scope: TenantScope, id: string): Promise<TicketDetail | null> {
    const row = await applyTenantScope(
      this.dataSource
        .createQueryBuilder()
        .from('tickets', 'tk')
        .innerJoin('master_categories', 'c', 'c.id = tk.category_id')
        .innerJoin('master_systems', 's', 's.id = tk.system_id')
        .innerJoin('master_networks', 'n', 'n.id = tk.network_id')
        .innerJoin('users', 'u', 'u.id = tk.created_by')
        .select([
          ...SUMMARY_COLUMNS,
          'tk.tenant_id AS tenant_id',
          'tk.remote_id AS remote_id',
          'tk.category_id AS category_id',
          'tk.system_id AS system_id',
          's.name AS system_name',
          'tk.network_id AS network_id',
          'n.code AS network_code',
          'n.name AS network_name',
          'tk.created_by AS created_by',
          'tk.customer_ticket_number AS customer_ticket_number',
        ])
        .where('tk.id = :id', { id }),
      scope,
      'tk.tenant_id',
    ).getRawOne<DetailRow>();
    if (!row) return null;
    const remote = await this.remotes.get(scope, row.remote_id);
    if (!remote) return null;
    return {
      ...toSummary(row),
      tenantId: row.tenant_id,
      customerTicketNumber: row.customer_ticket_number,
      category: { id: row.category_id, name: row.category_name },
      system: { id: row.system_id, name: row.system_name },
      network: { id: row.network_id, code: row.network_code, name: row.network_name },
      createdBy: { id: row.created_by, name: row.created_by_name },
      remote,
    };
  }

  /** NPR terbuka sebuah remote, terbaru dulu; `null` bila remote tidak ada dalam cakupan. */
  async openTicketsOfRemote(scope: TenantScope, remoteId: string): Promise<TicketSummary[] | null> {
    const remote = await this.remotes.get(scope, remoteId);
    if (!remote) return null;
    const rows = await applyTenantScope(
      summaryQuery(this.dataSource.createQueryBuilder())
        .where('tk.remote_id = :remoteId', { remoteId: remote.id })
        .andWhere('tk.status IN (:...open)', { open: [...OPEN_TICKET_STATUSES] }),
      scope,
      'tk.tenant_id',
    )
      .orderBy('tk.created_at', 'DESC')
      .limit(OPEN_TICKETS_LIMIT)
      .getRawMany<SummaryRow>();
    return rows.map(toSummary);
  }
}

const OPEN_TICKETS_LIMIT = 20;

const SUMMARY_COLUMNS = [
  'tk.id AS id',
  'tk.number AS number',
  'tk.status AS status',
  'c.name AS category_name',
  'tk.started_at AS started_at',
  'tk.created_at AS created_at',
  'u.name AS created_by_name',
  'tk.description AS description',
];

function summaryQuery(builder: SelectQueryBuilder<ObjectLiteral>): SelectQueryBuilder<ObjectLiteral> {
  return builder
    .from('tickets', 'tk')
    .innerJoin('master_categories', 'c', 'c.id = tk.category_id')
    .innerJoin('users', 'u', 'u.id = tk.created_by')
    .select(SUMMARY_COLUMNS);
}

/** NPR terbuka remote ini, dibaca di dalam transaksi pembuatan (setelah baris remote dikunci). */
async function openTicketsOf(manager: EntityManager, remoteId: string): Promise<TicketSummary[]> {
  const rows = await summaryQuery(manager.createQueryBuilder())
    .where('tk.remote_id = :remoteId', { remoteId })
    .andWhere('tk.status IN (:...open)', { open: [...OPEN_TICKET_STATUSES] })
    .orderBy('tk.created_at', 'DESC')
    .limit(OPEN_TICKETS_LIMIT)
    .getRawMany<SummaryRow>();
  return rows.map(toSummary);
}

function toSummary(row: SummaryRow): TicketSummary {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    categoryName: row.category_name,
    startedAt: row.started_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name,
    description: row.description,
  };
}

/**
 * Nilai master harus milik customer remote dan masih aktif (T44, aturan tenant §5). Nilai
 * customer lain dijawab sama dengan nilai yang tidak ada (T29).
 */
async function requireActiveValue(
  manager: EntityManager,
  table: 'master_categories' | 'master_systems',
  tenantId: string,
  id: string,
  messages: { missing: string; inactive: (name: string) => string },
): Promise<void> {
  const [value] = (await manager.query(`SELECT name, active FROM ${table} WHERE id = $1 AND tenant_id = $2`, [
    id,
    tenantId,
  ])) as Array<{ name: string; active: boolean }>;
  if (!value) throw new BadRequestException(messages.missing);
  if (!value.active) throw new BadRequestException(messages.inactive(value.name));
}

/**
 * Mulai gangguan (T57): tidak di masa depan (dengan toleransi jam perangkat; nilainya lalu
 * disimpan sama dengan waktu NPR dibuat) dan paling lama 30 hari sebelum NPR dibuat.
 */
function checkStartedAt(startedAt: Date, now: Date): void {
  if (startedAt.getTime() > now.getTime() + TICKET_STARTED_CLOCK_SKEW_MINUTES * MINUTE) {
    throw new BadRequestException('Mulai gangguan tidak boleh di masa depan.');
  }
  if (startedAt.getTime() < now.getTime() - TICKET_STARTED_MAX_AGE_DAYS * DAY) {
    throw new BadRequestException(
      `Mulai gangguan paling lama ${TICKET_STARTED_MAX_AGE_DAYS} hari sebelum NPR dibuat.`,
    );
  }
}
