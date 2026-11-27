import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Plus, RadioTower, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Panel,
  StatusBadge,
  lama,
  waktu,
} from "@/components/npr";
import {
  BarisRingkasan,
  KepalaUrut,
  Toolbar,
  labelRentang,
  tanggalWib,
  urutkan,
  useUrut,
  type Chip,
  type Urut,
} from "@/components/tabel";
import { TanggalInput, WaktuInput, sekarangWib } from "@/components/tanggal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/app";
import { customerById, gamas, remoteById, remotes, type Gamas } from "@/lib/data";

function FormGamas({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { go } = useApp();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>TT Gamas Baru</DialogTitle>
          <DialogDescription>Untuk gangguan yang mengenai banyak site sekaligus.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onOpenChange(false);
            toast.success("GAMAS/2026/11/0006 berhasil dibuat.");
            go("gamas-detail", 5);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <FieldLabel>Lokasi Penanganan</FieldLabel>
              <Input required placeholder="Mis. HUB Surabaya" />
            </label>
            <div>
              <FieldLabel hint="WIB">Mulai Gangguan</FieldLabel>
              <WaktuInput label="Mulai Gangguan" required />
            </div>
          </div>
          <label className="block">
            <FieldLabel>Catatan Problem</FieldLabel>
            <Textarea rows={3} required />
          </label>
          <div>
            <FieldLabel hint="Pilih minimal satu">Remote Terdampak</FieldLabel>
            <div className="max-h-52 divide-y overflow-y-auto rounded-md border">
              {remotes.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                  <Checkbox />
                  <span className="font-medium">{r.site_id}</span>
                  <span className="truncate text-muted-foreground">{r.location}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{r.jarkom}</span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit">Kirim TT Gamas</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Kolom = "nomor" | "lokasi" | "site" | "mulai" | "report" | "status";

const URUTAN_STATUS = ["OPEN", "IN PROGRESS", "CLOSED"] as const;
const LABEL_STATUS: Record<string, string> = { OPEN: "Open", "IN PROGRESS": "Ditangani", CLOSED: "Closed" };
const LABEL_REPORT: Record<string, string> = { menunggu: "Menunggu Report", sudah: "Sudah Diterima" };

const PILIHAN_URUT: { value: string; label: string; urut: Urut<Kolom> }[] = [
  { value: "nomor-turun", label: "No. Gamas, Terbaru", urut: { kolom: "nomor", arah: "turun" } },
  { value: "nomor-naik", label: "No. Gamas, Terlama", urut: { kolom: "nomor", arah: "naik" } },
  { value: "site-turun", label: "Site Terdampak, Terbanyak", urut: { kolom: "site", arah: "turun" } },
  { value: "status-naik", label: "Status, Aktif dulu", urut: { kolom: "status", arah: "naik" } },
];

function nilaiUrut(g: Gamas, kolom: Kolom): string | number {
  switch (kolom) {
    case "nomor":
      return g.number;
    case "lokasi":
      return g.location;
    case "site":
      return g.sites.length;
    case "mulai":
      return Date.parse(g.started_at);
    case "report":
      return g.report ? 1 : 0;
    case "status":
      return URUTAN_STATUS.indexOf(g.status);
  }
}

const unduhPdf = (nomor: string) => toast.success(`${nomor.replaceAll("/", "-")}.pdf diunduh.`);

export function GamasList() {
  const { go, kosong } = useApp();
  const [form, setForm] = useState(false);
  const [cari, setCari] = useState("");
  const [status, setStatus] = useState("semua");
  const [report, setReport] = useState("semua");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [urut, gantiUrut, setUrut] = useUrut<Kolom>({ kolom: "nomor", arah: "turun" }, ["nomor", "mulai", "site"]);
  const [per, setPer] = useState("25");

  const hasil = useMemo(() => {
    const q = cari.toLowerCase();
    return urutkan(
      (kosong ? [] : gamas).filter((g) => {
        const situs = g.sites.map((id) => remoteById(id).site_id).join(" ");
        const tgl = tanggalWib(g.started_at);
        return (
          `${g.number} ${g.location} ${g.notes} ${situs}`.toLowerCase().includes(q) &&
          (status === "semua" || g.status === status) &&
          (report === "semua" || (report === "sudah") === !!g.report) &&
          (!dari || tgl >= dari) &&
          (!sampai || tgl <= sampai)
        );
      }),
      (g) => nilaiUrut(g, urut.kolom),
      urut.arah,
      (a, b) => b.number.localeCompare(a.number),
    );
  }, [kosong, cari, status, report, dari, sampai, urut]);

  const chip = [
    status !== "semua" && { label: `Status: ${LABEL_STATUS[status]}`, hapus: () => setStatus("semua") },
    report !== "semua" && { label: `Report: ${LABEL_REPORT[report]}`, hapus: () => setReport("semua") },
    (dari || sampai) && { label: labelRentang("Mulai", dari, sampai), hapus: () => { setDari(""); setSampai(""); } },
  ].filter(Boolean) as Chip[];
  const hapusFilter = () => { setStatus("semua"); setReport("semua"); setDari(""); setSampai(""); };
  const adaFilter = cari || chip.length > 0;
  const tombolBaru = (
    <Button onClick={() => setForm(true)}>
      <Plus className="size-4" /> TT Gamas Baru
    </Button>
  );

  return (
    <>
      <PageHeader title="Trouble Ticket Gamas" desc="Gangguan massal yang mengenai banyak site sekaligus." actions={tombolBaru} />

      <div className="rounded-md border bg-card">
        <Toolbar cari={cari} onCari={setCari} placeholder="Cari Gamas, Lokasi, atau Site" jumlahFilter={chip.length} onHapusFilter={hapusFilter}>
          <label className="block">
            <FieldLabel>Status</FieldLabel>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Status</SelectItem>
                {URUTAN_STATUS.map((s) => <SelectItem key={s} value={s}>{LABEL_STATUS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="block">
            <FieldLabel>Report Teknisi</FieldLabel>
            <Select value={report} onValueChange={setReport}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Report</SelectItem>
                <SelectItem value="menunggu">Menunggu Report</SelectItem>
                <SelectItem value="sudah">Sudah Diterima</SelectItem>
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
            <Select value={`${urut.kolom}-${urut.arah}`} onValueChange={(v) => setUrut(PILIHAN_URUT.find((p) => p.value === v)!.urut)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Pilih Urutan" /></SelectTrigger>
              <SelectContent>
                {PILIHAN_URUT.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        </Toolbar>

        <BarisRingkasan jumlah={hasil.length} satuan="TT Gamas" chip={chip} onHapusSemua={hapusFilter} />

        {hasil.length ? (
          <>
            {/* Tabel: layar lebar. Klik baris membuka detail. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[940px] table-fixed text-[13px]">
                <colgroup>
                  <col className="w-[185px]" />
                  <col />
                  <col className="w-[135px]" />
                  <col className="w-[160px]" />
                  <col className="w-[150px]" />
                  <col className="w-[115px]" />
                  <col className="w-[52px]" />
                </colgroup>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <KepalaUrut kolom="nomor" urut={urut} onUrut={gantiUrut}>No. Gamas</KepalaUrut>
                    <KepalaUrut kolom="lokasi" urut={urut} onUrut={gantiUrut}>Lokasi Penanganan</KepalaUrut>
                    <KepalaUrut kolom="site" urut={urut} onUrut={gantiUrut}>Site Terdampak</KepalaUrut>
                    <KepalaUrut kolom="mulai" urut={urut} onUrut={gantiUrut}>Mulai</KepalaUrut>
                    <KepalaUrut kolom="report" urut={urut} onUrut={gantiUrut}>Report Teknisi</KepalaUrut>
                    <KepalaUrut kolom="status" urut={urut} onUrut={gantiUrut}>Status</KepalaUrut>
                    <th className="px-4 py-2"><span className="sr-only">PDF</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {hasil.map((g) => (
                    <tr key={g.id} onClick={() => go("gamas-detail", g.id)} className="cursor-pointer align-top hover:bg-muted/40">
                      <td className="px-4 py-3 font-semibold tabular-nums">{g.number}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{g.location}</div>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{g.notes}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="tabular-nums">{g.sites.length} site</div>
                        <div className="truncate text-xs text-muted-foreground" title={g.sites.map((id) => remoteById(id).site_id).join(", ")}>
                          {g.sites.map((id) => remoteById(id).site_id).join(", ")}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="tabular-nums">{waktu(g.started_at)}</div>
                        <div className="text-xs text-muted-foreground">
                          {g.online_at ? `Selesai dalam ${lama(g.started_at, g.online_at)}` : `${lama(g.started_at)} berjalan`}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {g.report ? "Sudah Diterima" : <span className="text-amber-700">Menunggu Report</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={g.status} /></td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-foreground"
                          title={`Unduh PDF ${g.number}`}
                          aria-label={`Unduh PDF ${g.number}`}
                          onClick={(e) => { e.stopPropagation(); unduhPdf(g.number); }}
                        >
                          <FileDown className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Kartu: HP */}
            <ul className="divide-y md:hidden">
              {hasil.map((g) => (
                <li key={g.id} className="flex items-start">
                  <button onClick={() => go("gamas-detail", g.id)} className="min-w-0 flex-1 py-3.5 pl-4 pr-2 text-left active:bg-muted/60">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold tabular-nums">{g.number}</span>
                      <StatusBadge status={g.status} />
                    </div>
                    <div className="mt-1.5 text-sm font-medium">{g.location}</div>
                    <div className="text-xs text-muted-foreground">{g.sites.length} site terdampak · {waktu(g.started_at)}</div>
                    <div className={cn("mt-2 text-xs", g.report ? "text-muted-foreground" : "font-medium text-amber-700")}>
                      {g.report ? `Selesai dalam ${lama(g.started_at, g.online_at)}` : "Menunggu Report"}
                    </div>
                  </button>
                  <Button variant="ghost" size="icon" className="mr-2 mt-2.5 size-9 shrink-0 text-muted-foreground" aria-label={`Unduh PDF ${g.number}`} onClick={() => unduhPdf(g.number)}>
                    <FileDown className="size-4" />
                  </Button>
                </li>
              ))}
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
            title="Tidak ada TT Gamas yang cocok"
            desc="Ubah kata kunci atau hapus filter."
            action={<Button variant="outline" onClick={() => { setCari(""); hapusFilter(); }}>Hapus Semua Filter</Button>}
          />
        ) : (
          <EmptyState
            icon={RadioTower}
            title="Belum ada gangguan massal"
            desc="Buat TT Gamas jika satu gangguan mengenai banyak site, mis. HUB atau satelit bermasalah."
            action={<Button variant="outline" onClick={() => setForm(true)}><Plus className="size-4" /> TT Gamas Baru</Button>}
          />
        )}
      </div>
      <FormGamas open={form} onOpenChange={setForm} />
    </>
  );
}

export function GamasDetail() {
  const { param } = useApp();
  const g = gamas.find((x) => x.id === param) ?? gamas[0];
  const [tutup, setTutup] = useState(false);
  const pembuat = g.actions[0];
  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3"><span className="text-[20px] tabular-nums">{g.number}</span><StatusBadge status={g.status} /></span>}
        actions={<Button variant="outline" onClick={() => unduhPdf(g.number)}><FileDown className="size-4" /> Unduh PDF</Button>}
      />

      {/* Ringkasan: pola sama dengan Detail NPR. */}
      <dl className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 xl:grid-cols-6">
        {[
          ["Lokasi Penanganan", g.location, `${g.sites.length} site terdampak`],
          ["Mulai", waktu(g.started_at), "WIB"],
          g.online_at
            ? ["Kembali Online", waktu(g.online_at), `Selesai dalam ${lama(g.started_at, g.online_at)}`]
            : ["Durasi", lama(g.started_at), "Masih berjalan"],
          ["Report Teknisi", g.report ? "Sudah Diterima" : "Menunggu Report", g.report ? "Lihat riwayat" : "Wajib sebelum ditutup"],
          ["Tindakan Terakhir", waktu(g.actions[g.actions.length - 1].at), g.actions[g.actions.length - 1].by],
          ["Dibuat oleh", pembuat.by, waktu(pembuat.at)],
        ].map(([label, nilai, ket]) => (
          <div key={label} className="min-w-0 bg-card px-4 py-3">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className={cn("mt-1 break-words text-sm font-semibold leading-snug tabular-nums", nilai === "Menunggu Report" && "text-amber-700")}>{nilai}</dd>
            <dd className="mt-0.5 break-words text-xs text-muted-foreground">{ket}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Panel title="Riwayat Penanganan" desc="Urut dari yang pertama dicatat">
            {/* Pola garis waktu sama dengan Riwayat Tindakan di Detail NPR. */}
            <ol className="relative space-y-5 before:absolute before:bottom-1 before:left-[7px] before:top-1 before:w-px before:bg-border">
              {g.actions.map((a, i) => (
                <li key={a.id} className="relative pl-7">
                  <span className={cn("absolute left-0 top-1 size-[15px] rounded-full border-2 bg-white", i === g.actions.length - 1 ? "border-navy" : "border-slate-300")} />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-sm font-semibold">{i === 0 ? "Create Gamas" : a.report ? "Report Teknisi" : "Perkembangan"}</span>
                    <span className="text-xs text-muted-foreground">{waktu(a.at)} · {a.by}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed">{a.notes}</p>
                  {a.report && (
                    <p className="mt-1.5 rounded border bg-muted/40 px-3 py-2 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">Report Teknisi</span>
                      <span className="mt-0.5 block">{a.report}</span>
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Panel>
          {g.status !== "CLOSED" ? (
            <Panel title="Perbarui Penanganan">
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); toast.success("Perkembangan Gamas berhasil disimpan."); setTutup(false); }}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                  <div><FieldLabel hint="WIB">Waktu Perkembangan</FieldLabel><WaktuInput label="Waktu Perkembangan" defaultValue={sekarangWib()} required /></div>
                  {tutup && <div><FieldLabel hint="WIB">Kembali Online</FieldLabel><WaktuInput label="Kembali Online" required /></div>}
                </div>
                <label className="block"><FieldLabel>Catatan Perkembangan</FieldLabel><Textarea rows={3} required /></label>
                <label className="block"><FieldLabel hint="Isi jika sudah diterima">Report Teknisi</FieldLabel><Textarea rows={2} /></label>
                <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-center gap-2.5 text-sm">
                    <Checkbox checked={tutup} onCheckedChange={(v) => setTutup(v === true)} />
                    Tutup TT Gamas
                    <span className="text-xs text-muted-foreground">(report teknisi wajib ada)</span>
                  </label>
                  <Button type="submit">{tutup ? "Simpan dan Tutup" : "Simpan Perkembangan"}</Button>
                </div>
              </form>
            </Panel>
          ) : (
            <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">TT Gamas ini sudah ditutup. Riwayatnya tidak bisa diubah.</p>
          )}
        </div>
        <aside>
          <Panel title="Site Terdampak" actions={<span className="text-xs font-semibold tabular-nums text-muted-foreground">{g.sites.length} site</span>} flush>
            <ul className="divide-y">
              {g.sites.map((id) => {
                const r = remoteById(id);
                return (
                  <li key={id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                    <div className="min-w-0">
                      <div className="font-medium tabular-nums">{r.site_id}</div>
                      <div className="text-xs text-muted-foreground">{customerById(r.customer_id).name} · {r.location}</div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{r.jarkom}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </aside>
      </div>
    </>
  );
}
