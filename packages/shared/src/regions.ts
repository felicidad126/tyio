/**
 * Wilayah remote untuk Overview (langkah 2.1, T113): kelompok pulau seperti mockup, dipetakan
 * dari provinsi remote. Provinsi disimpan sebagai teks dari impor (1.2), jadi ejaan dirapikan
 * dulu (`provinceKey`): huruf kecil, awalan "Provinsi"/"Prov." dibuang, lalu hanya huruf a–z.
 * Provinsi yang tidak dikenali, atau kosong, masuk "Lainnya".
 *
 * API memakai pemetaan yang sama di SQL (`remoteRegionSql` di modul overview), diuji sama
 * untuk setiap ejaan di daftar ini.
 */
export const REMOTE_REGIONS = [
  'Sumatera',
  'Jawa',
  'Bali & Nusa Tenggara',
  'Kalimantan',
  'Sulawesi',
  'Maluku',
  'Papua',
  'Lainnya',
] as const;
export type RemoteRegion = (typeof REMOTE_REGIONS)[number];

export const REMOTE_REGION_OTHER: RemoteRegion = 'Lainnya';

/**
 * Ejaan provinsi yang dikenali per wilayah, sesudah `provinceKey`: 38 provinsi dengan nama
 * resminya, ditambah singkatan yang lazim (Sumut, Jabar, NTT, Kaltim, DIY, …).
 */
export const REMOTE_REGION_PROVINCES: Readonly<Record<Exclude<RemoteRegion, 'Lainnya'>, readonly string[]>> = {
  Sumatera: [
    'aceh',
    'nad',
    'nanggroeacehdarussalam',
    'sumaterautara',
    'sumatrautara',
    'sumut',
    'sumaterabarat',
    'sumatrabarat',
    'sumbar',
    'riau',
    'kepulauanriau',
    'kepriau',
    'kepri',
    'jambi',
    'sumateraselatan',
    'sumatraselatan',
    'sumsel',
    'kepulauanbangkabelitung',
    'bangkabelitung',
    'babel',
    'bengkulu',
    'lampung',
  ],
  Jawa: [
    'dkijakarta',
    'jakarta',
    'dki',
    'jawabarat',
    'jabar',
    'banten',
    'jawatengah',
    'jateng',
    'diyogyakarta',
    'daerahistimewayogyakarta',
    'yogyakarta',
    'diy',
    'jawatimur',
    'jatim',
  ],
  'Bali & Nusa Tenggara': ['bali', 'nusatenggarabarat', 'ntb', 'nusatenggaratimur', 'ntt'],
  Kalimantan: [
    'kalimantanbarat',
    'kalbar',
    'kalimantantengah',
    'kalteng',
    'kalimantanselatan',
    'kalsel',
    'kalimantantimur',
    'kaltim',
    'kalimantanutara',
    'kaltara',
  ],
  Sulawesi: [
    'sulawesiutara',
    'sulut',
    'gorontalo',
    'sulawesitengah',
    'sulteng',
    'sulawesibarat',
    'sulbar',
    'sulawesiselatan',
    'sulsel',
    'sulawesitenggara',
    'sultra',
  ],
  Maluku: ['maluku', 'malukuutara', 'malut'],
  Papua: ['papua', 'papuabarat', 'papuabaratdaya', 'papuatengah', 'papuapegunungan', 'papuaselatan'],
};

export function isRemoteRegion(value: unknown): value is RemoteRegion {
  return typeof value === 'string' && (REMOTE_REGIONS as readonly string[]).includes(value);
}

/** Ejaan provinsi yang dirapikan: "Prov. Sulawesi Selatan" → "sulawesiselatan". */
export function provinceKey(province: string | null): string {
  return (province ?? '')
    .toLowerCase()
    .replace(/^\s*(provinsi|prov\.?)\s+/, '')
    .replace(/[^a-z]/g, '');
}

/** Wilayah sebuah provinsi; "Lainnya" bila tidak dikenali atau kosong. */
export function remoteRegionOf(province: string | null): RemoteRegion {
  const key = provinceKey(province);
  for (const [region, keys] of Object.entries(REMOTE_REGION_PROVINCES)) {
    if (keys.includes(key)) return region as RemoteRegion;
  }
  return REMOTE_REGION_OTHER;
}
