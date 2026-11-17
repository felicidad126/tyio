import { strFromU8, unzipSync } from 'fflate';

/** Isi satu sel: teks, angka (termasuk tanggal sebagai nomor seri Excel), atau boolean. */
export type CellValue = string | number | boolean;

export interface SheetRow {
  /** Nomor baris seperti di Excel (mulai 1). */
  row: number;
  /** Indeks kolom mulai 0 (A = 0); sel kosong tidak ada. */
  cells: Map<number, CellValue>;
}

export interface Sheet {
  rows: SheetRow[];
  /** Workbook memakai sistem tanggal 1904 (Excel Mac lama). */
  date1904: boolean;
}

/** File yang tidak bisa dibaca, dengan pesan untuk pengguna. */
export class XlsxError extends Error {}

/** Batas ukuran isi file setelah dibuka, agar file "bom zip" tidak membekukan browser. */
const MAX_UNZIPPED_BYTES = 80 * 1024 * 1024;

/**
 * Membaca lembar pertama file .xlsx. Hanya yang dibutuhkan impor tabel: teks (shared atau
 * inline, termasuk teks kaya), angka, boolean, dan nilai hasil rumus. Gaya, sel gabungan,
 * dan lembar lain diabaikan.
 */
export function readFirstSheet(data: Uint8Array): Sheet {
  const files = unzip(data);
  const workbook = text(files, 'xl/workbook.xml');
  const relations = text(files, 'xl/_rels/workbook.xml.rels');

  const firstSheet = elements(workbook, 'sheet')[0];
  const relationId = firstSheet && attribute(firstSheet.attributes, 'r:id');
  const target = elements(relations, 'Relationship').find(
    (r) => attribute(r.attributes, 'Id') === relationId,
  );
  const targetPath = target && attribute(target.attributes, 'Target');
  if (!targetPath) throw new XlsxError('File Excel tidak berisi lembar kerja.');
  const sheetPath = targetPath.startsWith('/') ? targetPath.slice(1) : `xl/${targetPath.replace(/^\.\//, '')}`;

  const shared = files['xl/sharedStrings.xml']
    ? elements(text(files, 'xl/sharedStrings.xml'), 'si').map((si) => richText(si.body))
    : [];
  const date1904 = elements(workbook, 'workbookPr').some((w) =>
    ['1', 'true'].includes(attribute(w.attributes, 'date1904') ?? ''),
  );
  return { rows: parseRows(text(files, sheetPath), shared), date1904 };
}

function unzip(data: Uint8Array): Record<string, Uint8Array> {
  let total = 0;
  try {
    return unzipSync(data, {
      filter: (file) => {
        if (!/^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/[^/]+\.xml)$/.test(file.name)) {
          return false;
        }
        total += file.originalSize;
        if (total > MAX_UNZIPPED_BYTES) throw new XlsxError('File terlalu besar untuk dibaca.');
        return true;
      },
    });
  } catch (error) {
    if (error instanceof XlsxError) throw error;
    throw new XlsxError('File ini bukan file Excel .xlsx. Simpan ulang sebagai "Excel Workbook (.xlsx)".');
  }
}

function text(files: Record<string, Uint8Array>, path: string): string {
  const file = files[path];
  if (!file) throw new XlsxError('File Excel tidak lengkap atau rusak.');
  return strFromU8(file);
}

function parseRows(xml: string, shared: string[]): SheetRow[] {
  const rows: SheetRow[] = [];
  let nextRow = 1;
  for (const rowElement of elements(xml, 'row')) {
    const row = Number(attribute(rowElement.attributes, 'r') ?? nextRow);
    nextRow = row + 1;
    const cells = new Map<number, CellValue>();
    let nextColumn = 0;
    for (const cell of elements(rowElement.body, 'c')) {
      const ref = attribute(cell.attributes, 'r');
      const column = ref ? columnIndex(ref) : nextColumn;
      nextColumn = column + 1;
      const value = cellValue(cell, shared);
      if (value !== undefined && value !== '') cells.set(column, value);
    }
    if (cells.size > 0) rows.push({ row, cells });
  }
  return rows;
}

function cellValue(cell: XmlElement, shared: string[]): CellValue | undefined {
  const type = attribute(cell.attributes, 't') ?? 'n';
  if (type === 'inlineStr') {
    const inline = elements(cell.body, 'is')[0];
    return inline ? richText(inline.body) : undefined;
  }
  const raw = elements(cell.body, 'v')[0];
  if (!raw) return undefined;
  const v = decode(raw.body);
  switch (type) {
    case 's':
      return shared[Number(v)] ?? '';
    case 'b':
      return v === '1';
    case 'str':
    case 'e':
      return v;
    default: {
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }
  }
}

/** Teks dari <t> langsung atau dari potongan teks kaya <r><t>, tanpa teks fonetik <rPh>. */
function richText(body: string): string {
  const withoutPhonetic = body.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
  return elements(withoutPhonetic, 't')
    .map((t) => decode(t.body))
    .join('');
}

/** "B12" → 1; "AA3" → 26. */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A';
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

interface XmlElement {
  attributes: string;
  body: string;
}

/**
 * Elemen bernama `name` (boleh berprefiks namespace, mis. <x:c>) beserta atribut dan isinya.
 * Cukup untuk XML OOXML yang dibuat mesin; elemen bernama sama tidak bersarang di sini.
 */
function elements(xml: string, name: string): XmlElement[] {
  const pattern = new RegExp(
    `<((?:\\w+:)?${name})((?:\\s[^>]*?)?)(?:/>|>([\\s\\S]*?)</\\1>)`,
    'g',
  );
  return [...xml.matchAll(pattern)].map((m) => ({ attributes: m[2] ?? '', body: m[3] ?? '' }));
}

function attribute(attributes: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attributes);
  return m ? decode(m[1] ?? m[2] ?? '') : undefined;
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[entity] ?? whole;
  });
}
