import { API_PREFIX, type ApiErrorBody } from '@tyio/shared';

/** Galat dari API dengan pesan yang siap ditampilkan ke pengguna. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterSeconds?: number,
    /** Kolom isian yang bermasalah, bila API menyebutnya. */
    readonly field?: string,
    /** Isi jawaban galat apa adanya, mis. laporan impor pada 422. */
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const NETWORK_MESSAGE = 'Server tidak bisa dihubungi. Periksa koneksi, lalu coba lagi.';
const SERVER_MESSAGE = 'Terjadi gangguan di server. Coba lagi sebentar lagi.';

/** Satu-satunya pintu ke API: satu origin, cookie sesi ikut otomatis. */
export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  // FormData (unggah berkas) dikirim apa adanya; browser mengisi batas multipart sendiri.
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/${API_PREFIX}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined || isForm ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE);
  }
  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const error = (data ?? {}) as Partial<ApiErrorBody>;
    // Pesan 4xx ditulis API untuk pengguna; rincian galat 5xx tidak ditampilkan.
    const message = res.status < 500 && typeof error.message === 'string' ? error.message : SERVER_MESSAGE;
    throw new ApiError(res.status, message, error.retryAfterSeconds, error.field, data);
  }
  return data as T;
}
