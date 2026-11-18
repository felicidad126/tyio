import { API_PREFIX, type ApiErrorBody, type NprReportQuery, type NprReportResponse } from '@tyio/shared';
import { ApiError, apiRequest } from './client';

const search = (query: NprReportQuery) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
};

export const reportsApi = {
  npr(query: NprReportQuery): Promise<NprReportResponse> {
    return apiRequest<NprReportResponse>('GET', `/reports/npr${search(query)}`);
  },

  /**
   * Berkas Excel rekap NPR. Diunduh lewat fetch (bukan tautan biasa) agar penolakan (periode
   * terlalu besar, unduhan lain berjalan) tampil sebagai pesan di halaman, bukan halaman JSON.
   */
  async nprExcel(query: Omit<NprReportQuery, 'page'>): Promise<{ file: Blob; fileName: string }> {
    let res: Response;
    try {
      res = await fetch(`/${API_PREFIX}/reports/npr/excel${search(query)}`, { credentials: 'same-origin' });
    } catch {
      throw new ApiError(0, 'Server tidak bisa dihubungi. Periksa koneksi, lalu coba lagi.');
    }
    if (!res.ok) {
      const error = ((await res.json().catch(() => undefined)) ?? {}) as Partial<ApiErrorBody>;
      const message =
        res.status < 500 && typeof error.message === 'string' ? error.message : 'Berkas Excel gagal dibuat. Coba lagi sebentar lagi.';
      throw new ApiError(res.status, message);
    }
    let file: Blob;
    try {
      file = await res.blob();
    } catch {
      throw new ApiError(0, 'Unduhan terputus sebelum selesai. Coba lagi.');
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1];
    return { file, fileName: name ?? 'rekap-npr.xlsx' };
  },
};
