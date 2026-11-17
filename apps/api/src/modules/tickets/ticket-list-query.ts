import { BadRequestException, HttpStatus } from '@nestjs/common';
import { SEARCH_MAX_LENGTH, TICKET_VIEWS, type TicketListQuery, type TicketView } from '@tyio/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = ['view', 'q', 'tenantId', 'categoryId', 'systemId', 'jarkomId', 'page'];

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
    ['systemId', 'System'],
    ['jarkomId', 'Jarkom'],
  ] as const) {
    const id = value(key);
    if (id === undefined) continue;
    if (!UUID.test(id)) throw invalid(`${label} tidak sah.`);
    query[key] = id;
  }
  return query;
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ statusCode: HttpStatus.BAD_REQUEST, message });
}
