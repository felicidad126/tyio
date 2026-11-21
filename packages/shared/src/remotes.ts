/**
 * Remote = site milik customer (ATM, KCP, kiosk) yang dipantau NOC (langkah 1.2).
 * Status di sini adalah status data (aktif/nonaktif, T49), bukan up/down dari alat
 * monitoring (R6).
 */

/** Zona waktu tampilan mengikuti lokasi remote (T12). */
export const REMOTE_ZONES = ['WIB', 'WITA', 'WIT'] as const;
export type RemoteZone = (typeof REMOTE_ZONES)[number];

/** Nama zona IANA untuk setiap zona remote (dipakai Intl dan PostgreSQL). */
export const REMOTE_ZONE_IANA: Record<RemoteZone, string> = {
  WIB: 'Asia/Jakarta',
  WITA: 'Asia/Makassar',
  WIT: 'Asia/Jayapura',
};

/** Selisih dari UTC dalam jam. Indonesia tidak memakai waktu musim panas, jadi selisihnya tetap. */
export const REMOTE_ZONE_UTC_OFFSET: Record<RemoteZone, number> = { WIB: 7, WITA: 8, WIT: 9 };

export interface RemoteContact {
  name: string;
  role: string | null;
  phone: string | null;
}

/** Satu baris di daftar remote. */
export interface RemoteSummary {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  networkCode: string;
  networkName: string;
  city: string | null;
  province: string | null;
  zone: RemoteZone;
  kanwil: string | null;
  kanca: string | null;
  ipSnmp: string | null;
  active: boolean;
}

/** Halaman remote, seperti dikirim `GET /api/remotes/:id`. */
export interface RemoteDetail extends RemoteSummary {
  networkId: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  ipLan: string | null;
  userIp: string | null;
  userIdent: string | null;
  manager: string | null;
  /** Tanggal `YYYY-MM-DD`, atau `null`. */
  onlineSince: string | null;
  contacts: RemoteContact[];
}

export interface RemotePage {
  items: RemoteSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export const REMOTE_PAGE_SIZE_DEFAULT = 50;
export const REMOTE_PAGE_SIZE_MAX = 100;

/** Jenis berkas yang diterima `POST /api/remote-import`. */
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const REMOTE_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const REMOTE_IMPORT_MAX_ROWS = 10_000;

/** Baris berkas impor yang tidak bisa disimpan, beserta alasannya. */
export interface RemoteImportFailure {
  /** Nomor baris di Excel (baris judul = 1). */
  row: number;
  code: string | null;
  errors: string[];
}

/**
 * Hasil `POST /api/remote-import`. Mode `preview` menghitung semuanya tanpa menyimpan;
 * mode `save` menyimpan baris yang benar saja (T51).
 */
export interface RemoteImportReport {
  mode: 'preview' | 'save';
  /** Baris berisi data (baris kosong dilewati). */
  totalRows: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: RemoteImportFailure[];
}
