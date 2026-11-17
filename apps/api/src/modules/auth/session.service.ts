import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { SessionEntity } from './session.entity.js';

// Sesi berakhir setelah 12 jam tidak dipakai (satu shift), dan paling lama 7 hari
// sejak login. Waktu dihitung dengan jam database, bukan jam server aplikasi.
const IDLE = `interval '12 hours'`;
const ABSOLUTE = `interval '7 days'`;
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
/** Perpanjangan ditulis paling sering sekali per menit per sesi. */
const TOUCH_AFTER = `interval '60 seconds'`;
/** 32 byte acak dalam base64url. */
const TOKEN_FORMAT = /^[\w-]{43}$/;

@Injectable()
export class SessionService {
  constructor(private readonly dataSource: DataSource) {}

  private get repo() {
    return this.dataSource.getRepository(SessionEntity);
  }

  /** Membuat sesi baru; mengembalikan token untuk cookie. Database hanya menyimpan hash-nya. */
  async create(userId: string, meta: { ip?: string; userAgent?: string }): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.repo
      .createQueryBuilder()
      .insert()
      .values({
        tokenHash: hashToken(token),
        userId,
        expiresAt: () => `now() + ${IDLE}`,
        absoluteExpiresAt: () => `now() + ${ABSOLUTE}`,
        ip: meta.ip?.slice(0, 64) ?? null,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
      })
      .execute();
    return token;
  }

  /** userId pemilik sesi, atau null bila token tidak dikenal atau sudah kedaluwarsa. */
  async resolve(token: string): Promise<string | null> {
    if (!TOKEN_FORMAT.test(token)) return null;
    const tokenHash = hashToken(token);

    await this.repo
      .createQueryBuilder()
      .delete()
      .where('token_hash = :tokenHash AND expires_at <= now()', { tokenHash })
      .execute();
    await this.repo
      .createQueryBuilder()
      .update()
      .set({
        lastSeenAt: () => 'now()',
        expiresAt: () => `least(now() + ${IDLE}, absolute_expires_at)`,
      })
      .where(`token_hash = :tokenHash AND last_seen_at < now() - ${TOUCH_AFTER}`, { tokenHash })
      .execute();

    const session = await this.repo.findOne({ where: { tokenHash }, select: { userId: true } });
    return session?.userId ?? null;
  }

  /** Menghapus sesi; mengembalikan userId pemiliknya, atau null bila sesi tidak ada. */
  async revoke(token: string): Promise<string | null> {
    if (!TOKEN_FORMAT.test(token)) return null;
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where('token_hash = :tokenHash', { tokenHash: hashToken(token) })
      .returning('user_id')
      .execute();
    const rows = result.raw as Array<{ user_id: string }>;
    return rows[0]?.user_id ?? null;
  }
}

function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
