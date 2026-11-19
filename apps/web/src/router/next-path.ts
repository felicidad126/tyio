import type { LocationQueryValue } from 'vue-router';

/**
 * Tujuan setelah login dari `?next=`. Hanya jalur di aplikasi ini; `//situs-lain` dan
 * sejenisnya ditolak agar tautan login tidak bisa dipakai mengalihkan ke situs lain.
 */
export function safeNextPath(
  value: LocationQueryValue | LocationQueryValue[] | undefined,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return undefined;
  return value;
}
