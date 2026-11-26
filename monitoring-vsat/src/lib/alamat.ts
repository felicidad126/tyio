// Alamat per halaman: setiap halaman punya alamat sendiri di browser, supaya
// link bisa dikirim, tombol Back bekerja, dan refresh tetap di halaman yang sama.
// Tanpa react-router: cukup History API bawaan browser.
import type { Page } from "@/lib/app";

export type Lokasi = { page: Page; param?: string | number };

/** Halaman biasa dan alamatnya (tanpa parameter). */
const ALAMAT: Record<Page, string> = {
  dashboard: "/",
  npr: "/npr",
  "npr-baru": "/npr/baru",
  "npr-detail": "/npr",
  tt: "/tt",
  gamas: "/gamas",
  "gamas-detail": "/gamas",
  sla: "/sla",
  customer: "/customer",
  remote: "/remote",
  pengguna: "/pengguna",
};

/** Nama parameter di belakang tanda tanya, untuk halaman daftar. */
const NAMA_PARAM: Partial<Record<Page, string>> = {
  npr: "kondisi",
  sla: "bulan",
  remote: "customer",
};

const idValid = (s: string | null) =>
  s !== null && /^[1-9]\d{0,9}$/.test(s) ? Number(s) : undefined;

/** Halaman + parameter → alamat, mis. ("npr-detail", 12) → "/npr/12". */
export function keAlamat(page: Page, param?: string | number): string {
  const dasar = ALAMAT[page];
  if (page === "npr-detail" || page === "gamas-detail")
    return `${dasar}/${param ?? ""}`;
  const nama = NAMA_PARAM[page];
  if (nama && param !== undefined && param !== "")
    return `${dasar}?${new URLSearchParams({ [nama]: String(param) })}`;
  return dasar;
}

/** Alamat → halaman + parameter. Alamat yang tidak dikenal → null. */
export function dariAlamat(pathname: string, search: string): Lokasi | null {
  const bagian = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const q = new URLSearchParams(search);
  if (bagian.length === 0) return { page: "dashboard" };

  const [utama, kedua] = bagian;
  if (bagian.length === 2) {
    if (utama === "npr" && kedua === "baru") return { page: "npr-baru" };
    const id = idValid(kedua);
    if (id === undefined) return null;
    if (utama === "npr") return { page: "npr-detail", param: id };
    if (utama === "gamas") return { page: "gamas-detail", param: id };
    return null;
  }
  if (bagian.length > 2) return null;

  const page = (Object.keys(ALAMAT) as Page[]).find(
    (p) =>
      ALAMAT[p] === `/${utama}` && p !== "npr-detail" && p !== "gamas-detail",
  );
  if (!page) return null;
  const nama = NAMA_PARAM[page];
  const nilai = nama ? q.get(nama) : null;
  if (!nama || !nilai) return { page };
  // Remote memakai id customer (angka); lainnya teks apa adanya.
  if (page === "remote") return { page, param: idValid(nilai) };
  return { page, param: nilai };
}

/** Lokasi dari alamat yang sedang dibuka. */
export const lokasiSekarang = () =>
  dariAlamat(window.location.pathname, window.location.search);
