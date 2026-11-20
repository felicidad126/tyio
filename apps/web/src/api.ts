import { API_PREFIX } from '@tyio/shared';

// Klien kecil untuk API di origin yang sama (T13). Cookie sesi ikut otomatis;
// halaman tidak pernah memegang token (cookie HttpOnly, T5).

/** Galat dari API dengan pesan yang aman ditampilkan ke pengguna. */
export class ApiError extends Error {
  override name = 'ApiError';

  constructor(
    /** Status HTTP; 0 bila server tidak bisa dihubungi. */
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const NETWORK_MESSAGE = 'Server tidak bisa dihubungi. Periksa koneksi, lalu coba lagi.';
const SERVER_MESSAGE = 'Server sedang bermasalah. Coba lagi sebentar lagi.';

let onUnauthorized: (() => void) | undefined;

/** Dipanggil bila API menjawab 401: sesi berakhir di tengah pemakaian. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  options: { handleUnauthorized?: boolean } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/${API_PREFIX}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE);
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (response.status === 401 && options.handleUnauthorized !== false) onUnauthorized?.();
    throw new ApiError(response.status, errorMessage(response.status, data));
  }
  return data as T;
}

/** Pesan dari API untuk galat 4xx (sudah berbahasa Indonesia); selain itu pesan umum. */
function errorMessage(status: number, data: unknown): string {
  if (status >= 500) return SERVER_MESSAGE;
  const message = (data as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' && message !== '' ? message : SERVER_MESSAGE;
}
