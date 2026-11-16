export type HealthState = 'ok' | 'error';

/**
 * Isi jawaban `GET /api/health`.
 * HTTP 200 bila semua `ok`; HTTP 503 dengan isi yang sama bila ada yang `error`.
 */
export interface HealthResponse {
  status: HealthState;
  database: HealthState;
}
