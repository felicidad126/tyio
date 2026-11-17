import { MASTER_LISTS, type MasterList } from '@tyio/shared';
import type { EntitySchema } from 'typeorm';
import { masterEntity, type MasterRow } from '../../db/master-entity.js';
import { TenantEntity } from '../tenants/tenant.entity.js';

/** Kategori NPR, mis. Remote Down, Corrective Maintenance, Preventive Maintenance. */
export const TicketCategoryEntity = masterEntity('TicketCategory', 'ticket_categories');

/** "System" pada tiket; artinya dibahas di sesi dengan user. */
export const SystemEntity = masterEntity('System', 'systems');

/** Jaringan komputer (K11); kodenya bagian dari nomor NPR/TT. */
export const JarkomEntity = masterEntity('Jarkom', 'jarkoms');

export const MASTER_ENTITIES: Readonly<Record<MasterList, EntitySchema<MasterRow>>> = {
  customer: TenantEntity,
  kategori: TicketCategoryEntity,
  system: SystemEntity,
  jarkom: JarkomEntity,
};

/** Nama tabel tiap daftar, dibaca dari entity-nya. */
export const MASTER_TABLES = Object.fromEntries(
  MASTER_LISTS.map((list) => [list, MASTER_ENTITIES[list].options.tableName ?? '']),
) as Readonly<Record<MasterList, string>>;
