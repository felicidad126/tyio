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
