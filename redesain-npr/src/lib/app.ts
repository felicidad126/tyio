import { createContext, useContext } from "react";

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
  param?: string | number;
  go: (page: Page, param?: string | number) => void;
  // Prototipe: tampilkan data contoh atau keadaan kosong.
  kosong: boolean;
};

export const AppCtx = createContext<AppState>({
  page: "dashboard",
  go: () => {},
  kosong: false,
});
export const useApp = () => useContext(AppCtx);
