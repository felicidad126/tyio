import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";
import { bulanWIB } from "../shared/waktu";
import { Field } from "./komponen";
import { GantiPassword, HalamanPengguna } from "./Pengguna";
import { namaPeran, type Peran } from "./peran";

type User = { id: number; username: string; full_name: string; peran: Peran };
type Customer = { id: number; name: string; code: string };
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
};
type NPR = {
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
  attachment_name?: string;
  attachment_data?: string;
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
};
type GamasAction = {
  id: number;
  gamas_id: number;
  notes: string;
  report?: string;
  created_at: string;
  created_by: string;
};
type Data = {
  customers: Customer[];
  remotes: Remote[];
  nprs: NPR[];
  actions: Action[];
  tickets: Ticket[];
  gamas: Gamas[];
  gamas_sites: { gamas_id: number; remote_id: number }[];
  gamas_actions: GamasAction[];
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
  | "New NPR"
  | "Detail NPR"
  | "Trouble Ticket"
  | "TT Gamas"
  | "Report NPR"
  | "Laporan SLA"
  | "Customer"
  | "Remote"
  | "Pengguna";
const emptyData: Data = {
  customers: [],
  remotes: [],
  nprs: [],
  actions: [],
  tickets: [],
  gamas: [],
  gamas_sites: [],
  gamas_actions: [],
};
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
const pages: Page[] = [
  "Dashboard",
  "New NPR",
  "Detail NPR",
  "Trouble Ticket",
  "TT Gamas",
  "Report NPR",
  "Laporan SLA",
  "Customer",
  "Remote",
  "Pengguna",
];
const icons = ["◈", "+", "▤", "↗", "◎", "▥", "◷", "▦", "⌖", "◉"];
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
function Status({ value }: { value: string }) {
  return (
    <span className={`status status-${value?.toLowerCase()}`}>
      {value || "OPEN"}
    </span>
  );
}
function csv(name: string, rows: (string | number)[][]) {
  const text =
    "\uFEFF" +
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
async function pdf(title: string, number: string, entries: [string, string][]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  let y = 24;
  doc.setFontSize(16);
  doc.text("PT. Tangara Mitrakom", 18, y);
  y += 9;
  doc.setFontSize(10);
  doc.text("SIMULASI AKADEMIK - DATA FIKTIF", 18, y);
  y += 13;
  doc.setFontSize(14);
  doc.text(title, 18, y);
  y += 8;
  doc.setFontSize(10);
  doc.text(number, 18, y);
  y += 12;
  for (const [key, value] of entries) {
    const lines = doc.splitTextToSize(
      `${key}: ${value || "—"}`,
      172,
    ) as string[];
    for (const line of lines) {
      if (y > 275) {
        doc.addPage();
        y = 22;
      }
      doc.text(line, 18, y);
      y += 6;
    }
    y += 3;
  }
  doc.save(number.replaceAll("/", "-") + ".pdf");
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState<Data>(emptyData);
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
  const [sla, setSla] = useState<{
    rows: SlaRow[];
    target: number;
    month: string;
  } | null>(null);
  const [slaLoading, setSlaLoading] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const [showPassword, setShowPassword] = useState(false);

  // Dibungkus useCallback supaya fungsi ini tetap sama di setiap render dan
  // aman dipakai sebagai dependensi useEffect di halaman lain.
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
  async function reload() {
    const result = await api<Data>("/api/data");
    const fresh = { ...emptyData, ...result };
    setData(fresh);
    return fresh;
  }
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
  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetch("/api/data")
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw new Error(result.message || "Gagal memuat data");
        if (alive) setData({ ...emptyData, ...result });
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [user]);
  useEffect(() => {
    if (!user || page !== "Laporan SLA") return;
    let alive = true;
    queueMicrotask(() => {
      if (alive) {
        setSlaLoading(true);
        setSla(null);
      }
    });
    fetch(`/api/sla?month=${slaMonth}`)
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw new Error(result.message);
        if (alive) setSla(result);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setSlaLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user, page, slaMonth, data]);
  function go(next: Page) {
    setPage(next);
    setSelected(null);
    setSelectedGamas(null);
    setCloseGamas(false);
    setSearch("");
    setCustomerFilter("");
    setStatusFilter("");
    setFrom("");
    setTo("");
    setRowPage(1);
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
      setData(emptyData);
      setPage("Dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function mutate(
    path: string,
    body: unknown,
    success: string,
    after?: (fresh: Data) => void,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, body);
      const fresh = await reload();
      setNotice(success);
      after?.(fresh);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const remote = (id: number) => data.remotes.find((r) => r.id === id);
  const customer = (id?: number) => data.customers.find((c) => c.id === id);
  const ticket = (id: number) => data.tickets.find((t) => t.npr_id === id);
  const active = data.nprs.filter((n) => n.status !== "CLOSED");
  const current = data.nprs.find((n) => n.id === selected);
  const currentRemote = current ? remote(current.remote_id) : undefined;
  const currentTicket = current ? ticket(current.id) : undefined;
  const currentGamas = data.gamas.find((g) => g.id === selectedGamas);
  const filtered = data.nprs
    .filter((n) => {
      const r = remote(n.remote_id);
      const c = customer(r?.customer_id);
      const day = new Date(n.started_at).toLocaleDateString("en-CA", {
        timeZone: "Asia/Jakarta",
      });
      return (
        (!customerFilter || String(r?.customer_id) === customerFilter) &&
        (!statusFilter || n.status === statusFilter) &&
        (!from || day >= from) &&
        (!to || day <= to) &&
        `${n.number} ${ticket(n.id)?.number || ""} ${r?.site_id} ${r?.location} ${c?.name} ${n.last_action}`
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    })
    .sort((a, b) => b.id - a.id);
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const visible = filtered.slice(
    (Math.min(rowPage, pageCount) - 1) * perPage,
    Math.min(rowPage, pageCount) * perPage,
  );
  const picked = remote(Number(newRemote));
  function exportNpr() {
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
        "Pending By",
        "Mulai WIB",
        "Online WIB",
        "Catatan Terakhir",
      ],
      ...filtered.map((n) => {
        const r = remote(n.remote_id);
        return [
          n.number,
          ticket(n.id)?.number || "",
          customer(r?.customer_id)?.name || "",
          r?.site_id || "",
          r?.location || "",
          r?.jarkom || "",
          n.remote_status,
          n.status,
          n.pending_by || "",
          dateText(n.started_at),
          dateText(n.online_at),
          n.last_action || "",
        ];
      }),
    ]);
  }
  function ticketPdf(t: Ticket) {
    const n = data.nprs.find((v) => v.id === t.npr_id);
    const r = n ? remote(n.remote_id) : undefined;
    void pdf("TROUBLE TICKET / KUNJUNGAN TEKNISI", t.number, [
      ["Referensi NPR", n?.number || ""],
      ["Customer", customer(r?.customer_id)?.name || ""],
      ["Instruction", t.instruction],
      ["Tanggal TT", dateText(t.created_at)],
      ["Site ID", r?.site_id || ""],
      ["Lokasi", r?.location || ""],
      ["Alamat", r?.address || ""],
      ["Kota / Provinsi", `${r?.city || ""} / ${r?.province || ""}`],
      ["Jarkom / IP LAN", `${r?.jarkom || ""} / ${r?.ip_lan || ""}`],
      ["PIC", `${r?.pic_name || ""} / ${r?.pic_phone || ""}`],
      ["Catatan NOC", t.notes],
      ["Teknisi", t.technician],
      ["Report teknisi", t.report],
    ]).catch(() => setError("PDF gagal dibuat. Silakan coba unduh kembali."));
  }
  function gamasPdf(g: Gamas, source: Data = data) {
    void pdf("TROUBLE TICKET GANGGUAN MASSAL", g.number, [
      ["Lokasi penanganan", g.location],
      ["Mulai gangguan", dateText(g.started_at)],
      ["Catatan", g.notes],
      [
        "Remote terdampak",
        source.gamas_sites
          .filter((s) => s.gamas_id === g.id)
          .map((s) => {
            const r = remote(s.remote_id);
            return `${r?.site_id} - ${r?.location}`;
          })
          .join("\n"),
      ],
      ["Report teknisi", g.report],
      ["Kembali online", dateText(g.online_at)],
    ]).catch(() => setError("PDF gagal dibuat. Silakan coba unduh kembali."));
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
    if (!current) return;
    const form = event.currentTarget;
    const f = new FormData(form);
    try {
      const file = f.get("attachment");
      const attached = await attachment(file instanceof File ? file : null);
      await mutate(
        `/api/nprs/${current.id}/actions`,
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
          ? "TT berhasil dibuat. PDF tersedia pada bagian Trouble Ticket."
          : "Tindakan berhasil disimpan.",
        (fresh) => {
          if (kind === "Eskalasi Service") {
            const created = fresh.tickets.find((t) => t.npr_id === current.id);
            if (created) ticketPdf(created);
          }
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
        {data.customers.map((c) => (
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
      {page === "Report NPR" && (
        <>
          <input
            type="date"
            aria-label="Dari tanggal"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setRowPage(1);
            }}
          />
          <input
            type="date"
            aria-label="Sampai tanggal"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value);
              setRowPage(1);
            }}
          />
        </>
      )}
    </div>
  );
  const nprTable = (
    <>
      <div className="table-scroll">
        <table>
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
            {visible.map((n) => {
              const r = remote(n.remote_id);
              return (
                <tr key={n.id}>
                  <td>
                    <strong className="mono">{n.number}</strong>
                    <small>{ticket(n.id)?.number || "Belum ada TT"}</small>
                  </td>
                  <td>
                    <strong>{customer(r?.customer_id)?.name}</strong>
                    <small>
                      {r?.site_id} · {r?.location}
                    </small>
                  </td>
                  <td>
                    {n.remote_status}
                    <small>{r?.jarkom}</small>
                  </td>
                  <td>{dateText(n.started_at)}</td>
                  <td>
                    <Status value={n.status} />
                  </td>
                  <td>{n.pending_by || "—"}</td>
                  <td className="notes-cell">{n.last_action || "—"}</td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelected(n.id);
                        setKind("Problem");
                        setError("");
                        setNotice("");
                      }}
                    >
                      Detail →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && (
          <div className="empty">
            Tidak ada NPR yang sesuai dengan pencarian.
          </div>
        )}
      </div>
      <div className="pagination">
        <span>{filtered.length} NPR ditemukan</span>
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
        >
          ←
        </button>
        <span>
          {Math.min(rowPage, pageCount)} / {pageCount}
        </span>
        <button
          disabled={rowPage >= pageCount}
          onClick={() => setRowPage((v) => v + 1)}
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
              <span className="brand-icon">TM</span>
              <div>
                <strong>PT. Tangara Mitrakom</strong>
                <span>Monitoring & Pelaporan Gangguan</span>
              </div>
            </div>
            <span className="intro-label">HELPDESK · VSAT & M2M</span>
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
                {busy ? "Memeriksa akun…" : "Masuk ke Dashboard →"}
              </button>
            </form>
            <div className="login-foot">Sistem Monitoring Jaringan ATM</div>
          </section>
        </div>
        <footer className="page-footer">
          Proyek Kerja Praktek · Universitas Dian Nusantara
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="side-brand">
          <span className="brand-icon">TM</span>
          <div>
            <strong>MONITORING</strong>
            <small>PT. Tangara Mitrakom</small>
          </div>
        </div>
        <div className="side-caption">WORKSPACE HELPDESK</div>
        <nav>
          {pages.map((p, i) =>
            p === "Pengguna" && user.peran !== "admin" ? null : (
              <button
                className={page === p ? "active" : ""}
                key={p}
                onClick={() => go(p)}
              >
                <span>{icons[i]}</span>
                {p}
              </button>
            ),
          )}
        </nav>
        <div className="side-bottom">
          <span className="online-dot" /> VSAT & M2M
          <br />
          <small>Proyek akademik · data dummy</small>
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
              Logout
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
                    : page}
              </h1>
              <p>
                {page === "Dashboard"
                  ? "Ringkasan gangguan dan perkembangan penanganan jaringan."
                  : "Pencatatan terpusat untuk pekerjaan helpdesk."}
              </p>
            </div>
            <span className="demo-tag">SIMULASI · DATA FIKTIF</span>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
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

          {current && currentRemote ? (
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
                    ["Customer", customer(currentRemote.customer_id)?.name],
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
                    ["Pending By", current.pending_by || "—"],
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
                    <button onClick={() => ticketPdf(currentTicket)}>
                      Unduh PDF TT
                    </button>
                  </div>
                  <div className="info-grid">
                    <div>
                      <small>Instruction</small>
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
                  {data.actions
                    .filter((a) => a.npr_id === current.id)
                    .sort((a, b) => a.id - b.id)
                    .map((a) => (
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
                        {a.attachment_data && (
                          <a
                            className="attachment"
                            href={a.attachment_data}
                            download={a.attachment_name}
                          >
                            ↓ {a.attachment_name}
                          </a>
                        )}
                      </article>
                    ))}
                </div>
              </section>
              {current.status !== "CLOSED" && (
                <section className="panel">
                  <h2>Add Action NPR</h2>
                  <form
                    onSubmit={saveAction}
                    key={`${current.id}-${data.actions.length}`}
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
                        <Field label="Remote Status">
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
                        <Field label="Category Pending">
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
                              ketika dikirim. Catatan berikut diisi berdasarkan
                              hasil pengecekan NOC.
                            </div>
                            <Field label="Instruction">
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
                            <input name="technician" required maxLength={120} />
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
                              ? "Send Trouble Ticket"
                              : "Simpan tindakan"}
                        </button>
                      </div>
                    </fieldset>
                  </form>
                </section>
              )}
            </>
          ) : currentGamas ? (
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
                  <button onClick={() => gamasPdf(currentGamas)}>
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
                      {data.gamas_sites
                        .filter((s) => s.gamas_id === currentGamas.id)
                        .map((s) => remote(s.remote_id)?.site_id)
                        .join(", ")}
                    </strong>
                  </div>
                  <div>
                    <small>Report teknisi</small>
                    <strong>{currentGamas.report || "Belum ada report"}</strong>
                  </div>
                </div>
              </section>
              <section className="panel">
                <h2>Riwayat penanganan</h2>
                <div className="timeline">
                  {data.gamas_actions
                    .filter((a) => a.gamas_id === currentGamas.id)
                    .map((a) => (
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
              {!currentGamas.closed_at && currentGamas.status !== "CLOSED" && (
                <section className="panel">
                  <h2>Perbarui penanganan Gamas</h2>
                  <form
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
                            ? { online_at: iso(String(f.get("online_at"))) }
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
                            onChange={(e) => setCloseGamas(e.target.checked)}
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
                        <button className="primary">Simpan perkembangan</button>
                      </div>
                    </fieldset>
                  </form>
                </section>
              )}
            </>
          ) : (
            <>
              {page === "Dashboard" && (
                <>
                  <div className="stats-grid">
                    {[
                      [
                        "NPR Aktif",
                        active.length,
                        "Seluruh gangguan yang belum ditutup",
                        "blue",
                      ],
                      [
                        "Critical >48 jam",
                        active.filter(
                          (n) =>
                            clock - Date.parse(n.started_at) > 48 * 3600000,
                        ).length,
                        "Perlu perhatian dan tindak lanjut",
                        "red",
                      ],
                      [
                        "Aging 24–48 jam",
                        active.filter((n) => {
                          const h =
                            (clock - Date.parse(n.started_at)) / 3600000;
                          return h >= 24 && h <= 48;
                        }).length,
                        "Pantau perkembangan penanganan",
                        "amber",
                      ],
                      [
                        "Menunggu Report",
                        data.tickets.filter(
                          (t) =>
                            !t.report &&
                            data.nprs.find((n) => n.id === t.npr_id)?.status !==
                              "CLOSED",
                        ).length,
                        "TT belum memiliki report teknisi",
                        "green",
                      ],
                    ].map(([label, value, sub, color]) => (
                      <article className={`stat-card ${color}`} key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                        <small>{sub}</small>
                      </article>
                    ))}
                  </div>
                  <div className="dashboard-grid">
                    <section className="panel">
                      <div className="panel-title">
                        <h2>Distribusi penanganan</h2>
                        <span className="muted">NPR aktif</span>
                      </div>
                      {[
                        [
                          "Pending TM",
                          active.filter((n) => n.pending_by === "TM").length,
                        ],
                        [
                          "Pending Customer",
                          active.filter((n) => n.pending_by === "Customer")
                            .length,
                        ],
                        [
                          "Belum dikategorikan",
                          active.filter((n) => !n.pending_by).length,
                        ],
                      ].map(([k, v]) => (
                        <div className="distribution" key={k}>
                          <span>{k}</span>
                          <strong>{v}</strong>
                          <div>
                            <i
                              style={{
                                width: `${active.length ? (Number(v) / active.length) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                      <button
                        className="text-button"
                        onClick={() => go("Detail NPR")}
                      >
                        Lihat seluruh NPR →
                      </button>
                    </section>
                    <section className="panel">
                      <div className="panel-title">
                        <h2>NPR masuk · 7 hari terakhir</h2>
                        <span className="muted">WIB</span>
                      </div>
                      <div className="bar-chart">
                        {Array.from({ length: 7 }, (_, i) => {
                          const d = new Date();
                          d.setDate(d.getDate() - 6 + i);
                          const key = d.toLocaleDateString("en-CA", {
                            timeZone: "Asia/Jakarta",
                          });
                          const count = data.nprs.filter(
                            (n) =>
                              new Date(n.started_at).toLocaleDateString(
                                "en-CA",
                                { timeZone: "Asia/Jakarta" },
                              ) === key,
                          ).length;
                          const max = Math.max(
                            1,
                            ...Array.from({ length: 7 }, (_, j) => {
                              const t = new Date();
                              t.setDate(t.getDate() - j);
                              return data.nprs.filter(
                                (n) =>
                                  new Date(n.started_at).toLocaleDateString(
                                    "en-CA",
                                    { timeZone: "Asia/Jakarta" },
                                  ) ===
                                  t.toLocaleDateString("en-CA", {
                                    timeZone: "Asia/Jakarta",
                                  }),
                              ).length;
                            }),
                          );
                          return (
                            <div className="bar-item" key={key}>
                              <strong>{count}</strong>
                              <div className="bar-track">
                                <div
                                  style={{ height: `${(count / max) * 100}%` }}
                                />
                              </div>
                              <small>
                                {d.toLocaleDateString("id-ID", {
                                  day: "numeric",
                                  month: "short",
                                })}
                              </small>
                            </div>
                          );
                        })}
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
                    {data.gamas.filter((g) => g.status !== "CLOSED").length ? (
                      data.gamas
                        .filter((g) => g.status !== "CLOSED")
                        .map((g) => (
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

              {page === "New NPR" && (
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
                          go("Detail NPR");
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
                            {data.customers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Remote Name / Site ID">
                          <select
                            value={newRemote}
                            onChange={(e) => setNewRemote(e.target.value)}
                            required
                          >
                            <option value="">Pilih site ATM</option>
                            {data.remotes
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
                        <Field label="Address">
                          <input readOnly value={picked?.address || ""} />
                        </Field>
                        <Field label="Province">
                          <input readOnly value={picked?.province || ""} />
                        </Field>
                        <Field label="City">
                          <input readOnly value={picked?.city || ""} />
                        </Field>
                        <Field label="Remote Status / Jenis Gangguan">
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
                        <Field label="NPR Number">
                          <input
                            readOnly
                            value={
                              picked
                                ? `NPR/${localNow().slice(0, 4)}/${localNow().slice(5, 7)}/… (otomatis)`
                                : "Pilih remote terlebih dahulu"
                            }
                          />
                        </Field>
                        <Field label="Created By">
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
                        nomor tiket ganda. Seluruh data lokasi dan kontak
                        merupakan data dummy.
                      </div>
                      <div className="form-footer">
                        <button className="primary">
                          {busy ? "Menyimpan…" : "Submit NPR"}
                        </button>
                      </div>
                    </fieldset>
                  </form>
                </section>
              )}
              {(page === "Detail NPR" || page === "Report NPR") && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>
                      {page === "Report NPR"
                        ? "Histori & laporan NPR"
                        : "Daftar NPR"}
                    </h2>
                    <div className="button-group">
                      <button onClick={exportNpr}>Ekspor CSV</button>
                      <button className="primary" onClick={() => go("New NPR")}>
                        + New NPR
                      </button>
                    </div>
                  </div>
                  {filters}
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
                    <table>
                      <thead>
                        <tr>
                          <th>No. TT / NPR</th>
                          <th>Remote</th>
                          <th>Instruction</th>
                          <th>Report teknisi</th>
                          <th>Status NPR</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.tickets
                          .filter((t) => {
                            const n = data.nprs.find((n) => n.id === t.npr_id);
                            return `${t.number} ${n?.number} ${remote(n?.remote_id || 0)?.site_id}`
                              .toLowerCase()
                              .includes(search.toLowerCase());
                          })
                          .map((t) => {
                            const n = data.nprs.find((n) => n.id === t.npr_id);
                            const r = remote(n?.remote_id || 0);
                            return (
                              <tr key={t.id}>
                                <td>
                                  <strong className="mono">{t.number}</strong>
                                  <small>{n?.number}</small>
                                </td>
                                <td>
                                  {r?.site_id}
                                  <small>{r?.location}</small>
                                </td>
                                <td>{t.instruction}</td>
                                <td>
                                  {t.report
                                    ? "Sudah diterima"
                                    : "Menunggu report"}
                                  <small>{t.technician}</small>
                                </td>
                                <td>
                                  <Status value={n?.status || "OPEN"} />
                                </td>
                                <td>
                                  <div className="button-group">
                                    <button onClick={() => ticketPdf(t)}>
                                      PDF
                                    </button>
                                    <button
                                      className="text-button"
                                      onClick={() => {
                                        setSelected(t.npr_id);
                                        setKind("Report Teknisi");
                                      }}
                                    >
                                      Detail / Report
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                    {!data.tickets.length && (
                      <div className="empty">
                        Belum ada TT. Buka NPR, pilih Add Action → Eskalasi
                        Service.
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
                    <table>
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
                        {data.gamas.map((g) => (
                          <tr key={g.id}>
                            <td className="mono">{g.number}</td>
                            <td>{g.location}</td>
                            <td>{dateText(g.started_at)}</td>
                            <td>
                              {
                                data.gamas_sites.filter(
                                  (s) => s.gamas_id === g.id,
                                ).length
                              }
                            </td>
                            <td>
                              <Status value={g.status} />
                            </td>
                            <td>
                              <div className="button-group">
                                <button onClick={() => gamasPdf(g)}>PDF</button>
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
                    {!data.gamas.length && (
                      <div className="empty">Belum ada gangguan massal.</div>
                    )}
                  </div>
                </section>
              )}
              {page === "Laporan SLA" && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>Service Level Agreement</h2>
                    <div className="button-group">
                      <input
                        type="month"
                        aria-label="Periode SLA"
                        value={slaMonth}
                        onChange={(e) => setSlaMonth(e.target.value)}
                        required
                      />
                      <button
                        disabled={!sla}
                        onClick={() =>
                          sla &&
                          csv(`SLA-${slaMonth}.csv`, [
                            [
                              "Site ID",
                              "Lokasi",
                              "Customer",
                              "Menit Periode",
                              "Downtime Menit",
                              "SLA %",
                            ],
                            ...sla.rows.map((r) => [
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
                    <strong>Aturan simulasi akademik</strong>
                    <p>
                      SLA = (waktu periode − downtime TM) ÷ waktu periode ×
                      100%. TT Maintenance dihitung, Preventive Maintenance dan
                      gangguan Customer tidak dihitung. Gangguan massal dihitung
                      per site; waktu yang tumpang tindih tidak digandakan.
                      Waktu pemulihan menggunakan waktu kembali online, bukan
                      waktu administrasi penutupan. Periode berjalan dihitung
                      sampai saat ini. Target simulasi: {sla?.target ?? 99.5}%.
                    </p>
                  </div>
                  {slaLoading ? (
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
                          {sla?.rows.map((r) => (
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
                                  className={`status ${r.sla !== null && r.sla >= (sla.target || 99.5) ? "status-closed" : "status-pending"}`}
                                >
                                  {r.sla !== null &&
                                  r.sla >= (sla.target || 99.5)
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
                      {!sla?.rows.length && (
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
                    <table>
                      <thead>
                        <tr>
                          <th>Kode</th>
                          <th>Nama Customer</th>
                          <th>Jumlah Remote</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.customers.map((c) => (
                          <tr key={c.id}>
                            <td className="mono">{c.code}</td>
                            <td>
                              <strong>{c.name}</strong>
                            </td>
                            <td>
                              {
                                data.remotes.filter(
                                  (r) => r.customer_id === c.id,
                                ).length
                              }{" "}
                              site
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
                      {data.customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="table-scroll">
                    <table>
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
                        {data.remotes
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
                              <td className="mono">{r.site_id}</td>
                              <td>
                                <strong>{customer(r.customer_id)?.name}</strong>
                                <small>{r.location}</small>
                              </td>
                              <td>{r.jarkom}</td>
                              <td>
                                {r.address}
                                <small>
                                  {r.city}, {r.province}
                                </small>
                              </td>
                              <td className="mono">{r.ip_lan}</td>
                              <td>
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
          Proyek Kerja Praktek · Universitas Dian Nusantara{" "}
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
                  "Data berhasil disimpan.",
                  (fresh) => {
                    if (modal === "gamas") {
                      const created = fresh.gamas.find(
                        (g) => !data.gamas.some((old) => old.id === g.id),
                      );
                      if (created) gamasPdf(created, fresh);
                    }
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
                      <Field label="Nama bank dummy">
                        <input name="name" required maxLength={100} />
                      </Field>
                    </>
                  ) : modal === "remote" ? (
                    <>
                      <Field label="Customer">
                        <select name="customer_id" required>
                          <option value="">Pilih customer</option>
                          {data.customers.map((c) => (
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
                      <Field label="City">
                        <input name="city" required />
                      </Field>
                      <Field label="Province">
                        <input name="province" required />
                      </Field>
                      <Field label="IP LAN dummy">
                        <input
                          name="ip_lan"
                          required
                          placeholder="192.0.2.10"
                        />
                      </Field>
                      <Field label="Nama pengelola / PIC dummy">
                        <input name="pic_name" required />
                      </Field>
                      <Field label="Telepon dummy">
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
                          {data.remotes.map((r) => (
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
                        ? "Send Trouble Ticket Gamas"
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
