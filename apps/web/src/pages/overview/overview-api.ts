import type { Overview } from '@npr/shared';
import { apiRequest } from '../../api';

// Overview (langkah 2.1). Cakupan customer diperiksa server; setiap angka membawa saringan
// antrean yang memberi daftar dengan jumlah sama (lihat tickets/list/queue-query.ts).

export const overviewApi = {
  get: (query: { period: number; tenantId?: string }) => {
    const params = new URLSearchParams({ period: String(query.period) });
    if (query.tenantId) params.set('tenantId', query.tenantId);
    return apiRequest<Overview>('GET', `/overview?${params.toString()}`);
  },
};
