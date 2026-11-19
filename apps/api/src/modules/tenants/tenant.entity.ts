import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Customer portal (R-E: setiap customer = tenant). Remote, tiket, dan laporan kelak
 * menempel ke tenant; penyaringannya dipasang di langkah 0.4.
 */
@Entity({ name: 'tenants' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Kode pendek huruf besar/angka untuk penomoran NPR/TT, mis. `BNA`. Unik. */
  @Column({ type: 'text' })
  code: string;

  @Column({ type: 'text' })
  name: string;

  /** Customer nonaktif tidak dihapus (riwayat tetap utuh) dan tidak tampil sebagai pilihan. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
