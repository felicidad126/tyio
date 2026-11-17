import {
  ACTION_NOTE_MAX,
  ATTACHMENT_MAX_FILES,
  CUSTOMER_TICKET_NUMBER_MAX,
  PENDING_PARTIES,
  PENDING_REASON_MAX,
  PENDING_REASON_MIN,
  type PendingParty,
  TICKET_FUTURE_TOLERANCE_MINUTES,
  TICKET_STATUSES,
  type TicketStatus,
} from '@tyio/shared';
import { invalid } from '../ticket-input.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = ['occurredAt', 'note', 'statusTo', 'expectedStatus', 'pendingParty', 'pendingReason', 'correctsId'];
const EARLIEST = Date.UTC(2020, 0, 1);

export type ActionInput =
  | {
      kind: 'action';
      occurredAt: Date;
      note: string | null;
      status: { to: TicketStatus; expected: TicketStatus; pending: { party: PendingParty; reason: string } | null } | null;
    }
  | { kind: 'correction'; correctsId: string; note: string };

/** Berkas yang diterima multer (disimpan di memori, sudah dibatasi ukuran dan jumlahnya). */
export interface UploadedFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/**
 * Isian "Tambah tindakan". Multipart: bagian `data` berisi JSON; atau JSON biasa bila tanpa
 * lampiran. Tindakan biasa wajib berisi catatan atau perubahan status (atau keduanya).
 */
export function parseActionInput(body: unknown, files: UploadedFile[], now = new Date()): ActionInput {
  const input = readBody(body);
  const unknown = Object.keys(input).find((key) => !ALLOWED.includes(key));
  if (unknown !== undefined) throw invalid(`Kolom tidak dikenal: ${unknown}.`, unknown);

  const note = optionalText(input.note);
  if (note !== null && note.length > ACTION_NOTE_MAX) {
    throw invalid(`Catatan paling banyak ${ACTION_NOTE_MAX.toLocaleString('id-ID')} karakter.`, 'note');
  }

  if (input.correctsId !== undefined) {
    if (typeof input.correctsId !== 'string' || !UUID.test(input.correctsId)) {
      throw invalid('Entri yang dikoreksi tidak sah.', 'correctsId');
    }
    if (input.statusTo !== undefined || input.pendingParty !== undefined || input.pendingReason !== undefined) {
      throw invalid('Koreksi hanya berisi catatan; status diubah lewat tindakan biasa.', 'statusTo');
    }
    if (files.length > 0) throw invalid('Koreksi tidak bisa membawa lampiran.', 'lampiran');
    if (!note) throw invalid('Tulis koreksinya.', 'note');
    return { kind: 'correction', correctsId: input.correctsId, note };
  }

  const occurredAt = typeof input.occurredAt === 'string' ? new Date(input.occurredAt) : null;
  if (!occurredAt || Number.isNaN(occurredAt.getTime()) || !/T.*(Z|[+-]\d{2}:?\d{2})$/.test(input.occurredAt as string)) {
    throw invalid('Isi waktu tindakan.', 'occurredAt');
  }
  if (occurredAt.getTime() > now.getTime() + TICKET_FUTURE_TOLERANCE_MINUTES * 60_000) {
    throw invalid('Waktu tindakan tidak boleh di masa depan.', 'occurredAt');
  }
  if (occurredAt.getTime() < EARLIEST) throw invalid('Waktu tindakan terlalu lama; periksa tahunnya.', 'occurredAt');

  let status: Extract<ActionInput, { kind: 'action' }>['status'] = null;
  if (input.statusTo !== undefined) {
    const to = statusOf(input.statusTo, 'statusTo');
    const expected = statusOf(input.expectedStatus, 'expectedStatus');
    let pending: { party: PendingParty; reason: string } | null = null;
    if (to === 'pending') {
      if (!PENDING_PARTIES.includes(input.pendingParty as PendingParty)) {
        throw invalid('Pilih pihak yang ditunggu: Customer atau TM.', 'pendingParty');
      }
      const reason = optionalText(input.pendingReason) ?? '';
      if (reason.length < PENDING_REASON_MIN || reason.length > PENDING_REASON_MAX) {
        throw invalid(`Alasan pending ${PENDING_REASON_MIN}–${PENDING_REASON_MAX} karakter.`, 'pendingReason');
      }
      pending = { party: input.pendingParty as PendingParty, reason };
    } else if (input.pendingParty !== undefined || input.pendingReason !== undefined) {
      throw invalid('Pihak dan alasan pending hanya untuk status Pending.', 'pendingParty');
    }
    status = { to, expected, pending };
  } else if (input.pendingParty !== undefined || input.pendingReason !== undefined) {
    throw invalid('Pihak dan alasan pending hanya untuk status Pending.', 'pendingParty');
  }

  if (!note && !status && files.length === 0) throw invalid('Tulis catatan, ubah status, atau lampirkan berkas.', 'note');
  if (!note && !status) throw invalid('Tulis catatan untuk lampiran ini.', 'note');
  if (files.length > ATTACHMENT_MAX_FILES) {
    throw invalid(`Paling banyak ${ATTACHMENT_MAX_FILES} lampiran per tindakan.`, 'lampiran');
  }
  return { kind: 'action', occurredAt, note, status };
}

/** Nomor tiket customer: teks bebas satu baris, atau kosong untuk menghapus. */
export function parseCustomerTicketNumber(body: unknown): string | null {
  const input = readBody(body);
  const unknown = Object.keys(input).find((key) => key !== 'customerTicketNumber');
  if (unknown !== undefined) throw invalid(`Kolom tidak dikenal: ${unknown}.`, unknown);
  const value = input.customerTicketNumber;
  if (value !== null && typeof value !== 'string') {
    throw invalid('Isi nomor tiket customer, atau kosongkan.', 'customerTicketNumber');
  }
  const number = optionalText(value);
  if (number !== null && (number.length > CUSTOMER_TICKET_NUMBER_MAX || /\p{Cc}/u.test(number))) {
    throw invalid(`Nomor tiket customer satu baris, paling banyak ${CUSTOMER_TICKET_NUMBER_MAX} karakter.`, 'customerTicketNumber');
  }
  return number;
}

function readBody(body: unknown): Record<string, unknown> {
  let value = body;
  // Multipart: isian JSON ada di bagian `data`.
  if (typeof body === 'object' && body !== null && typeof (body as { data?: unknown }).data === 'string') {
    try {
      value = JSON.parse((body as { data: string }).data);
    } catch {
      throw invalid('Bagian data bukan JSON yang sah.');
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid('Isian harus berupa objek JSON.');
  return value as Record<string, unknown>;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\r\n/g, '\n').trim();
  return text || null;
}

function statusOf(value: unknown, field: string): TicketStatus {
  if (!TICKET_STATUSES.includes(value as TicketStatus)) {
    throw invalid(field === 'statusTo' ? 'Status tujuan tidak dikenal.' : 'Status saat ini wajib dikirim.', field);
  }
  return value as TicketStatus;
}
