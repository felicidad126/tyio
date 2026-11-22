# Isolasi tenant dan jejak audit: aturan untuk kode baru

Berlaku untuk setiap endpoint, tabel, dan tulisan data baru di `apps/api` (langkah 0.4,
keputusan T9, T24–T30 di [langkah teknis](../../plans/pending/langkah-teknis.md)).
Kedua aturan dijaga uji dan database: yang lupa akan gagal, bukan diam-diam bocor.

## 1. Setiap endpoint menyatakan apakah menyentuh data customer

Pasang salah satu di handler atau controller-nya:

```ts
@TenantScoped()  // membaca atau mengubah data milik customer
@NoTenantData()  // tidak menyentuh data customer (health, logout)
```

`test/tenant-isolation.test.ts` membaca semua endpoint dari aplikasi dan gagal bila:

- ada endpoint tanpa salah satu dekorator itu;
- ada endpoint `@TenantScoped()` tanpa uji lintas-tenant di `PROBES` (kunci
  `"GET /api/remotes/:id"`, dst.). Uji itu memastikan pengguna yang dibatasi ke customer A
  tidak melihat data customer B, dan tetap melihat data A;
- ada endpoint non-publik yang menjawab selain 401 tanpa sesi.

## 2. Query data customer selalu lewat cakupan

```ts
@Get(':id')
async get(@CurrentScope() scope: TenantScope, @Param('id', ...) id: string) {
  const remote = await applyTenantScope(
    this.remotes.createQueryBuilder('remote'), scope, 'remote.tenantId',
  ).andWhere('remote.id = :id', { id }).getOne();
  if (!remote) throw new NotFoundException('Remote tidak ditemukan.');
  ...
}
```

- `applyTenantScope` adalah satu-satunya tempat penyaringan tenant (T9). Jangan menulis
  `WHERE tenant_id = ...` sendiri.
- Data di luar cakupan dijawab **404, sama seperti data yang tidak ada** (T29), bukan 403,
  agar keberadaannya tidak bocor. Id yang formatnya salah juga 404.
- Cakupan pengguna (`scopeFor`): semua customer, atau customer aktif yang ditautkan (K26).
  Customer nonaktif keluar dari cakupan.

## 3. Setiap tabel data punya `tenant_id` dan diaudit

Di migrasi yang membuat tabel:

```ts
await queryRunner.query(`CREATE TABLE remotes (..., tenant_id uuid NOT NULL REFERENCES tenants (id), ...)`);
await queryRunner.query(`SELECT audit_enable('remotes', 'tenant_id')`);
// Kolom rahasia: SELECT audit_enable('nama', 'tenant_id', ARRAY['kolom_rahasia'])
```

Di `down`: `DROP TRIGGER audit_no_truncate ON remotes; DROP TRIGGER audit ON remotes;`
sebelum `DROP TABLE` (atau cukup `DROP TABLE`, yang ikut membuang trigger-nya).

Uji skema gagal bila ada tabel tanpa `tenant_id` atau tanpa trigger audit yang tidak
disebut, beserta alasannya, di daftar pengecualian di `tenant-isolation.test.ts`
(`GLOBAL_TABLES`) atau `audit.test.ts` (`NOT_AUDITED`).

## 4. Setiap tulisan data membawa konteks audit

Trigger `audit` mencatat setiap INSERT/UPDATE/DELETE: siapa, kapan, dari mana, apa yang
berubah (UPDATE hanya kolom yang berubah, lama dan baru). Tulisan **tanpa konteks ditolak
database**, jadi semua tulisan lewat:

```ts
await auditedTransaction(
  this.dataSource,
  { source: 'api', userId: user.id, label: user.email, clientIp: clientInfo(request).ip },
  async (manager) => { /* tulis di sini, pakai manager */ },
);
```

| `source` | Dipakai oleh |
| --- | --- |
| `api` | Permintaan pengguna lewat API |
| `sistem` | Pekerjaan latar (antrean, SLA, notifikasi) |
| `cli` | Perintah di server, mis. `create-user` |
| `seed` | Data dummy (`seed/run.js`) |
| `migrasi` | Perubahan data di dalam migrasi (koneksi skrip migrasi sudah membawanya) |
| `manual` | Perbaikan langsung oleh operator di database |

Login, login gagal, dan logout dicatat sebagai peristiwa (`AuditService.recordEvent`).
Percobaan yang ditolak karena terkunci (429) tidak dicatat, agar serangan tidak bisa
membanjiri audit.

`audit_log` hanya bisa ditambah: UPDATE, DELETE, dan TRUNCATE ditolak, juga TRUNCATE pada
tabel yang diaudit. Koreksi dilakukan dengan perubahan baru, yang ikut tercatat (R-F).

## 5. Memakai nilai master (langkah 1.1)

Tabel yang memakai kategori, system, jarkom, atau customer (remote, tiket, mulai 1.2–1.3)
menautkannya dengan foreign key **tanpa `ON DELETE`**:

```sql
category_id uuid NOT NULL REFERENCES master_categories (id)
```

Dengan begitu database menolak penghapusan nilai yang sudah dipakai, dan API data master
menjawab 409 "… Nonaktifkan saja" (T45). Jangan menambah `ON DELETE CASCADE` atau
`SET NULL` pada tautan ke tabel master.

- Nilai master harus milik customer yang sama dengan baris pemakainya; periksa di
  service saat menyimpan (nilai customer lain dijawab seperti tidak ada, T29).
- Formulir hanya menawarkan nilai yang `active`; data lama tetap menampilkan nilai
  nonaktif yang pernah dipilih.
- Kode customer dan kode jarkom tidak bisa diubah (trigger `reject_immutable_change`, T46),
  jadi aman dipakai untuk nomor tiket.

## 6. Nomor tiket (langkah 1.3)

Nomor `NPR/JARKOM/CUSTOMER/TAHUN/BULAN/urut` dibuat **trigger database** `assign_number`
saat baris tiket disisipkan (T55, T56, T58). Jangan membuat nomor di aplikasi:

```sql
INSERT INTO tickets (tenant_id, remote_id, network_id, category_id, system_id, description, started_at, created_by)
VALUES (...) RETURNING id, number;  -- kolom number jangan diisi; database menolaknya
```

- TAHUN/BULAN dihitung dari `created_at` menurut zona remote (`ticket_zone_iana`), urut dari
  `ticket_counters` per customer, jenis, jarkom, dan bulan. Penghitung dinaikkan di transaksi
  yang sama, jadi penyimpanan serentak tidak bentrok dan penyimpanan yang gagal tidak
  menghabiskan nomor. Tahan transaksi pembuat tiket sesingkat mungkin sesudah INSERT, karena
  penghitung terkunci sampai transaksi selesai.
- Jenis tiket lain (TT di 1.5b) memakai fungsi yang sama: `EXECUTE FUNCTION
  assign_ticket_number('TT')` di tabelnya sendiri, ditambah `'TT'` ke `ticket_counters_kind_valid`.
- Peringatan NPR terbuka dijaga di API dengan mengunci baris remote (`FOR NO KEY UPDATE`)
  sebelum memeriksa; jalur pembuat tiket baru (alert R6, API R7) wajib memakai
  `TicketsService.create`, bukan INSERT sendiri.

## 7. Linimasa NPR dan status (langkah 1.4)

Status, mulai gangguan, dan nomor tiket customer NPR **hanya berubah lewat entri linimasa**
(T71). Jangan `UPDATE tickets SET status = …`: database menolaknya. Tambahkan entri:

```sql
INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to,
                            pending_reason, created_by)
VALUES (...);  -- trigger apply_ticket_action memeriksa status_from = status sekarang dan
               -- perpindahannya sah, lalu memperbarui tickets
```

- `ticket_actions` dan `ticket_attachments` hanya bisa ditambah: UPDATE dan DELETE ditolak,
  TRUNCATE ditolak trigger audit. Perbaikan = entri baru jenis `koreksi` dengan `corrects_id`
  ke entri lama di NPR yang sama.
- Entri `dibuat` ditulis trigger saat NPR disisipkan; jangan menulisnya sendiri.
- Perpindahan yang sah ada di dua tempat yang diuji sama: `isTicketTransitionAllowed`
  (`@tyio/shared`) dan `ticket_status_transition_allowed` (database). Ubah keduanya bersama.
- Aturan yang bergantung peran (buka kembali hanya L2/admin) dan penutupan (1.6) dijaga di
  `TicketActionsService`; jalur penulis baru (alert R6, API R7) wajib memakainya.
- Lampiran disimpan di database (T70) bersama entrinya dalam satu transaksi; isinya
  disembunyikan dari audit_log (`audit_enable(..., ARRAY['content'])`).
- Perbaikan manual oleh operator juga lewat entri, dengan konteks audit `manual`
  (contoh di `docs/operasi/menjalankan.md`), bukan UPDATE.
