import { EntitySchema } from 'typeorm';
import { TenantEntity } from '../tenants/tenant.entity.js';
import { TicketEntity } from '../tickets/ticket.entity.js';
import { UserEntity } from '../users/user.entity.js';

/**
 * Trouble Ticket (TT): eskalasi NPR ke Service Delivery untuk kunjungan teknisi (K27, K44).
 * Paling banyak satu per NPR (unik di `ticket_id`), selalu milik customer yang sama dengan
 * NPR-nya (foreign key gabungan). Penjadwalan teknisi di luar portal; hasilnya dicatat di NPR.
 */
export interface TroubleTicket {
  id: string;
  tenantId: string;
  ticketId: string;
  number: string;
  problem: string;
  createdById: string;
  createdAt: Date;
  /** Diisi saat ditutup bersama NPR-nya (langkah 1.6). */
  closedAt: Date | null;
}

export const TroubleTicketEntity = new EntitySchema<TroubleTicket>({
  name: 'TroubleTicket',
  tableName: 'trouble_tickets',
  columns: {
    id: { type: 'uuid', primary: true, default: () => 'uuidv7()', primaryKeyConstraintName: 'trouble_tickets_pkey' },
    tenantId: {
      name: 'tenant_id',
      type: 'uuid',
      foreignKey: { target: TenantEntity, name: 'trouble_tickets_tenant_id_fkey', onDelete: 'RESTRICT' },
    },
    ticketId: { name: 'ticket_id', type: 'uuid' },
    number: { type: 'varchar', length: 64 },
    problem: { type: 'text' },
    createdById: {
      name: 'created_by',
      type: 'uuid',
      foreignKey: { target: UserEntity, name: 'trouble_tickets_created_by_fkey', onDelete: 'RESTRICT' },
    },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    closedAt: { name: 'closed_at', type: 'timestamptz', nullable: true },
  },
  foreignKeys: [
    {
      name: 'trouble_tickets_ticket_fkey',
      target: TicketEntity,
      columnNames: ['ticketId', 'tenantId'],
      referencedColumnNames: ['id', 'tenantId'],
      onDelete: 'RESTRICT',
    },
  ],
  uniques: [
    { name: 'trouble_tickets_number_key', columns: ['number'] },
    { name: 'trouble_tickets_ticket_key', columns: ['ticketId'] },
  ],
  indices: [
    // Indeks ekspresi trigram untuk pencarian no. TT; dibuat migrasi.
    { name: 'trouble_tickets_search_trgm', columns: ['number'], synchronize: false },
  ],
  checks: [{ name: 'trouble_tickets_problem_length', expression: 'char_length(problem) BETWEEN 3 AND 2000' }],
});
