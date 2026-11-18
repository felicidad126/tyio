import { BadRequestException, HttpStatus } from '@nestjs/common';
import {
  isDateString,
  SEARCH_MAX_LENGTH,
  TICKET_STATUSES,
  TICKET_VIEWS,
  type TicketListQuery,
  type TicketStatus,
  type TicketView,
} from '@tyio/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = [
  'view',
  'q',
  'tenantId',
  'categoryId',
  'jarkomId',
  'remoteId',
  'status',
  'occurredFrom',
  'occurredTo',
  'closedFrom',
  'closedTo',
  'flagged',
  'page',
];

export type ParsedTicketListQuery = TicketListQuery & { view: TicketView; page: number };

/** Parameter daftar tiket dari query string; yang tidak sah dijawab 400 dengan pesan jelas. */
export function parseTicketListQuery(raw: Record<string, unknown>): ParsedTicketListQuery {
  const unknown = Object.keys(raw).find((key) => !ALLOWED.includes(key));
  if (unknown) throw invalid(`Parameter tidak dikenal: ${unknown}.`);
  const value = (key: string): string | undefined => {
    const v = raw[key];
    if (v === undefined || v === '') return undefined;
    if (typeof v !== 'string') throw invalid(`Parameter ${key} hanya boleh satu nilai.`);
    return v;
  };

  const query: ParsedTicketListQuery = { view: 'aktif', page: 1 };
  const view = value('view');
  if (view !== undefined) {
    if (!TICKET_VIEWS.includes(view as TicketView)) {
      throw invalid(`Tampilan harus salah satu dari: ${TICKET_VIEWS.join(', ')}.`);
    }
    query.view = view as TicketView;
  }
  const q = value('q')?.trim();
  if (q) {
    if (q.length > SEARCH_MAX_LENGTH) throw invalid(`Pencarian paling banyak ${SEARCH_MAX_LENGTH} karakter.`);
    query.q = q;
  }
  const page = value('page');
  if (page !== undefined) {
    if (!/^\d{1,6}$/.test(page) || Number(page) < 1) throw invalid('Halaman harus bilangan bulat mulai 1.');
    query.page = Number(page);
  }
  for (const [key, label] of [
    ['tenantId', 'Customer'],
    ['categoryId', 'Kategori'],
    ['jarkomId', 'Jarkom'],
    ['remoteId', 'Remote'],
  ] as const) {
    const id = value(key);
    if (id === undefined) continue;
    if (!UUID.test(id)) throw invalid(`${label} tidak sah.`);
    query[key] = id;
  }
  const status = value('status');
  if (status !== undefined) {
    if (!TICKET_STATUSES.includes(status as TicketStatus)) {
      throw invalid(`Status harus salah satu dari: ${TICKET_STATUSES.join(', ')}.`);
    }
    query.status = status as TicketStatus;
  }
  // Rentang tanggal WIB (YYYY-MM-DD), kedua ujungnya termasuk.
  for (const [from, to, label] of [
    ['occurredFrom', 'occurredTo', 'kejadian'],
    ['closedFrom', 'closedTo', 'online kembali'],
  ] as const) {
    for (const key of [from, to]) {
      const date = value(key);
      if (date === undefined) continue;
      if (!isDateString(date)) throw invalid(`Tanggal ${label} harus berbentuk TTTT-BB-HH.`);
      query[key] = date;
    }
    if (query[from] && query[to] && query[from] > query[to]) {
      throw invalid(`Tanggal ${label} "dari" tidak boleh setelah "sampai".`);
    }
  }
  const flagged = value('flagged');
  if (flagged !== undefined) {
    if (flagged !== 'true') throw invalid('Parameter flagged hanya boleh "true".');
    query.flagged = true;
  }
  return query;
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ statusCode: HttpStatus.BAD_REQUEST, message });
}
