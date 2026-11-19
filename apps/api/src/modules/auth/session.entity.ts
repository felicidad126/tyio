import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { User } from '../users/user.entity.js';

/**
 * Sesi login di sisi server (T5). Cookie hanya membawa token acak; yang disimpan di sini
 * hanya hash SHA-256-nya, sehingga isi tabel ini tidak bisa dipakai untuk masuk.
 * Waktu dihitung dengan jam database (`now()`), bukan jam aplikasi.
 */
@Entity({ name: 'sessions' })
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'token_hash', type: 'bytea' })
  tokenHash: Buffer;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** Diperbarui setiap permintaan; sesi berakhir bila lebih lama dari batas idle. */
  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;

  /** Batas mutlak sejak login, walau sesi terus dipakai. */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'text', nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;
}
