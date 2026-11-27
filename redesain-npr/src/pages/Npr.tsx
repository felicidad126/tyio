import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  FileWarning,
  Paperclip,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
  EmptyState,
  FieldLabel,
  InfoList,
  PageHeader,
  Panel,
  StatusBadge,
  lama,
  waktu,
} from "@/components/npr";
import { BarisRingkasan, KepalaUrut, Toolbar, labelRentang, tanggalWib, urutkan, useUrut, type Chip, type Urut } from "@/components/tabel";
import { TanggalInput, WaktuInput, sekarangWib } from "@/components/tanggal";
import { useApp } from "@/lib/app";
import {
  JENIS_GANGGUAN,
  customerById,
  customers,
  nprs,
  remoteById,
  remotes,
} from "@/lib/data";
import { cn } from "@/lib/utils";

const KONDISI: Record<string, string> = {
  aktif: "NPR Aktif",
  kritis: "Aktif Lebih dari 48 Jam",
  aging: "Aktif 24–48 Jam",
  menunggu_report: "TT Menunggu Report",
  pending_tm: "Pending TM",
  pending_customer: "Pending Customer",
  belum_kategori: "Belum Dikategorikan",
};

function cocokKondisi(n: (typeof nprs)[number], k: string) {
  const jam = (Date.now() - Date.parse(n.started_at)) / 3600_000;
  const aktif = n.status !== "CLOSED";
  return {
    aktif,
    kritis: aktif && jam > 48,
    aging: aktif && jam >= 24 && jam <= 48,
    menunggu_report: aktif && !!n.ticket && !n.ticket.report,
    pending_tm: aktif && n.pending_by === "TM",
    pending_customer: aktif && n.pending_by === "Customer",
    belum_kategori: aktif && !n.pending_by,
  }[k] as boolean;
}

type Npr = (typeof nprs)[number];
type KolomUrut = "nomor" | "customer" | "gangguan" | "mulai" | "status" | "pending";
type UrutNpr = Urut<KolomUrut>;

const URUTAN_STATUS = ["OPEN", "PENDING", "ESKALASI", "CLOSED"] as const;
const LABEL_STATUS: Record<string, string> = { OPEN: "Open", PENDING: "Pending", ESKALASI: "Eskalasi", CLOSED: "Closed" };

const PILIHAN_URUT: { value: string; label: string; urut: UrutNpr }[] = [
  { value: "nomor-turun", label: "No. NPR, Terbaru", urut: { kolom: "nomor", arah: "turun" } },
  { value: "nomor-naik", label: "No. NPR, Terlama", urut: { kolom: "nomor", arah: "naik" } },
  { value: "mulai-turun", label: "Mulai Gangguan, Terbaru", urut: { kolom: "mulai", arah: "turun" } },
  { value: "mulai-naik", label: "Mulai Gangguan, Terlama", urut: { kolom: "mulai", arah: "naik" } },
  { value: "customer-naik", label: "Customer, A–Z", urut: { kolom: "customer", arah: "naik" } },
  { value: "status-naik", label: "Status, Open dulu", urut: { kolom: "status", arah: "naik" } },
];

/** Nilai pembanding untuk tiap kolom yang bisa diurutkan. */
function nilaiUrut(n: Npr, kolom: KolomUrut): string | number {
  const r = remoteById(n.remote_id);
  switch (kolom) {
    case "nomor":
      return n.number;
    case "customer":
      return `${customerById(r.customer_id).name} ${r.site_id}`;
    case "gangguan":
      return n.remote_status;
    case "mulai":
      return Date.parse(n.started_at);
    case "status":
      return URUTAN_STATUS.indexOf(n.status);
    case "pending":
      // Kosong ditaruh paling akhir saat urut naik.
      return n.pending_by || "~";
  }
}

export function NprList() {
  const { go, kosong, param } = useApp();
  const [cari, setCari] = useState("");
  const [customer, setCustomer] = useState("semua");
  const [status, setStatus] = useState("semua");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [kondisi, setKondisi] = useState(typeof param === "string" ? param : "");
  const [urut, gantiUrut, setUrut] = useUrut<KolomUrut>({ kolom: "nomor", arah: "turun" }, ["nomor", "mulai"]);
  const [per, setPer] = useState("25");

  // Hasil semua filter kecuali status. Dipakai untuk menghitung angka di
  // setiap pilihan status.
  const dasar = useMemo(
    () =>
      (kosong ? [] : nprs).filter((n) => {
        const r = remoteById(n.remote_id);
        const teks = `${n.number} ${n.ticket?.number ?? ""} ${r.site_id} ${r.location} ${customerById(r.customer_id).name} ${n.last_action}`.toLowerCase();
        const tgl = tanggalWib(n.started_at);
        return (
          teks.includes(cari.toLowerCase()) &&
          (customer === "semua" || String(r.customer_id) === customer) &&
          (!dari || tgl >= dari) &&
          (!sampai || tgl <= sampai) &&
          (!kondisi || cocokKondisi(n, kondisi))
        );
      }),
    [kosong, cari, customer, dari, sampai, kondisi],
  );
  const hasil = useMemo(
    () =>
      urutkan(
        dasar.filter((n) => status === "semua" || n.status === status),
        (n) => nilaiUrut(n, urut.kolom),
        urut.arah,
        // Nilai sama: yang terbaru di atas, supaya urutan selalu tetap.
        (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at),
      ),
    [dasar, status, urut],
  );

  // Filter yang sedang aktif, ditampilkan sebagai chip di bawah toolbar.
  const chip = [
    kondisi && { label: KONDISI[kondisi], hapus: () => setKondisi("") },
    status !== "semua" && { label: `Status: ${LABEL_STATUS[status]}`, hapus: () => setStatus("semua") },
    customer !== "semua" && { label: `Customer: ${customerById(Number(customer)).name}`, hapus: () => setCustomer("semua") },
    (dari || sampai) && { label: labelRentang("Mulai", dari, sampai), hapus: () => { setDari(""); setSampai(""); } },
  ].filter(Boolean) as Chip[];
  const jumlahFilter = chip.length;
  const hapusFilter = () => { setStatus("semua"); setCustomer("semua"); setDari(""); setSampai(""); setKondisi(""); };
  const adaFilter = cari || jumlahFilter > 0;

  return (
    <>
      <PageHeader
        title="NPR"
        desc="Semua laporan gangguan jaringan."
        actions={
          <>
            <Button variant="outline" onClick={() => toast.success("Laporan-NPR.csv diunduh.")}>
              <Download className="size-4" /> Ekspor CSV
            </Button>
            <Button onClick={() => go("npr-baru")}>
              <Plus className="size-4" /> NPR Baru
            </Button>
          </>
        }
      />

      <div className="rounded-md border bg-card">
        <Toolbar
          cari={cari}
          onCari={setCari}
          placeholder="Cari NPR, TT, Site, atau Lokasi"
          jumlahFilter={jumlahFilter}
          onHapusFilter={hapusFilter}
        >
            <label className="block">
              <FieldLabel>Status</FieldLabel>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["semua", ...URUTAN_STATUS].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "semua" ? "Semua Status" : LABEL_STATUS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block">
              <FieldLabel>Customer</FieldLabel>
              <Select value={customer} onValueChange={setCustomer}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua Customer</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div>
              <FieldLabel hint="WIB">Tanggal Mulai Gangguan</FieldLabel>
              <div className="space-y-2">
                <div>
                  <span className="mb-1 block text-xs text-muted-foreground">Dari</span>
                  <TanggalInput label="Dari tanggal" value={dari} max={sampai || undefined} onChange={setDari} />
                </div>
                <div>
                  <span className="mb-1 block text-xs text-muted-foreground">Sampai</span>
                  <TanggalInput label="Sampai tanggal" value={sampai} min={dari || undefined} onChange={setSampai} />
                </div>
              </div>
            </div>
            {/* Di HP tabel diganti kartu, jadi urutan dipilih di sini. */}
            <label className="block md:hidden">
              <FieldLabel>Urutkan</FieldLabel>
              <Select
                value={`${urut.kolom}-${urut.arah}`}
                onValueChange={(v) => setUrut(PILIHAN_URUT.find((p) => p.value === v)!.urut)}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Pilih Urutan" /></SelectTrigger>
                <SelectContent>
                  {PILIHAN_URUT.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
        </Toolbar>

        <BarisRingkasan jumlah={hasil.length} satuan="NPR" chip={chip} onHapusSemua={hapusFilter} />

        {hasil.length ? (
          <>
            {/* Tabel: layar lebar. Lebar kolom tetap supaya posisi kolom tidak
                bergeser saat isi tabel berubah karena filter. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1000px] table-fixed text-[13px]">
                {/* Kolom berisi data pendek diberi lebar tetap; Customer/Site dan
                    Tindakan Terakhir berbagi sisa ruang. */}
                <colgroup>
                  <col className="w-[165px]" />
                  <col />
                  <col className="w-[140px]" />
                  <col className="w-[165px]" />
                  <col className="w-[105px]" />
                  <col className="w-[95px]" />
                  <col />
                </colgroup>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <KepalaUrut kolom="nomor" urut={urut} onUrut={gantiUrut}>No. NPR</KepalaUrut>
                    <KepalaUrut kolom="customer" urut={urut} onUrut={gantiUrut}>Customer / Site</KepalaUrut>
                    <KepalaUrut kolom="gangguan" urut={urut} onUrut={gantiUrut}>Gangguan</KepalaUrut>
                    <KepalaUrut kolom="mulai" urut={urut} onUrut={gantiUrut}>Mulai</KepalaUrut>
                    <KepalaUrut kolom="status" urut={urut} onUrut={gantiUrut}>Status</KepalaUrut>
                    <KepalaUrut kolom="pending" urut={urut} onUrut={gantiUrut}>Pending</KepalaUrut>
                    <th className="px-4 py-2 font-medium">Tindakan Terakhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {hasil.map((n) => {
                    const r = remoteById(n.remote_id);
                    return (
                      <tr key={n.id} onClick={() => go("npr-detail", n.id)} className="cursor-pointer align-top hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <div className="font-semibold tabular-nums">{n.number}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">{n.ticket?.number ?? "Tanpa TT"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{customerById(r.customer_id).name}</div>
                          <div className="text-xs text-muted-foreground">{r.site_id} · {r.location}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{n.remote_status}</div>
                          <div className="text-xs text-muted-foreground">{r.jarkom}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="tabular-nums">{waktu(n.started_at)}</div>
                          <div className="text-xs text-muted-foreground">{n.status === "CLOSED" ? `Selesai dalam ${lama(n.started_at, n.online_at)}` : `${lama(n.started_at)} berjalan`}</div>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={n.status} /></td>
                        <td className="px-4 py-3 text-muted-foreground">{n.pending_by || "—"}</td>
                        <td className="px-4 py-3"><p className="line-clamp-2 text-muted-foreground">{n.last_action}</p></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Kartu: HP */}
            <ul className="divide-y md:hidden">
              {hasil.map((n) => {
                const r = remoteById(n.remote_id);
                return (
                  <li key={n.id}>
                    <button onClick={() => go("npr-detail", n.id)} className="w-full px-4 py-3.5 text-left active:bg-muted/60">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold tabular-nums">{n.number}</span>
                        <StatusBadge status={n.status} />
                      </div>
                      <div className="mt-1.5 text-sm font-medium">{customerById(r.customer_id).name}</div>
                      <div className="text-xs text-muted-foreground">{r.site_id} · {n.remote_status} · {r.jarkom}</div>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{waktu(n.started_at)}</span>
                        <span>{n.pending_by ? `Pending ${n.pending_by}` : "Belum Dikategorikan"}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Select value={per} onValueChange={setPer}>
                  <SelectTrigger className="h-8 w-[110px]" aria-label="Baris per halaman"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["10", "25", "50"].map((v) => <SelectItem key={v} value={v}>{v} Baris</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="tabular-nums">1 / 1</span>
                <Button variant="outline" size="icon" className="size-8" disabled aria-label="Halaman sebelumnya"><ChevronLeft className="size-4" /></Button>
                <Button variant="outline" size="icon" className="size-8" disabled aria-label="Halaman berikutnya"><ChevronRight className="size-4" /></Button>
              </div>
            </div>
          </>
        ) : adaFilter && !kosong ? (
          <EmptyState
            icon={Search}
            title="Tidak ada NPR yang cocok"
            desc="Ubah kata kunci atau hapus filter."
            action={<Button variant="outline" onClick={() => { setCari(""); hapusFilter(); }}>Hapus Semua Filter</Button>}
          />
        ) : (
          <EmptyState
            icon={FileWarning}
            title="Belum ada NPR"
            desc="Catat gangguan pertama untuk mulai memantau penanganannya."
            action={<Button onClick={() => go("npr-baru")}><Plus className="size-4" /> NPR Baru</Button>}
          />
        )}
      </div>
    </>
  );
}

/** Satu bagian form: judul + penjelasan di kiri, isian di kanan. */
function BagianForm({ judul, ket, children }: { judul: string; ket: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 px-4 py-5 sm:px-5 md:grid-cols-[180px_minmax(0,1fr)] md:gap-8">
      <div>
        <h2 className="text-sm font-semibold">{judul}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ket}</p>
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

export function NprBaru() {
  const { go } = useApp();
  const [jarkom, setJarkom] = useState<"VSAT" | "M2M">("VSAT");
  const [customer, setCustomer] = useState("");
  const [remote, setRemote] = useState("");
  const pilihan = remotes.filter((r) => String(r.customer_id) === customer && r.jarkom === jarkom);
  const site = remotes.find((r) => String(r.id) === remote);
  const dataSite = (
    <InfoList
      items={[
        ["Lokasi", site?.location ?? <Kosong />],
        ["Alamat", site ? `${site.address}, ${site.city}, ${site.province}` : <Kosong />],
        ["PIC", site ? <>{site.pic_name}<div className="font-normal text-muted-foreground tabular-nums">{site.pic_phone}</div></> : <Kosong />],
        ["Jarkom", site?.jarkom ?? <Kosong />],
        ["IP LAN", site ? <span className="font-mono">{site.ip_lan}</span> : <Kosong />],
      ]}
    />
  );

  return (
    <>
      <PageHeader title="NPR Baru" desc="Catat gangguan baru pada site ATM." />
      <form
        className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"
        onSubmit={(e) => {
          e.preventDefault();
          toast.success("NPR/2026/11/0016 berhasil dibuat.");
          go("npr");
        }}
      >
        <div className="divide-y rounded-md border bg-card">
          <BagianForm judul="Lokasi" ket="Site ATM yang mengalami gangguan.">
            <div>
              <FieldLabel>Jarkom</FieldLabel>
              <ToggleGroup
                type="single"
                value={jarkom}
                onValueChange={(v) => { if (v) { setJarkom(v as "VSAT" | "M2M"); setRemote(""); } }}
                className="inline-flex justify-start rounded-md border p-0.5"
              >
                {["VSAT", "M2M"].map((j) => (
                  <ToggleGroupItem key={j} value={j} className="h-8 px-5 data-[state=on]:bg-navy data-[state=on]:text-white">{j}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <div>
                <FieldLabel>Customer</FieldLabel>
                <Select value={customer} onValueChange={(v) => { setCustomer(v); setRemote(""); }}>
                  <SelectTrigger><SelectValue placeholder="Pilih Customer" /></SelectTrigger>
                  <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>Remote / Site ID</FieldLabel>
                <Select value={remote} onValueChange={setRemote} disabled={!customer || !pilihan.length}>
                  <SelectTrigger>
                    <SelectValue placeholder={customer ? (pilihan.length ? "Pilih Site" : `Tidak Ada Site ${jarkom}`) : "Pilih Customer Dulu"} />
                  </SelectTrigger>
                  <SelectContent>{pilihan.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.site_id} · {r.location}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {/* HP: data site langsung di bawah pilihan site. */}
            {site && (
              <div className="rounded-md border bg-muted/30 p-3 lg:hidden">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Data Site {site.site_id}</p>
                {dataSite}
              </div>
            )}
          </BagianForm>

          <BagianForm judul="Gangguan" ket="Kondisi awal saat gangguan pertama terpantau.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <div>
                <FieldLabel>Jenis Gangguan</FieldLabel>
                <Select defaultValue="Remote Down">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{JENIS_GANGGUAN.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel hint="WIB">Mulai Gangguan</FieldLabel>
                <WaktuInput label="Mulai Gangguan" defaultValue={sekarangWib()} />
              </div>
            </div>
            <label className="block">
              <FieldLabel>Catatan Awal</FieldLabel>
              <Textarea rows={4} required placeholder="Mis. remote terpantau down dari NMS. Follow-up PIC untuk cek di lokasi." />
            </label>
          </BagianForm>

          <div className="flex flex-col-reverse gap-3 bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-muted-foreground">
              {site ? "Nomor NPR dibuat otomatis saat disimpan." : "Pilih site terlebih dahulu untuk menyimpan."}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1 bg-white sm:flex-none" onClick={() => go("npr")}>Batal</Button>
              <Button type="submit" className="flex-1 sm:flex-none" disabled={!site}>Simpan NPR</Button>
            </div>
          </div>
        </div>

        {/* Pratinjau site: baris tetap tampil (berisi "—") supaya bentuk
            panel tidak berubah saat site dipilih. */}
        <Panel
          title="Data Site"
          actions={site && <span className="text-xs font-semibold tabular-nums text-muted-foreground">{site.site_id}</span>}
          className="hidden lg:sticky lg:top-20 lg:flex"
        >
          {dataSite}
          <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">Terisi otomatis dari remote yang dipilih.</p>
        </Panel>
      </form>
    </>
  );
}

const Kosong = () => <span className="font-normal text-muted-foreground">—</span>;

const JENIS_TINDAKAN = ["Problem", "Eskalasi Service", "Report Teknisi", "Close"] as const;

/** Pilih lampiran dengan tombol berbahasa Indonesia (bukan "Choose File"). */
function PilihFile() {
  const [nama, setNama] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const hapus = () => {
    if (input.current) input.current.value = "";
    setNama("");
  };
  return (
    <div className="flex h-9 items-center gap-3 rounded-md border border-input bg-white pl-1 pr-2 text-sm">
      <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded border bg-muted/50 px-2.5 font-medium hover:bg-muted focus-within:ring-1 focus-within:ring-ring">
        <Paperclip className="size-3.5" /> Pilih File
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          className="sr-only"
          onChange={(e) => setNama(e.target.files?.[0]?.name ?? "")}
        />
      </label>
      <span className={cn("min-w-0 flex-1 truncate", !nama && "text-muted-foreground")}>{nama || "Belum ada file"}</span>
      {nama && (
        <button type="button" onClick={hapus} aria-label="Hapus lampiran" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function NprDetail() {
  const { param } = useApp();
  const n = nprs.find((x) => x.id === param) ?? nprs[0];
  const r = remoteById(n.remote_id);
  const [jenis, setJenis] = useState<(typeof JENIS_TINDAKAN)[number]>("Problem");
  const tersedia = JENIS_TINDAKAN.filter((j) => (j === "Eskalasi Service" ? !n.ticket : j === "Report Teknisi" ? !!n.ticket : true));
  const closeTerkunci = jenis === "Close" && !!n.ticket && !n.ticket.report;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="text-[20px] tabular-nums">{n.number}</span>
            <StatusBadge status={n.status} />
          </span>
        }
        actions={
          n.ticket && (
            <Button variant="outline" onClick={() => toast.success(`${n.ticket!.number.replaceAll("/", "-")}.pdf diunduh.`)}>
              <FileDown className="size-4" /> Unduh PDF TT
            </Button>
          )
        }
      />

      {/* Ringkasan: fakta utama NPR dalam sel berlabel (pola sama dengan
          strip Ringkasan di Dashboard dan kolom tabel NPR). */}
      <dl className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 xl:grid-cols-6">
        {[
          ["Customer", customerById(r.customer_id).name, `Site ${r.site_id}`],
          ["Gangguan", n.remote_status, r.jarkom],
          ["Mulai", waktu(n.started_at), "WIB"],
          n.online_at
            ? ["Kembali Online", waktu(n.online_at), `Selesai dalam ${lama(n.started_at, n.online_at)}`]
            : ["Durasi", lama(n.started_at), "Masih berjalan"],
          ["Pending", n.pending_by ? `Pending ${n.pending_by}` : "Belum Dikategorikan", n.pending_by === "TM" ? "Menunggu tindakan TM" : n.pending_by === "Customer" ? "Menunggu bank/lokasi" : "Pilih saat tindakan berikutnya"],
          ["Dibuat oleh", n.created_by, waktu(n.actions[0]?.occurred_at ?? n.started_at)],
        ].map(([label, nilai, ket]) => (
          <div key={label} className="min-w-0 bg-card px-4 py-3">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold leading-snug tabular-nums">{nilai}</dd>
            <dd className="mt-0.5 break-words text-xs text-muted-foreground">{ket}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Panel title="Riwayat Tindakan" desc="Urut dari yang pertama dicatat">
            <ol className="relative space-y-5 before:absolute before:bottom-1 before:left-[7px] before:top-1 before:w-px before:bg-border">
              {n.actions.map((a, i) => (
                <li key={a.id} className="relative pl-7">
                  <span className={cn("absolute left-0 top-1 size-[15px] rounded-full border-2 bg-white", i === n.actions.length - 1 ? "border-navy" : "border-slate-300")} />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-sm font-semibold">{a.kind}</span>
                    <span className="text-xs text-muted-foreground">{waktu(a.occurred_at)} · {a.created_by}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed">{a.notes}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{a.remote_status}</span>
                    {a.pending_by && <span>· Pending {a.pending_by}</span>}
                    {a.attachment_name && (
                      <button onClick={() => toast.success(`${a.attachment_name} diunduh.`)} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium text-foreground hover:bg-muted">
                        <Paperclip className="size-3" /> {a.attachment_name}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          {n.status !== "CLOSED" ? (
            <Panel title="Tambah Tindakan">
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); toast.success(jenis === "Eskalasi Service" ? "TT berhasil dibuat. PDF dapat diunduh di atas." : "Tindakan berhasil disimpan."); }}>
                <div>
                  <FieldLabel>Tindakan</FieldLabel>
                  <ToggleGroup type="single" value={jenis} onValueChange={(v) => v && setJenis(v as typeof jenis)} className="flex flex-wrap justify-start gap-1 rounded-md border p-0.5">
                    {tersedia.map((j) => (
                      <ToggleGroupItem key={j} value={j} className="h-8 px-3 text-[13px] data-[state=on]:bg-navy data-[state=on]:text-white">{j}</ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Status Remote</FieldLabel>
                    <Select defaultValue={n.remote_status}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{JENIS_GANGGUAN.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <FieldLabel>Pending oleh</FieldLabel>
                    <Select defaultValue={n.pending_by || undefined}>
                      <SelectTrigger><SelectValue placeholder={jenis === "Problem" ? "Pilih Kategori" : "Belum Dikategorikan"} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Customer">Pending Customer</SelectItem>
                        <SelectItem value="TM">Pending TM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <FieldLabel hint="WIB">Waktu Tindakan</FieldLabel>
                    <WaktuInput label="Waktu Tindakan" defaultValue={sekarangWib()} />
                  </div>
                  {jenis === "Eskalasi Service" && (
                    <div>
                      <FieldLabel>Instruksi</FieldLabel>
                      <Select defaultValue="Maintenance">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Maintenance">Maintenance</SelectItem>
                          <SelectItem value="Preventive Maintenance">Preventive Maintenance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {jenis === "Report Teknisi" && (
                    <label>
                      <FieldLabel>Nama Teknisi</FieldLabel>
                      <Input required />
                    </label>
                  )}
                  {jenis === "Close" && (
                    <div>
                      <FieldLabel hint="WIB">Kembali Online</FieldLabel>
                      <WaktuInput label="Kembali Online" required />
                    </div>
                  )}
                </div>
                <label className="block">
                  <FieldLabel>{jenis === "Eskalasi Service" ? "Catatan Problem dari NOC" : jenis === "Report Teknisi" ? "Report Teknisi" : "Catatan Tindakan"}</FieldLabel>
                  <Textarea rows={3} required />
                </label>
                <div>
                  <FieldLabel hint="JPG, PNG, atau PDF, maks. 500 KB">Lampiran</FieldLabel>
                  <PilihFile />
                </div>
                {closeTerkunci && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    NPR dengan TT baru bisa ditutup setelah report teknisi dicatat.
                  </p>
                )}
                <div className="flex justify-end border-t pt-4">
                  <Button type="submit" disabled={closeTerkunci}>{jenis === "Eskalasi Service" ? "Kirim TT" : "Simpan Tindakan"}</Button>
                </div>
              </form>
            </Panel>
          ) : (
            <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              NPR ini sudah ditutup. Riwayatnya tidak bisa diubah.
            </p>
          )}
        </div>

        <aside className="space-y-5">
          {n.ticket && (
            <Panel title="Trouble Ticket" actions={<span className="text-xs font-semibold tabular-nums">{n.ticket.number}</span>}>
              <InfoList
                items={[
                  ["Instruksi", n.ticket.instruction],
                  ["Catatan NOC", n.ticket.notes],
                  ["Teknisi", n.ticket.technician || <span className="text-muted-foreground">Belum Dilaporkan</span>],
                  ["Report", n.ticket.report || <span className="text-amber-700">Menunggu Report Teknisi</span>],
                ]}
              />
            </Panel>
          )}
          <Panel title="Data Site" actions={<span className="text-xs font-semibold tabular-nums text-muted-foreground">{r.site_id}</span>}>
            <InfoList
              items={[
                ["Lokasi", r.location],
                ["Alamat", `${r.address}, ${r.city}, ${r.province}`],
                ["PIC", <>{r.pic_name}<div className="font-normal text-muted-foreground tabular-nums">{r.pic_phone}</div></>],
                ["Jarkom", r.jarkom],
                ["IP LAN", <span className="font-mono">{r.ip_lan}</span>],
              ]}
            />
          </Panel>
        </aside>
      </div>
    </>
  );
}
