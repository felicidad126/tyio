import { strFromU8, unzipSync } from 'fflate';
import type { Test } from 'supertest';

/** Isi berkas .xlsx untuk uji: nama lembar dan teks XML tiap lembar. */
export function readXlsx(body: Buffer): { names: string[]; sheets: string[] } {
  const files = unzipSync(new Uint8Array(body));
  const workbook = strFromU8(files['xl/workbook.xml']!);
  const names = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]!);
  return { names, sheets: names.map((_, i) => strFromU8(files[`xl/worksheets/sheet${i + 1}.xml`]!)) };
}

/** Pengurai supertest yang menyimpan jawaban apa adanya sebagai Buffer. */
export const binaryParser: Parameters<Test['parse']>[0] = (res, done) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};
