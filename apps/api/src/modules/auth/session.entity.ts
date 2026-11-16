import { EntitySchema } from 'typeorm';
import { UserEntity } from '../users/user.entity.js';

/**
 * Sesi login. Yang disimpan hanya hash SHA-256 dari token; token aslinya hanya ada di
 * cookie browser, sehingga isi database yang bocor tidak bisa dipakai untuk masuk.
 */
export interface Session {
  id: string;
  tokenHash: Buffer;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  /** Berakhir bila tidak dipakai; diperpanjang saat dipakai, tidak melewati absoluteExpiresAt. */
  expiresAt: Date;
  absoluteExpiresAt: Date;
  ip: string | null;
  userAgent: string | null;
}

export const SessionEntity = new EntitySchema<Session>({
  name: 'Session',
  tableName: 'sessions',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      default: () => 'uuidv7()',
      primaryKeyConstraintName: 'sessions_pkey',
    },
    tokenHash: { name: 'token_hash', type: 'bytea' },
    userId: {
      name: 'user_id',
      type: 'uuid',
      foreignKey: { target: UserEntity, name: 'sessions_user_id_fkey', onDelete: 'CASCADE' },
    },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    lastSeenAt: { name: 'last_seen_at', type: 'timestamptz', default: () => 'now()' },
    expiresAt: { name: 'expires_at', type: 'timestamptz' },
    absoluteExpiresAt: { name: 'absolute_expires_at', type: 'timestamptz' },
    ip: { type: 'varchar', length: 64, nullable: true },
    userAgent: { name: 'user_agent', type: 'varchar', length: 512, nullable: true },
  },
  uniques: [{ name: 'sessions_token_hash_key', columns: ['tokenHash'] }],
  indices: [{ name: 'sessions_user_id_idx', columns: ['userId'] }],
});
