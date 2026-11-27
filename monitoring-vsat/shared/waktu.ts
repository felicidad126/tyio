// Semua pekerjaan helpdesk memakai WIB (UTC+7, tanpa musim panas).
// Waktu disimpan di database dalam UTC, lalu fungsi di sini dipakai untuk
// menentukan tanggal dan bulan menurut WIB, baik di server maupun di tampilan.
const SELISIH_WIB = 7 * 60 * 60 * 1000;

function geserKeWib(waktu: number | string | Date) {
  return new Date(new Date(waktu).getTime() + SELISIH_WIB).toISOString();
}

/** Bulan WIB dalam bentuk "2026-11". */
export function bulanWIB(waktu: number | string | Date = Date.now()) {
  return geserKeWib(waktu).slice(0, 7);
}

/** Tanggal WIB dalam bentuk "2026-11-25". */
export function tanggalWIB(waktu: number | string | Date = Date.now()) {
  return geserKeWib(waktu).slice(0, 10);
}
