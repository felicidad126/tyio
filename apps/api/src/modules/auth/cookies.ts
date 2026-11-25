import { API_PREFIX } from '@npr/shared';
import type { CookieOptions } from 'express';

/** Nama cookie sesi. Isinya token acak; artinya hanya diketahui tabel `sessions`. */
export const SESSION_COOKIE = 'npr_sesi';

/**
 * Atribut cookie sesi (T5):
 * - HttpOnly: tidak terbaca JavaScript halaman.
 * - SameSite=Strict: tidak pernah ikut permintaan yang dimulai situs lain (lawan CSRF).
 * - Path=/api: hanya dikirim ke API, tidak ke berkas web.
 * - Secure: hanya lewat HTTPS; dimatikan di development/test (lihat config).
 */
export function sessionCookieOptions(secure: boolean, expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: `/${API_PREFIX}`,
    ...(expires ? { expires } : {}),
  };
}

/** Membaca satu cookie dari header `Cookie`. Nilai yang tidak bisa didekode diabaikan. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}
