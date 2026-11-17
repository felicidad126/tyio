import { randomUUID, createHash } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { access, constants, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { AttachmentType } from '@tyio/shared';
import { APP_CONFIG, type AppConfig } from '../../../config.js';

const EXTENSIONS: Record<AttachmentType, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export interface StoredFile {
  storedName: string;
  sha256: string;
}

/**
 * Lampiran di disk (T8). Nama berkas diacak; nama asli hanya disimpan di database. Folder
 * diperiksa saat aplikasi start, agar volume yang lupa dipasang ketahuan sejak awal.
 */
@Injectable()
export class AttachmentStorage implements OnModuleInit {
  private readonly dir: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.dir = resolve(config.attachmentsDir);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      await access(this.dir, constants.W_OK);
    } catch {
      throw new Error(`Folder lampiran ${this.dir} tidak bisa ditulis (ATTACHMENTS_DIR).`);
    }
  }

  async save(data: Buffer, type: AttachmentType): Promise<StoredFile> {
    const storedName = `${randomUUID()}${EXTENSIONS[type]}`;
    await writeFile(this.path(storedName), data, { flag: 'wx', mode: 0o640 });
    return { storedName, sha256: createHash('sha256').update(data).digest('hex') };
  }

  /** Untuk membersihkan berkas bila penyimpanan ke database gagal. */
  async remove(storedName: string): Promise<void> {
    await rm(this.path(storedName), { force: true });
  }

  open(storedName: string): ReadStream {
    return createReadStream(this.path(storedName));
  }

  private path(storedName: string): string {
    // Nama tersimpan selalu buatan sistem; basename tetap dipakai sebagai pagar tambahan.
    return join(this.dir, basename(storedName));
  }
}

/** Jenis berkas dari isinya (bukan dari nama atau header kiriman), atau null bila tidak diizinkan. */
export function detectAttachmentType(data: Buffer): AttachmentType | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (data.length >= 5 && data.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

/** Nama asli yang aman ditampilkan dan dipakai di header unduhan. */
export function cleanFileName(name: string): string {
  const cleaned = basename(name.replace(/\\/g, '/'))
    .replace(/[\p{Cc}"]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'lampiran';
  if (cleaned.length <= 200) return cleaned;
  const dot = cleaned.lastIndexOf('.');
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : '';
  return cleaned.slice(0, 200 - ext.length) + ext;
}
