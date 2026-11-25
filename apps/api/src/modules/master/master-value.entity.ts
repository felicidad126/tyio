import type { MasterKind } from '@npr/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Kolom bersama semua nilai master (tabel `master_*`, migrasi 1.1). */
abstract class MasterValueBase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Customer pemilik nilai ini; tidak bisa diubah (dijaga trigger database). */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'text' })
  name: string;

  /** Nilai nonaktif tetap tampil di data lama, tetapi tidak ditawarkan untuk data baru. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

/** Kategori kejadian di tiket, mis. Remote Down, Corrective, Preventive. */
@Entity({ name: 'master_categories' })
export class MasterCategory extends MasterValueBase {}

/** System = alat monitoring sumber gangguan (T43), mis. SNMP NOC, NMS VSAT. */
@Entity({ name: 'master_systems' })
export class MasterSystem extends MasterValueBase {}

/** Jarkom = jenis jaringan komputer remote (K11). Kodenya dipakai di nomor NPR/TT. */
@Entity({ name: 'master_networks' })
export class MasterNetwork extends MasterValueBase {
  /** 2–10 huruf besar/angka, unik per customer, tidak bisa diubah. */
  @Column({ type: 'text' })
  code: string;
}

export type MasterEntity = typeof MasterCategory | typeof MasterSystem | typeof MasterNetwork;

export const MASTER_ENTITIES: Record<MasterKind, MasterEntity> = {
  kategori: MasterCategory,
  system: MasterSystem,
  jarkom: MasterNetwork,
};
