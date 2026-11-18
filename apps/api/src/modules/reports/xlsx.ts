import { once } from 'node:events';
import { createDeflateRaw, crc32 } from 'node:zlib';
import { type AsyncFlateStreamHandler, type FlateError, strToU8, Zip, type ZipInputFile } from 'fflate';

/** Satu sel: teks, angka, atau waktu (ditulis sebagai tanggal-waktu Excel menurut WIB). */
export type Cell = string | number | Date | null;

export interface Sheet {
  name: string;
  /** Baris judul kolom (tebal dan dibekukan). */
  header?: string[];
  /** Baris isi; boleh berupa kelompok baris yang dibaca bertahap (mis. dari cursor database). */
  rows: Cell[][] | AsyncIterable<Cell[][]>;
  /** Lebar kolom dalam karakter. */
  widths?: number[];
  /** Saringan otomatis di baris judul. */
  table?: boolean;
}

/** Penerima potongan berkas; ditunggu sebelum potongan berikutnya dibuat (tekanan balik). */
export type XlsxSink = (chunk: Uint8Array) => void | Promise<void>;

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;
const LEVEL = 6;
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// Gaya: 0 biasa · 1 tebal (judul) · 2 tanggal-waktu · 3 bilangan bulat dengan pemisah ribuan ·
// 4 desimal satu angka.
const STYLE = { text: 0, bold: 1, dateTime: 2, integer: 3, decimal: 4 } as const;

const STYLES =
  XML_DECLARATION +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="5">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/**
 * Berkas .xlsx untuk laporan (4.2), tanpa pustaka spreadsheet: teks sebagai teks inline (tidak
 * pernah ditafsirkan sebagai rumus, jadi aman dari injeksi rumus), angka sebagai angka, waktu
 * sebagai tanggal-waktu Excel dalam WIB.
 *
 * Ditulis bertahap ke `sink`: lembar besar tidak pernah utuh di memori, dan setiap kelompok baris
 * dikompres lalu dikirim sebelum kelompok berikutnya dibaca. workbook.xml ditulis terakhir karena
 * rentang saringan otomatis butuh jumlah baris sebenarnya.
 */
export async function writeXlsx(sheets: Sheet[], sink: XlsxSink): Promise<void> {
  const pending: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((err, data) => {
    if (err) failure = err;
    else pending.push(data);
  });
  const flush = async () => {
    if (failure) throw failure;
    while (pending.length > 0) await sink(pending.shift()!);
  };
  const file = async (path: string, parts: Iterable<string> | AsyncIterable<string>) => {
    const entry = new NativeDeflate(path);
    zip.add(entry);
    for await (const part of parts) {
      await entry.write(strToU8(part));
      await flush();
    }
    await entry.end();
    await flush();
  };

  await file('[Content_Types].xml', [
    XML_DECLARATION +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      `</Types>`,
  ]);
  await file('_rels/.rels', [
    XML_DECLARATION +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
  ]);
  await file('xl/_rels/workbook.xml.rels', [
    XML_DECLARATION +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  ]);
  await file('xl/styles.xml', [STYLES]);
  const rowCounts: number[] = [];
  for (const [i, sheet] of sheets.entries()) {
    await file(`xl/worksheets/sheet${i + 1}.xml`, worksheet(sheet, (count) => rowCounts.push(count)));
  }
  await file('xl/workbook.xml', [workbook(sheets, rowCounts)]);
  zip.end();
  await flush();
}

/**
 * Isi berkas ZIP yang dikompres zlib bawaan Node: kompresi berjalan di thread pool, bukan di
 * event loop, jadi unduhan besar tidak menahan permintaan lain (mis. pembaruan langsung).
 */
class NativeDeflate implements ZipInputFile {
  size = 0;
  crc = 0;
  readonly compression = 8;
  ondata?: AsyncFlateStreamHandler;
  private readonly deflate = createDeflateRaw({ level: LEVEL });
  private readonly finished: Promise<void>;

  constructor(readonly filename: string) {
    this.finished = new Promise((resolve, reject) => {
      this.deflate.on('data', (chunk: Buffer) => this.ondata!(null, chunk as Uint8Array<ArrayBuffer>, false));
      this.deflate.on('end', () => {
        this.ondata!(null, new Uint8Array(0), true);
        resolve();
      });
      this.deflate.on('error', (err) => {
        this.ondata!(err as FlateError, null as unknown as Uint8Array<ArrayBuffer>, true);
        reject(err);
      });
    });
  }

  async write(data: Uint8Array): Promise<void> {
    this.size += data.length;
    this.crc = crc32(data, this.crc);
    if (!this.deflate.write(data)) await once(this.deflate, 'drain');
  }

  end(): Promise<void> {
    this.deflate.end();
    return this.finished;
  }
}

function workbook(sheets: Sheet[], rowCounts: number[]): string {
  // Saringan otomatis butuh nama tersembunyi per lembar.
  const names = sheets
    .map((s, i) =>
      s.table && s.header
        ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">` +
          `'${escape(sheetName(s.name)).replace(/'/g, "''")}'!$A$1:$${columnName(s.header.length - 1)}$${rowCounts[i]! + 1}` +
          `</definedName>`
        : '',
    )
    .join('');
  return (
    XML_DECLARATION +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    sheets.map((s, i) => `<sheet name="${escape(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    `</sheets>` +
    (names ? `<definedNames>${names}</definedNames>` : '') +
    `</workbook>`
  );
}

/** Isi satu lembar sebagai potongan teks; jumlah baris isi dilaporkan lewat `done` di akhir. */
async function* worksheet(sheet: Sheet, done: (rowCount: number) => void): AsyncGenerator<string> {
  const header = sheet.header ? 1 : 0;
  const view = header
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '';
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  let start =
    XML_DECLARATION + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${view}${cols}<sheetData>`;
  if (sheet.header) {
    start += `<row r="1">${sheet.header.map((h, c) => textCell(c, 1, h, STYLE.bold)).join('')}</row>`;
  }
  yield start;
  let count = 0;
  const batches = Array.isArray(sheet.rows) ? [sheet.rows] : sheet.rows;
  for await (const batch of batches) {
    const parts: string[] = [];
    for (const cells of batch) {
      const r = ++count + header;
      parts.push(`<row r="${r}">${cells.map((value, c) => cell(c, r, value)).join('')}</row>`);
    }
    yield parts.join('');
  }
  const filter =
    sheet.table && sheet.header ? `<autoFilter ref="A1:${columnName(sheet.header.length - 1)}${count + 1}"/>` : '';
  done(count);
  yield `</sheetData>${filter}</worksheet>`;
}

function cell(c: number, r: number, value: Cell): string {
  if (value === null || value === '') return '';
  if (value instanceof Date) {
    const serial = (value.getTime() + WIB_OFFSET_MS - EXCEL_EPOCH_MS) / DAY_MS;
    return `<c r="${columnName(c)}${r}" s="${STYLE.dateTime}"><v>${serial}</v></c>`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    const style = Number.isInteger(value) ? STYLE.integer : STYLE.decimal;
    return `<c r="${columnName(c)}${r}" s="${style}"><v>${value}</v></c>`;
  }
  return textCell(c, r, value, STYLE.text);
}

function textCell(c: number, r: number, value: string, style: number): string {
  const s = style ? ` s="${style}"` : '';
  // Spasi di tepi dan baris baru hanya dipertahankan dengan xml:space; selain itu dihemat.
  const t = /^\s|\s$|[\t\n\r]/.test(value) ? '<t xml:space="preserve">' : '<t>';
  return `<c r="${columnName(c)}${r}" t="inlineStr"${s}><is>${t}${escape(value)}</t></is></c>`;
}

/** 0 → "A", 26 → "AA". */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Nama lembar Excel: paling banyak 31 karakter, tanpa karakter terlarang. */
function sheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim();
}

/** Karakter kendali yang tidak sah di XML 1.0 dibuang; tab dan baris baru tetap. */
function stripInvalid(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    const control = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    if (!control && code !== 0xfffe && code !== 0xffff) out += ch;
  }
  return out;
}

function escape(value: string): string {
  return stripInvalid(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
