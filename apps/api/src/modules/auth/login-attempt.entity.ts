import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Setiap percobaan login, berhasil maupun gagal, untuk membatasi tebakan kata sandi
 * per email dan per alamat IP. Email disimpan apa adanya walau tidak terdaftar,
 * agar penguncian berlaku sama dan tidak membocorkan email mana yang ada.
 */
@Entity({ name: 'login_attempts' })
export class LoginAttempt {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text' })
  ip: string;

  @Column({ type: 'boolean' })
  succeeded: boolean;

  @Column({ name: 'attempted_at', type: 'timestamptz' })
  attemptedAt: Date;
}
