import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MASTER_CODE_PATTERN, MASTER_NAME_MAX_LENGTH } from '@npr/shared';
import { QueryFailedError } from 'typeorm';

// Pembacaan isi permintaan untuk endpoint data master. Pesan galat berbahasa Indonesia
// dan aman ditampilkan apa adanya di layar admin.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** Isi permintaan harus objek JSON yang hanya berisi kolom yang dikenal. */
export function readBody(body: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException('Kirim data sebagai objek JSON.');
  }
  const record = body as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unknownKeys.length > 0) {
    throw new BadRequestException(`Kolom ini tidak bisa diisi atau diubah: ${unknownKeys.join(', ')}.`);
  }
  return record;
}

export function readName(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException('Nama wajib diisi.');
  }
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length > MASTER_NAME_MAX_LENGTH) {
    throw new BadRequestException(`Nama paling panjang ${MASTER_NAME_MAX_LENGTH} karakter.`);
  }
  return name;
}

/** Kode ditulis huruf besar; huruf kecil dari masukan diubah otomatis. */
export function readCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!MASTER_CODE_PATTERN.test(code)) {
    throw new BadRequestException('Kode wajib 2–10 huruf atau angka, tanpa spasi.');
  }
  return code;
}

export function readActive(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new BadRequestException('Status aktif harus true atau false.');
  return value;
}

/** Id customer di isi permintaan; yang formatnya salah dijawab seperti yang tidak ada (T29). */
export function readTenantId(value: unknown, notFoundMessage: string): string {
  if (!isUuid(value)) throw new NotFoundException(notFoundMessage);
  return value.toLowerCase();
}

/** Kode dan constraint galat PostgreSQL di balik galat TypeORM, bila ada. */
export function postgresError(error: unknown): { code: string; constraint?: string } | undefined {
  if (!(error instanceof QueryFailedError)) return undefined;
  const driver = error.driverError as { code?: unknown; constraint?: unknown };
  if (typeof driver.code !== 'string') return undefined;
  return {
    code: driver.code,
    constraint: typeof driver.constraint === 'string' ? driver.constraint : undefined,
  };
}

export const UNIQUE_VIOLATION = '23505';

/**
 * Baris yang dihapus masih dirujuk tabel lain: foreign key biasa (23503) atau yang
 * ditulis `ON DELETE RESTRICT` (23001, mis. `user_tenants`).
 */
export function isInUseError(error: { code: string } | undefined): boolean {
  return error?.code === '23503' || error?.code === '23001';
}
