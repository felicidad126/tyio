import { BadRequestException, HttpStatus } from '@nestjs/common';
import { findProvince, REMOTE_STATUSES, type RemoteListQuery, type RemoteStatus } from '@tyio/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = ['q', 'tenantId', 'province', 'jarkomId', 'status', 'page'];

/** Parameter daftar remote dari query string; yang tidak sah dijawab 400 dengan pesan jelas. */
export function parseRemoteListQuery(raw: Record<string, unknown>): Required<Pick<RemoteListQuery, 'page'>> &
  RemoteListQuery {
  const unknown = Object.keys(raw).find((key) => !ALLOWED.includes(key));
  if (unknown) throw invalid(`Parameter tidak dikenal: ${unknown}.`);
  const value = (key: string): string | undefined => {
    const v = raw[key];
    if (v === undefined || v === '') return undefined;
    if (typeof v !== 'string') throw invalid(`Parameter ${key} hanya boleh satu nilai.`);
    return v;
  };

  const query: RemoteListQuery & { page: number } = { page: 1 };
  const q = value('q')?.trim();
  if (q) {
    if (q.length > 100) throw invalid('Pencarian paling banyak 100 karakter.');
    query.q = q;
  }
  const page = value('page');
  if (page !== undefined) {
    if (!/^\d{1,6}$/.test(page) || Number(page) < 1) throw invalid('Halaman harus bilangan bulat mulai 1.');
    query.page = Number(page);
  }
  const tenantId = value('tenantId');
  if (tenantId !== undefined) {
    if (!UUID.test(tenantId)) throw invalid('Customer tidak sah.');
    query.tenantId = tenantId;
  }
  const jarkomId = value('jarkomId');
  if (jarkomId !== undefined) {
    if (!UUID.test(jarkomId)) throw invalid('Jarkom tidak sah.');
    query.jarkomId = jarkomId;
  }
  const province = value('province');
  if (province !== undefined) {
    const found = findProvince(province);
    if (!found) throw invalid(`Provinsi "${province}" tidak dikenal.`);
    query.province = found.name;
  }
  const status = value('status');
  if (status !== undefined) {
    if (!REMOTE_STATUSES.includes(status as RemoteStatus)) {
      throw invalid(`Status harus salah satu dari: ${REMOTE_STATUSES.join(', ')}.`);
    }
    query.status = status as RemoteStatus;
  }
  return query;
}

/** Karakter wildcard LIKE dicari apa adanya. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ statusCode: HttpStatus.BAD_REQUEST, message });
}
