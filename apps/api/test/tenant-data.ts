import type { DataSource } from 'typeorm';
import type { Tenant } from '../src/modules/tenants/tenant.entity.js';
import { createActionWithAttachment, createRemote, createTicket, createTroubleTicket } from './fixtures.js';

/**
 * Data milik satu tenant untuk uji lintas-tenant. Setiap entity baru yang punya kolom
 * `tenant_id` WAJIB ditambahkan di sini (uji isolasi gagal bila ada yang terlewat), agar
 * setiap rute bertanda @TenantScoped() diuji terhadap data tenant lain yang nyata.
 *
 * Mengembalikan id baris yang dibuat, untuk dicari di jawaban dan dipakai sebagai parameter.
 */
export async function seedTenantOwnedData(ds: DataSource, tenant: Tenant): Promise<string[]> {
  // Berkoordinat agar ikut tampil di peta (2.3).
  const remote = await createRemote(ds, tenant, `${tenant.code}-R1`, {
    name: `Remote ${tenant.name}`,
    latitude: '-6.200000',
    longitude: '106.816000',
  });
  const ticket = await createTicket(ds, remote, `NPR/UJI/${tenant.code}/2026/11/0001`);
  const { action, attachment } = await createActionWithAttachment(ds, ticket, `Catatan ${tenant.name}`);
  const tt = await createTroubleTicket(ds, ticket, `TT/UJI/${tenant.code}/2026/11/0001`);
  return [remote.id, ticket.id, action.id, attachment.id, tt.id];
}

/** Tabel ber-`tenant_id` yang sudah diisi oleh seedTenantOwnedData di atas. */
export const TENANT_OWNED_TABLES_COVERED: readonly string[] = [
  'remotes',
  'tickets',
  'ticket_actions',
  'ticket_attachments',
  'trouble_tickets',
];

/** Tabel ber-`tenant_id` yang bukan data milik tenant, beserta alasannya. */
export const TENANT_COLUMN_NOT_OWNED: Readonly<Record<string, string>> = {
  user_tenants: 'Cakupan akses pengguna, bukan data customer; tidak dilayani rute tenant.',
  audit_log: 'Catatan audit; belum ada rute yang melayaninya.',
  ticket_sequences: 'Penghitung nomor tiket; tidak dilayani rute mana pun.',
  notification_events:
    'Antrean notifikasi; hanya dibaca pekerja notifikasi dan log di Admin › Notifikasi (khusus admin semua customer).',
  notification_channel_tenants: 'Pengaturan penerima notifikasi; hanya diatur admin semua customer.',
};
