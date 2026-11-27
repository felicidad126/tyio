// Keadaan aplikasi yang dipakai bersama oleh semua halaman.
import { createContext, useContext } from "react";
import type { Api } from "@/useMuat";
import type { User } from "@/lib/tipe";

export type Page =
  | "dashboard"
  | "npr"
  | "npr-baru"
  | "npr-detail"
  | "tt"
  | "gamas"
  | "gamas-detail"
  | "sla"
  | "customer"
  | "remote"
  | "pengguna";

export type AppState = {
  page: Page;
  /** Parameter halaman: id NPR/Gamas, kondisi filter dari Dashboard, atau id customer. */
  param?: string | number;
  go: (page: Page, param?: string | number) => void;
  /** Ganti parameter halaman ini (mis. filter) tanpa menambah riwayat Back. */
  gantiParam: (param?: string | number) => void;
  user: User;
  api: Api;
  /** Naik setiap ada data yang disimpan; halaman memuat ulang datanya. */
  versi: number;
  /**
   * Kirim data ke server. Menampilkan pesan berhasil/gagal, menaikkan versi,
   * dan mengembalikan hasilnya (atau undefined jika gagal).
   */
  kirim: <T = { id?: number }>(
    path: string,
    body: unknown,
    pesan: string,
  ) => Promise<T | undefined>;
  sibuk: boolean;
  /** Tampilkan pesan galat (mis. PDF gagal dibuat). */
  galat: (pesan: string) => void;
};

export const AppCtx = createContext<AppState | null>(null);
export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp dipakai di luar AppCtx.");
  return ctx;
}
