import { useCallback, useEffect, useState, type MouseEvent } from "react";
import {
  BarChart3,
  Building2,
  ChevronDown,
  FileWarning,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  RadioTower,
  Ticket,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppCtx, type AppState, type Page } from "@/lib/app";
import { keAlamat, lokasiSekarang, type Lokasi } from "@/lib/alamat";
import type { User } from "@/lib/tipe";
import { cn } from "@/lib/utils";
import { namaPeran } from "@/peran";
import logoTm from "@/aset/logo-tm.png";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { NprBaru, NprDetail, NprList } from "@/pages/Npr";
import { TroubleTicket } from "@/pages/Tiket";
import { GamasDetail, GamasList } from "@/pages/Gamas";
import { LaporanSla } from "@/pages/Sla";
import { CustomerPage, RemotePage } from "@/pages/Master";
import { PenggunaPage } from "@/pages/Pengguna";
import { GantiPassword } from "@/pages/GantiPassword";

type ItemMenu = {
  page: Page;
  label: string;
  icon: typeof Menu;
  aktif?: Page[];
  admin?: boolean;
};
const MENU: { grup: string; item: ItemMenu[] }[] = [
  {
    grup: "Operasional",
    item: [
      { page: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      {
        page: "npr",
        label: "NPR",
        icon: FileWarning,
        aktif: ["npr-baru", "npr-detail"],
      },
      { page: "tt", label: "Trouble Ticket", icon: Ticket },
      {
        page: "gamas",
        label: "TT Gamas",
        icon: RadioTower,
        aktif: ["gamas-detail"],
      },
    ],
  },
  {
    grup: "Laporan",
    item: [{ page: "sla", label: "Laporan SLA", icon: BarChart3 }],
  },
  {
    grup: "Data Master",
    item: [
      { page: "customer", label: "Customer", icon: Building2 },
      { page: "remote", label: "Remote", icon: MapPin },
    ],
  },
  {
    grup: "Admin",
    item: [{ page: "pengguna", label: "Pengguna", icon: Users, admin: true }],
  },
];

const judulHalaman: Record<Page, string> = {
  dashboard: "Dashboard",
  npr: "NPR",
  "npr-baru": "NPR Baru",
  "npr-detail": "Detail",
  tt: "Trouble Ticket",
  gamas: "Trouble Ticket Gamas",
  "gamas-detail": "Detail",
  sla: "Laporan SLA",
  customer: "Customer",
  remote: "Remote",
  pengguna: "Pengguna",
};
/** Judul tab browser: halaman detail diberi nama lengkap. */
const judulTab: Record<Page, string> = {
  ...judulHalaman,
  "npr-detail": "Detail NPR",
  "gamas-detail": "Detail TT Gamas",
};
/** Halaman turunan: ditampilkan di bawah induknya pada breadcrumb. */
const indukHalaman: Partial<Record<Page, Page>> = {
  "npr-baru": "npr",
  "npr-detail": "npr",
  "gamas-detail": "gamas",
};

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white">
        <img src={logoTm} alt="Logo PT. Tangara Mitrakom" className="size-7" />
      </span>
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-wide text-white">
          NPR
        </div>
        <div className="text-xs text-slate-300">PT. Tangara Mitrakom</div>
      </div>
    </div>
  );
}

function Navigasi({
  page,
  go,
  admin,
}: {
  page: Page;
  go: (p: Page) => void;
  admin: boolean;
}) {
  return (
    <nav
      className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-5"
      aria-label="Menu utama"
    >
      {MENU.map((g) => {
        const item = g.item.filter((m) => !m.admin || admin);
        if (!item.length) return null;
        return (
          <div key={g.grup}>
            <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              {g.grup}
            </div>
            <ul className="space-y-0.5">
              {item.map((m) => {
                const aktif = page === m.page || m.aktif?.includes(page);
                const Icon = m.icon;
                return (
                  <li key={m.page}>
                    <a
                      href={keAlamat(m.page)}
                      onClick={(e) => ikutiTautan(e, () => go(m.page))}
                      aria-current={aktif ? "page" : undefined}
                      className={cn(
                        "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
                        aktif
                          ? "bg-white/[0.12] text-white shadow-[inset_2px_0_0_#53e9fa]"
                          : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-[18px]",
                          aktif
                            ? "text-cyan-brand"
                            : "text-slate-400 group-hover:text-slate-200",
                        )}
                        strokeWidth={1.9}
                      />
                      {m.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function KakiSidebar() {
  return (
    <div className="border-t border-white/10 px-5 py-4 text-xs leading-relaxed text-slate-400">
      Helpdesk VSAT &amp; M2M
      <br />
      Semua waktu dalam WIB
    </div>
  );
}

function Breadcrumb({ page, go }: { page: Page; go: (p: Page) => void }) {
  const induk = indukHalaman[page];
  const garis = (
    <span className="mx-1.5 text-border" aria-hidden>
      /
    </span>
  );
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center text-sm text-muted-foreground"
    >
      <span className="hidden lg:inline">Network Problem Report</span>
      <span className="hidden lg:inline">{garis}</span>
      {induk && (
        <>
          <a
            href={keAlamat(induk)}
            onClick={(e) => ikutiTautan(e, () => go(induk))}
            className="rounded hover:text-foreground hover:underline"
          >
            {judulHalaman[induk]}
          </a>
          {garis}
        </>
      )}
      <span
        aria-current="page"
        className="truncate font-medium text-foreground"
      >
        {judulHalaman[page]}
      </span>
    </nav>
  );
}

/**
 * Klik biasa pada tautan menu: pindah halaman tanpa memuat ulang. Ctrl/Cmd/
 * Shift atau klik tengah dibiarkan ke browser (buka di tab atau jendela baru).
 */
function ikutiTautan(e: MouseEvent<HTMLAnchorElement>, pindah: () => void) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  e.preventDefault();
  pindah();
}

/** Lokasi awal dari alamat; alamat yang tidak dikenal kembali ke Dashboard. */
function lokasiAwal(): Lokasi {
  const lokasi = lokasiSekarang();
  if (lokasi) return lokasi;
  window.history.replaceState(null, "", "/");
  return { page: "dashboard" };
}

const inisial = (nama: string) =>
  nama
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [memeriksa, setMemeriksa] = useState(true);
  const [{ page, param }, setLokasi] = useState<Lokasi>(lokasiAwal);
  const [menuHp, setMenuHp] = useState(false);
  const [gantiPassword, setGantiPassword] = useState(false);
  const [versi, setVersi] = useState(0);
  const [sibuk, setSibuk] = useState(false);

  // Dibungkus useCallback supaya tetap sama di setiap render dan aman
  // dipakai sebagai dependensi useEffect.
  const api = useCallback(
    async <T,>(path: string, body?: unknown): Promise<T> => {
      const response = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        headers:
          body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 && path !== "/api/login") setUser(null);
        throw new Error(result.message || "Permintaan gagal diproses.");
      }
      return result as T;
    },
    [],
  );

  // Periksa sesi yang masih berlaku saat halaman dibuka.
  useEffect(() => {
    let hidup = true;
    fetch("/api/me")
      .then(async (r) => {
        if (r.status === 401) return;
        if (!r.ok) throw new Error("Tidak dapat memeriksa sesi.");
        const result = await r.json();
        if (hidup) setUser(result.user);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => {
        if (hidup) setMemeriksa(false);
      });
    return () => {
      hidup = false;
    };
  }, []);

  // Pindah halaman: alamat browser ikut berganti dan tercatat di riwayat,
  // supaya tombol Back kembali ke halaman sebelumnya.
  const go = useCallback((p: Page, prm?: string | number) => {
    const alamat = keAlamat(p, prm);
    if (alamat !== window.location.pathname + window.location.search)
      window.history.pushState(null, "", alamat);
    setLokasi({ page: p, param: prm });
    setMenuHp(false);
    window.scrollTo({ top: 0 });
  }, []);

  // Filter yang tercermin di alamat (kondisi NPR, bulan SLA, customer di
  // Remote) diganti tanpa menambah riwayat, jadi Back tidak berhenti di
  // setiap perubahan filter.
  const gantiParam = useCallback(
    (prm?: string | number) => {
      window.history.replaceState(null, "", keAlamat(page, prm));
      setLokasi({ page, param: prm });
    },
    [page],
  );

  // Tombol Back/Forward browser.
  useEffect(() => {
    const kembali = () => {
      setLokasi(lokasiSekarang() ?? { page: "dashboard" });
      setMenuHp(false);
    };
    window.addEventListener("popstate", kembali);
    return () => window.removeEventListener("popstate", kembali);
  }, []);

  // Judul tab mengikuti halaman, mis. "NPR Baru | PT. Tangara Mitrakom".
  useEffect(() => {
    const judul = !user ? "Masuk" : judulTab[page];
    document.title = `${judul} | PT. Tangara Mitrakom`;
  }, [user, page]);

  async function kirim<T = { id?: number }>(
    path: string,
    body: unknown,
    pesan: string,
  ) {
    if (sibuk) return undefined;
    setSibuk(true);
    try {
      const hasil = await api<T>(path, body);
      setVersi((v) => v + 1);
      toast.success(pesan);
      return hasil;
    } catch (e) {
      toast.error((e as Error).message);
      return undefined;
    } finally {
      setSibuk(false);
    }
  }

  async function keluar() {
    try {
      await api("/api/logout", {});
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    setUser(null);
    go("dashboard");
  }

  if (memeriksa) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Memeriksa sesi…
      </div>
    );
  }
  if (!user) {
    return (
      <>
        <Login
          api={api}
          onMasuk={(u) => {
            // Tetap di alamat yang dibuka, mis. link NPR dari rekan kerja.
            setUser(u);
            window.scrollTo({ top: 0 });
          }}
        />
        <Toaster position="top-right" richColors />
      </>
    );
  }

  const admin = user.peran === "admin";
  const state: AppState = {
    page,
    param,
    go,
    gantiParam,
    user,
    api,
    versi,
    kirim,
    sibuk,
    galat: (pesan) => toast.error(pesan),
  };

  return (
    <AppCtx.Provider value={state}>
      <div className="min-h-screen">
        {/* Sidebar layar lebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-navy lg:flex">
          <div className="flex h-14 items-center border-b border-white/10 px-3">
            <Brand />
          </div>
          <Navigasi page={page} go={go} admin={admin} />
          <KakiSidebar />
        </aside>

        {/* Sidebar HP: laci dari kiri */}
        <Sheet open={menuHp} onOpenChange={setMenuHp}>
          <SheetContent
            side="left"
            className="flex w-72 flex-col border-0 bg-navy p-0 text-white"
          >
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex h-14 items-center border-b border-white/10 px-3">
              <Brand />
            </div>
            <Navigasi page={page} go={go} admin={admin} />
            <KakiSidebar />
          </SheetContent>
        </Sheet>

        <div className="lg:pl-60">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-white/90 px-4 backdrop-blur sm:px-6">
            <button
              className="-ml-1 grid size-9 place-items-center rounded-md text-foreground hover:bg-muted lg:hidden"
              onClick={() => setMenuHp(true)}
              aria-label="Buka menu"
            >
              <Menu className="size-5" />
            </button>
            <Breadcrumb page={page} go={go} />

            <DropdownMenu>
              <DropdownMenuTrigger
                className="ml-auto flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Menu akun"
              >
                <span className="grid size-8 place-items-center rounded-full bg-navy text-xs font-semibold text-white">
                  {inisial(user.full_name)}
                </span>
                <span className="hidden leading-tight sm:block">
                  <span className="block text-sm font-semibold">
                    {user.full_name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {namaPeran[user.peran]}
                  </span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-semibold">{user.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {user.username} · {namaPeran[user.peran]}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setGantiPassword(true)}>
                  <KeyRound className="mr-2 size-4" /> Ganti Password
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void keluar()}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 size-4" /> Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <main className="w-full px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pt-7">
            {page === "dashboard" && <Dashboard />}
            {page === "npr" && <NprList />}
            {page === "npr-baru" && <NprBaru />}
            {page === "npr-detail" && <NprDetail />}
            {page === "tt" && <TroubleTicket />}
            {page === "gamas" && <GamasList />}
            {page === "gamas-detail" && <GamasDetail />}
            {page === "sla" && <LaporanSla />}
            {page === "customer" && <CustomerPage />}
            {page === "remote" && <RemotePage />}
            {page === "pengguna" &&
              (admin ? (
                <PenggunaPage />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Menu ini hanya untuk admin.
                </p>
              ))}
          </main>
        </div>

        <GantiPassword open={gantiPassword} onOpenChange={setGantiPassword} />
        <Toaster position="top-right" richColors />
      </div>
    </AppCtx.Provider>
  );
}
