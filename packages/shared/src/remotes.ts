import type { TenantRef } from './auth.js';

/** Siklus hidup remote. Remote tidak pernah dihapus (tiket merujuknya); yang dibongkar ditandai. */
export const REMOTE_STATUSES = ['aktif', 'nonaktif', 'dibongkar'] as const;
export type RemoteStatus = (typeof REMOTE_STATUSES)[number];

export const REMOTE_STATUS_LABELS: Readonly<Record<RemoteStatus, string>> = {
  aktif: 'Aktif',
  nonaktif: 'Nonaktif',
  dibongkar: 'Dibongkar',
};

/** Zona waktu Indonesia dan nama IANA-nya (R-H: waktu tampil menurut lokasi remote). */
export const TIME_ZONES = {
  WIB: 'Asia/Jakarta',
  WITA: 'Asia/Makassar',
  WIT: 'Asia/Jayapura',
} as const;
export type TimeZoneLabel = keyof typeof TIME_ZONES;
export type TimeZoneName = (typeof TIME_ZONES)[TimeZoneLabel];

export interface Province {
  name: string;
  zone: TimeZoneLabel;
  /** Penulisan lain yang sering dipakai, untuk impor. */
  aliases?: readonly string[];
}

/** 38 provinsi. Setiap provinsi berada di satu zona waktu, jadi zona remote mengikuti provinsinya. */
export const PROVINCES: readonly Province[] = [
  { name: 'Aceh', zone: 'WIB', aliases: ['Nanggroe Aceh Darussalam', 'NAD'] },
  { name: 'Sumatera Utara', zone: 'WIB', aliases: ['Sumut'] },
  { name: 'Sumatera Barat', zone: 'WIB', aliases: ['Sumbar'] },
  { name: 'Riau', zone: 'WIB' },
  { name: 'Kepulauan Riau', zone: 'WIB', aliases: ['Kepri'] },
  { name: 'Jambi', zone: 'WIB' },
  { name: 'Bengkulu', zone: 'WIB' },
  { name: 'Sumatera Selatan', zone: 'WIB', aliases: ['Sumsel'] },
  { name: 'Kepulauan Bangka Belitung', zone: 'WIB', aliases: ['Bangka Belitung', 'Babel'] },
  { name: 'Lampung', zone: 'WIB' },
  { name: 'Banten', zone: 'WIB' },
  { name: 'DKI Jakarta', zone: 'WIB', aliases: ['Jakarta', 'Daerah Khusus Jakarta', 'DKJ'] },
  { name: 'Jawa Barat', zone: 'WIB', aliases: ['Jabar'] },
  { name: 'Jawa Tengah', zone: 'WIB', aliases: ['Jateng'] },
  { name: 'DI Yogyakarta', zone: 'WIB', aliases: ['Daerah Istimewa Yogyakarta', 'DIY', 'Yogyakarta'] },
  { name: 'Jawa Timur', zone: 'WIB', aliases: ['Jatim'] },
  { name: 'Kalimantan Barat', zone: 'WIB', aliases: ['Kalbar'] },
  { name: 'Kalimantan Tengah', zone: 'WIB', aliases: ['Kalteng'] },
  { name: 'Bali', zone: 'WITA' },
  { name: 'Nusa Tenggara Barat', zone: 'WITA', aliases: ['NTB'] },
  { name: 'Nusa Tenggara Timur', zone: 'WITA', aliases: ['NTT'] },
  { name: 'Kalimantan Selatan', zone: 'WITA', aliases: ['Kalsel'] },
  { name: 'Kalimantan Timur', zone: 'WITA', aliases: ['Kaltim'] },
  { name: 'Kalimantan Utara', zone: 'WITA', aliases: ['Kaltara'] },
  { name: 'Sulawesi Utara', zone: 'WITA', aliases: ['Sulut'] },
  { name: 'Gorontalo', zone: 'WITA' },
  { name: 'Sulawesi Tengah', zone: 'WITA', aliases: ['Sulteng'] },
  { name: 'Sulawesi Barat', zone: 'WITA', aliases: ['Sulbar'] },
  { name: 'Sulawesi Selatan', zone: 'WITA', aliases: ['Sulsel'] },
  { name: 'Sulawesi Tenggara', zone: 'WITA', aliases: ['Sultra'] },
  { name: 'Maluku', zone: 'WIT' },
  { name: 'Maluku Utara', zone: 'WIT', aliases: ['Malut'] },
  { name: 'Papua', zone: 'WIT' },
  { name: 'Papua Barat', zone: 'WIT' },
  { name: 'Papua Barat Daya', zone: 'WIT' },
  { name: 'Papua Tengah', zone: 'WIT' },
  { name: 'Papua Pegunungan', zone: 'WIT' },
  { name: 'Papua Selatan', zone: 'WIT' },
];

const simplify = (value: string) =>
  value
    .toLowerCase()
    .replace(/^prov(insi|\.)?\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const PROVINCE_LOOKUP = new Map<string, Province>(
  PROVINCES.flatMap((p) => [p.name, ...(p.aliases ?? [])].map((n) => [simplify(n), p] as const)),
);

/** Provinsi dari teks bebas ("Provinsi Jawa Timur", "jatim", "DIY"), atau undefined. */
export function findProvince(input: string): Province | undefined {
  return PROVINCE_LOOKUP.get(simplify(input));
}

export interface RemoteContact {
  name: string;
  /** Peran kontak, mis. "Pengelola", "PIC cabang". */
  role: string | null;
  phone: string;
  email: string | null;
}

export const REMOTE_MAX_CONTACTS = 5;

export interface JarkomRef {
  id: string;
  code: string;
  name: string;
}

/** Satu baris di daftar remote. */
export interface RemoteSummary {
  id: string;
  siteId: string;
  name: string;
  tenant: TenantRef;
  jarkom: JarkomRef;
  city: string;
  province: string;
  status: RemoteStatus;
}

export interface RemoteDetail extends RemoteSummary {
  address: string | null;
  timeZone: TimeZoneName;
  latitude: number | null;
  longitude: number | null;
  ipSnmp: string | null;
  ipLan: string | null;
  userIp: string | null;
  userId: string | null;
  kanwil: string | null;
  kanca: string | null;
  /** YYYY-MM-DD */
  onlineDate: string | null;
  contacts: RemoteContact[];
}

export const REMOTE_PAGE_SIZE = 50;

/** Parameter daftar remote (query string). */
export interface RemoteListQuery {
  /** Cari di Site ID, nama, kota, dan kanca. */
  q?: string;
  tenantId?: string;
  province?: string;
  jarkomId?: string;
  status?: RemoteStatus;
  page?: number;
}

export interface RemoteListResponse {
  items: RemoteSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RemoteResponse {
  remote: RemoteDetail;
}

// ---------------------------------------------------------------------------------------
// Impor dari Excel. File dibaca di browser; API menerima baris berisi teks per kolom.

export const REMOTE_IMPORT_FIELDS = [
  'siteId',
  'name',
  'jarkom',
  'status',
  'address',
  'city',
  'province',
  'latitude',
  'longitude',
  'ipSnmp',
  'ipLan',
  'userIp',
  'userId',
  'kanwil',
  'kanca',
  'onlineDate',
  'contact1Name',
  'contact1Role',
  'contact1Phone',
  'contact2Name',
  'contact2Role',
  'contact2Phone',
  'contact3Name',
  'contact3Role',
  'contact3Phone',
] as const;
export type RemoteImportField = (typeof REMOTE_IMPORT_FIELDS)[number];

export interface RemoteImportColumn {
  field: RemoteImportField;
  /** Judul kolom di baris pertama file. */
  header: string;
  required: boolean;
  /** Penjelasan untuk lembar petunjuk di template. */
  hint: string;
}

const contactColumns = (n: 1 | 2 | 3): RemoteImportColumn[] => [
  { field: `contact${n}Name`, header: `Kontak ${n} Nama`, required: false, hint: 'Nama kontak.' },
  { field: `contact${n}Role`, header: `Kontak ${n} Peran`, required: false, hint: 'Mis. Pengelola, PIC cabang.' },
  {
    field: `contact${n}Phone`,
    header: `Kontak ${n} Telepon`,
    required: false,
    hint: 'Wajib bila nama kontak diisi.',
  },
];

export const REMOTE_IMPORT_COLUMNS: readonly RemoteImportColumn[] = [
  { field: 'siteId', header: 'Site ID', required: true, hint: 'Unik per customer. Huruf, angka, titik, garis bawah, atau tanda hubung.' },
  { field: 'name', header: 'Nama Remote', required: true, hint: '2–160 karakter.' },
  { field: 'jarkom', header: 'Jarkom', required: true, hint: 'Kode jarkom yang aktif di Admin › Master data, mis. VSAT.' },
  { field: 'status', header: 'Status', required: false, hint: 'Aktif, Nonaktif, atau Dibongkar. Kosong = Aktif untuk remote baru.' },
  { field: 'address', header: 'Alamat', required: false, hint: 'Paling banyak 500 karakter.' },
  { field: 'city', header: 'Kota', required: true, hint: 'Kota atau kabupaten.' },
  { field: 'province', header: 'Provinsi', required: true, hint: 'Nama provinsi; zona waktu (WIB/WITA/WIT) mengikuti provinsi.' },
  { field: 'latitude', header: 'Latitude', required: false, hint: 'Angka desimal, mis. -6.2. Isi bersama Longitude.' },
  { field: 'longitude', header: 'Longitude', required: false, hint: 'Angka desimal, mis. 106.8. Isi bersama Latitude.' },
  { field: 'ipSnmp', header: 'IP SNMP', required: false, hint: 'Alamat IPv4 atau IPv6.' },
  { field: 'ipLan', header: 'IP LAN', required: false, hint: 'Alamat IP, boleh dengan prefiks, mis. 10.1.2.0/29.' },
  { field: 'userIp', header: 'User IP', required: false, hint: 'Alamat IPv4 atau IPv6.' },
  { field: 'userId', header: 'User ID', required: false, hint: 'Paling banyak 64 karakter.' },
  { field: 'kanwil', header: 'Kanwil', required: false, hint: 'Kantor wilayah.' },
  { field: 'kanca', header: 'Kanca', required: false, hint: 'Kantor cabang.' },
  { field: 'onlineDate', header: 'Tanggal Online', required: false, hint: 'Tanggal Excel, atau teks 2024-01-31 / 31/01/2024.' },
  ...contactColumns(1),
  ...contactColumns(2),
  ...contactColumns(3),
];

export const REMOTE_IMPORT_MAX_ROWS = 10000;

export interface RemoteImportRow {
  /** Nomor baris di file (judul kolom di baris 1), untuk laporan. */
  row: number;
  /**
   * Isi sel per kolom, sebagai teks. Kolom yang tidak ada di file tidak dikirim, dan
   * untuk remote yang sudah ada nilainya tidak diubah; sel kosong mengosongkan nilainya.
   */
  values: Partial<Record<RemoteImportField, string>>;
}

export interface RemoteImportRequest {
  tenantId: string;
  rows: RemoteImportRow[];
  /** true: hanya memeriksa dan melaporkan, tidak menyimpan apa pun. */
  dryRun: boolean;
}

export interface RemoteImportFailure {
  row: number;
  errors: Array<{ column: string; message: string }>;
}

export interface RemoteImportResult {
  created: number;
  updated: number;
  unchanged: number;
  failed: RemoteImportFailure[];
  /** Tersimpan hanya bila bukan pemeriksaan dan tidak ada baris yang gagal. */
  saved: boolean;
}
