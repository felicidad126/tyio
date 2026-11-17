import type { RemoteContact, RemoteStatus, TimeZoneName } from '@tyio/shared';
import { EntitySchema } from 'typeorm';
import { JarkomEntity } from '../master/master.entities.js';
import { TenantEntity } from '../tenants/tenant.entity.js';

/** Remote (site ATM/VSAT) milik satu customer. Tidak pernah dihapus; lihat `status`. */
export interface Remote {
  id: string;
  tenantId: string;
  /** Unik per customer; kunci untuk impor ulang. Disimpan huruf besar. */
  siteId: string;
  name: string;
  jarkomId: string;
  status: RemoteStatus;
  address: string | null;
  city: string;
  province: string;
  /** Ditentukan dari provinsi, tidak diisi pengguna. */
  timeZone: TimeZoneName;
  /** numeric dikembalikan driver sebagai teks agar presisi tidak hilang. */
  latitude: string | null;
  longitude: string | null;
  ipSnmp: string | null;
  ipLan: string | null;
  userIp: string | null;
  userId: string | null;
  kanwil: string | null;
  kanca: string | null;
  /** YYYY-MM-DD */
  onlineDate: string | null;
  contacts: RemoteContact[];
  createdAt: Date;
  updatedAt: Date;
}

/** Teks yang dicari di daftar remote; sama persis dengan indeks trigram di migrasi. */
export const REMOTE_SEARCH_EXPRESSION = (alias: string) =>
  `(${alias}.site_id || ' ' || ${alias}.name || ' ' || ${alias}.city || ' ' || coalesce(${alias}.kanca, ''))`;

const optionalText = (length: number) => ({ type: 'varchar' as const, length, nullable: true });

export const RemoteEntity = new EntitySchema<Remote>({
  name: 'Remote',
  tableName: 'remotes',
  columns: {
    id: { type: 'uuid', primary: true, default: () => 'uuidv7()', primaryKeyConstraintName: 'remotes_pkey' },
    tenantId: {
      name: 'tenant_id',
      type: 'uuid',
      foreignKey: { target: TenantEntity, name: 'remotes_tenant_id_fkey', onDelete: 'RESTRICT' },
    },
    siteId: { name: 'site_id', type: 'varchar', length: 40 },
    name: { type: 'varchar', length: 160 },
    jarkomId: {
      name: 'jarkom_id',
      type: 'uuid',
      foreignKey: { target: JarkomEntity, name: 'remotes_jarkom_id_fkey', onDelete: 'RESTRICT' },
    },
    status: { type: 'varchar', length: 16, default: 'aktif' },
    address: optionalText(500),
    city: { type: 'varchar', length: 120 },
    province: { type: 'varchar', length: 60 },
    timeZone: { name: 'time_zone', type: 'varchar', length: 32 },
    latitude: { type: 'numeric', precision: 9, scale: 6, nullable: true },
    longitude: { type: 'numeric', precision: 9, scale: 6, nullable: true },
    ipSnmp: { name: 'ip_snmp', type: 'inet', nullable: true },
    ipLan: { name: 'ip_lan', type: 'inet', nullable: true },
    userIp: { name: 'user_ip', type: 'inet', nullable: true },
    userId: { name: 'user_id', ...optionalText(64) },
    kanwil: optionalText(120),
    kanca: optionalText(120),
    onlineDate: { name: 'online_date', type: 'date', nullable: true },
    contacts: { type: 'jsonb', default: () => "'[]'" },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
  uniques: [{ name: 'remotes_tenant_site_key', columns: ['tenantId', 'siteId'] }],
  indices: [
    { name: 'remotes_jarkom_id_idx', columns: ['jarkomId'] },
    { name: 'remotes_site_id_idx', columns: ['siteId'] },
    // Indeks ekspresi trigram untuk pencarian; dibuat migrasi, tidak bisa dinyatakan TypeORM.
    { name: 'remotes_search_trgm', columns: ['siteId'], synchronize: false },
  ],
  checks: [
    { name: 'remotes_status_valid', expression: `status IN ('aktif', 'nonaktif', 'dibongkar')` },
    {
      name: 'remotes_time_zone_valid',
      expression: `time_zone IN ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')`,
    },
    { name: 'remotes_coordinates_pair', expression: '(latitude IS NULL) = (longitude IS NULL)' },
    { name: 'remotes_latitude_range', expression: 'latitude BETWEEN -90 AND 90' },
    { name: 'remotes_longitude_range', expression: 'longitude BETWEEN -180 AND 180' },
    { name: 'remotes_contacts_array', expression: `jsonb_typeof(contacts) = 'array'` },
  ],
});
