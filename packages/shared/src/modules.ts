import { USER_ROLES, type UserRole } from './auth.js';

/** Modul portal, urut seperti di menu (navigasi per pekerjaan). */
export const APP_MODULES = [
  'overview',
  'alert',
  'tiket',
  'remote',
  'laporan',
  'admin',
] as const;
export type AppModule = (typeof APP_MODULES)[number];

const EVERYONE = USER_ROLES;

/**
 * Peran yang boleh membuka tiap modul. Satu sumber untuk menu di web dan, begitu rute
 * modul itu ada, untuk penjaga di API, sehingga tombol yang tampil selalu sama dengan
 * yang diizinkan.
 *
 * SEMENTARA sampai sesi hak akses dengan pengguna (langkah 8.1): modul operasional untuk
 * semua peran; Admin (tenant, pengguna, master data, SLA, daftar remote — K18) khusus admin.
 */
export const MODULE_ROLES: Readonly<Record<AppModule, readonly UserRole[]>> = {
  overview: EVERYONE,
  alert: EVERYONE,
  tiket: EVERYONE,
  remote: EVERYONE,
  laporan: EVERYONE,
  admin: ['admin'],
};

export function canOpenModule(role: UserRole, module: AppModule): boolean {
  return MODULE_ROLES[module].includes(role);
}
