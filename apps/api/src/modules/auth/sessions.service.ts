import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { APP_CONFIG } from '../../config.module.js';
import type { AppConfig } from '../../config.js';

export interface ClientInfo {
  ip: string;
  userAgent: string | undefined;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 byte acak dalam base64url

/**
 * Sesi login di PostgreSQL (T5, T7: tanpa komponen tambahan). Semua perbandingan waktu
 * memakai `now()` database, sehingga jam aplikasi yang meleset tidak memperpanjang sesi.
 * UPDATE/DELETE dibungkus CTE agar hasil query selalu berupa baris.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(userId: string, client: ClientInfo): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const rows: Array<{ expires_at: Date }> = await this.dataSource.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent)
       VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5)
       RETURNING expires_at`,
      [
        hashToken(token),
        userId,
        this.config.session.maxHours,
        client.ip,
        client.userAgent?.slice(0, 512) ?? null,
      ],
    );
    const expiresAt = rows[0]?.expires_at;
    if (!expiresAt) throw new Error('Sesi gagal dibuat.');
    return { token, expiresAt };
  }

  /**
   * Sesi yang masih berlaku dicatat dipakai sekarang (memperpanjang batas idle)
   * dan pemiliknya dikembalikan. Sesi kedaluwarsa, tidak dikenal, atau rusak: `null`.
   */
  async touch(token: string): Promise<{ userId: string } | null> {
    if (!TOKEN_PATTERN.test(token)) return null;
    const rows: Array<{ user_id: string }> = await this.dataSource.query(
      `WITH touched AS (
         UPDATE sessions SET last_seen_at = now()
         WHERE token_hash = $1
           AND expires_at > now()
           AND last_seen_at > now() - make_interval(mins => $2)
         RETURNING user_id
       )
       SELECT user_id FROM touched`,
      [hashToken(token), this.config.session.idleMinutes],
    );
    const row = rows[0];
    return row ? { userId: row.user_id } : null;
  }

  /** Mencabut sesi; mengembalikan pemiliknya bila sesi itu memang ada. */
  async revoke(token: string): Promise<{ userId: string; email: string } | null> {
    if (!TOKEN_PATTERN.test(token)) return null;
    const rows: Array<{ user_id: string; email: string }> = await this.dataSource.query(
      `WITH gone AS (DELETE FROM sessions WHERE token_hash = $1 RETURNING user_id)
       SELECT gone.user_id, users.email FROM gone JOIN users ON users.id = gone.user_id`,
      [hashToken(token)],
    );
    const row = rows[0];
    return row ? { userId: row.user_id, email: row.email } : null;
  }

  /** Membuang sesi yang sudah tidak berlaku. Dipanggil sambil lalu saat login. */
  async purgeExpired(): Promise<void> {
    await this.dataSource.query(
      `WITH gone AS (
         DELETE FROM sessions
         WHERE expires_at <= now() OR last_seen_at <= now() - make_interval(mins => $1)
         RETURNING id
       )
       SELECT count(*) FROM gone`,
      [this.config.session.idleMinutes],
    );
  }
}

/** Hanya hash token yang disimpan; isi tabel sesi tidak bisa dipakai untuk masuk. */
function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
