import { BadRequestException, HttpStatus } from '@nestjs/common';
import { TICKET_FUTURE_TOLERANCE_MINUTES, TICKET_PROBLEM_MAX, TICKET_PROBLEM_MIN } from '@tyio/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = ['remoteId', 'categoryId', 'systemId', 'occurredAt', 'problem', 'confirmOpenTickets'];
/** Batas bawah waktu kejadian: menangkap salah ketik tahun. */
const EARLIEST = Date.UTC(2020, 0, 1);

export interface CreateTicketInput {
  remoteId: string;
  categoryId: string;
  systemId: string | null;
  occurredAt: Date;
  problem: string;
  confirmOpenTickets: boolean;
}

/** Isian "Buat tiket"; pesan per kolom agar tampil di bawah kolom yang salah. */
export function parseCreateTicket(body: unknown, now = new Date()): CreateTicketInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalid('Isian harus berupa objek JSON.');
  }
  const input = body as Record<string, unknown>;
  const unknown = Object.keys(input).find((key) => !ALLOWED.includes(key));
  if (unknown !== undefined) throw invalid(`Kolom tidak dikenal: ${unknown}.`, unknown);

  const remoteId = input.remoteId;
  if (typeof remoteId !== 'string' || !UUID.test(remoteId)) throw invalid('Pilih remote.', 'remoteId');
  const categoryId = input.categoryId;
  if (typeof categoryId !== 'string' || !UUID.test(categoryId)) throw invalid('Pilih kategori.', 'categoryId');

  let systemId: string | null = null;
  if (input.systemId !== undefined && input.systemId !== null && input.systemId !== '') {
    if (typeof input.systemId !== 'string' || !UUID.test(input.systemId)) throw invalid('System tidak sah.', 'systemId');
    systemId = input.systemId;
  }

  const occurredAt = typeof input.occurredAt === 'string' ? new Date(input.occurredAt) : null;
  if (!occurredAt || Number.isNaN(occurredAt.getTime()) || !/T.*(Z|[+-]\d{2}:?\d{2})$/.test(input.occurredAt as string)) {
    throw invalid('Isi waktu kejadian.', 'occurredAt');
  }
  if (occurredAt.getTime() > now.getTime() + TICKET_FUTURE_TOLERANCE_MINUTES * 60_000) {
    throw invalid('Waktu kejadian tidak boleh di masa depan.', 'occurredAt');
  }
  if (occurredAt.getTime() < EARLIEST) {
    throw invalid('Waktu kejadian terlalu lama; periksa tahunnya.', 'occurredAt');
  }

  const problem = typeof input.problem === 'string' ? input.problem.replace(/\r\n/g, '\n').trim() : '';
  if (problem.length < TICKET_PROBLEM_MIN || problem.length > TICKET_PROBLEM_MAX) {
    throw invalid(`Keterangan ${TICKET_PROBLEM_MIN}–${TICKET_PROBLEM_MAX.toLocaleString('id-ID')} karakter.`, 'problem');
  }

  const confirm = input.confirmOpenTickets ?? false;
  if (typeof confirm !== 'boolean') {
    throw invalid('confirmOpenTickets harus true atau false.', 'confirmOpenTickets');
  }
  return { remoteId, categoryId, systemId, occurredAt, problem, confirmOpenTickets: confirm };
}

export function invalid(message: string, field?: string): BadRequestException {
  return new BadRequestException({ statusCode: HttpStatus.BAD_REQUEST, message, field });
}
