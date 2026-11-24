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

Status, mulai gangguan, nomor tiket customer, dan penanggung NPR **hanya berubah lewat entri
linimasa** (T71, T86). Jangan `UPDATE tickets SET status = …`: database menolaknya. Tambahkan entri:

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
- Penanggung berganti lewat entri `ambil` (`assignee_id` = penanggung baru); trigger mengisi
  `assignee_from_id` dengan penanggung sebelumnya. Lewat API: `TicketActionsService.take`.
- Perpindahan yang sah ada di dua tempat yang diuji sama: `isTicketTransitionAllowed`
  (`@tyio/shared`) dan `ticket_status_transition_allowed` (database). Ubah keduanya bersama.
- Aturan yang bergantung peran (buka kembali hanya L2/admin) dan penutupan (1.6, §9) dijaga di
  `TicketActionsService`; jalur penulis baru (alert R6, API R7, Gamas R3) wajib memakainya.
- Lampiran disimpan di database (T70) bersama entrinya dalam satu transaksi; isinya
  disembunyikan dari audit_log (`audit_enable(..., ARRAY['content'])`).
- Perbaikan manual oleh operator juga lewat entri, dengan konteks audit `manual`
  (contoh di `docs/operasi/menjalankan.md`), bukan UPDATE.

## 8. TT ke Service Delivery (langkah 1.5b)

TT disisipkan ke `trouble_tickets` lewat `TroubleTicketsService.create`. Database mengisi
nomor (`assign_ticket_number('TT')`), remote dan jarkom (dari NPR), dan entri `tt_dibuat` di
linimasa NPR. Jangan mengisi `number`, `remote_id`, atau `network_id` sendiri.

- TT hanya untuk NPR yang belum ditutup; nomor, problem, dan kontak TT tidak bisa diubah.
- Setiap "Salin ringkasan TT" menambah entri `tt_disalin` (K25) lewat
  `TroubleTicketsService.markCopied`; jumlah salin dihitung dari entri itu.
- Status TT baru (Hasil masuk di R3) ditambahkan lewat migrasi baru pada
  `trouble_tickets_status_valid` dan `TROUBLE_TICKET_STATUSES` di `@tyio/shared`. Ditutup
  (1.6) lewat linimasa, lihat §9.

## 9. Penutupan NPR dan TT (langkah 1.6)

NPR dan TT **ditutup lewat entri linimasa**, tidak pernah dengan UPDATE (T71). Database menolak
UPDATE langsung pada status dan isian penutupan, juga oleh operator di psql.

```sql
-- Tutup NPR: hanya dari 'pulih'; penyebab dari daftar tetap (T98), penyelesaian di note.
INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, status_from, status_to,
                            close_cause, created_by)
VALUES (..., 'tutup', 'Listrik gedung kembali menyala', now(), 'pulih', 'ditutup', 'listrik', ...);

-- Tutup TT: note = hasil kunjungan / penyelesaian (T100); status NPR tidak berubah.
INSERT INTO ticket_actions (tenant_id, ticket_id, kind, note, occurred_at, trouble_ticket_id, created_by)
VALUES (..., 'tt_ditutup', 'Teknisi SD mengganti modem; remote up 14:40', now(), ..., ...);
```

- Ke Ditutup hanya lewat entri `tutup` dengan `close_cause` (CHECK `ticket_actions_close`).
  Trigger `apply_ticket_action` menyalin penyebab, penyelesaian, waktu, dan penutup ke `tickets`
  (`close_cause`, `resolution`, `closed_at`, `closed_by`) dan mengosongkannya saat NPR dibuka
  kembali. Daftar penyebab ada di dua tempat yang harus sama: `TICKET_CLOSE_CAUSES`
  (`@tyio/shared`) dan CHECK `*_close_cause_valid` (migrasi `ticket-close`).
- **K21 dijaga database** dari peran penulis entri (`users.role` milik `created_by`): NPR yang
  punya TT, walau TT-nya sudah ditutup, dan entri `tt_ditutup` hanya oleh L2/admin. **T99:** NPR
  tidak bisa ditutup selama masih ada TT yang belum ditutup; pesannya menyebut nomor TT itu.
- TT yang sudah ditutup tidak menerima entri `tt_disalin` atau `tt_ditutup` lagi; TT baru selalu
  `menunggu_sd` (trigger `apply_trouble_ticket_refs`).
- Lewat API: `TicketActionsService.close` dan `TroubleTicketsService.close`. Keduanya mengunci
  baris NPR lebih dulu (lalu baris TT), urutan yang sama dengan trigger, jadi penutupan yang
  serentak dengan pembuatan atau penutupan TT tidak saling menunggu dan tidak lolos bersamaan.
- Riwayat NPR per remote (`GET /api/remotes/:remoteId/tickets`, T101): waktu pulih = waktu
  kejadian entri terakhir yang memindahkan NPR ke Pulih, hanya bila status sekarang Pulih atau
  Ditutup.

## 10. Angka Overview (langkah 2.1)

Setiap angka Overview harus sama persis dengan daftar yang dibuka darinya. Karena itu angka
**tidak dihitung dengan query sendiri**: `OverviewService` memanggil
`TicketQueueService.matching(scope, me, kriteria)`, yaitu query yang sama dengan `total` antrean
(`GET /api/tickets`), lalu hanya menambah `GROUP BY`. Kriteria itu ikut dikirim bersama angkanya
(`OverviewCount.filter`, parameter `GET /api/tickets`), dan web membuat tautannya dari sana
(`queue-query.ts`).

- Angka baru di Overview: tambah syaratnya ke `TicketQueueCriteria` dan `filtered()` (serta
  `readQueueFilters` di controller), bukan ke query Overview. Uji `overview.test.ts` membandingkan
  **setiap** angka di jawaban dengan `total` antrean untuk saringannya; angka baru otomatis ikut bila
  dimasukkan ke `allCounts`.
- Batas hari menurut WIB (T109) hanya di `tickets/list/wib-day.ts`: `wibDateSql` (tanggal dari
  waktu) dan `wibDayStartSql` (awal hari dari tanggal). Jangan menulis `AT TIME ZONE` sendiri.
- Wilayah (T113): pemetaan provinsi → wilayah di `@tyio/shared` (`REMOTE_REGION_PROVINCES`), SQL-nya
  dirangkai dari daftar yang sama (`remotes/remote-region.ts`). Ejaan baru cukup ditambah ke daftar;
  uji memeriksa SQL dan TypeScript sama untuk setiap ejaan.
- Nama yang digabung lintas customer (kategori, T114) dipilih dengan `COLLATE "C"`: tanpa itu
  hasilnya ikut collation database dan berbeda antara lokal (C.UTF-8) dan CI (en_US). Uji lokal di
  database ber-collation seperti CI:
  `CREATE DATABASE tyio_coll ... LOCALE_PROVIDER icu ICU_LOCALE 'en-US' LOCALE 'C.UTF-8'` lalu
  `TEST_DATABASE_URL=postgres://tyio:tyio@localhost:5432/tyio_coll pnpm test`.
