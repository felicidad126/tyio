import { isIP } from 'node:net';
import {
  findProvince,
  REMOTE_IMPORT_COLUMNS,
  REMOTE_STATUSES,
  type RemoteContact,
  type RemoteImportField,
  type RemoteStatus,
  TIME_ZONES,
} from '@tyio/shared';
import type { Remote } from './remote.entity.js';

/** Kolom remote yang bisa diisi dari impor; selain itu diatur sistem. */
export type RemoteImportable = Omit<Remote, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>;

export interface ParsedRow {
  /** Hanya kolom yang ada di file (ditambah kolom wajib); kolom lain tidak disentuh. */
  record: Partial<RemoteImportable>;
  errors: Array<{ column: string; message: string }>;
}

export interface JarkomLookup {
  id: string;
  active: boolean;
}

const HEADERS = Object.fromEntries(REMOTE_IMPORT_COLUMNS.map((c) => [c.field, c.header])) as Record<
  RemoteImportField,
  string
>;
const SITE_ID = /^[A-Z0-9][A-Z0-9._-]{0,39}$/;
const PHONE = /^[0-9+()\-.\s]{5,40}$/;
const STATUS_BY_TEXT = new Map(REMOTE_STATUSES.map((s) => [s, s] as const));

/**
 * Memeriksa dan menormalkan satu baris impor. Aturan "kolom tidak ada di file = tidak
 * diubah; sel kosong = dikosongkan" berlaku untuk kolom yang tidak wajib.
 */
export function parseImportRow(
  values: Partial<Record<RemoteImportField, string>>,
  jarkoms: ReadonlyMap<string, JarkomLookup>,
): ParsedRow {
  const record: Partial<RemoteImportable> = {};
  const errors: ParsedRow['errors'] = [];
  const fail = (field: RemoteImportField, message: string) => errors.push({ column: HEADERS[field], message });
  const has = (field: RemoteImportField) => field in values;
  const text = (field: RemoteImportField) => (values[field] ?? '').replace(/\s+/g, ' ').trim();

  // Wajib.
  const siteId = text('siteId').toUpperCase();
  if (!siteId) fail('siteId', 'Isi Site ID.');
  else if (!SITE_ID.test(siteId)) {
    fail('siteId', 'Site ID hanya huruf, angka, titik, garis bawah, atau tanda hubung, paling banyak 40 karakter.');
  } else record.siteId = siteId;

  const name = text('name');
  if (!name) fail('name', 'Isi nama remote.');
  else if (name.length < 2 || name.length > 160) fail('name', 'Nama remote 2–160 karakter.');
  else record.name = name;

  const jarkomCode = text('jarkom').toUpperCase();
  const jarkom = jarkoms.get(jarkomCode);
  if (!jarkomCode) fail('jarkom', 'Isi jarkom.');
  else if (!jarkom) fail('jarkom', `Jarkom ${jarkomCode} tidak ada di master data.`);
  else if (!jarkom.active) fail('jarkom', `Jarkom ${jarkomCode} nonaktif.`);
  else record.jarkomId = jarkom.id;

  const city = text('city');
  if (!city) fail('city', 'Isi kota.');
  else if (city.length > 120) fail('city', 'Kota paling banyak 120 karakter.');
  else record.city = city;

  const provinceText = text('province');
  const province = provinceText ? findProvince(provinceText) : undefined;
  if (!provinceText) fail('province', 'Isi provinsi.');
  else if (!province) fail('province', `Provinsi "${provinceText}" tidak dikenal.`);
  else {
    record.province = province.name;
    record.timeZone = TIME_ZONES[province.zone];
  }

  // Tidak wajib. Status kosong berarti tidak diubah (remote baru: aktif).
  const status = text('status').toLowerCase();
  if (status) {
    const known = STATUS_BY_TEXT.get(status as RemoteStatus);
    if (known) record.status = known;
    else fail('status', 'Status harus Aktif, Nonaktif, atau Dibongkar.');
  }

  optionalText('address', 500, 'Alamat');
  optionalText('userId', 64, 'User ID');
  optionalText('kanwil', 120, 'Kanwil');
  optionalText('kanca', 120, 'Kanca');

  for (const field of ['ipSnmp', 'ipLan', 'userIp'] as const) {
    if (!has(field)) continue;
    const ip = text(field).toLowerCase();
    const normalized = ip ? normalizeIp(ip, field === 'ipLan') : null;
    if (ip && !normalized) fail(field, `${HEADERS[field]} bukan alamat IP yang sah.`);
    else record[field] = normalized;
  }

  if (has('latitude') || has('longitude')) {
    const lat = text('latitude');
    const lon = text('longitude');
    if (!lat && !lon) {
      record.latitude = null;
      record.longitude = null;
    } else if (!lat || !lon) {
      fail(lat ? 'longitude' : 'latitude', 'Isi Latitude dan Longitude bersama-sama.');
    } else {
      const latitude = coordinate(lat, 90);
      const longitude = coordinate(lon, 180);
      if (latitude === null) fail('latitude', 'Latitude harus angka antara -90 dan 90.');
      if (longitude === null) fail('longitude', 'Longitude harus angka antara -180 dan 180.');
      if (latitude !== null && longitude !== null) {
        // Bentuk yang sama dengan yang dikembalikan PostgreSQL untuk numeric(9,6).
        record.latitude = latitude.toFixed(6);
        record.longitude = longitude.toFixed(6);
      }
    }
  }

  if (has('onlineDate')) {
    const raw = text('onlineDate');
    const date = raw ? parseDate(raw) : null;
    if (raw && !date) {
      fail('onlineDate', 'Tanggal tidak dikenali; pakai format 2024-01-31 atau 31/01/2024.');
    } else record.onlineDate = date;
  }

  // Kontak: bila ada kolom kontak di file, daftar kontak diganti dengan isi file.
  const contactFields = ([1, 2, 3] as const).map(
    (n) => [n, `contact${n}Name`, `contact${n}Role`, `contact${n}Phone`] as const,
  );
  if (contactFields.some(([, ...fields]) => fields.some(has))) {
    const contacts: RemoteContact[] = [];
    let valid = true;
    for (const [n, nameField, roleField, phoneField] of contactFields) {
      const contactName = text(nameField);
      const role = text(roleField);
      const phone = text(phoneField);
      if (!contactName && !role && !phone) continue;
      if (!contactName) {
        fail(nameField, `Isi nama kontak ${n}.`);
        valid = false;
      } else if (contactName.length > 120) {
        fail(nameField, `Nama kontak ${n} paling banyak 120 karakter.`);
        valid = false;
      }
      if (role.length > 60) {
        fail(roleField, `Peran kontak ${n} paling banyak 60 karakter.`);
        valid = false;
      }
      if (!phone) {
        fail(phoneField, `Isi telepon kontak ${n}.`);
        valid = false;
      } else if (!PHONE.test(phone)) {
        fail(phoneField, `Telepon kontak ${n} hanya angka, spasi, +, -, titik, atau tanda kurung.`);
        valid = false;
      }
      contacts.push({ name: contactName, role: role || null, phone, email: null });
    }
    if (valid) record.contacts = contacts;
  }

  return { record, errors };

  function optionalText(field: 'address' | 'userId' | 'kanwil' | 'kanca', max: number, label: string): void {
    if (!has(field)) return;
    const value = text(field);
    if (value.length > max) fail(field, `${label} paling banyak ${max} karakter.`);
    else record[field] = value || null;
  }
}

/**
 * Alamat IP yang sah (dengan prefiks bila diizinkan), dalam bentuk yang sama dengan keluaran
 * PostgreSQL untuk alamat host (tanpa /32 atau /128), agar impor ulang tidak dianggap
 * perubahan; null bila tidak sah.
 */
function normalizeIp(value: string, allowPrefix: boolean): string | null {
  const [address = '', prefix, ...rest] = value.split('/');
  const version = isIP(address);
  if (version === 0 || rest.length > 0) return null;
  if (prefix === undefined) return address;
  const max = version === 4 ? 32 : 128;
  if (!allowPrefix || !/^\d{1,3}$/.test(prefix) || Number(prefix) > max) return null;
  return Number(prefix) === max ? address : `${address}/${Number(prefix)}`;
}

/** Angka desimal (titik atau koma) dalam rentang ±max, dibulatkan ke 6 desimal. */
function coordinate(text: string, max: number): number | null {
  const normalized = text.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Math.abs(value) <= max ? Math.round(value * 1e6) / 1e6 : null;
}

/** 2024-01-31, 31/01/2024, atau 31-01-2024 menjadi YYYY-MM-DD; tanggal yang tidak ada ditolak. */
export function parseDate(text: string): string | null {
  let year: number;
  let month: number;
  let day: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else {
    match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
    if (!match) return null;
    [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real && year >= 1990 && year <= 2100 ? date.toISOString().slice(0, 10) : null;
}
