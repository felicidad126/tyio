import { EntitySchema } from 'typeorm';

/** Customer (bank). Nama constraint ditulis eksplisit agar sama persis dengan migrasi. */
export interface Tenant {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const TenantEntity = new EntitySchema<Tenant>({
  name: 'Tenant',
  tableName: 'tenants',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      default: () => 'uuidv7()',
      primaryKeyConstraintName: 'tenants_pkey',
    },
    code: { type: 'varchar', length: 16 },
    name: { type: 'varchar', length: 120 },
    active: { type: 'boolean', default: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
  uniques: [{ name: 'tenants_code_key', columns: ['code'] }],
  checks: [{ name: 'tenants_code_format', expression: `code ~ '^[A-Z0-9]{2,16}$'` }],
});
