import { masterEntity, type MasterRow } from '../../db/master-entity.js';

/** Customer (bank). Juga salah satu daftar master yang dikelola admin (langkah 1.1). */
export type Tenant = MasterRow;

export const TenantEntity = masterEntity('Tenant', 'tenants');
