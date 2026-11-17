import { BadRequestException, HttpStatus } from '@nestjs/common';
import {
  type CreateMasterItemRequest,
  masterCodeError,
  masterNameError,
  normalizeMasterCode,
  normalizeMasterName,
  type UpdateMasterItemRequest,
} from '@tyio/shared';

// Aturan dan pesan isian sama dengan yang dipakai form di web (@tyio/shared).

export function parseCreate(body: unknown): CreateMasterItemRequest {
  const input = asObject(body);
  rejectUnknown(input, ['code', 'name']);
  return { code: parseCode(input.code), name: parseName(input.name) };
}

export function parseUpdate(body: unknown): UpdateMasterItemRequest {
  const input = asObject(body);
  if ('code' in input) throw invalid('Kode tidak bisa diubah setelah dibuat.', 'code');
  rejectUnknown(input, ['name', 'active']);

  const update: UpdateMasterItemRequest = {};
  if ('name' in input) update.name = parseName(input.name);
  if ('active' in input) {
    if (typeof input.active !== 'boolean') {
      throw invalid('Status aktif harus true atau false.', 'active');
    }
    update.active = input.active;
  }
  if (Object.keys(update).length === 0) throw invalid('Tidak ada yang diubah.');
  return update;
}

function parseCode(value: unknown): string {
  const code = normalizeMasterCode(typeof value === 'string' ? value : '');
  const error = masterCodeError(code);
  if (error) throw invalid(error, 'code');
  return code;
}

function parseName(value: unknown): string {
  const name = normalizeMasterName(typeof value === 'string' ? value : '');
  const error = masterNameError(name);
  if (error) throw invalid(error, 'name');
  return name;
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalid('Isian harus berupa objek JSON.');
  }
  return body as Record<string, unknown>;
}

function rejectUnknown(input: Record<string, unknown>, allowed: readonly string[]): void {
  const unknown = Object.keys(input).find((key) => !allowed.includes(key));
  if (unknown !== undefined) throw invalid(`Kolom tidak dikenal: ${unknown}.`, unknown);
}

function invalid(message: string, field?: string): BadRequestException {
  return new BadRequestException({ statusCode: HttpStatus.BAD_REQUEST, message, field });
}
