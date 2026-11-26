import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";
import { bulanWIB } from "../shared/waktu";
import { Field } from "./komponen";
import { GantiPassword, HalamanPengguna } from "./Pengguna";
import { namaPeran, type Peran } from "./peran";
import { useMuat, useTunda } from "./useMuat";
import logoTm from "./aset/logo-tm.png";
import { pdfGamas, pdfTicket, type DataTicket } from "./pdf";

type User = { id: number; username: string; full_name: string; peran: Peran };
type Customer = {
  id: number;
  name: string;
  code: string;
  remote_count: number;
};
type Remote = {
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
};
// Baris NPR dari server, sudah digabung dengan data site, customer, dan TT.
type NprRow = {
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
type Action = {
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
type Ticket = {
  id: number;
  npr_id: number;
  number: string;
  instruction: string;
  notes: string;
  created_at: string;
  report: string;
  technician: string;
};
// Data lengkap yang dibutuhkan untuk PDF TT.
type TicketPdf = Ticket &
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
  > & { npr_number: string; customer_name: string };
type TicketRow = TicketPdf & { npr_status: string };
type Gamas = {
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
};
type GamasAction = {
  id: number;
  gamas_id: number;
  notes: string;
  report?: string;
  created_at: string;
  created_by: string;
};
type GamasDetail = { gamas: Gamas; sites: Remote[]; actions: GamasAction[] };
type NprDetail = {
  npr: NprRow;
  remote: Remote;
  ticket: Ticket | null;
  actions: Action[];
};
type Dashboard = {
  ringkas: Record<string, number>;
  grafik: { hari: string; jumlah: number }[];
  gamas_aktif: Pick<Gamas, "id" | "number" | "location" | "status">[];
  npr_terlama: NprRow[];
};
type SlaRow = {
  remote_id: number;
  site_id: string;
  location: string;
  customer_name: string;
  total_minutes: number;
  downtime_minutes: number;
  sla: number | null;
};
type Page =
  | "Dashboard"
  | "NPR"
  | "NPR Baru"
  | "Trouble Ticket"
  | "TT Gamas"
  | "Laporan SLA"
  | "Customer"
  | "Remote"
  | "Pengguna";
const cases = [
  "ATM Offline",
  "Remote Down",
  "Remote Idle",
  "Relokasi",
  "Reposisi",
  "Maintenance",
  "Preventive Maintenance",
  "Other",
];
// "NPR Baru" dibuka dari tombol di daftar NPR, jadi tidak tampil di menu.
const menu: { page: Page; icon: string }[] = [
  { page: "Dashboard", icon: "◈" },
  { page: "NPR", icon: "▤" },
  { page: "Trouble Ticket", icon: "↗" },
  { page: "TT Gamas", icon: "◎" },
  { page: "Laporan SLA", icon: "◷" },
  { page: "Customer", icon: "▦" },
  { page: "Remote", icon: "⌖" },
  { page: "Pengguna", icon: "◉" },
];
// Filter daftar NPR yang dibuka dari kartu dan tautan di Dashboard.
const kondisiNpr: Record<string, string> = {
  aktif: "NPR aktif",
  kritis: "Kritis >48 jam",
  aging: "Berjalan 24–48 jam",
  menunggu_report: "Menunggu report teknisi",
  pending_tm: "Pending TM",
  pending_customer: "Pending Customer",
  belum_kategori: "Belum dikategorikan",
};
function localNow() {
  return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
}
function dateText(value?: string | null) {
  return value
    ? new Date(value).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      })
    : "—";
}
function iso(value: string) {
  return new Date(value + ":00+07:00").toISOString();
}
// Lama gangguan berjalan, mis. "2 hari 5 jam".
function lamaBerjalan(mulai: string, sekarang: number) {
  const jam = Math.max(0, Math.floor((sekarang - Date.parse(mulai)) / 3600000));
  const hari = Math.floor(jam / 24);
  return hari ? `${hari} hari ${jam % 24} jam` : `${jam} jam`;
}
function Status({ value }: { value: string }) {
  return (
    <span className={`status status-${value?.toLowerCase()}`}>
      {value || "OPEN"}
    </span>
  );
}
function csv(name: string, rows: (string | number)[][]) {
  const text =
    "﻿" +
    rows
      .map((row) =>
        row
          .map((v) => {
            const s = String(v ?? "");
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
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState<Page>("Dashboard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [dialogText, setDialogText] = useState("");
  const loginDialog = useRef<HTMLDialogElement>(null);
  const [modal, setModal] = useState<"customer" | "remote" | "gamas" | null>(
    null,
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedGamas, setSelectedGamas] = useState<number | null>(null);
  const [kind, setKind] = useState("Problem");
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [kondisi, setKondisi] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rowPage, setRowPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [newCustomer, setNewCustomer] = useState("");
  const [newJarkom, setNewJarkom] = useState("VSAT");
  const [newRemote, setNewRemote] = useState("");
  const [newCase, setNewCase] = useState("Remote Down");
  const [slaMonth, setSlaMonth] = useState(() => bulanWIB());
  const [closeGamas, setCloseGamas] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Menu samping di layar sempit (HP) dibuka lewat tombol ☰.
  const [menuBuka, setMenuBuka] = useState(false);
  // Dinaikkan setelah ada data yang disimpan, supaya tampilan memuat ulang.
  const [versi, setVersi] = useState(0);
  const [versiMaster, setVersiMaster] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Dibungkus useCallback supaya fungsi ini tetap sama di setiap render dan
  // aman dipakai sebagai dependensi useEffect.
  const api = useCallback(
    async <T,>(path: string, body?: unknown): Promise<T> => {
      const response = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        headers:
          body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401 && path !== "/api/login") setUser(null);
        throw new Error(result.message || "Permintaan gagal diproses.");
      }
      return result as T;
    },
    [],
  );
  useEffect(() => {
    let alive = true;
    fetch("/api/me")
      .then(async (r) => {
        if (r.status === 401) return;
        if (!r.ok) throw new Error("Tidak dapat memeriksa sesi.");
        const result = await r.json();
        if (alive) setUser(result.user);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Setiap halaman hanya memuat data yang ditampilkannya.
  const lihatDetail = selected !== null || selectedGamas !== null;
  const cariTunda = useTunda(search);
  const butuhMaster =
    !!user &&
    (["NPR", "NPR Baru", "Customer", "Remote"].includes(page) ||
      modal !== null);
  const master = useMuat<{ customers: Customer[]; remotes: Remote[] }>(
    butuhMaster ? "/api/master" : null,
    api,
    versiMaster,
  );
  const customers = master.data?.customers ?? [];
  const remotes = master.data?.remotes ?? [];

  const nprQuery = new URLSearchParams({
    halaman: String(rowPage),
    per: String(perPage),
    ...(cariTunda && { cari: cariTunda }),
    ...(customerFilter && { customer: customerFilter }),
    ...(statusFilter && { status: statusFilter }),
    ...(kondisi && { kondisi, urut: "terlama" }),
    ...(from && { dari: from }),
    ...(to && { sampai: to }),
  }).toString();
  const nprList = useMuat<{ rows: NprRow[]; total: number }>(
    user && page === "NPR" && !lihatDetail ? `/api/nprs?${nprQuery}` : null,
    api,
    versi,
  );
  const detail = useMuat<NprDetail>(
    user && selected !== null ? `/api/nprs/${selected}` : null,
    api,
    versi,
  );
  const gamasDetail = useMuat<GamasDetail>(
    user && selectedGamas !== null ? `/api/gamas/${selectedGamas}` : null,
    api,
    versi,
  );
  const dashboard = useMuat<Dashboard>(
    user && page === "Dashboard" && !lihatDetail ? "/api/dashboard" : null,
    api,
    versi,
  );
  const tickets = useMuat<{ rows: TicketRow[] }>(
    user && page === "Trouble Ticket" && !lihatDetail
      ? `/api/tickets?cari=${encodeURIComponent(cariTunda)}`
      : null,
    api,
    versi,
  );
  const gamasList = useMuat<{ rows: Gamas[] }>(
    user && page === "TT Gamas" && !lihatDetail ? "/api/gamas" : null,
    api,
    versi,
  );
  const sla = useMuat<{ rows: SlaRow[]; target: number; month: string }>(
    user && page === "Laporan SLA" ? `/api/sla?month=${slaMonth}` : null,
    api,
    versi,
  );
  const loadError =
    master.error ||
    nprList.error ||
    detail.error ||
    gamasDetail.error ||
    dashboard.error ||
    tickets.error ||
    gamasList.error ||
    sla.error;

  function go(next: Page) {
    setPage(next);
    setMenuBuka(false);
    setSelected(null);
    setSelectedGamas(null);
    setCloseGamas(false);
    setSearch("");
    setCustomerFilter("");
    setStatusFilter("");
    setKondisi("");
    setFrom("");
    setTo("");
    setRowPage(1);
    setError("");
    setNotice("");
  }
  // Membuka daftar NPR yang sudah tersaring dari Dashboard.
  function bukaDaftar(namaKondisi: string) {
    go("NPR");
    setKondisi(namaKondisi);
  }
  function bukaNpr(id: number) {
    setPage("NPR");
    setSelectedGamas(null);
    setSelected(id);
    setKind("Problem");
    setError("");
    setNotice("");
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>("/api/login", {
        username: username.trim(),
        password,
      });
      setUser(result.user);
      setPassword("");
    } catch (e) {
      setDialogText((e as Error).message);
      loginDialog.current?.showModal();
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api("/api/logout", {});
      setUser(null);
      go("Dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function mutate<T = { id?: number }>(
    path: string,
    body: unknown,
    success: string,
    after?: (result: T) => void,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<T>(path, body);
      setVersi((v) => v + 1);
      setNotice(success);
      after?.(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const customerName = (id?: number) =>
    customers.find((c) => c.id === id)?.name;
  const picked = remotes.find((r) => r.id === Number(newRemote));
  const pageCount = Math.max(
    1,
    Math.ceil((nprList.data?.total ?? 0) / perPage),
  );

  async function exportNpr() {
    try {
      const params = new URLSearchParams(nprQuery);
      params.set("ekspor", "1");
      const { rows } = await api<{ rows: NprRow[] }>(`/api/nprs?${params}`);
      csv("Laporan-NPR.csv", [
        [
          "No NPR",
          "No TT",
          "Customer",
          "Site ID",
          "Lokasi",
          "Jarkom",
          "Jenis Gangguan",
          "Status",
          "Pending oleh",
          "Mulai WIB",
          "Online WIB",
          "Catatan Terakhir",
        ],
        ...rows.map((n) => [
          n.number,
          n.ticket_number || "",
          n.customer_name,
          n.site_id,
          n.location,
          n.jarkom,
          n.remote_status,
          n.status,
          n.pending_by || "",
          dateText(n.started_at),
          dateText(n.online_at),
          n.last_action || "",
        ]),
      ]);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function ticketPdf(t: DataTicket) {
    pdfTicket(t, user?.full_name ?? "").catch(() =>
      setError("PDF gagal dibuat. Silakan coba unduh kembali."),
    );
  }
  function gamasPdf({ gamas, sites }: GamasDetail) {
    pdfGamas({ ...gamas, sites }, user?.full_name ?? "").catch(() =>
      setError("PDF gagal dibuat. Silakan coba unduh kembali."),
    );
  }
  async function gamasPdfDariDaftar(id: number) {
    try {
      gamasPdf(await api<GamasDetail>(`/api/gamas/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  // Isi lampiran baru diambil dari server saat tautannya diklik.
  async function unduhLampiran(a: Action) {
    try {
      const file = await api<{ name: string; data: string }>(
        `/api/lampiran/${a.id}`,
      );
      const link = document.createElement("a");
      link.href = file.data;
      link.download = file.name;
      link.click();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function attachment(file: File | null) {
    if (!file || !file.size) return {};
    if (file.size > 500 * 1024)
      throw new Error("Ukuran lampiran maksimal 500 KB.");
    if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type))
      throw new Error("Lampiran harus PNG, JPG, atau PDF.");
    const result = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return { attachment_name: file.name, attachment_data: result };
  }
  async function saveAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected === null) return;
    const form = event.currentTarget;
    const f = new FormData(form);
    try {
      const file = f.get("attachment");
      const attached = await attachment(file instanceof File ? file : null);
      await mutate(
        `/api/nprs/${selected}/actions`,
        {
          kind,
          notes: f.get("notes"),
          remote_status: f.get("remote_status"),
          pending_by: f.get("pending_by"),
          occurred_at: iso(String(f.get("occurred_at"))),
          ...(f.get("online_at")
            ? { online_at: iso(String(f.get("online_at"))) }
            : {}),
          instruction: f.get("instruction") || undefined,
          technician: f.get("technician") || undefined,
          ...attached,
        },
        kind === "Eskalasi Service"
          ? "TT berhasil dibuat. PDF dapat diunduh dari bagian Trouble Ticket di bawah."
          : "Tindakan berhasil disimpan.",
        () => {
          form.reset();
          setKind("Problem");
        },
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const filters = (
    <div className="filters">
      <input
        aria-label="Cari tiket"
        placeholder="Cari NPR, TT, site, atau lokasi…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setRowPage(1);
        }}
      />
      <select
        aria-label="Filter customer"
        value={customerFilter}
        onChange={(e) => {
          setCustomerFilter(e.target.value);
          setRowPage(1);
        }}
      >
        <option value="">Semua customer</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter status"
        value={statusFilter}
        onChange={(e) => {
          setStatusFilter(e.target.value);
          setRowPage(1);
        }}
      >
        <option value="">Semua status</option>
        {["OPEN", "PENDING", "ESKALASI", "CLOSED"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <input
        type="date"
        aria-label="Dari tanggal"
        title="Dari tanggal mulai gangguan"
        value={from}
        onChange={(e) => {
          setFrom(e.target.value);
          setRowPage(1);
        }}
      />
      <input
        type="date"
        aria-label="Sampai tanggal"
        title="Sampai tanggal mulai gangguan"
        value={to}
        min={from}
        onChange={(e) => {
          setTo(e.target.value);
          setRowPage(1);
        }}
      />
    </div>
  );
  const nprRows = nprList.data?.rows ?? [];
  const nprTable = (
    <>
      <div className="table-scroll">
        <table className="tabel-kartu">
          <thead>
            <tr>
              <th>No. NPR / TT</th>
              <th>Customer / Remote</th>
              <th>Gangguan</th>
              <th>Mulai · WIB</th>
              <th>Status</th>
              <th>Pending</th>
              <th>Tindakan terakhir</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {nprRows.map((n) => (
              <tr key={n.id}>
                <td data-label="No. NPR / TT">
                  <strong className="mono">{n.number}</strong>
                  <small>{n.ticket_number || "Belum ada TT"}</small>
                </td>
                <td data-label="Customer / Remote">
                  <strong>{n.customer_name}</strong>
                  <small>
                    {n.site_id} · {n.location}
                  </small>
                </td>
                <td data-label="Gangguan">
                  {n.remote_status}
                  <small>{n.jarkom}</small>
                </td>
                <td data-label="Mulai · WIB">{dateText(n.started_at)}</td>
                <td data-label="Status">
                  <Status value={n.status} />
                </td>
                <td data-label="Pending">{n.pending_by || "—"}</td>
                <td data-label="Tindakan terakhir" className="notes-cell">
                  {n.last_action || "—"}
                </td>
                <td data-label="">
                  <button className="text-button" onClick={() => bukaNpr(n.id)}>
                    Detail →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!nprRows.length && (
          <div className="empty">
            {nprList.loading
              ? "Memuat daftar NPR…"
              : "Tidak ada NPR yang sesuai dengan pencarian."}
          </div>
        )}
      </div>
      <div className="pagination">
        <span>{nprList.data?.total ?? 0} NPR ditemukan</span>
        <select
          aria-label="Jumlah baris"
          value={perPage}
          onChange={(e) => {
            setPerPage(Number(e.target.value));
            setRowPage(1);
          }}
        >
          {[10, 25, 50].map((n) => (
            <option key={n} value={n}>
              {n} baris
            </option>
          ))}
        </select>
        <button
          disabled={rowPage <= 1}
          onClick={() => setRowPage((v) => v - 1)}
          aria-label="Halaman sebelumnya"
        >
          ←
        </button>
        <span>
          {Math.min(rowPage, pageCount)} / {pageCount}
        </span>
        <button
          disabled={rowPage >= pageCount}
          onClick={() => setRowPage((v) => v + 1)}
          aria-label="Halaman berikutnya"
        >
          →
        </button>
      </div>
    </>
  );

  if (checking)
    return <div className="loading-screen">Memeriksa sesi login…</div>;
  if (!user)
    return (
      <main className="login-page">
        <div className="login-layout">
          <section className="intro">
            <div className="brand">
              <span className="logo-tile">
                <img src={logoTm} alt="Logo PT. Tangara Mitrakom" />
              </span>
              <div>
                <strong>Network Problem Report</strong>
                <span>PT. Tangara Mitrakom</span>
              </div>
            </div>
            <span className="intro-label">Helpdesk VSAT & M2M</span>
            <h1>
              Pantau gangguan.
              <br />
              Catat penanganan.
            </h1>
            <p className="intro-description">
              Kelola NPR, tiket kunjungan teknisi, dan riwayat penanganan
              jaringan ATM dalam satu sistem.
            </p>
            <div className="feature-list">
              <span>01 / Pencatatan NPR</span>
              <span>02 / Trouble Ticket</span>
              <span>03 / Laporan & SLA</span>
            </div>
          </section>
          <section className="login-card">
            <span className="eyebrow">AKSES HELPDESK</span>
            <h2>Selamat datang</h2>
            <p>Masuk menggunakan akun helpdesk Anda.</p>
            {error && <div className="alert error">{error}</div>}
            <form onSubmit={login}>
              <Field label="Username">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  maxLength={100}
                  disabled={busy}
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  maxLength={256}
                  disabled={busy}
                />
              </Field>
              <button className="primary login-button" disabled={busy}>
                {busy ? "Memeriksa akun…" : "Masuk"}
              </button>
            </form>
          </section>
        </div>
        <footer className="page-footer">
          Proyek Kerja Praktek, Universitas Dian Nusantara
        </footer>
        <dialog
          ref={loginDialog}
          className="error-dialog"
          aria-labelledby="login-error-title"
          aria-describedby="login-error-text"
        >
          <div className="error-cross">×</div>
          <h2 id="login-error-title">Login Gagal</h2>
          <p id="login-error-text">{dialogText}</p>
          <form method="dialog">
            <button className="primary" autoFocus>
              OK
            </button>
          </form>
        </dialog>
      </main>
    );

  const ringkas = dashboard.data?.ringkas ?? {};
  const grafik = dashboard.data?.grafik ?? [];
  const grafikMax = Math.max(1, ...grafik.map((g) => g.jumlah));
  const nprDetail = detail.data;
  const current = nprDetail?.npr;
  const currentRemote = nprDetail?.remote;
  const currentTicket = nprDetail?.ticket ?? null;
  const currentGamas = gamasDetail.data?.gamas;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuBuka ? "buka" : ""}`}>
        <div className="side-brand">
          <span className="logo-tile">
            <img src={logoTm} alt="Logo PT. Tangara Mitrakom" />
          </span>
          <div>
            <strong>NPR</strong>
            <small>PT. Tangara Mitrakom</small>
          </div>
          <button
            className="menu-toggle"
            aria-expanded={menuBuka}
            aria-controls="menu-utama"
            onClick={() => setMenuBuka((v) => !v)}
          >
            <span aria-hidden="true">{menuBuka ? "✕" : "☰"}</span> Menu
          </button>
        </div>
        <div className="side-caption">WORKSPACE HELPDESK</div>
        <nav id="menu-utama" aria-label="Menu utama">
          {menu
            .filter((m) => m.page !== "Pengguna" || user.peran === "admin")
            .map((m) => (
              <button
                className={
                  page === m.page || (m.page === "NPR" && page === "NPR Baru")
                    ? "active"
                    : ""
                }
                key={m.page}
                onClick={() => go(m.page)}
              >
                <span>{m.icon}</span>
                {m.page}
              </button>
            ))}
        </nav>
        <div className="side-bottom">
          <span className="online-dot" /> Helpdesk VSAT & M2M
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Network Problem Report <span className="top-separator">/</span>{" "}
            <strong>{page}</strong>
          </span>
          <div className="account">
            <span className="avatar">
              {user.full_name
                .split(" ")
                .map((s) => s[0])
                .join("")
                .slice(0, 2)}
            </span>
            <span>
              {user.full_name}
              <small>{namaPeran[user.peran]}</small>
            </span>
            <button onClick={() => setShowPassword(true)} className="ghost">
              Ganti password
            </button>
            <button onClick={logout} disabled={busy} className="ghost">
              Keluar
            </button>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">OPERASIONAL JARINGAN ATM</span>
              <h1>
                {selected
                  ? "Detail & Tindak Lanjut NPR"
                  : selectedGamas
                    ? "Detail Gangguan Massal"
                    : page === "NPR"
                      ? "Daftar NPR"
                      : page}
              </h1>
              <p>
                {page === "Dashboard"
                  ? "Ringkasan gangguan dan perkembangan penanganan jaringan."
                  : "Pencatatan terpusat untuk pekerjaan helpdesk."}
              </p>
            </div>
          </div>
          {(error || loadError) && (
            <div className="alert error" role="alert">
              {error || loadError}
              <button onClick={() => setError("")} aria-label="Tutup pesan">
                ×
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Tutup pesan">
                ×
              </button>
            </div>
          )}

          {selected !== null ? (
            !current || !currentRemote || current.id !== selected ? (
              <div className="empty">Memuat NPR…</div>
            ) : (
              <>
                <button
                  className="text-button back"
                  onClick={() => setSelected(null)}
                >
                  ← Kembali ke daftar
                </button>
                <section className="panel">
                  <div className="panel-title">
                    <div>
                      <span className="eyebrow">NETWORK PROBLEM REPORT</span>
                      <h2 className="mono">{current.number}</h2>
                    </div>
                    <Status value={current.status} />
                  </div>
                  <div className="info-grid">
                    {[
                      ["Customer", currentRemote.customer_name],
                      [
                        "Site / Lokasi",
                        `${currentRemote.site_id} · ${currentRemote.location}`,
                      ],
                      [
                        "Alamat",
                        `${currentRemote.address}, ${currentRemote.city}, ${currentRemote.province}`,
                      ],
                      [
                        "Jarkom / IP LAN",
                        `${currentRemote.jarkom} / ${currentRemote.ip_lan}`,
                      ],
                      [
                        "PIC / Kontak",
                        `${currentRemote.pic_name} / ${currentRemote.pic_phone}`,
                      ],
                      [
                        "Mulai / Kembali online",
                        `${dateText(current.started_at)} / ${dateText(current.online_at)}`,
                      ],
                      ["Jenis Gangguan", current.remote_status],
                      [
                        "Pending oleh",
                        current.pending_by || "Belum dikategorikan",
                      ],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <small>{k}</small>
                        <strong>{v}</strong>
                      </div>
                    ))}
                  </div>
                </section>
                {currentTicket && (
                  <section className="panel">
                    <div className="panel-title">
                      <div>
                        <h2>Trouble Ticket</h2>
                        <span className="mono">{currentTicket.number}</span>
                      </div>
                      <button
                        onClick={() =>
                          ticketPdf({
                            ...currentRemote,
                            ...currentTicket,
                            npr_number: current.number,
                            remote_status: current.remote_status,
                            npr_started_at: current.started_at,
                            customer_name: currentRemote.customer_name ?? "",
                          })
                        }
                      >
                        Unduh PDF TT
                      </button>
                    </div>
                    <div className="info-grid">
                      <div>
                        <small>Instruksi</small>
                        <strong>{currentTicket.instruction}</strong>
                      </div>
                      <div>
                        <small>Catatan NOC</small>
                        <strong>{currentTicket.notes}</strong>
                      </div>
                      <div>
                        <small>Teknisi</small>
                        <strong>
                          {currentTicket.technician || "Belum dilaporkan"}
                        </strong>
                      </div>
                      <div>
                        <small>Report Teknisi</small>
                        <strong>
                          {currentTicket.report || "Menunggu report teknisi"}
                        </strong>
                      </div>
                    </div>
                  </section>
                )}
                <section className="panel">
                  <div className="panel-title">
                    <h2>Riwayat tindakan</h2>
                    <span className="muted">Urutan waktu pencatatan</span>
                  </div>
                  <div className="timeline">
                    {nprDetail.actions.map((a) => (
                      <article key={a.id}>
                        <span className="timeline-dot" />
                        <div className="timeline-heading">
                          <strong>{a.kind}</strong>
                          <small>
                            {dateText(a.occurred_at)} · {a.created_by}
                          </small>
                        </div>
                        <p>{a.notes}</p>
                        <small>
                          {a.remote_status}{" "}
                          {a.pending_by && `· Pending ${a.pending_by}`}
                        </small>
                        {a.attachment_name && (
                          <button
                            className="attachment text-button"
                            onClick={() => void unduhLampiran(a)}
                          >
                            ↓ {a.attachment_name}
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
                {current.status !== "CLOSED" && (
                  <section className="panel">
                    <h2>Tambah tindakan</h2>
                    <form
                      onSubmit={saveAction}
                      key={`${current.id}-${nprDetail.actions.length}`}
                    >
                      <fieldset disabled={busy}>
                        <div className="form-grid">
                          <Field label="Tindakan">
                            <select
                              value={kind}
                              onChange={(e) => setKind(e.target.value)}
                            >
                              <option>Problem</option>
                              {!currentTicket && (
                                <option>Eskalasi Service</option>
                              )}
                              {currentTicket && <option>Report Teknisi</option>}
                              <option>Close</option>
                            </select>
                          </Field>
                          <Field label="Status remote">
                            <select
                              name="remote_status"
                              defaultValue={current.remote_status}
                            >
                              {cases.map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Waktu tindakan">
                            <input
                              type="datetime-local"
                              name="occurred_at"
                              defaultValue={localNow()}
                              required
                            />
                          </Field>
                          <Field label="Pending oleh">
                            <select
                              name="pending_by"
                              defaultValue={current.pending_by}
                              required={kind === "Problem"}
                            >
                              <option value="">
                                {kind === "Problem"
                                  ? "Pilih kategori"
                                  : "Belum dikategorikan"}
                              </option>
                              <option value="Customer">Pending Customer</option>
                              <option value="TM">Pending TM</option>
                            </select>
                          </Field>
                          {kind === "Eskalasi Service" && (
                            <>
                              <div className="form-note wide">
                                Form Trouble Ticket · Nomor TT dibuat otomatis
                                ketika dikirim. Catatan berikut diisi
                                berdasarkan hasil pengecekan NOC.
                              </div>
                              <Field label="Instruksi">
                                <select name="instruction">
                                  <option>Maintenance</option>
                                  <option>Preventive Maintenance</option>
                                </select>
                              </Field>
                              <Field label="No. Referensi NPR">
                                <input value={current.number} readOnly />
                              </Field>
                            </>
                          )}
                          {kind === "Report Teknisi" && (
                            <Field label="Nama teknisi">
                              <input
                                name="technician"
                                required
                                maxLength={120}
                              />
                            </Field>
                          )}
                          {kind === "Close" && (
                            <>
                              <Field label="Waktu jaringan kembali online / pekerjaan selesai">
                                <input
                                  type="datetime-local"
                                  name="online_at"
                                  required
                                  defaultValue={localNow()}
                                />
                              </Field>
                              <div className="form-note">
                                {currentTicket
                                  ? "NPR dengan TT hanya dapat ditutup setelah report teknisi dicatat."
                                  : "NPR tanpa TT dapat ditutup setelah kondisi lokasi dipastikan normal."}
                              </div>
                            </>
                          )}
                          <Field
                            label={
                              kind === "Eskalasi Service"
                                ? "Catatan problem dari NOC"
                                : kind === "Report Teknisi"
                                  ? "Report teknisi"
                                  : "Catatan tindakan"
                            }
                            wide
                          >
                            <textarea
                              name="notes"
                              required
                              rows={4}
                              maxLength={4000}
                            />
                          </Field>
                          <Field
                            label="Lampiran opsional · JPG, PNG, PDF · maks. 500 KB"
                            wide
                          >
                            <input
                              name="attachment"
                              type="file"
                              accept="image/png,image/jpeg,application/pdf"
                            />
                          </Field>
                        </div>
                        <div className="form-footer">
                          <button
                            className="primary"
                            disabled={
                              kind === "Close" &&
                              !!currentTicket &&
                              !currentTicket.report
                            }
                          >
                            {busy
                              ? "Menyimpan…"
                              : kind === "Eskalasi Service"
                                ? "Kirim TT"
                                : "Simpan tindakan"}
                          </button>
                        </div>
                      </fieldset>
                    </form>
                  </section>
                )}
              </>
            )
          ) : selectedGamas !== null ? (
            !currentGamas || currentGamas.id !== selectedGamas ? (
              <div className="empty">Memuat TT Gamas…</div>
            ) : (
              <>
                <button
                  className="text-button back"
                  onClick={() => setSelectedGamas(null)}
                >
                  ← Kembali ke TT Gamas
                </button>
                <section className="panel">
                  <div className="panel-title">
                    <div>
                      <h2 className="mono">{currentGamas.number}</h2>
                      <p>{currentGamas.location}</p>
                    </div>
                    <button
                      onClick={() =>
                        gamasDetail.data && gamasPdf(gamasDetail.data)
                      }
                    >
                      Unduh PDF TT Gamas
                    </button>
                  </div>
                  <Status value={currentGamas.status} />
                  <p className="preserve">{currentGamas.notes}</p>
                  <div className="info-grid">
                    <div>
                      <small>Mulai gangguan</small>
                      <strong>{dateText(currentGamas.started_at)}</strong>
                    </div>
                    <div>
                      <small>Kembali online</small>
                      <strong>{dateText(currentGamas.online_at)}</strong>
                    </div>
                    <div>
                      <small>Remote terdampak</small>
                      <strong>
                        {gamasDetail.data?.sites
                          .map((r) => r.site_id)
                          .join(", ")}
                      </strong>
                    </div>
                    <div>
                      <small>Report teknisi</small>
                      <strong>
                        {currentGamas.report || "Belum ada report"}
                      </strong>
                    </div>
                  </div>
                </section>
                <section className="panel">
                  <h2>Riwayat penanganan</h2>
                  <div className="timeline">
                    {gamasDetail.data?.actions.map((a) => (
                      <article key={a.id}>
                        <span className="timeline-dot" />
                        <small>
                          {dateText(a.created_at)} · {a.created_by}
                        </small>
                        <p>{a.notes}</p>
                        {a.report && <p>Report teknisi: {a.report}</p>}
                      </article>
                    ))}
                  </div>
                </section>
                {!currentGamas.closed_at &&
                  currentGamas.status !== "CLOSED" && (
                    <section className="panel">
                      <h2>Perbarui penanganan Gamas</h2>
                      <form
                        key={`${currentGamas.id}-${gamasDetail.data?.actions.length}`}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void mutate(
                            `/api/gamas/${currentGamas.id}/actions`,
                            {
                              notes: f.get("notes"),
                              report: f.get("report") || undefined,
                              occurred_at: iso(String(f.get("occurred_at"))),
                              close: f.get("close") === "on",
                              ...(f.get("online_at")
                                ? {
                                    online_at: iso(String(f.get("online_at"))),
                                  }
                                : {}),
                            },
                            "Perkembangan Gamas berhasil disimpan.",
                            () => setCloseGamas(false),
                          );
                        }}
                      >
                        <fieldset disabled={busy}>
                          <div className="form-grid">
                            <Field label="Catatan perkembangan" wide>
                              <textarea name="notes" required rows={3} />
                            </Field>
                            <Field
                              label="Report teknisi · isi jika sudah diterima"
                              wide
                            >
                              <textarea name="report" rows={3} />
                            </Field>
                            <Field label="Waktu perkembangan">
                              <input
                                name="occurred_at"
                                type="datetime-local"
                                defaultValue={localNow()}
                                required
                              />
                            </Field>
                            <label className="check">
                              <input
                                type="checkbox"
                                name="close"
                                checked={closeGamas}
                                onChange={(e) =>
                                  setCloseGamas(e.target.checked)
                                }
                              />{" "}
                              Tutup TT Gamas (report teknisi harus sudah ada)
                            </label>
                            {closeGamas && (
                              <Field label="Waktu kembali online">
                                <input
                                  name="online_at"
                                  type="datetime-local"
                                  required
                                />
                              </Field>
                            )}
                          </div>
                          <div className="form-footer">
                            <button className="primary">
                              Simpan perkembangan
                            </button>
                          </div>
                        </fieldset>
                      </form>
                    </section>
                  )}
              </>
            )
          ) : (
            <>
              {page === "Dashboard" && (
                <>
                  <div className="stats-grid">
                    {[
                      [
                        "aktif",
                        "NPR Aktif",
                        "Seluruh gangguan yang belum ditutup",
                        "blue",
                      ],
                      [
                        "kritis",
                        "Kritis >48 jam",
                        "Perlu perhatian dan tindak lanjut",
                        "red",
                      ],
                      [
                        "aging",
                        "Berjalan 24–48 jam",
                        "Pantau perkembangan penanganan",
                        "amber",
                      ],
                      [
                        "menunggu_report",
                        "Menunggu report",
                        "TT belum memiliki report teknisi",
                        "green",
                      ],
                    ].map(([key, label, sub, color]) => (
                      <button
                        className={`stat-card ${color}`}
                        key={key}
                        onClick={() => bukaDaftar(key)}
                        aria-label={`${label}: ${ringkas[key] ?? 0}. Buka daftar`}
                      >
                        <span>{label}</span>
                        <strong>
                          {dashboard.data ? (ringkas[key] ?? 0) : "…"}
                        </strong>
                        <small>{sub}</small>
                      </button>
                    ))}
                  </div>
                  <section className="panel">
                    <div className="panel-title">
                      <h2>NPR aktif terlama</h2>
                      <button
                        className="text-button"
                        onClick={() => bukaDaftar("aktif")}
                      >
                        Lihat semua NPR aktif →
                      </button>
                    </div>
                    <div className="table-scroll">
                      <table className="tabel-kartu">
                        <thead>
                          <tr>
                            <th>No. NPR</th>
                            <th>Customer / Remote</th>
                            <th>Lama gangguan</th>
                            <th>Status</th>
                            <th>Pending</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboard.data?.npr_terlama.map((n) => (
                            <tr key={n.id}>
                              <td data-label="No. NPR">
                                <strong className="mono">{n.number}</strong>
                                <small>{n.remote_status}</small>
                              </td>
                              <td data-label="Customer / Remote">
                                <strong>{n.customer_name}</strong>
                                <small>
                                  {n.site_id} · {n.location}
                                </small>
                              </td>
                              <td data-label="Lama gangguan">
                                {lamaBerjalan(n.started_at, clock)}
                              </td>
                              <td data-label="Status">
                                <Status value={n.status} />
                              </td>
                              <td data-label="Pending">
                                {n.pending_by || "Belum dikategorikan"}
                              </td>
                              <td data-label="">
                                <button
                                  className="text-button"
                                  onClick={() => bukaNpr(n.id)}
                                >
                                  Detail →
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {dashboard.data && !dashboard.data.npr_terlama.length && (
                        <div className="empty">Tidak ada NPR aktif.</div>
                      )}
                    </div>
                  </section>
                  <div className="dashboard-grid">
                    <section className="panel">
                      <div className="panel-title">
                        <h2>Distribusi penanganan</h2>
                        <span className="muted">NPR aktif</span>
                      </div>
                      {[
                        ["pending_tm", "Pending TM"],
                        ["pending_customer", "Pending Customer"],
                        ["belum_kategori", "Belum dikategorikan"],
                      ].map(([key, label]) => (
                        <button
                          className="distribution"
                          key={key}
                          onClick={() => bukaDaftar(key)}
                        >
                          <span>{label}</span>
                          <strong>{ringkas[key] ?? 0}</strong>
                          <div>
                            <i
                              style={{
                                width: `${ringkas.aktif ? ((ringkas[key] ?? 0) / ringkas.aktif) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </button>
                      ))}
                    </section>
                    <section className="panel">
                      <div className="panel-title">
                        <h2>NPR masuk · 7 hari terakhir</h2>
                        <span className="muted">WIB</span>
                      </div>
                      <div className="bar-chart">
                        {grafik.map((g) => (
                          <div className="bar-item" key={g.hari}>
                            <strong>{g.jumlah}</strong>
                            <div className="bar-track">
                              <div
                                style={{
                                  height: `${(g.jumlah / grafikMax) * 100}%`,
                                }}
                              />
                            </div>
                            <small>
                              {new Date(
                                `${g.hari}T12:00:00+07:00`,
                              ).toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "short",
                                timeZone: "Asia/Jakarta",
                              })}
                            </small>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                  <section className="panel">
                    <div className="panel-title">
                      <h2>Gangguan massal aktif</h2>
                      <button
                        className="text-button"
                        onClick={() => go("TT Gamas")}
                      >
                        Kelola TT Gamas →
                      </button>
                    </div>
                    {dashboard.data?.gamas_aktif.length ? (
                      dashboard.data.gamas_aktif.map((g) => (
                        <button
                          className="gamas-summary"
                          key={g.id}
                          onClick={() => {
                            setPage("TT Gamas");
                            setSelectedGamas(g.id);
                          }}
                        >
                          <strong>{g.number}</strong>
                          <span>{g.location}</span>
                          <Status value={g.status} />
                        </button>
                      ))
                    ) : (
                      <div className="empty">
                        Tidak ada gangguan massal aktif.
                      </div>
                    )}
                  </section>
                </>
              )}

              {page === "NPR Baru" && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>Buat Network Problem Report</h2>
                    <span className="muted">
                      Pencatatan berdasarkan monitoring manual
                    </span>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void mutate(
                        "/api/nprs",
                        {
                          remote_id: Number(newRemote),
                          remote_status: newCase,
                          started_at: iso(String(f.get("started_at"))),
                          notes: f.get("notes"),
                        },
                        "NPR berhasil dibuat.",
                        () => {
                          go("NPR");
                          setNotice("NPR berhasil dibuat.");
                          setNewRemote("");
                        },
                      );
                    }}
                  >
                    <fieldset disabled={busy}>
                      <div className="form-grid three">
                        <Field label="Jarkom">
                          <select
                            value={newJarkom}
                            onChange={(e) => {
                              setNewJarkom(e.target.value);
                              setNewRemote("");
                            }}
                          >
                            <option>VSAT</option>
                            <option>M2M</option>
                          </select>
                        </Field>
                        <Field label="Customer">
                          <select
                            value={newCustomer}
                            onChange={(e) => {
                              setNewCustomer(e.target.value);
                              setNewRemote("");
                            }}
                            required
                          >
                            <option value="">Pilih bank</option>
                            {customers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Remote / Site ID">
                          <select
                            value={newRemote}
                            onChange={(e) => setNewRemote(e.target.value)}
                            required
                          >
                            <option value="">Pilih site ATM</option>
                            {remotes
                              .filter(
                                (r) =>
                                  String(r.customer_id) === newCustomer &&
                                  r.jarkom === newJarkom,
                              )
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.site_id} — {r.location}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label="Alamat">
                          <input readOnly value={picked?.address || ""} />
                        </Field>
                        <Field label="Provinsi">
                          <input readOnly value={picked?.province || ""} />
                        </Field>
                        <Field label="Kota">
                          <input readOnly value={picked?.city || ""} />
                        </Field>
                        <Field label="Jenis gangguan">
                          <select
                            value={newCase}
                            onChange={(e) => setNewCase(e.target.value)}
                          >
                            {cases.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Mulai gangguan / waktu kegiatan">
                          <input
                            name="started_at"
                            type="datetime-local"
                            required
                            defaultValue={localNow()}
                          />
                        </Field>
                        <Field label="Nomor NPR">
                          <input
                            readOnly
                            value={
                              picked
                                ? `NPR/${localNow().slice(0, 4)}/${localNow().slice(5, 7)}/… (otomatis)`
                                : "Pilih remote terlebih dahulu"
                            }
                          />
                        </Field>
                        <Field label="Dibuat oleh">
                          <input readOnly value={user.full_name} />
                        </Field>
                        <Field label="PIC / Kontak">
                          <input
                            readOnly
                            value={
                              picked
                                ? `${picked.pic_name} / ${picked.pic_phone}`
                                : ""
                            }
                          />
                        </Field>
                        <Field label="IP LAN">
                          <input readOnly value={picked?.ip_lan || ""} />
                        </Field>
                        <Field label="Catatan awal gangguan" wide>
                          <textarea
                            name="notes"
                            placeholder="Contoh: remote terpantau down. Follow-up PIC untuk pengecekan di lokasi."
                            required
                            rows={4}
                            maxLength={4000}
                          />
                        </Field>
                      </div>
                      <div className="form-note">
                        Nomor final ditetapkan saat disimpan agar tidak terjadi
                        nomor tiket ganda.
                      </div>
                      <div className="form-footer">
                        <button
                          type="button"
                          onClick={() => go("NPR")}
                          disabled={busy}
                        >
                          Batal
                        </button>
                        <button className="primary">
                          {busy ? "Menyimpan…" : "Simpan NPR"}
                        </button>
                      </div>
                    </fieldset>
                  </form>
                </section>
              )}
              {page === "NPR" && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>Daftar NPR</h2>
                    <div className="button-group">
                      <button onClick={() => void exportNpr()}>
                        Ekspor CSV
                      </button>
                      <button
                        className="primary"
                        onClick={() => go("NPR Baru")}
                      >
                        + NPR Baru
                      </button>
                    </div>
                  </div>
                  {filters}
                  {kondisi && (
                    <div className="filter-chip">
                      Filter dari Dashboard:{" "}
                      <strong>{kondisiNpr[kondisi]}</strong>
                      <button
                        onClick={() => {
                          setKondisi("");
                          setRowPage(1);
                        }}
                        aria-label="Hapus filter Dashboard"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {nprTable}
                </section>
              )}
              {page === "Trouble Ticket" && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>Daftar Trouble Ticket</h2>
                    <span className="muted">
                      Dibuat melalui Eskalasi Service pada NPR
                    </span>
                  </div>
                  <div className="filters">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Cari TT atau site…"
                      aria-label="Cari TT"
                    />
                  </div>
                  <div className="table-scroll">
                    <table className="tabel-kartu">
                      <thead>
                        <tr>
                          <th>No. TT / NPR</th>
                          <th>Remote</th>
                          <th>Instruksi</th>
                          <th>Report teknisi</th>
                          <th>Status NPR</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tickets.data?.rows.map((t) => (
                          <tr key={t.id}>
                            <td data-label="No. TT / NPR">
                              <strong className="mono">{t.number}</strong>
                              <small>{t.npr_number}</small>
                            </td>
                            <td data-label="Remote">
                              {t.site_id}
                              <small>{t.location}</small>
                            </td>
                            <td data-label="Instruksi">{t.instruction}</td>
                            <td data-label="Report teknisi">
                              {t.report ? "Sudah diterima" : "Menunggu report"}
                              <small>{t.technician}</small>
                            </td>
                            <td data-label="Status NPR">
                              <Status value={t.npr_status} />
                            </td>
                            <td data-label="Aksi">
                              <div className="button-group">
                                <button onClick={() => ticketPdf(t)}>
                                  PDF
                                </button>
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    bukaNpr(t.npr_id);
                                    setKind("Report Teknisi");
                                  }}
                                >
                                  Detail / Report
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!tickets.data?.rows.length && (
                      <div className="empty">
                        {tickets.loading
                          ? "Memuat daftar TT…"
                          : "Belum ada TT. Buka NPR, pilih Add Action → Eskalasi Service."}
                      </div>
                    )}
                  </div>
                </section>
              )}
              {page === "TT Gamas" && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>Gangguan massal</h2>
                    <button
                      className="primary"
                      onClick={() => setModal("gamas")}
                    >
                      + TT Gamas
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table className="tabel-kartu">
                      <thead>
                        <tr>
                          <th>No. TT Gamas</th>
                          <th>Lokasi penanganan</th>
                          <th>Mulai gangguan</th>
                          <th>Site terdampak</th>
                          <th>Status</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gamasList.data?.rows.map((g) => (
                          <tr key={g.id}>
                            <td data-label="No. TT Gamas" className="mono">
                              {g.number}
                            </td>
                            <td data-label="Lokasi penanganan">{g.location}</td>
                            <td data-label="Mulai gangguan">
                              {dateText(g.started_at)}
                            </td>
                            <td data-label="Site terdampak">{g.site_count}</td>
                            <td data-label="Status">
                              <Status value={g.status} />
                            </td>
                            <td data-label="Aksi">
                              <div className="button-group">
                                <button
                                  onClick={() => void gamasPdfDariDaftar(g.id)}
                                >
                                  PDF
                                </button>
                                <button
                                  className="text-button"
                                  onClick={() => setSelectedGamas(g.id)}
                                >
                                  Detail →
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!gamasList.data?.rows.length && (
                      <div className="empty">
                        {gamasList.loading
                          ? "Memuat daftar Gamas…"
                          : "Belum ada gangguan massal."}
                      </div>
                    )}
                  </div>
                </section>
              )}
              {page === "Laporan SLA" && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>Ketersediaan layanan per site</h2>
                    <div className="button-group">
                      <input
                        type="month"
                        aria-label="Periode SLA"
                        value={slaMonth}
                        onChange={(e) => setSlaMonth(e.target.value)}
                        required
                      />
                      <button
                        disabled={!sla.data}
                        onClick={() =>
                          sla.data &&
                          csv(`SLA-${slaMonth}.csv`, [
                            [
                              "Site ID",
                              "Lokasi",
                              "Customer",
                              "Menit Periode",
                              "Downtime Menit",
                              "SLA %",
                            ],
                            ...sla.data.rows.map((r) => [
                              r.site_id,
                              r.location,
                              r.customer_name,
                              r.total_minutes,
                              r.downtime_minutes,
                              r.sla ?? "Belum berjalan",
                            ]),
                          ])
                        }
                      >
                        Ekspor CSV
                      </button>
                    </div>
                  </div>
                  <div className="form-note">
                    <strong>Aturan perhitungan SLA</strong>
                    <p>
                      SLA = (waktu periode − downtime TM) ÷ waktu periode ×
                      100%. TT Maintenance dihitung, Preventive Maintenance dan
                      gangguan Customer tidak dihitung. Gangguan massal dihitung
                      per site; waktu yang tumpang tindih tidak digandakan.
                      Waktu pemulihan menggunakan waktu kembali online, bukan
                      waktu administrasi penutupan. Periode berjalan dihitung
                      sampai saat ini. Target: {sla.data?.target ?? 99.5}%. TM =
                      PT. Tangara Mitrakom.
                    </p>
                  </div>
                  {sla.loading && !sla.data ? (
                    <div className="empty">Menghitung laporan…</div>
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Site / Customer</th>
                            <th>Lokasi</th>
                            <th>Waktu periode</th>
                            <th>Downtime TM</th>
                            <th>SLA</th>
                            <th>Pencapaian</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sla.data?.rows.map((r) => (
                            <tr key={r.remote_id}>
                              <td>
                                <strong>{r.site_id}</strong>
                                <small>{r.customer_name}</small>
                              </td>
                              <td>{r.location}</td>
                              <td>
                                {Number(r.total_minutes).toLocaleString(
                                  "id-ID",
                                )}{" "}
                                menit
                              </td>
                              <td>
                                {Number(r.downtime_minutes).toLocaleString(
                                  "id-ID",
                                  { maximumFractionDigits: 2 },
                                )}{" "}
                                menit
                              </td>
                              <td>
                                <strong>
                                  {r.sla === null
                                    ? "—"
                                    : Number(r.sla).toFixed(3) + "%"}
                                </strong>
                              </td>
                              <td>
                                <span
                                  className={`status ${r.sla !== null && r.sla >= (sla.data?.target || 99.5) ? "status-closed" : "status-pending"}`}
                                >
                                  {r.sla !== null &&
                                  r.sla >= (sla.data?.target || 99.5)
                                    ? "Tercapai"
                                    : r.sla === null
                                      ? "Belum berjalan"
                                      : "Di bawah target"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!sla.data?.rows.length && (
                        <div className="empty">
                          Tidak ada data pada periode ini.
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}
              {page === "Customer" && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>Customer bank</h2>
                    <button
                      className="primary"
                      onClick={() => setModal("customer")}
                    >
                      + Tambah Customer
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table className="tabel-kartu">
                      <thead>
                        <tr>
                          <th>Kode</th>
                          <th>Nama Customer</th>
                          <th>Jumlah Remote</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customers.map((c) => (
                          <tr key={c.id}>
                            <td data-label="Kode" className="mono">
                              {c.code}
                            </td>
                            <td data-label="Nama Customer">
                              <strong>{c.name}</strong>
                            </td>
                            <td data-label="Jumlah Remote">
                              {c.remote_count} site
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {page === "Pengguna" && user.peran === "admin" && (
                <HalamanPengguna
                  api={api}
                  penggunaId={user.id}
                  onNotice={setNotice}
                />
              )}
              {page === "Remote" && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>Daftar remote ATM</h2>
                    <button
                      className="primary"
                      onClick={() => setModal("remote")}
                    >
                      + Tambah Remote
                    </button>
                  </div>
                  <div className="filters">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Cari site atau lokasi…"
                      aria-label="Cari remote"
                    />
                    <select
                      value={customerFilter}
                      onChange={(e) => setCustomerFilter(e.target.value)}
                      aria-label="Filter customer"
                    >
                      <option value="">Semua customer</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="table-scroll">
                    <table className="tabel-kartu">
                      <thead>
                        <tr>
                          <th>Site ID</th>
                          <th>Customer / Lokasi</th>
                          <th>Jarkom</th>
                          <th>Alamat</th>
                          <th>IP LAN</th>
                          <th>Pengelola / PIC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {remotes
                          .filter(
                            (r) =>
                              (!customerFilter ||
                                String(r.customer_id) === customerFilter) &&
                              `${r.site_id} ${r.location} ${r.city}`
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                          )
                          .map((r) => (
                            <tr key={r.id}>
                              <td data-label="Site ID" className="mono">
                                {r.site_id}
                              </td>
                              <td data-label="Customer / Lokasi">
                                <strong>{customerName(r.customer_id)}</strong>
                                <small>{r.location}</small>
                              </td>
                              <td data-label="Jarkom">{r.jarkom}</td>
                              <td data-label="Alamat">
                                {r.address}
                                <small>
                                  {r.city}, {r.province}
                                </small>
                              </td>
                              <td data-label="IP LAN" className="mono">
                                {r.ip_lan}
                              </td>
                              <td data-label="Pengelola / PIC">
                                {r.pic_name}
                                <small>{r.pic_phone}</small>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>Seluruh waktu ditampilkan dalam WIB</span>
        </footer>
      </div>
      {showPassword && (
        <GantiPassword
          api={api}
          onClose={() => setShowPassword(false)}
          onDone={() => {
            setShowPassword(false);
            setNotice("Password berhasil diganti.");
          }}
        />
      )}
      {modal && (
        <div className="modal-overlay">
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="panel-title">
              <h2 id="modal-title">
                {modal === "customer"
                  ? "Tambah Customer"
                  : modal === "remote"
                    ? "Tambah Remote"
                    : "Buat TT Gamas"}
              </h2>
              <button
                onClick={() => setModal(null)}
                aria-label="Tutup form"
                disabled={busy}
              >
                ×
              </button>
            </div>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const body: Record<string, unknown> = Object.fromEntries(
                  f.entries(),
                );
                if (modal === "remote")
                  body.customer_id = Number(body.customer_id);
                if (modal === "gamas") {
                  body.remote_ids = f.getAll("remote_ids").map(Number);
                  body.started_at = iso(String(body.started_at));
                }
                void mutate(
                  `/api/${modal === "customer" ? "customers" : modal === "remote" ? "remotes" : "gamas"}`,
                  body,
                  modal === "gamas"
                    ? "TT Gamas berhasil dibuat. PDF dapat diunduh dari halaman ini."
                    : "Data berhasil disimpan.",
                  (result) => {
                    if (modal === "gamas" && result.id)
                      setSelectedGamas(result.id);
                    else setVersiMaster((v) => v + 1);
                    setModal(null);
                  },
                );
              }}
            >
              <fieldset disabled={busy}>
                <div className="form-grid">
                  {modal === "customer" ? (
                    <>
                      <Field label="Kode customer · contoh ARN">
                        <input
                          name="code"
                          required
                          maxLength={12}
                          pattern="[A-Za-z0-9]+"
                        />
                      </Field>
                      <Field label="Nama bank">
                        <input name="name" required maxLength={100} />
                      </Field>
                    </>
                  ) : modal === "remote" ? (
                    <>
                      <Field label="Customer">
                        <select name="customer_id" required>
                          <option value="">Pilih customer</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Site ID">
                        <input name="site_id" required maxLength={60} />
                      </Field>
                      <Field label="Nama lokasi ATM">
                        <input name="location" required maxLength={200} />
                      </Field>
                      <Field label="Jarkom">
                        <select name="jarkom">
                          <option>VSAT</option>
                          <option>M2M</option>
                        </select>
                      </Field>
                      <Field label="Alamat" wide>
                        <textarea name="address" required rows={2} />
                      </Field>
                      <Field label="Kota">
                        <input name="city" required />
                      </Field>
                      <Field label="Provinsi">
                        <input name="province" required />
                      </Field>
                      <Field label="IP LAN">
                        <input
                          name="ip_lan"
                          required
                          placeholder="192.0.2.10"
                        />
                      </Field>
                      <Field label="Nama PIC">
                        <input name="pic_name" required />
                      </Field>
                      <Field label="Telepon PIC">
                        <input
                          name="pic_phone"
                          required
                          placeholder="000-000-0001"
                        />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="Lokasi penanganan · HUB / data center" wide>
                        <input name="location" required />
                      </Field>
                      <Field label="Mulai gangguan">
                        <input
                          name="started_at"
                          type="datetime-local"
                          defaultValue={localNow()}
                          required
                        />
                      </Field>
                      <Field label="Catatan problem" wide>
                        <textarea name="notes" required rows={3} />
                      </Field>
                      <div className="wide">
                        <label className="field">
                          <span>Remote terdampak · pilih minimal satu</span>
                        </label>
                        <div className="site-checks">
                          {remotes.map((r) => (
                            <label className="check" key={r.id}>
                              <input
                                type="checkbox"
                                name="remote_ids"
                                value={r.id}
                              />
                              {r.site_id} — {r.location}
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="form-footer">
                  <button type="button" onClick={() => setModal(null)}>
                    Batal
                  </button>
                  <button className="primary">
                    {busy
                      ? "Menyimpan…"
                      : modal === "gamas"
                        ? "Kirim TT Gamas"
                        : "Simpan"}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
export default App;
