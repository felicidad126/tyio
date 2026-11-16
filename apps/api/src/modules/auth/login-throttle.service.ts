import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { LoginFailureEntity } from './login-failure.entity.js';

// Dalam jendela 15 menit: paling banyak 5 gagal per nama pengguna, 20 gagal per alamat IP.
const WINDOW = `interval '15 minutes'`;
const MAX_PER_USERNAME = 5;
const MAX_PER_IP = 20;

/** Kunci pembatasan untuk satu nama pengguna (hash, bukan teks yang diketik). */
export function usernameKey(normalizedUsername: string): Buffer {
  return createHash('sha256').update(`tyio-login:${normalizedUsername}`).digest();
}

@Injectable()
export class LoginThrottleService {
  constructor(private readonly dataSource: DataSource) {}

  private get repo() {
    return this.dataSource.getRepository(LoginFailureEntity);
  }

  /** Berapa detik lagi percobaan boleh dilakukan; 0 = boleh sekarang. */
  async retryAfterSeconds(key: Buffer, ip: string | undefined): Promise<number> {
    const byUsername = await this.waitFor('f.username_hash = :value', key, MAX_PER_USERNAME);
    const byIp = ip ? await this.waitFor('f.ip = :value', ip, MAX_PER_IP) : 0;
    return Math.max(byUsername, byIp);
  }

  async recordFailure(key: Buffer, ip: string | undefined): Promise<void> {
    await this.repo.insert({ usernameHash: key, ip: ip?.slice(0, 64) ?? null });
    // Catatan lama tidak dipakai lagi; dibersihkan sambil lalu.
    await this.repo
      .createQueryBuilder()
      .delete()
      .where(`attempted_at < now() - interval '1 day'`)
      .execute();
  }

  async clear(key: Buffer): Promise<void> {
    await this.repo.delete({ usernameHash: key });
  }

  /**
   * Penahanan berakhir saat jumlah gagal di jendela turun di bawah batas, yaitu saat
   * kegagalan terbaru ke-`max` keluar dari jendela.
   */
  private async waitFor(condition: string, value: Buffer | string, max: number): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('f')
      .select(`ceil(extract(epoch from f.attempted_at + ${WINDOW} - now()))::int`, 'wait')
      .where(condition, { value })
      .andWhere(`f.attempted_at > now() - ${WINDOW}`)
      .orderBy('f.attempted_at', 'DESC')
      .offset(max - 1)
      .limit(1)
      .getRawOne<{ wait: number }>();
    return row ? Math.max(row.wait, 1) : 0;
  }
}
