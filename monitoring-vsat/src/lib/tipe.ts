// Bentuk data dari server. Nama kolom mengikuti respons /api/*.
import type { Peran } from "@/peran";

export type User = {
  id: number;
  username: string;
  full_name: string;
  peran: Peran;
};
export type Customer = {
  id: number;
  name: string;
  code: string;
  remote_count: number;
  npr_aktif: number;
  npr_bulan_ini: number;
};
export type Remote = {
  id: number;
  customer_id: number;
  site_id: string;
  location: string;
  address: string;
  city: string;
  province: string;
  jarkom: string;
  ip_lan: string;
  pic_name: string;
  pic_phone: string;
  customer_name?: string;
  npr_aktif?: number;
  npr_bulan_ini?: number;
  // NPR terakhir di site ini (kosong jika belum pernah ada).
  npr_terakhir_number?: string | null;
  npr_terakhir_status?: string | null;
  npr_terakhir_gangguan?: string | null;
  npr_terakhir_mulai?: string | null;
  npr_terakhir_online?: string | null;
};
// Baris NPR dari server, sudah digabung dengan data site, customer, dan TT.
export type NprRow = {
  id: number;
  number: string;
  remote_id: number;
  remote_status: string;
  status: string;
  pending_by: string;
  started_at: string;
  online_at: string | null;
  closed_at: string | null;
  created_by: string;
  last_action: string;
  site_id: string;
  location: string;
  jarkom: string;
  customer_id: number;
  customer_name: string;
  ticket_number: string | null;
  ticket_report: string | null;
};
export type Action = {
  id: number;
  npr_id: number;
  kind: string;
  notes: string;
  remote_status: string;
  pending_by: string;
  occurred_at: string;
  created_by: string;
  attachment_name: string;
};
export type Ticket = {
  id: number;
  npr_id: number;
  number: string;
  instruction: string;
  notes: string;
  created_at: string;
  report: string;
  technician: string;
};
export type TicketRow = Ticket &
  Pick<
    Remote,
    | "site_id"
    | "location"
    | "address"
    | "city"
    | "province"
    | "jarkom"
    | "ip_lan"
    | "pic_name"
    | "pic_phone"
  > & {
    npr_number: string;
    customer_name: string;
    npr_status: string;
    remote_status: string;
    npr_started_at: string;
  };
export type Gamas = {
  id: number;
  number: string;
  location: string;
  notes: string;
  started_at: string;
  online_at: string | null;
  closed_at: string | null;
  status: string;
  report: string;
  site_count?: number;
  site_ids?: string | null;
};
export type GamasAction = {
  id: number;
  gamas_id: number;
  notes: string;
  report?: string;
  created_at: string;
  created_by: string;
};
export type GamasDetail = {
  gamas: Gamas;
  sites: Remote[];
  actions: GamasAction[];
};
export type NprDetail = {
  npr: NprRow;
  remote: Remote;
  ticket: Ticket | null;
  actions: Action[];
};
export type Dashboard = {
  ringkas: Record<string, number>;
  grafik: { hari: string; jumlah: number }[];
  gamas_aktif: (Pick<
    Gamas,
    "id" | "number" | "location" | "status" | "started_at"
  > & { site_count: number })[];
  npr_terlama: NprRow[];
};
export type SlaRow = {
  remote_id: number;
  site_id: string;
  location: string;
  customer_name: string;
  total_minutes: number;
  downtime_minutes: number;
  sla: number | null;
};
export type Sla = { rows: SlaRow[]; target: number; month: string };
export type Akun = {
  id: number;
  username: string;
  full_name: string;
  peran: Peran;
  aktif: number;
  created_at: string;
  npr_dicatat: number;
  tt_dibuat: number;
  tindakan_bulan_ini: number;
  tindakan_terakhir_jenis: string | null;
  tindakan_terakhir_ref: string | null;
  tindakan_terakhir_at: string | null;
};

export const JENIS_GANGGUAN = [
  "ATM Offline",
  "Remote Down",
  "Remote Idle",
  "Relokasi",
  "Reposisi",
  "Maintenance",
  "Preventive Maintenance",
  "Other",
];

/** "2026-11-25T09:05" (WIB, dari isian) → ISO UTC untuk server. */
export const keIso = (wib: string) => new Date(wib + ":00+07:00").toISOString();

/** Waktu sekarang menurut WIB, format "YYYY-MM-DDTHH:MM". */
export const sekarangWib = () =>
  new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16);

/** Unduh baris data sebagai CSV (Excel membaca UTF-8 dengan BOM). */
export function unduhCsv(
  nama: string,
  baris: (string | number | null | undefined)[][],
) {
  const isi =
    "﻿" +
    baris
      .map((row) =>
        row
          .map((v) => {
            const s = String(v ?? "");
            // Cegah formula injection saat dibuka di Excel.
            return (
              '"' +
              (/^[=+@\-\t\r]/.test(s) ? "'" : "") +
              s.replaceAll('"', '""') +
              '"'
            );
          })
          .join(","),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([isi], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  a.click();
  URL.revokeObjectURL(url);
}
