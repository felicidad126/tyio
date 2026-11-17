import { describe, expect, it } from 'vitest';
import type { CellValue, Sheet } from '../../../lib/xlsx/read';
import { excelDate, ImportFileError, mapSheet } from './import-rows';

const sheet = (rows: CellValue[][], date1904 = false): Sheet => ({
  date1904,
  rows: rows.map((cells, i) => ({
    row: i + 1,
    cells: new Map(cells.flatMap((c, j) => (c === '' ? [] : [[j, c] as const]))),
  })),
});

const REQUIRED = ['Site ID', 'Nama Remote', 'Jarkom', 'Kota', 'Provinsi'];

describe('lembar Excel menjadi baris impor', () => {
  it('memetakan judul tanpa peduli huruf besar/kecil dan spasi; kolom tak dikenal diabaikan', () => {
    const result = mapSheet(
      sheet([
        [' site  id ', 'NAMA REMOTE', 'Jarkom', 'Kota', 'Provinsi', 'Catatan', 'Tanggal Online', 'Latitude'],
        ['s-1', 'ATM A', 'VSAT', 'Malang', 'Jatim', 'abaikan', 45322, -7.98],
        ['s-2', '', 'VSAT', 'Malang', 'Jatim', '', '2024-02-01', ''],
      ]),
    );

    expect(result.ignoredHeaders).toEqual(['Catatan']);
    expect(result.rows).toEqual([
      {
        row: 2,
        values: {
          siteId: 's-1',
          name: 'ATM A',
          jarkom: 'VSAT',
          city: 'Malang',
          province: 'Jatim',
          onlineDate: '2024-01-31',
          latitude: '-7.98',
        },
      },
      {
        row: 3,
        values: {
          siteId: 's-2',
          name: '',
          jarkom: 'VSAT',
          city: 'Malang',
          province: 'Jatim',
          onlineDate: '2024-02-01',
          latitude: '',
        },
      },
    ]);
  });

  it('kolom yang tidak ada di file tidak dikirim; baris yang hanya berisi kolom tak dikenal dilewati', () => {
    const result = mapSheet(sheet([[...REQUIRED, 'Catatan'], ['S-1', 'A', 'VSAT', 'Malang', 'Bali', ''], ['', '', '', '', '', 'x']]));

    expect(result.rows).toHaveLength(1);
    expect(Object.keys(result.rows[0]!.values)).toEqual(['siteId', 'name', 'jarkom', 'city', 'province']);
  });

  it('menolak kolom wajib yang hilang, judul ganda, file kosong, dan file tanpa data', () => {
    expect(() => mapSheet(sheet([['Site ID', 'Kota']]))).toThrow(/Kolom wajib tidak ada di baris judul: Nama Remote, Jarkom, Provinsi/);
    expect(() => mapSheet(sheet([[...REQUIRED, 'kota']]))).toThrow(/"kota" muncul dua kali/);
    expect(() => mapSheet(sheet([]))).toThrow(ImportFileError);
    expect(() => mapSheet(sheet([REQUIRED]))).toThrow(/tidak berisi data remote/);
  });

  it('nomor seri tanggal Excel 1900 dan 1904', () => {
    expect(excelDate(45322, false)).toBe('2024-01-31');
    expect(excelDate(60, false)).toBe('1900-02-28');
    expect(excelDate(43860, true)).toBe('2024-01-31');
  });
});
