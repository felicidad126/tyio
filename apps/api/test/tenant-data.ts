import type { DataSource } from 'typeorm';
import type { Tenant } from '../src/modules/tenants/tenant.entity.js';

/**
 * Data milik satu tenant untuk uji lintas-tenant. Setiap entity baru yang punya kolom
 * `tenant_id` WAJIB ditambahkan di sini (uji isolasi gagal bila ada yang terlewat), agar
 * setiap rute bertanda @TenantScoped() diuji terhadap data tenant lain yang nyata.
 *
 * Mengembalikan id baris yang dibuat, untuk dicari di jawaban dan dipakai sebagai parameter.
 */
export async function seedTenantOwnedData(_ds: DataSource, _tenant: Tenant): Promise<string[]> {
  // R0 belum punya tabel milik tenant selain tenants itu sendiri. R1 menambah remote, tiket, dll.
  return [];
}

/** Tabel ber-`tenant_id` yang sudah diisi oleh seedTenantOwnedData di atas. */
export const TENANT_OWNED_TABLES_COVERED: readonly string[] = [];

/** Tabel ber-`tenant_id` yang bukan data milik tenant, beserta alasannya. */
export const TENANT_COLUMN_NOT_OWNED: Readonly<Record<string, string>> = {
  user_tenants: 'Cakupan akses pengguna, bukan data customer; tidak dilayani rute tenant.',
  audit_log: 'Catatan audit; belum ada rute yang melayaninya.',
};
