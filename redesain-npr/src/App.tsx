import { useState } from "react";
import {
  BarChart3,
  ChevronDown,
  Database,
  FileWarning,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MapPin,
  RadioTower,
  Ticket,
  Users,
  Building2,
} from "lucide-react";
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
import { AppCtx, type Page } from "@/lib/app";
import { LOGO } from "@/lib/logo";
import { cn } from "@/lib/utils";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { NprBaru, NprDetail, NprList } from "@/pages/Npr";
import { TroubleTicket } from "@/pages/Tiket";
import { GamasDetail, GamasList } from "@/pages/Gamas";
import { LaporanSla } from "@/pages/Sla";
import { CustomerPage, RemotePage } from "@/pages/Master";
import { PenggunaPage } from "@/pages/Pengguna";
import { GantiPassword } from "@/pages/GantiPassword";

const MENU: { grup: string; item: { page: Page; label: string; icon: typeof Menu; aktif?: Page[] }[] }[] = [
  {
    grup: "Operasional",
    item: [
      { page: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { page: "npr", label: "NPR", icon: FileWarning, aktif: ["npr-baru", "npr-detail"] },
      { page: "tt", label: "Trouble Ticket", icon: Ticket },
      { page: "gamas", label: "TT Gamas", icon: RadioTower, aktif: ["gamas-detail"] },
    ],
  },
  { grup: "Laporan", item: [{ page: "sla", label: "Laporan SLA", icon: BarChart3 }] },
  {
    grup: "Data Master",
    item: [
      { page: "customer", label: "Customer", icon: Building2 },
      { page: "remote", label: "Remote", icon: MapPin },
    ],
  },
  { grup: "Admin", item: [{ page: "pengguna", label: "Pengguna", icon: Users }] },
];

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white">
        <img src={LOGO} alt="Logo PT. Tangara Mitrakom" className="size-7" />
      </span>
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-wide text-white">NPR</div>
        <div className="text-xs text-slate-300">PT. Tangara Mitrakom</div>
      </div>
    </div>
  );
}

function Navigasi({ page, go }: { page: Page; go: (p: Page) => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-5" aria-label="Menu utama">
      {MENU.map((g) => (
        <div key={g.grup}>
          <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            {g.grup}
          </div>
          <ul className="space-y-0.5">
            {g.item.map((m) => {
              const aktif = page === m.page || m.aktif?.includes(page);
              const Icon = m.icon;
              return (
                <li key={m.page}>
                  <button
                    onClick={() => go(m.page)}
                    aria-current={aktif ? "page" : undefined}
                    className={cn(
                      "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
                      aktif
                        ? "bg-white/[0.12] text-white shadow-[inset_2px_0_0_#53e9fa]"
                        : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    <Icon
                      className={cn("size-[18px]", aktif ? "text-cyan-brand" : "text-slate-400 group-hover:text-slate-200")}
                      strokeWidth={1.9}
                    />
                    {m.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
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

/** Halaman turunan: ditampilkan di bawah induknya pada breadcrumb. */
const indukHalaman: Partial<Record<Page, Page>> = {
  "npr-baru": "npr",
  "npr-detail": "npr",
  "gamas-detail": "gamas",
};

function Breadcrumb({ page, go }: { page: Page; go: (p: Page) => void }) {
  const induk = indukHalaman[page];
  const garis = <span className="mx-1.5 text-border" aria-hidden>/</span>;
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center text-sm text-muted-foreground">
      <span className="hidden lg:inline">Network Problem Report</span>
      <span className="hidden lg:inline">{garis}</span>
      {induk && (
        <>
          <button onClick={() => go(induk)} className="rounded hover:text-foreground hover:underline">
            {judulHalaman[induk]}
          </button>
          {garis}
        </>
      )}
      <span aria-current="page" className="truncate font-medium text-foreground">{judulHalaman[page]}</span>
    </nav>
  );
}

export default function App() {
  const [masuk, setMasuk] = useState(true);
  const [page, setPage] = useState<Page>("dashboard");
  const [param, setParam] = useState<string | number | undefined>();
  const [kosong, setKosong] = useState(false);
  const [menuHp, setMenuHp] = useState(false);
  const [gantiPassword, setGantiPassword] = useState(false);

  const go = (p: Page, prm?: string | number) => {
    setPage(p);
    setParam(prm);
    setMenuHp(false);
    window.scrollTo({ top: 0 });
  };

  if (!masuk) return <Login onMasuk={() => setMasuk(true)} />;

  return (
    <AppCtx.Provider value={{ page, param, go, kosong }}>
      <div className="min-h-screen">
        {/* Sidebar layar lebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-navy lg:flex">
          <div className="flex h-14 items-center border-b border-white/10 px-3">
            <Brand />
          </div>
          <Navigasi page={page} go={go} />
          <KakiSidebar />
        </aside>

        {/* Sidebar HP: laci dari kiri */}
        <Sheet open={menuHp} onOpenChange={setMenuHp}>
          <SheetContent side="left" className="flex w-72 flex-col border-0 bg-navy p-0 text-white">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex h-14 items-center border-b border-white/10 px-3">
              <Brand />
            </div>
            <Navigasi page={page} go={go} />
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
              <DropdownMenuTrigger className="ml-auto flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="grid size-8 place-items-center rounded-full bg-navy text-xs font-semibold text-white">
                  MS
                </span>
                <span className="hidden leading-tight sm:block">
                  <span className="block text-sm font-semibold">mimin suhendar</span>
                  <span className="block text-xs text-muted-foreground">Admin</span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-semibold">mimin suhendar</div>
                  <div className="text-xs text-muted-foreground">mimin · Admin</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setGantiPassword(true)}>
                  <KeyRound className="mr-2 size-4" /> Ganti Password
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMasuk(false)} className="text-destructive focus:text-destructive">
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
            {page === "pengguna" && <PenggunaPage />}
          </main>
        </div>

        <GantiPassword open={gantiPassword} onOpenChange={setGantiPassword} />
        <Toaster position="top-right" richColors />

        {/* Kontrol khusus prototipe, tidak ada di aplikasi asli. */}
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-1 rounded-full border bg-white p-1 text-xs shadow-lg">
          <span className="flex items-center gap-1 px-2 font-semibold text-muted-foreground">
            <Database className="size-3.5" /> Prototipe
          </span>
          {[
            [false, "Data Contoh"],
            [true, "Kosong"],
          ].map(([v, label]) => (
            <button
              key={String(v)}
              onClick={() => setKosong(v as boolean)}
              className={cn(
                "rounded-full px-3 py-1.5 font-medium",
                kosong === v ? "bg-navy text-white" : "text-foreground hover:bg-muted",
              )}
            >
              {label as string}
            </button>
          ))}
        </div>
      </div>
    </AppCtx.Provider>
  );
}
