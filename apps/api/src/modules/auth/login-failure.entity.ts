import { EntitySchema } from 'typeorm';

/**
 * Satu percobaan login yang gagal, untuk pembatasan percobaan.
 * Nama pengguna disimpan sebagai hash: orang kadang mengetik kata sandi di kolom nama
 * pengguna, dan isi itu tidak boleh tersimpan apa adanya.
 */
export interface LoginFailure {
  id: string;
  usernameHash: Buffer;
  ip: string | null;
  attemptedAt: Date;
}

export const LoginFailureEntity = new EntitySchema<LoginFailure>({
  name: 'LoginFailure',
  tableName: 'login_failures',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      default: () => 'uuidv7()',
      primaryKeyConstraintName: 'login_failures_pkey',
    },
    usernameHash: { name: 'username_hash', type: 'bytea' },
    ip: { type: 'varchar', length: 64, nullable: true },
    attemptedAt: { name: 'attempted_at', type: 'timestamptz', default: () => 'now()' },
  },
  indices: [
    { name: 'login_failures_username_idx', columns: ['usernameHash', 'attemptedAt'] },
    { name: 'login_failures_ip_idx', columns: ['ip', 'attemptedAt'] },
  ],
});
