import type { Role } from '@tyio/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity.js';

/**
 * Pengguna portal: staf NOC (L1 Monitoring, L2 NOC) dan admin (K20, K24).
 * Akses customer (K26): bawaan semua customer; bila `allTenants` false, hanya `tenants`.
 */
@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Selalu huruf kecil (dijaga constraint database); dipakai untuk login (K27). */
  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  role: Role;

  /** Hash argon2id format PHC. Tidak pernah dikirim keluar API. */
  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash: string;

  @Column({ name: 'all_tenants', type: 'boolean', default: true })
  allTenants: boolean;

  /** Daftar customer yang boleh diakses bila `allTenants` false. */
  @ManyToMany(() => Tenant)
  @JoinTable({
    name: 'user_tenants',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tenant_id', referencedColumnName: 'id' },
  })
  tenants: Relation<Tenant[]>;

  /** Pengguna nonaktif tidak bisa login dan sesinya ditolak. Tidak dihapus demi jejak audit. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
