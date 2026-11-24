import { REMOTE_REGION_OTHER, REMOTE_REGION_PROVINCES } from '@tyio/shared';

// Wilayah remote dari provinsinya (T113) di SQL, dari daftar yang sama dengan `remoteRegionOf`
// di @tyio/shared. Dipakai Overview untuk mengelompokkan dan antrean untuk saringan `region`,
// jadi angka per wilayah dan daftar yang dibuka selalu memakai pemetaan yang sama.

const SAFE_KEY = /^[a-z]+$/;
const SAFE_REGION = /^[A-Za-z &]+$/;

for (const [region, keys] of Object.entries(REMOTE_REGION_PROVINCES)) {
  // Nilainya tetap (bukan masukan pengguna) dan dirangkai ke SQL: pastikan tidak bisa memuat kutip.
  if (!SAFE_REGION.test(region) || keys.some((key) => !SAFE_KEY.test(key))) {
    throw new Error(`Pemetaan wilayah tidak aman untuk SQL: ${region}`);
  }
}

/** Ejaan provinsi yang dirapikan di SQL, sama dengan `provinceKey` di @tyio/shared. */
export function provinceKeySql(column: string): string {
  return `regexp_replace(regexp_replace(lower(coalesce(${column}, '')), '^\\s*(provinsi|prov\\.?)\\s+', ''), '[^a-z]', '', 'g')`;
}

/** Ekspresi SQL wilayah untuk kolom provinsi; "Lainnya" bila tidak dikenali atau kosong. */
export function remoteRegionSql(column: string): string {
  const branches = Object.entries(REMOTE_REGION_PROVINCES)
    .flatMap(([region, keys]) => keys.map((key) => `WHEN '${key}' THEN '${region}'`))
    .join(' ');
  return `(CASE ${provinceKeySql(column)} ${branches} ELSE '${REMOTE_REGION_OTHER}' END)`;
}
