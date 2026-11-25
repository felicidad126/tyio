import { isIP } from 'node:net';
import {
  REMOTE_IMPORT_MAX_ROWS,
  REMOTE_ZONES,
  type RemoteContact,
  type RemoteImportFailure,
  type RemoteZone,
} from '@npr/shared';

// Pembaca berkas impor remote (langkah 1.2): satu baris Excel → satu remote yang sudah
// diperiksa, atau daftar alasan baris itu ditolak. Fungsi murni tanpa database; jarkom
// customer diberikan pemanggil.

/** Satu kolom templat. `title` adalah judul kolom persis di Excel. */
export interface ImportColumn {
  key: string;
  title: string;
  required?: boolean;
  hint: string;
  example: string;
}

const CONTACT_SLOTS = [1, 2] as const;

export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: 'code', title: 'Kode remote', required: true, hint: '2–40 huruf, angka, titik, minus, atau garis bawah. Unik per customer; baris dengan kode yang sudah ada memperbarui remote itu.', example: 'BNA-MKS-0217' },
  { key: 'name', title: 'Nama remote', required: true, hint: 'Paling panjang 120 karakter.', example: 'ATM KCP Pasar Sentral' },
  { key: 'network', title: 'Jarkom', required: true, hint: 'Kode jarkom aktif milik customer ini (lihat Admin › Data master › Jarkom).', example: 'VSAT' },
  { key: 'status', title: 'Status', hint: 'Aktif atau Nonaktif. Kosong = Aktif.', example: 'Aktif' },
  { key: 'zone', title: 'Zona waktu', required: true, hint: 'WIB, WITA, atau WIT, sesuai lokasi remote.', example: 'WITA' },
  { key: 'address', title: 'Alamat', hint: 'Paling panjang 300 karakter.', example: 'Jl. Sulawesi No. 12' },
  { key: 'city', title: 'Kota', hint: '', example: 'Makassar' },
  { key: 'province', title: 'Provinsi', hint: '', example: 'Sulawesi Selatan' },
  { key: 'latitude', title: 'Latitude', hint: 'Angka desimal, mis. -5.1349. Isi bersama Longitude, atau kosongkan keduanya.', example: '-5.1349' },
  { key: 'longitude', title: 'Longitude', hint: 'Angka desimal, mis. 119.4128.', example: '119.4128' },
  { key: 'kanwil', title: 'Kanwil', hint: '', example: 'Kanwil Makassar' },
  { key: 'kanca', title: 'Kanca', hint: '', example: 'KCP Pasar Sentral' },
  { key: 'ipSnmp', title: 'IP SNMP', hint: 'Alamat IPv4 atau IPv6.', example: '10.41.17.22' },
  { key: 'ipLan', title: 'IP LAN', hint: 'Alamat IPv4 atau IPv6.', example: '192.168.217.1' },
  { key: 'userIp', title: 'User IP', hint: 'Alamat IPv4 atau IPv6.', example: '10.41.17.23' },
  { key: 'userIdent', title: 'User ID', hint: '', example: 'bna-mks-0217' },
  { key: 'manager', title: 'Pengelola', hint: '', example: 'Bank Nusa KCP Pasar Sentral' },
  { key: 'onlineSince', title: 'Online sejak', hint: 'Tanggal (format tanggal Excel, atau teks 2023-03-12 / 12/03/2023).', example: '2023-03-12' },
  ...CONTACT_SLOTS.flatMap((slot) => [
    { key: `contact${slot}Name`, title: `Kontak ${slot} nama`, hint: 'Wajib bila jabatan atau telepon kontak ini diisi.', example: slot === 1 ? 'Hendra' : '' },
    { key: `contact${slot}Role`, title: `Kontak ${slot} jabatan`, hint: '', example: slot === 1 ? 'Kepala Unit' : '' },
    { key: `contact${slot}Phone`, title: `Kontak ${slot} telepon`, hint: 'Angka, spasi, +, -, atau tanda kurung.', example: slot === 1 ? '+62 811-0000-0217' : '' },
  ]),
];

/** Remote dari satu baris berkas yang lolos pemeriksaan. */
export interface RemoteInput {
  code: string;
  name: string;
  networkId: string;
  active: boolean;
  zone: RemoteZone;
  address: string | null;
  city: string | null;
  province: string | null;
  latitude: number | null;
  longitude: number | null;
  kanwil: string | null;
  kanca: string | null;
  ipSnmp: string | null;
  ipLan: string | null;
  userIp: string | null;
  userIdent: string | null;
  manager: string | null;
  onlineSince: string | null;
  contacts: RemoteContact[];
}

export interface ParsedImport {
  /** Kunci kolom (`ImportColumn.key`) yang ada di berkas; kolom lain tidak diubah saat memperbarui. */
  columns: ReadonlySet<string>;
  totalRows: number;
  /** Baris yang benar, dengan nomor barisnya di Excel. */
  valid: Array<{ row: number; remote: RemoteInput }>;
  failed: RemoteImportFailure[];
}

/** Masalah pada berkas secara keseluruhan (bukan per baris): dijawab 400. */
export class ImportFileError extends Error {
  override name = 'ImportFileError';
}

export type CellValue = string | number | boolean | Date | null | undefined;

export interface NetworkOption {
  id: string;
  active: boolean;
}

const CODE = /^[A-Z0-9][A-Z0-9._-]{1,39}$/;
const PHONE = /^[0-9+()\- ]{6,30}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const normalizeTitle = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Memeriksa isi sheet. `rows[0]` adalah baris judul. Jarkom dicocokkan dengan kode jarkom
 * customer (`networks`, kunci = kode huruf besar).
 */
export function parseRemoteImport(
  rows: readonly (readonly CellValue[])[],
  networks: ReadonlyMap<string, NetworkOption>,
  today: string,
): ParsedImport {
  const header = rows[0];
  if (!header || header.every(isBlank)) {
    throw new ImportFileError('Baris pertama berkas harus berisi judul kolom seperti di templat.');
  }

  const byTitle = new Map(IMPORT_COLUMNS.map((column) => [normalizeTitle(column.title), column]));
  const positions = new Map<string, number>();
  const unknown: string[] = [];
  header.forEach((cell, index) => {
    if (isBlank(cell)) return;
    const column = byTitle.get(normalizeTitle(String(cell)));
    if (!column) unknown.push(String(cell).trim());
    else if (positions.has(column.key)) throw new ImportFileError(`Kolom "${column.title}" muncul dua kali.`);
    else positions.set(column.key, index);
  });
  if (unknown.length > 0) {
    throw new ImportFileError(
      `Judul kolom tidak dikenal: ${unknown.map((title) => `"${title}"`).join(', ')}. Pakai judul kolom dari templat.`,
    );
  }
  const missing = IMPORT_COLUMNS.filter((column) => column.required && !positions.has(column.key));
  if (missing.length > 0) {
    throw new ImportFileError(`Kolom wajib tidak ada: ${missing.map((column) => `"${column.title}"`).join(', ')}.`);
  }

  const dataRows = rows.slice(1);
  const nonBlank = dataRows.filter((row) => !row.every(isBlank)).length;
  if (nonBlank > REMOTE_IMPORT_MAX_ROWS) {
    throw new ImportFileError(
      `Berkas berisi ${nonBlank} baris; paling banyak ${REMOTE_IMPORT_MAX_ROWS} baris per impor. Bagi menjadi beberapa berkas.`,
    );
  }

  const result: ParsedImport = { columns: new Set(positions.keys()), totalRows: 0, valid: [], failed: [] };
  const seenCodes = new Map<string, number>();

  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2;
    if (cells.every(isBlank)) return;
    result.totalRows += 1;

    const errors: string[] = [];
    const cell = (key: string): CellValue => {
      const position = positions.get(key);
      return position === undefined ? undefined : cells[position];
    };
    const text = (key: string, max = 120): string | null => {
      const value = cell(key);
      if (isBlank(value)) return null;
      const content = (value instanceof Date ? value.toISOString().slice(0, 10) : String(value)).trim().replace(/\s+/g, ' ');
      if (content.length > max) {
        errors.push(`${titleOf(key)} paling panjang ${max} karakter.`);
        return null;
      }
      return content;
    };

    const rawCode = text('code', 40)?.toUpperCase() ?? null;
    let code: string | null = null;
    if (rawCode === null) errors.push('Kode remote wajib diisi.');
    else if (!CODE.test(rawCode)) {
      errors.push('Kode remote hanya boleh huruf, angka, titik, minus, atau garis bawah (2–40 karakter).');
    } else if (seenCodes.has(rawCode)) {
      errors.push(`Kode remote ${rawCode} sudah dipakai di baris ${seenCodes.get(rawCode)} berkas ini.`);
    } else {
      code = rawCode;
      seenCodes.set(rawCode, rowNumber);
    }

    const name = text('name');
    if (name === null && !errors.some((e) => e.startsWith('Nama remote'))) errors.push('Nama remote wajib diisi.');

    const networkCode = text('network', 10)?.toUpperCase() ?? null;
    let networkId: string | null = null;
    if (networkCode === null) errors.push('Jarkom wajib diisi.');
    else {
      const network = networks.get(networkCode);
      if (!network) errors.push(`Jarkom ${networkCode} tidak ada di customer ini.`);
      else if (!network.active) errors.push(`Jarkom ${networkCode} nonaktif.`);
      else networkId = network.id;
    }

    const statusText = text('status', 20)?.toLowerCase() ?? 'aktif';
    let active = true;
    if (statusText === 'nonaktif') active = false;
    else if (statusText !== 'aktif') errors.push('Status harus Aktif atau Nonaktif.');

    const zoneText = text('zone', 10)?.toUpperCase() ?? null;
    let zone: RemoteZone | null = null;
    if (zoneText === null) errors.push('Zona waktu wajib diisi (WIB, WITA, atau WIT).');
    else if (!(REMOTE_ZONES as readonly string[]).includes(zoneText)) {
      errors.push('Zona waktu harus WIB, WITA, atau WIT.');
    } else zone = zoneText as RemoteZone;

    const latitude = coordinate(cell('latitude'), 'Latitude', -90, 90, errors);
    const longitude = coordinate(cell('longitude'), 'Longitude', -180, 180, errors);
    if ((latitude === null) !== (longitude === null) && !errors.some((e) => /^L(at|ong)itude/.test(e))) {
      errors.push('Latitude dan Longitude diisi bersama, atau dikosongkan keduanya.');
    }

    const ip = (key: string): string | null => {
      const value = text(key, 45);
      if (value === null) return null;
      if (isIP(value) === 0) {
        errors.push(`${titleOf(key)} bukan alamat IP yang sah: ${value}.`);
        return null;
      }
      return value;
    };

    const onlineSince = dateValue(cell('onlineSince'), today, errors);

    const contacts: RemoteContact[] = [];
    for (const slot of CONTACT_SLOTS) {
      const contactName = text(`contact${slot}Name`);
      const role = text(`contact${slot}Role`);
      const phone = text(`contact${slot}Phone`, 30);
      if (contactName === null && role === null && phone === null) continue;
      if (contactName === null) {
        errors.push(`Kontak ${slot} nama wajib diisi bila jabatan atau teleponnya diisi.`);
        continue;
      }
      if (phone !== null && !PHONE.test(phone)) {
        errors.push(`Kontak ${slot} telepon hanya boleh angka, spasi, +, -, atau tanda kurung.`);
        continue;
      }
      contacts.push({ name: contactName, role, phone });
    }

    const remote = {
      address: text('address', 300),
      city: text('city'),
      province: text('province'),
      kanwil: text('kanwil'),
      kanca: text('kanca'),
      ipSnmp: ip('ipSnmp'),
      ipLan: ip('ipLan'),
      userIp: ip('userIp'),
      userIdent: text('userIdent'),
      manager: text('manager'),
    };

    if (errors.length > 0 || code === null || name === null || networkId === null || zone === null) {
      result.failed.push({ row: rowNumber, code: rawCode, errors: [...new Set(errors)] });
      return;
    }
    result.valid.push({
      row: rowNumber,
      remote: { code, name, networkId, active, zone, latitude, longitude, onlineSince, contacts, ...remote },
    });
  });

  return result;
}

function isBlank(value: CellValue): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function titleOf(key: string): string {
  return IMPORT_COLUMNS.find((column) => column.key === key)?.title ?? key;
}

function coordinate(value: CellValue, title: string, min: number, max: number, errors: string[]): number | null {
  if (isBlank(value)) return null;
  const number = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(number) || number < min || number > max) {
    errors.push(`${title} harus angka antara ${min} dan ${max}.`);
    return null;
  }
  return Math.round(number * 1e6) / 1e6;
}

/** Tanggal dari sel Excel (Date) atau teks `YYYY-MM-DD` / `DD/MM/YYYY`; tidak boleh di masa depan. */
function dateValue(value: CellValue, today: string, errors: string[]): string | null {
  if (isBlank(value)) return null;
  let iso: string | null = null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    iso = value.toISOString().slice(0, 10);
  } else if (typeof value === 'string') {
    const text = value.trim();
    const isoMatch = ISO_DATE.exec(text);
    const dmyMatch = DMY_DATE.exec(text);
    if (isoMatch) iso = validDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    else if (dmyMatch) iso = validDate(Number(dmyMatch[3]), Number(dmyMatch[2]), Number(dmyMatch[1]));
  }
  if (iso === null) {
    errors.push('Online sejak bukan tanggal yang sah (pakai format tanggal Excel, 2023-03-12, atau 12/03/2023).');
    return null;
  }
  if (iso > today) {
    errors.push('Online sejak tidak boleh setelah hari ini.');
    return null;
  }
  return iso;
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 1990) return null;
  return date.toISOString().slice(0, 10);
}
