import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { TICKET_ATTACHMENT_MAX_BYTES, TICKET_ATTACHMENT_NAME_MAX_LENGTH, TICKET_ATTACHMENT_TYPES } from '@tyio/shared';

/** Satu berkas dari bagian `lampiran` permintaan multipart (multer, penyimpanan memori). */
export interface UploadedPart {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/** Lampiran yang sudah diperiksa dan siap disimpan. */
export interface CheckedAttachment {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  content: Buffer;
}

const startsWith = (content: Buffer, ...bytes: number[]) => bytes.every((byte, index) => content[index] === byte);
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * Isi berkas harus cocok dengan ekstensinya (T70): jenis isi yang disimpan dan dikirim saat
 * diunduh berasal dari daftar ekstensi, bukan dari peramban, dan berkas yang menyamar
 * (mis. HTML bernama .png) ditolak.
 */
const SIGNATURES: Record<string, (content: Buffer) => boolean> = {
  png: (c) => startsWith(c, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  jpg: (c) => startsWith(c, 0xff, 0xd8, 0xff),
  jpeg: (c) => startsWith(c, 0xff, 0xd8, 0xff),
  webp: (c) => c.subarray(0, 4).toString('latin1') === 'RIFF' && c.subarray(8, 12).toString('latin1') === 'WEBP',
  pdf: (c) => c.subarray(0, 5).toString('latin1') === '%PDF-',
  xlsx: (c) => startsWith(c, ...ZIP),
  docx: (c) => startsWith(c, ...ZIP),
  xls: (c) => startsWith(c, ...OLE),
  doc: (c) => startsWith(c, ...OLE),
  txt: isPlainText,
  log: isPlainText,
  csv: isPlainText,
};

/** Teks: UTF-8 yang sah tanpa byte NUL. */
function isPlainText(content: Buffer): boolean {
  if (content.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(content);
    return true;
  } catch {
    return false;
  }
}

export function checkAttachment(part: UploadedPart): CheckedAttachment {
  const fileName = cleanFileName(part.originalname);
  const extension = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? '';
  const contentType = TICKET_ATTACHMENT_TYPES[extension];
  const signature = SIGNATURES[extension];
  if (!contentType || !signature) {
    throw new BadRequestException(
      `Berkas ${fileName}: jenis ini tidak diterima. Pilih gambar (PNG, JPEG, WebP), PDF, teks/log/CSV, Excel, atau Word.`,
    );
  }
  if (part.size === 0 || part.buffer.length === 0) throw new BadRequestException(`Berkas ${fileName} kosong.`);
  if (part.buffer.length > TICKET_ATTACHMENT_MAX_BYTES) {
    throw new BadRequestException(`Berkas ${fileName} lebih dari 10 MB.`);
  }
  if (!signature(part.buffer)) {
    throw new BadRequestException(`Isi berkas ${fileName} tidak cocok dengan jenisnya (.${extension}).`);
  }
  return {
    fileName,
    contentType,
    sizeBytes: part.buffer.length,
    sha256: createHash('sha256').update(part.buffer).digest('hex'),
    content: part.buffer,
  };
}

/**
 * Nama tampilan saja (berkas tidak pernah ditulis ke disk): tanpa folder dan karakter kontrol,
 * paling panjang 200 karakter dengan ekstensi tetap di akhir.
 */
export function cleanFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex -- membuang karakter kontrol memang tujuannya
  let name = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (name === '' || name === '.' || name === '..') name = 'lampiran';
  if (name.length > TICKET_ATTACHMENT_NAME_MAX_LENGTH) {
    const extension = /\.[a-z0-9]{1,5}$/i.exec(name)?.[0] ?? '';
    name = `${name.slice(0, TICKET_ATTACHMENT_NAME_MAX_LENGTH - extension.length).trimEnd()}${extension}`;
  }
  return name;
}
