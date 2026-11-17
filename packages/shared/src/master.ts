/**
 * Master data yang dikelola admin (langkah 1.1). Customer adalah tenant (R-E); kategori,
 * system, dan jarkom berlaku untuk semua customer.
 */
export const MASTER_LISTS = ['customer', 'kategori', 'system', 'jarkom'] as const;
export type MasterList = (typeof MASTER_LISTS)[number];

export const MASTER_LABELS: Readonly<Record<MasterList, string>> = {
  customer: 'Customer',
  kategori: 'Kategori',
  system: 'System',
  jarkom: 'Jarkom',
};

export interface MasterItem {
  id: string;
  /** Huruf besar dan angka; tetap setelah dibuat karena dipakai di nomor tiket. */
  code: string;
  name: string;
  /** Nonaktif: tidak ditawarkan untuk data baru; data lama yang memakainya tetap utuh. */
  active: boolean;
}

export interface MasterListResponse {
  items: MasterItem[];
}

export interface MasterItemResponse {
  item: MasterItem;
}

export interface CreateMasterItemRequest {
  code: string;
  name: string;
}

/** Kode sengaja tidak ada: kode tidak bisa diubah setelah dibuat. */
export interface UpdateMasterItemRequest {
  name?: string;
  active?: boolean;
}

export const MASTER_CODE_PATTERN = /^[A-Z0-9]{2,16}$/;
export const MASTER_NAME_MIN = 2;
export const MASTER_NAME_MAX = 120;

/** Kode diketik bebas huruf kecil/besar dan spasi di tepi; disimpan huruf besar. */
export function normalizeMasterCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Spasi di tepi dibuang dan spasi berulang dirapatkan, agar "Bank  A" tidak dianggap beda. */
export function normalizeMasterName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Pesan galat untuk kode yang sudah dinormalkan, atau null bila sah. */
export function masterCodeError(code: string): string | null {
  if (!code) return 'Isi kode.';
  return MASTER_CODE_PATTERN.test(code)
    ? null
    : 'Kode hanya huruf A–Z dan angka, 2–16 karakter, tanpa spasi.';
}

/** Pesan galat untuk nama yang sudah dinormalkan, atau null bila sah. */
export function masterNameError(name: string): string | null {
  if (!name) return 'Isi nama.';
  return name.length >= MASTER_NAME_MIN && name.length <= MASTER_NAME_MAX
    ? null
    : `Nama ${MASTER_NAME_MIN}–${MASTER_NAME_MAX} karakter.`;
}
