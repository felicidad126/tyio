import {
  type OpenTroubleTicketRequest,
  TICKET_STATUSES,
  type TicketStatus,
  TT_PROBLEM_MAX,
  TT_PROBLEM_MIN,
} from '@tyio/shared';
import { invalid } from '../tickets/ticket-input.js';

/** Isian "Eskalasi To SD": problem untuk teknisi dan status yang dilihat Helpdesk. */
export function parseOpenTroubleTicket(body: unknown): OpenTroubleTicketRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw invalid('Isian harus berupa objek JSON.');
  const input = body as Record<string, unknown>;
  const unknown = Object.keys(input).find((key) => key !== 'problem' && key !== 'expectedStatus');
  if (unknown !== undefined) throw invalid(`Kolom tidak dikenal: ${unknown}.`, unknown);
  const problem = typeof input.problem === 'string' ? input.problem.replace(/\r\n/g, '\n').trim() : '';
  if (problem.length < TT_PROBLEM_MIN || problem.length > TT_PROBLEM_MAX) {
    throw invalid(`Problem untuk teknisi ${TT_PROBLEM_MIN}–${TT_PROBLEM_MAX.toLocaleString('id-ID')} karakter.`, 'problem');
  }
  if (!TICKET_STATUSES.includes(input.expectedStatus as TicketStatus)) {
    throw invalid('Status tiket yang dilihat tidak sah.', 'expectedStatus');
  }
  return { problem, expectedStatus: input.expectedStatus as TicketStatus };
}
