/**
 * Tujuan setelah masuk, dari parameter `next`. Hanya jalur di dalam aplikasi ini yang
 * diterima, agar tautan `?next=//situs-lain` tidak bisa membawa pengguna keluar
 * (open redirect).
 */
export function safeRedirectTarget(next: unknown): string {
  if (typeof next !== 'string') return '/';
  const internal = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\');
  if (!internal || next.startsWith('/login')) return '/';
  return next;
}
