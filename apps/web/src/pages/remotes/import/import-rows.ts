import {
  REMOTE_IMPORT_COLUMNS,
  REMOTE_IMPORT_MAX_ROWS,
  type RemoteImportField,
  type RemoteImportRow,
} from '@tyio/shared';
import type { CellValue, Sheet } from '../../../lib/xlsx/read';

/** Masalah pada susunan file (bukan isi baris), dengan pesan untuk pengguna. */
export class ImportFileError extends Error {}

export interface MappedImport {
  rows: RemoteImportRow[];
  /** Judul kolom yang tidak dikenal; isinya diabaikan. */
  ignoredHeaders: string[];
}

const normalize = (header: string) => header.replace(/\s+/g, ' ').trim().toLowerCase();
const FIELD_BY_HEADER = new Map(REMOTE_IMPORT_COLUMNS.map((c) => [normalize(c.header), c.field]));

/**
 * Lembar Excel menjadi baris impor: baris pertama berisi judul kolom, baris berikutnya
 * remote. Isi sel dikirim sebagai teks; aturan isinya diperiksa API, satu tempat untuk semua.
 * Kolom yang tidak ada di file tidak dikirim, sehingga nilainya di remote yang sudah ada tetap.
 */
export function mapSheet(sheet: Sheet): MappedImport {
  const [header, ...data] = sheet.rows;
  if (!header) throw new ImportFileError('File kosong. Isi judul kolom di baris 1, lalu data remote di bawahnya.');

  const columns = new Map<number, RemoteImportField>();
  const ignoredHeaders: string[] = [];
  for (const [index, cell] of [...header.cells].sort(([a], [b]) => a - b)) {
    const title = String(cell);
    const field = FIELD_BY_HEADER.get(normalize(title));
    if (!field) {
      ignoredHeaders.push(title.trim());
      continue;
    }
    if ([...columns.values()].includes(field)) {
      throw new ImportFileError(`Kolom "${title.trim()}" muncul dua kali di baris judul.`);
    }
    columns.set(index, field);
  }
  const present = new Set(columns.values());
  const missing = REMOTE_IMPORT_COLUMNS.filter((c) => c.required && !present.has(c.field));
  if (missing.length > 0) {
    throw new ImportFileError(
      `Kolom wajib tidak ada di baris judul: ${missing.map((c) => c.header).join(', ')}. ` +
        'Pakai template impor agar judul kolomnya sesuai.',
    );
  }

  const rows: RemoteImportRow[] = [];
  for (const { row, cells } of data) {
    const values: RemoteImportRow['values'] = {};
    let filled = false;
    for (const [index, field] of columns) {
      const cell = cells.get(index);
      const value = cell === undefined ? '' : cellText(cell, field, sheet.date1904);
      values[field] = value;
      if (value.trim()) filled = true;
    }
    if (filled) rows.push({ row, values });
  }
  if (rows.length === 0) throw new ImportFileError('File tidak berisi data remote di bawah baris judul.');
  if (rows.length > REMOTE_IMPORT_MAX_ROWS) {
    throw new ImportFileError(
      `File berisi ${rows.length.toLocaleString('id-ID')} remote; paling banyak ` +
        `${REMOTE_IMPORT_MAX_ROWS.toLocaleString('id-ID')} per impor. Bagi menjadi beberapa file.`,
    );
  }
  return { rows, ignoredHeaders };
}

function cellText(cell: CellValue, field: RemoteImportField, date1904: boolean): string {
  if (typeof cell === 'boolean') return cell ? 'TRUE' : 'FALSE';
  if (typeof cell === 'string') return cell;
  // Tanggal di Excel adalah nomor seri hari.
  if (field === 'onlineDate' && cell >= 1 && cell < 2958466) return excelDate(cell, date1904);
  return String(cell);
}

/** Nomor seri tanggal Excel menjadi YYYY-MM-DD (sistem 1900 atau 1904). */
export function excelDate(serial: number, date1904: boolean): string {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(epoch + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
}
