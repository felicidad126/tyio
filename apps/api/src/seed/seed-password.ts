import type { TyioEnv } from '../config.js';

/** Hanya untuk lingkungan dev lokal dan uji; tertulis di dokumen operasi. */
export const DEV_SEED_PASSWORD = 'contoh-dev-2026';
const MIN_LENGTH = 12;

/**
 * Kata sandi untuk pengguna contoh. Di dev/uji boleh memakai bawaan; di staging wajib
 * diisi lewat TYIO_SEED_PASSWORD, agar server yang diakses bersama tidak memakai
 * kata sandi yang tertulis di repo.
 */
export function seedPassword(env: TyioEnv, value: string | undefined): string {
  if (!value && (env === 'development' || env === 'test')) return DEV_SEED_PASSWORD;
  if (!value) {
    throw new Error(`TYIO_SEED_PASSWORD wajib diisi untuk seed di lingkungan ${env}.`);
  }
  if (value.length < MIN_LENGTH) {
    throw new Error(`TYIO_SEED_PASSWORD minimal ${MIN_LENGTH} karakter.`);
  }
  return value;
}
