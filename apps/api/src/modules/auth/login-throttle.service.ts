import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { APP_CONFIG } from '../../config.module.js';
import type { AppConfig } from '../../config.js';

/**
 * Membatasi tebakan kata sandi:
 * - per email: setelah N gagal berturut-turut (sejak login berhasil terakhir) dalam jendela
 *   waktu, email itu dikunci sampai kegagalan tertua dari N itu keluar dari jendela;
 * - per IP: setelah M gagal dalam jendela waktu, dari email apa pun.
 * Penguncian berlaku sama untuk email yang tidak terdaftar, jadi tidak membocorkan akun.
 */
@Injectable()
export class LoginThrottleService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Detik sampai boleh mencoba lagi, atau `null` bila tidak dikunci. */
  async lockedFor(email: string, ip: string): Promise<number | null> {
    const { maxFailuresPerAccount, maxFailuresPerIp, windowMinutes } = this.config.loginLimit;

    const byAccount: Array<{ wait: number }> = await this.dataSource.query(
      `SELECT ceil(extract(epoch FROM attempted_at + make_interval(mins => $2) - now()))::int AS wait
       FROM login_attempts
       WHERE email = $1
         AND NOT succeeded
         AND attempted_at > now() - make_interval(mins => $2)
         AND attempted_at > coalesce(
           (SELECT max(attempted_at) FROM login_attempts WHERE email = $1 AND succeeded),
           '-infinity'
         )
       ORDER BY attempted_at DESC
       OFFSET $3 LIMIT 1`,
      [email, windowMinutes, maxFailuresPerAccount - 1],
    );

    const byIp: Array<{ wait: number }> = await this.dataSource.query(
      `SELECT ceil(extract(epoch FROM attempted_at + make_interval(mins => $2) - now()))::int AS wait
       FROM login_attempts
       WHERE ip = $1 AND NOT succeeded AND attempted_at > now() - make_interval(mins => $2)
       ORDER BY attempted_at DESC
       OFFSET $3 LIMIT 1`,
      [ip, windowMinutes, maxFailuresPerIp - 1],
    );

    const waits = [byAccount[0]?.wait, byIp[0]?.wait].filter(
      (wait): wait is number => typeof wait === 'number' && wait > 0,
    );
    return waits.length === 0 ? null : Math.max(...waits);
  }

  async record(email: string, ip: string, succeeded: boolean): Promise<void> {
    await this.dataSource.query(
      'INSERT INTO login_attempts (email, ip, succeeded) VALUES ($1, $2, $3)',
      [email.slice(0, 320), ip, succeeded],
    );
  }

  /** Catatan lebih dari sehari tidak lagi dipakai penguncian. Dipanggil sambil lalu. */
  async purgeOld(): Promise<void> {
    await this.dataSource.query(
      `WITH gone AS (
         DELETE FROM login_attempts WHERE attempted_at < now() - interval '1 day' RETURNING id
       )
       SELECT count(*) FROM gone`,
    );
  }
}
