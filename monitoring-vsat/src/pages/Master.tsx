import { useMemo, useState, type ReactNode } from "react";
import { Building2, ChevronRight, MapPin, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EmptyState,
  FieldLabel,
  PageHeader,
  lama,
  waktu,
} from "@/components/npr";
import {
  BarisRingkasan,
  KepalaUrut,
  Toolbar,
  urutkan,
  useUrut,
  type Chip,
  type Urut,
} from "@/components/tabel";
import { useApp } from "@/lib/app";
import type { Customer, Remote, Sla } from "@/lib/tipe";
import { useMuat } from "@/useMuat";
import { cn } from "@/lib/utils";

function Footer({ onBatal, sibuk }: { onBatal: () => void; sibuk: boolean }) {
  return (
    <DialogFooter className="gap-2 border-t pt-4">
      <Button type="button" variant="outline" onClick={onBatal}>
        Batal
      </Button>
      <Button type="submit" disabled={sibuk}>
        {sibuk ? "Menyimpan…" : "Simpan"}
      </Button>
    </DialogFooter>
  );
}

/** Judul kelompok isian di dalam dialog. */
function Kelompok({ judul, children }: { judul: string; children: ReactNode }) {
  return (
    <section
      className="space-y-4 border-t pt-5 first:border-t-0 first:pt-0"
      aria-label={judul}
    >
      <h3 className="text-sm font-semibold">{judul}</h3>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Customer                                                            */
/* ------------------------------------------------------------------ */

type KolomCustomer =
  | "kode"
  | "nama"
  | "remote"
  | "vsat"
  | "m2m"
  | "aktif"
  | "bulanIni"
  | "sla";

const TARGET_SLA = 99.5;
const persen = (v: number) =>
  v.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + "%";
const bulanIniWib = () =>
  new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);

/**
 * Data master (customer + remote, sudah berisi jumlah NPR dari server) dan
 * SLA bulan berjalan per remote.
 */
function useMaster() {
  const { api, versi } = useApp();
  const master = useMuat<{ customers: Customer[]; remotes: Remote[] }>(
    "/api/master",
    api,
    versi,
  );
  const sla = useMuat<Sla>(`/api/sla?month=${bulanIniWib()}`, api, versi);
  const slaRemote = useMemo(
    () =>
      new Map(
        (sla.data?.rows ?? [])
          .filter((r) => r.sla !== null)
          .map((r) => [r.remote_id, r.sla as number]),
      ),
    [sla.data],
  );
  return {
    customers: master.data?.customers ?? [],
    remotes: master.data?.remotes ?? [],
    slaRemote,
    target: sla.data?.target ?? TARGET_SLA,
    siap: !!master.data,
    error: master.error,
  };
}

/** Angka per customer: jumlah remote, NPR dari server, rata-rata SLA remote-nya. */
function statistik(
  c: Customer,
  remotes: Remote[],
  slaRemote: Map<number, number>,
) {
  const milik = remotes.filter((r) => r.customer_id === c.id);
  const sla = milik
    .map((r) => slaRemote.get(r.id))
    .filter((v): v is number => v !== undefined);
  return {
    remote: milik.length,
    vsat: milik.filter((r) => r.jarkom === "VSAT").length,
    m2m: milik.filter((r) => r.jarkom === "M2M").length,
    aktif: c.npr_aktif ?? 0,
    bulanIni: c.npr_bulan_ini ?? 0,
    sla: sla.length ? sla.reduce((t, v) => t + v, 0) / sla.length : null,
  };
}

/** Kepala kolom angka: rata kanan, ikon urut di kiri teks. */
const kananUrut = "text-right [&>button]:flex-row-reverse";

export function CustomerPage() {
  const { go, kirim, sibuk } = useApp();
  const { customers, remotes, slaRemote, target, siap, error } = useMaster();
  const [form, setForm] = useState(false);
  const [cari, setCari] = useState("");
  const [urut, gantiUrut] = useUrut<KolomCustomer>(
    { kolom: "nama", arah: "naik" },
    ["remote", "vsat", "m2m", "aktif", "bulanIni"],
  );
  const semua = useMemo(
    () =>
      customers.map((c) => ({ ...c, st: statistik(c, remotes, slaRemote) })),
    [customers, remotes, slaRemote],
  );

  const hasil = useMemo(
    () =>
      urutkan(
        semua.filter((c) =>
          `${c.code} ${c.name}`.toLowerCase().includes(cari.toLowerCase()),
        ),
        (c) =>
          urut.kolom === "kode"
            ? c.code
            : urut.kolom === "nama"
              ? c.name
              : (c.st[urut.kolom] ?? -1),
        urut.arah,
        (a, b) => a.name.localeCompare(b.name),
      ),
    [semua, cari, urut],
  );

  return (
    <>
      <PageHeader
        title="Customer"
        desc="Bank pemilik site ATM. Kode customer dipakai sebagai awalan Site ID."
        actions={
          <Button onClick={() => setForm(true)}>
            <Plus className="size-4" /> Tambah Customer
          </Button>
        }
      />
      <div className="rounded-md border bg-card">
        <Toolbar
          cari={cari}
          onCari={setCari}
          placeholder="Cari Kode atau Nama Customer"
          jumlahFilter={0}
          onHapusFilter={() => {}}
        />
        <BarisRingkasan
          jumlah={hasil.length}
          satuan="customer"
          chip={[]}
          onHapusSemua={() => {}}
        />
        {!siap ? (
          <p
            className={cn(
              "px-4 py-10 text-center text-sm",
              error ? "text-rose-700" : "text-muted-foreground",
            )}
          >
            {error || "Memuat data…"}
          </p>
        ) : hasil.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[960px] table-fixed text-[13px]">
                <colgroup>
                  <col className="w-[110px]" />
                  <col />
                  <col className="w-[96px]" />
                  <col className="w-[84px]" />
                  <col className="w-[84px]" />
                  <col className="w-[110px]" />
                  <col className="w-[130px]" />
                  <col className="w-[160px]" />
                  <col className="w-[44px]" />
                </colgroup>
                <thead>
                  {/* Baris kelompok: memperjelas kolom mana yang dari data remote,
                      NPR, dan SLA. */}
                  <tr className="border-b text-xs text-muted-foreground">
                    <th colSpan={2} />
                    <th
                      colSpan={3}
                      className="border-l px-4 pb-1 pt-2 text-center font-medium"
                    >
                      Remote
                    </th>
                    <th
                      colSpan={2}
                      className="border-l px-4 pb-1 pt-2 text-center font-medium"
                    >
                      NPR
                    </th>
                    <th className="border-l px-4 pb-1 pt-2 text-center font-medium">
                      Laporan SLA
                    </th>
                    <th />
                  </tr>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <KepalaUrut kolom="kode" urut={urut} onUrut={gantiUrut}>
                      Kode
                    </KepalaUrut>
                    <KepalaUrut kolom="nama" urut={urut} onUrut={gantiUrut}>
                      Nama Customer
                    </KepalaUrut>
                    <KepalaUrut
                      kolom="remote"
                      urut={urut}
                      onUrut={gantiUrut}
                      className={`${kananUrut} border-l`}
                    >
                      Total
                    </KepalaUrut>
                    <KepalaUrut
                      kolom="vsat"
                      urut={urut}
                      onUrut={gantiUrut}
                      className={kananUrut}
                    >
                      VSAT
                    </KepalaUrut>
                    <KepalaUrut
                      kolom="m2m"
                      urut={urut}
                      onUrut={gantiUrut}
                      className={kananUrut}
                    >
                      M2M
                    </KepalaUrut>
                    <KepalaUrut
                      kolom="aktif"
                      urut={urut}
                      onUrut={gantiUrut}
                      className={`${kananUrut} border-l`}
                    >
                      Aktif
                    </KepalaUrut>
                    <KepalaUrut
                      kolom="bulanIni"
                      urut={urut}
                      onUrut={gantiUrut}
                      className={kananUrut}
                    >
                      Bulan Ini
                    </KepalaUrut>
                    <KepalaUrut
                      kolom="sla"
                      urut={urut}
                      onUrut={gantiUrut}
                      className={`${kananUrut} border-l`}
                    >
                      Rata-rata Bulan Ini
                    </KepalaUrut>
                    <th>
                      <span className="sr-only">Lihat remote</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {hasil.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => go("remote", c.id)}
                      className="group cursor-pointer hover:bg-muted/40"
                      title={`Lihat remote ${c.name}`}
                    >
                      <td className="px-4 py-3 font-semibold">{c.code}</td>
                      <td className="px-4 py-3">{c.name}</td>
                      <td className="border-l px-4 py-3 text-right tabular-nums">
                        {c.st.remote}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right tabular-nums",
                          !c.st.vsat && "text-muted-foreground",
                        )}
                      >
                        {c.st.vsat}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right tabular-nums",
                          !c.st.m2m && "text-muted-foreground",
                        )}
                      >
                        {c.st.m2m}
                      </td>
                      <td
                        className={cn(
                          "border-l px-4 py-3 text-right tabular-nums",
                          c.st.aktif
                            ? "font-semibold"
                            : "text-muted-foreground",
                        )}
                      >
                        {c.st.aktif}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right tabular-nums",
                          !c.st.bulanIni && "text-muted-foreground",
                        )}
                      >
                        {c.st.bulanIni}
                      </td>
                      <td
                        className={cn(
                          "border-l px-4 py-3 text-right tabular-nums",
                          c.st.sla !== null &&
                            c.st.sla < target &&
                            "font-semibold text-rose-700",
                        )}
                      >
                        {c.st.sla === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          persen(c.st.sla)
                        )}
                      </td>
                      <td className="pr-3 text-muted-foreground">
                        <ChevronRight className="ml-auto size-4 opacity-0 group-hover:opacity-100" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y md:hidden">
              {hasil.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => go("remote", c.id)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold">{c.code}</span>
                        {c.st.sla !== null && (
                          <span
                            className={cn(
                              "text-xs tabular-nums",
                              c.st.sla < target
                                ? "font-semibold text-rose-700"
                                : "text-muted-foreground",
                            )}
                          >
                            SLA {persen(c.st.sla)}
                          </span>
                        )}
                      </span>
                      <span className="block text-sm">{c.name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                        {c.st.remote} remote ({c.st.vsat} VSAT, {c.st.m2m} M2M)
                        · {c.st.aktif} NPR aktif
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : semua.length ? (
          <EmptyState
            icon={Search}
            title="Tidak ada customer yang cocok"
            desc="Ubah kata kunci pencarian."
          />
        ) : (
          <EmptyState
            icon={Building2}
            title="Belum ada customer"
            desc="Tambahkan bank pemilik ATM sebelum menambah remote."
            action={
              <Button variant="outline" onClick={() => setForm(true)}>
                <Plus className="size-4" /> Tambah Customer
              </Button>
            }
          />
        )}
        {semua.length > 0 && (
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            NPR Aktif = belum Closed. Bulan Ini dan Rata-rata SLA memakai
            periode {bulanIniWib().slice(5, 7)}/{bulanIniWib().slice(0, 4)}{" "}
            (WIB). Klik baris untuk melihat remote customer tersebut.
          </p>
        )}
      </div>

      <Dialog open={form} onOpenChange={setForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Customer</DialogTitle>
            <DialogDescription>Bank pemilik site ATM.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const hasil = await kirim(
                "/api/customers",
                { code: f.get("code"), name: f.get("name") },
                "Customer berhasil disimpan.",
              );
              if (hasil) setForm(false);
            }}
          >
            <label className="block">
              <FieldLabel hint="Huruf dan angka, maks. 12">Kode</FieldLabel>
              <Input
                name="code"
                required
                maxLength={12}
                pattern="[A-Za-z0-9]+"
                placeholder="Mis. BRI"
                className="uppercase placeholder:normal-case"
              />
            </label>
            <label className="block">
              <FieldLabel>Nama Bank</FieldLabel>
              <Input
                name="name"
                required
                maxLength={100}
                placeholder="Mis. Bank Rakyat Nusantara"
              />
            </label>
            <Footer onBatal={() => setForm(false)} sibuk={sibuk} />
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Remote                                                              */
/* ------------------------------------------------------------------ */

type KolomRemote =
  | "site"
  | "lokasi"
  | "jarkom"
  | "kota"
  | "pic"
  | "aktif"
  | "bulanIni"
  | "sla";

const PILIHAN_URUT: {
  value: string;
  label: string;
  urut: Urut<KolomRemote>;
}[] = [
  {
    value: "site-naik",
    label: "Site ID, A–Z",
    urut: { kolom: "site", arah: "naik" },
  },
  {
    value: "lokasi-naik",
    label: "Lokasi, A–Z",
    urut: { kolom: "lokasi", arah: "naik" },
  },
  {
    value: "kota-naik",
    label: "Kota, A–Z",
    urut: { kolom: "kota", arah: "naik" },
  },
];

/** Angka per remote (dari server) dan SLA bulan berjalan. */
function statRemote(r: Remote, slaRemote: Map<number, number>) {
  return {
    aktif: r.npr_aktif ?? 0,
    bulanIni: r.npr_bulan_ini ?? 0,
    sla: slaRemote.get(r.id) ?? null,
    terakhir: r.npr_terakhir_number
      ? {
          number: r.npr_terakhir_number,
          status: r.npr_terakhir_status ?? "",
          remote_status: r.npr_terakhir_gangguan ?? "",
          started_at: r.npr_terakhir_mulai ?? "",
          online_at: r.npr_terakhir_online ?? null,
        }
      : undefined,
  };
}

function nilaiRemote(
  r: Remote,
  kolom: KolomRemote,
  slaRemote: Map<number, number>,
) {
  switch (kolom) {
    case "site":
      return r.site_id;
    case "lokasi":
      return r.location;
    case "jarkom":
      return r.jarkom;
    case "kota":
      return `${r.city} ${r.address}`;
    case "pic":
      return r.pic_name;
    case "aktif":
    case "bulanIni":
      return statRemote(r, slaRemote)[kolom];
    case "sla":
      return statRemote(r, slaRemote).sla ?? -1;
  }
}

export function RemotePage() {
  const { go, param, gantiParam, kirim, sibuk } = useApp();
  const { customers, remotes, slaRemote, target, siap, error } = useMaster();
  const customerById = (id: number) =>
    customers.find((c) => c.id === id) ?? { name: "…" };
  const [form, setForm] = useState(false);
  const [jarkomBaru, setJarkomBaru] = useState("VSAT");
  const [cari, setCari] = useState("");
  // Dari halaman Customer: langsung tersaring ke customer yang diklik.
  // Saringan customer tersimpan di alamat: /remote?customer=3.
  const customer = typeof param === "number" ? String(param) : "semua";
  const setCustomer = (v: string) =>
    gantiParam(v === "semua" ? undefined : Number(v));
  const [jarkom, setJarkom] = useState("semua");
  const [urut, gantiUrut, setUrut] = useUrut<KolomRemote>({
    kolom: "site",
    arah: "naik",
  });
  const semua = remotes;

  const hasil = useMemo(() => {
    const q = cari.toLowerCase();
    return urutkan(
      semua.filter(
        (r) =>
          (customer === "semua" || String(r.customer_id) === customer) &&
          (jarkom === "semua" || r.jarkom === jarkom) &&
          `${r.site_id} ${r.location} ${r.city} ${r.address} ${r.pic_name} ${r.ip_lan}`
            .toLowerCase()
            .includes(q),
      ),
      (r) => nilaiRemote(r, urut.kolom, slaRemote),
      urut.arah,
      (a, b) => a.site_id.localeCompare(b.site_id),
    );
  }, [semua, cari, customer, jarkom, urut, slaRemote]);

  const chip = [
    customer !== "semua" && {
      label: `Customer: ${customerById(Number(customer)).name}`,
      hapus: () => setCustomer("semua"),
    },
    jarkom !== "semua" && {
      label: `Jarkom: ${jarkom}`,
      hapus: () => setJarkom("semua"),
    },
  ].filter(Boolean) as Chip[];
  const hapusFilter = () => {
    setCustomer("semua");
    setJarkom("semua");
  };

  return (
    <>
      <PageHeader
        title="Remote"
        desc="Site ATM yang dipantau helpdesk. Data ini dipakai di NPR, TT, dan Laporan SLA."
        actions={
          <Button onClick={() => setForm(true)}>
            <Plus className="size-4" /> Tambah Remote
          </Button>
        }
      />
      <div className="rounded-md border bg-card">
        <Toolbar
          cari={cari}
          onCari={setCari}
          placeholder="Cari Site, Lokasi, Kota, PIC, atau IP"
          jumlahFilter={chip.length}
          onHapusFilter={hapusFilter}
        >
          <label className="block">
            <FieldLabel>Customer</FieldLabel>
            <Select value={customer} onValueChange={setCustomer}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Customer</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block">
            <FieldLabel>Jarkom</FieldLabel>
            <Select value={jarkom} onValueChange={setJarkom}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Jarkom</SelectItem>
                <SelectItem value="VSAT">VSAT</SelectItem>
                <SelectItem value="M2M">M2M</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="block md:hidden">
            <FieldLabel>Urutkan</FieldLabel>
            <Select
              value={`${urut.kolom}-${urut.arah}`}
              onValueChange={(v) =>
                setUrut(PILIHAN_URUT.find((p) => p.value === v)!.urut)
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Pilih Urutan" />
              </SelectTrigger>
              <SelectContent>
                {PILIHAN_URUT.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </Toolbar>
        <BarisRingkasan
          jumlah={hasil.length}
          satuan="remote"
          chip={chip}
          onHapusSemua={hapusFilter}
        />

        {!siap ? (
          <p
            className={cn(
              "px-4 py-10 text-center text-sm",
              error ? "text-rose-700" : "text-muted-foreground",
            )}
          >
            {error || "Memuat data…"}
          </p>
        ) : hasil.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              {/* Lebar kolom tetap sesuai isi; sisa ruang di layar lebar jatuh
                  ke kolom terakhir, supaya jarak antar-nilai sama di semua layar. */}
              <table className="w-full min-w-[920px] table-fixed text-[13px]">
                <colgroup>
                  <col className="w-[145px]" />
                  <col className="w-[250px]" />
                  <col className="w-[80px]" />
                  <col className="w-[205px]" />
                  <col className="w-[120px]" />
                  {/* Layar lebar: kolom angka mulai 1660 px, Gangguan Terakhir
                      mulai 1880 px (mengisi sisa ruang). Batas dipilih dari total
                      lebar kolom supaya tabel tidak pernah meluber ke samping. */}
                  <col className="min-[1880px]:w-[170px]" />
                  <col className="hidden min-[1880px]:table-column" />
                  <col className="hidden w-[100px] min-[1660px]:table-column" />
                  <col className="hidden w-[115px] min-[1660px]:table-column" />
                  <col className="hidden w-[125px] min-[1660px]:table-column" />
                </colgroup>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <KepalaUrut kolom="site" urut={urut} onUrut={gantiUrut}>
                      Site ID
                    </KepalaUrut>
                    <KepalaUrut kolom="lokasi" urut={urut} onUrut={gantiUrut}>
                      Lokasi / Customer
                    </KepalaUrut>
                    <KepalaUrut kolom="jarkom" urut={urut} onUrut={gantiUrut}>
                      Jarkom
                    </KepalaUrut>
                    <KepalaUrut kolom="kota" urut={urut} onUrut={gantiUrut}>
                      Alamat
                    </KepalaUrut>
                    <th className="px-4 py-2 font-medium">IP LAN</th>
                    <KepalaUrut kolom="pic" urut={urut} onUrut={gantiUrut}>
                      PIC
                    </KepalaUrut>
                    <th className="hidden px-4 py-2 font-medium min-[1880px]:table-cell">
                      Gangguan Terakhir
                    </th>
                    <KepalaUrut
                      kolom="aktif"
                      urut={urut}
                      onUrut={gantiUrut}
                      className={`hidden min-[1660px]:table-cell ${kananUrut}`}
                    >
                      NPR Aktif
                    </KepalaUrut>
                    <KepalaUrut
                      kolom="bulanIni"
                      urut={urut}
                      onUrut={gantiUrut}
                      className={`hidden min-[1660px]:table-cell ${kananUrut}`}
                    >
                      NPR Bulan Ini
                    </KepalaUrut>
                    <KepalaUrut
                      kolom="sla"
                      urut={urut}
                      onUrut={gantiUrut}
                      className={`hidden min-[1660px]:table-cell ${kananUrut}`}
                    >
                      SLA Bulan Ini
                    </KepalaUrut>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {hasil.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-3 font-semibold tabular-nums">
                        {r.site_id}
                      </td>
                      <td className="px-4 py-3">
                        <div>{r.location}</div>
                        <div className="text-xs text-muted-foreground">
                          {customerById(r.customer_id).name}
                        </div>
                      </td>
                      <td className="px-4 py-3">{r.jarkom}</td>
                      <td className="px-4 py-3">
                        <div>{r.address}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.city}, {r.province}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {r.ip_lan}
                      </td>
                      <td className="px-4 py-3">
                        <div>{r.pic_name}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {r.pic_phone}
                        </div>
                      </td>
                      {(() => {
                        const st = statRemote(r, slaRemote);
                        return (
                          <>
                            <td className="hidden px-4 py-3 min-[1880px]:table-cell">
                              {st.terakhir ? (
                                <>
                                  <div>
                                    {st.terakhir.remote_status}{" "}
                                    <span className="text-muted-foreground">
                                      · {st.terakhir.number}
                                    </span>
                                  </div>
                                  {/* Jam dan lama gangguan di baris sendiri:
                                      titik pemisah tepat setelah jam (11.09 ·)
                                      terbaca seperti salah ketik. */}
                                  <div className="text-xs text-muted-foreground">
                                    {waktu(st.terakhir.started_at)}
                                  </div>
                                  {st.terakhir.status === "CLOSED" ? (
                                    <div className="text-xs text-muted-foreground">
                                      Selesai dalam{" "}
                                      {lama(
                                        st.terakhir.started_at,
                                        st.terakhir.online_at,
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-xs font-medium text-amber-700">
                                      Masih aktif
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span className="text-muted-foreground">
                                  Belum ada NPR
                                </span>
                              )}
                            </td>
                            <td
                              className={cn(
                                "hidden px-4 py-3 text-right tabular-nums min-[1660px]:table-cell",
                                st.aktif
                                  ? "font-semibold"
                                  : "text-muted-foreground",
                              )}
                            >
                              {st.aktif}
                            </td>
                            <td
                              className={cn(
                                "hidden px-4 py-3 text-right tabular-nums min-[1660px]:table-cell",
                                !st.bulanIni && "text-muted-foreground",
                              )}
                            >
                              {st.bulanIni}
                            </td>
                            <td
                              className={cn(
                                "hidden px-4 py-3 text-right tabular-nums min-[1660px]:table-cell",
                                st.sla !== null &&
                                  st.sla < target &&
                                  "font-semibold text-rose-700",
                              )}
                            >
                              {st.sla === null ? "—" : persen(st.sla)}
                            </td>
                          </>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y md:hidden">
              {hasil.map((r) => (
                <li key={r.id} className="px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold tabular-nums">
                      {r.site_id}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {r.jarkom}
                    </span>
                  </div>
                  <div className="mt-1 text-sm">{r.location}</div>
                  <div className="text-xs text-muted-foreground">
                    {customerById(r.customer_id).name} · {r.city}
                  </div>
                  <dl className="mt-2 grid grid-cols-[52px_1fr] gap-x-2 gap-y-0.5 text-xs">
                    <dt className="text-muted-foreground">PIC</dt>
                    <dd>
                      {r.pic_name} ·{" "}
                      <span className="tabular-nums">{r.pic_phone}</span>
                    </dd>
                    <dt className="text-muted-foreground">IP LAN</dt>
                    <dd className="font-mono">{r.ip_lan}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        ) : semua.length ? (
          <EmptyState
            icon={Search}
            title="Tidak ada remote yang cocok"
            desc="Ubah kata kunci atau hapus filter."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setCari("");
                  hapusFilter();
                }}
              >
                Hapus Semua Filter
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={MapPin}
            title="Belum ada remote"
            desc={
              customers.length
                ? "Daftarkan site ATM yang dipantau helpdesk."
                : "Tambahkan customer lebih dulu, lalu daftarkan site ATM-nya di sini."
            }
            action={
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => go("customer")}>
                  Ke Customer
                </Button>
                <Button onClick={() => setForm(true)}>
                  <Plus className="size-4" /> Tambah Remote
                </Button>
              </div>
            }
          />
        )}
      </div>

      <Dialog open={form} onOpenChange={setForm}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tambah Remote</DialogTitle>
            <DialogDescription>
              Data site ATM untuk NPR, TT, dan Laporan SLA.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const body = Object.fromEntries(f.entries()) as Record<
                string,
                unknown
              >;
              body.customer_id = Number(body.customer_id);
              body.jarkom = jarkomBaru;
              const hasil = await kirim(
                "/api/remotes",
                body,
                "Remote berhasil disimpan.",
              );
              if (hasil) setForm(false);
            }}
          >
            <Kelompok judul="Site">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <div>
                  <FieldLabel>Customer</FieldLabel>
                  <Select name="customer_id" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Jarkom</FieldLabel>
                  <ToggleGroup
                    type="single"
                    value={jarkomBaru}
                    onValueChange={(v) => v && setJarkomBaru(v)}
                    className="inline-flex justify-start rounded-md border p-0.5"
                  >
                    {["VSAT", "M2M"].map((j) => (
                      <ToggleGroupItem
                        key={j}
                        value={j}
                        className="h-8 px-5 data-[state=on]:bg-navy data-[state=on]:text-white"
                      >
                        {j}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <label>
                  <FieldLabel>Site ID</FieldLabel>
                  <Input
                    name="site_id"
                    required
                    maxLength={60}
                    placeholder="Mis. BRI-SBY-014"
                  />
                </label>
                <label>
                  <FieldLabel>Nama Lokasi ATM</FieldLabel>
                  <Input
                    name="location"
                    required
                    maxLength={200}
                    placeholder="Mis. ATM Pasar Atom"
                  />
                </label>
              </div>
            </Kelompok>
            <Kelompok judul="Lokasi">
              <label className="block">
                <FieldLabel>Alamat</FieldLabel>
                <Textarea name="address" rows={2} required />
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label>
                  <FieldLabel>Kota</FieldLabel>
                  <Input name="city" required />
                </label>
                <label>
                  <FieldLabel>Provinsi</FieldLabel>
                  <Input name="province" required />
                </label>
              </div>
            </Kelompok>
            <Kelompok judul="Jaringan dan PIC">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label>
                  <FieldLabel>IP LAN</FieldLabel>
                  <Input
                    name="ip_lan"
                    required
                    placeholder="192.0.2.10"
                    className="font-mono"
                  />
                </label>
                <label>
                  <FieldLabel>Nama PIC</FieldLabel>
                  <Input name="pic_name" required />
                </label>
                <label>
                  <FieldLabel>Telepon PIC</FieldLabel>
                  <Input name="pic_phone" required inputMode="tel" />
                </label>
              </div>
            </Kelompok>
            <Footer onBatal={() => setForm(false)} sibuk={sibuk} />
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
