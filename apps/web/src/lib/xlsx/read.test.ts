import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readFirstSheet, XlsxError } from './read';
import { writeXlsx } from './write';

/** File .xlsx buatan tangan, meniru keluaran Excel (shared strings, prefiks namespace, dst.). */
function workbook(options: { sheetXml: string; sharedXml?: string; date1904?: boolean; sheets?: string }) {
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0"?><x:workbook xmlns:x="m" xmlns:r="r">` +
        (options.date1904 ? '<x:workbookPr date1904="1"/>' : '<x:workbookPr/>') +
        `<x:sheets>${options.sheets ?? '<x:sheet name="Data" sheetId="1" r:id="rId7"/>'}</x:sheets></x:workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<Relationships><Relationship Id="rId9" Target="worksheets/sheet9.xml"/>` +
        `<Relationship Id="rId7" Target="/xl/worksheets/data.xml"/></Relationships>`,
    ),
    'xl/worksheets/data.xml': strToU8(options.sheetXml),
    'xl/worksheets/sheet9.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1"><v>9</v></c></row></sheetData></worksheet>'),
  };
  if (options.sharedXml) files['xl/sharedStrings.xml'] = strToU8(options.sharedXml);
  return zipSync(files);
}

const plain = (sheet: ReturnType<typeof readFirstSheet>) =>
  sheet.rows.map((r) => [r.row, Object.fromEntries(r.cells)]);

describe('membaca .xlsx', () => {
  it('teks bersama, teks kaya tanpa fonetik, teks inline, angka, boolean, hasil rumus, dan entitas', () => {
    const file = workbook({
      sharedXml:
        '<sst><si><t>Site ID</t></si><si><r><t>ATM </t></r><r><rPr/><t xml:space="preserve">Pasar &amp; Mall</t></r><rPh><t>abaikan</t></rPh></si></sst>',
      sheetXml:
        '<x:worksheet><x:sheetData>' +
        '<x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="C1" t="inlineStr"><x:is><x:t>Kota &lt;1&gt;</x:t></x:is></x:c></x:row>' +
        '<x:row r="3"><x:c r="A3" t="s"><x:v>1</x:v></x:c><x:c r="B3"><x:v>-6.25</x:v></x:c><x:c r="C3" t="b"><x:v>1</x:v></x:c>' +
        '<x:c r="AA3" t="str"><x:f>A3&amp;"x"</x:f><x:v>hasil</x:v></x:c><x:c r="D3" s="2"/></x:row>' +
        '</x:sheetData></x:worksheet>',
    });

    const sheet = readFirstSheet(file);

    expect(sheet.date1904).toBe(false);
    expect(plain(sheet)).toEqual([
      [1, { 0: 'Site ID', 2: 'Kota <1>' }],
      [3, { 0: 'ATM Pasar & Mall', 1: -6.25, 2: true, 26: 'hasil' }],
    ]);
  });

  it('sel dan baris tanpa atribut r memakai urutan; baris kosong dilewati', () => {
    const sheet = readFirstSheet(
      workbook({
        sheetXml:
          '<worksheet><sheetData><row><c t="inlineStr"><is><t>a</t></is></c><c><v>2</v></c></row>' +
          '<row/><row><c r="C3" t="inlineStr"><is><t>c</t></is></c></row></sheetData></worksheet>',
      }),
    );

    expect(plain(sheet)).toEqual([
      [1, { 0: 'a', 1: 2 }],
      [3, { 2: 'c' }],
    ]);
  });

  it('memakai lembar pertama menurut urutan workbook dan mengenali sistem tanggal 1904', () => {
    const sheet = readFirstSheet(
      workbook({
        date1904: true,
        sheets: '<x:sheet name="Data" sheetId="1" r:id="rId7"/><x:sheet name="Lain" sheetId="2" r:id="rId9"/>',
        sheetXml: "<worksheet><sheetData><row r='1'><c r='A1'><v>1</v></c></row></sheetData></worksheet>",
      }),
    );

    expect(sheet.date1904).toBe(true);
    expect(plain(sheet)).toEqual([[1, { 0: 1 }]]);
  });

  it('membaca kembali file buatan writeXlsx, termasuk angka berawalan nol sebagai teks', () => {
    const file = writeXlsx([
      { name: 'Remote', rows: [['Site ID', 'Telepon'], ['S-001', '0210000001']] },
      { name: 'Petunjuk', rows: [['abaikan']] },
    ]);

    expect(plain(readFirstSheet(file))).toEqual([
      [1, { 0: 'Site ID', 1: 'Telepon' }],
      [2, { 0: 'S-001', 1: '0210000001' }],
    ]);
  });

  it('menolak file yang bukan xlsx, xlsx tanpa lembar, dan isi yang terlalu besar', () => {
    expect(() => readFirstSheet(strToU8('Site ID,Nama\nS-1,A'))).toThrow(XlsxError);
    expect(() => readFirstSheet(strToU8('Site ID,Nama\nS-1,A'))).toThrow(/bukan file Excel/);
    expect(() =>
      readFirstSheet(zipSync({ 'xl/workbook.xml': strToU8('<workbook/>'), 'xl/_rels/workbook.xml.rels': strToU8('<r/>') })),
    ).toThrow(/tidak berisi lembar kerja/);
    const bomb = zipSync({
      'xl/workbook.xml': strToU8('<workbook/>'),
      'xl/worksheets/sheet1.xml': new Uint8Array(90 * 1024 * 1024),
    });
    expect(() => readFirstSheet(bomb)).toThrow(/terlalu besar/);
  });
});
