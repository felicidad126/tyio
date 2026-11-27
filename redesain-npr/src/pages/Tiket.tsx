import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Search, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, FieldLabel, PageHeader, StatusBadge, waktu } from "@/components/npr";
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
import { TanggalInput } from "@/components/tanggal";
import { useApp } from "@/lib/app";
import { customerById, nprs, remoteById } from "@/lib/data";
import { cn } from "@/lib/utils";

type Baris = (typeof nprs)[number] & { ticket: NonNullable<(typeof nprs)[number]["ticket"]> };
type Kolom = "nomor" | "site" | "instruksi" | "dibuat" | "report" | "status";

const INSTRUKSI = ["Maintenance", "Preventive Maintenance"];
const URUTAN_STATUS = ["OPEN", "PENDING", "ESKALASI", "CLOSED"] as const;
const LABEL_STATUS: Record<string, string> = { OPEN: "Open", PENDING: "Pending", ESKALASI: "Eskalasi", CLOSED: "Closed" };
const LABEL_REPORT: Record<string, string> = { menunggu: "Menunggu Report", sudah: "Sudah Diterima" };

const PILIHAN_URUT: { value: string; label: string; urut: Urut<Kolom> }[] = [
  { value: "nomor-turun", label: "No. TT, Terbaru", urut: { kolom: "nomor", arah: "turun" } },
  { value: "nomor-naik", label: "No. TT, Terlama", urut: { kolom: "nomor", arah: "naik" } },
  { value: "report-naik", label: "Menunggu Report dulu", urut: { kolom: "report", arah: "naik" } },
  { value: "site-naik", label: "Site, A–Z", urut: { kolom: "site", arah: "naik" } },
  { value: "status-naik", label: "Status NPR, Open dulu", urut: { kolom: "status", arah: "naik" } },
];

function nilaiUrut(n: Baris, kolom: Kolom): string | number {
  switch (kolom) {
    case "nomor":
      return n.ticket.number;
    case "site":
      return remoteById(n.remote_id).site_id;
    case "instruksi":
      return n.ticket.instruction;
    case "dibuat":
      return Date.parse(n.ticket.created_at);
    case "report":
      // Yang masih menunggu report di atas saat urut naik.
      return n.ticket.report ? 1 : 0;
    case "status":
      return URUTAN_STATUS.indexOf(n.status);
  }
}

const unduhPdf = (nomor: string) => toast.success(`${nomor.replaceAll("/", "-")}.pdf diunduh.`);

export function TroubleTicket() {
  const { go, kosong } = useApp();
  const [cari, setCari] = useState("");
  const [instruksi, setInstruksi] = useState("semua");
  const [report, setReport] = useState("semua");
  const [status, setStatus] = useState("semua");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [urut, gantiUrut, setUrut] = useUrut<Kolom>({ kolom: "nomor", arah: "turun" }, ["nomor", "dibuat"]);
  const [per, setPer] = useState("25");

  const hasil = useMemo(() => {
    const semua = (kosong ? [] : nprs).filter((n): n is Baris => !!n.ticket);
    const q = cari.toLowerCase();
    return urutkan(
      semua.filter((n) => {
        const r = remoteById(n.remote_id);
        const t = n.ticket;
        const tgl = tanggalWib(t.created_at);
        return (
          `${t.number} ${n.number} ${r.site_id} ${r.location} ${customerById(r.customer_id).name} ${t.technician}`.toLowerCase().includes(q) &&
          (instruksi === "semua" || t.instruction === instruksi) &&
          (report === "semua" || (report === "sudah") === !!t.report) &&
          (status === "semua" || n.status === status) &&
          (!dari || tgl >= dari) &&
          (!sampai || tgl <= sampai)
        );
      }),
      (n) => nilaiUrut(n, urut.kolom),
      urut.arah,
      (a, b) => b.ticket.number.localeCompare(a.ticket.number),
    );
  }, [kosong, cari, instruksi, report, status, dari, sampai, urut]);

  const chip = [
    instruksi !== "semua" && { label: `Instruksi: ${instruksi}`, hapus: () => setInstruksi("semua") },
    report !== "semua" && { label: `Report: ${LABEL_REPORT[report]}`, hapus: () => setReport("semua") },
    status !== "semua" && { label: `Status NPR: ${LABEL_STATUS[status]}`, hapus: () => setStatus("semua") },
    (dari || sampai) && { label: labelRentang("Dibuat", dari, sampai), hapus: () => { setDari(""); setSampai(""); } },
  ].filter(Boolean) as Chip[];
  const hapusFilter = () => { setInstruksi("semua"); setReport("semua"); setStatus("semua"); setDari(""); setSampai(""); };
  const adaFilter = cari || chip.length > 0;
  const adaTt = !kosong && nprs.some((n) => n.ticket);

  return (
    <>
      <PageHeader title="Trouble Ticket" desc="TT dibuat dari tindakan Eskalasi Service pada NPR." />

      <div className="rounded-md border bg-card">
        <Toolbar
          cari={cari}
          onCari={setCari}
          placeholder="Cari TT, NPR, Site, atau Teknisi"
          jumlahFilter={chip.length}
          onHapusFilter={hapusFilter}
        >
          <label className="block">
            <FieldLabel>Instruksi</FieldLabel>
            <Select value={instruksi} onValueChange={setInstruksi}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Instruksi</SelectItem>
                {INSTRUKSI.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
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
          <label className="block">
            <FieldLabel>Status NPR</FieldLabel>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Status</SelectItem>
                {URUTAN_STATUS.map((s) => <SelectItem key={s} value={s}>{LABEL_STATUS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <div>
            <FieldLabel hint="WIB">Tanggal TT Dibuat</FieldLabel>
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

        <BarisRingkasan jumlah={hasil.length} satuan="TT" chip={chip} onHapusSemua={hapusFilter} />

        {hasil.length ? (
          <>
            {/* Tabel: layar lebar. Lebar kolom tetap supaya posisi kolom tidak
                bergeser saat filter berubah. Klik baris membuka NPR-nya. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[920px] table-fixed text-[13px]">
                <colgroup>
                  <col className="w-[160px]" />
                  <col />
                  <col className="w-[150px]" />
                  <col className="w-[160px]" />
                  <col className="w-[160px]" />
                  <col className="w-[125px]" />
                  <col className="w-[56px]" />
                </colgroup>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <KepalaUrut kolom="nomor" urut={urut} onUrut={gantiUrut}>No. TT</KepalaUrut>
                    <KepalaUrut kolom="site" urut={urut} onUrut={gantiUrut}>Site</KepalaUrut>
                    <KepalaUrut kolom="instruksi" urut={urut} onUrut={gantiUrut}>Instruksi</KepalaUrut>
                    <KepalaUrut kolom="dibuat" urut={urut} onUrut={gantiUrut}>Dibuat</KepalaUrut>
                    <KepalaUrut kolom="report" urut={urut} onUrut={gantiUrut}>Report Teknisi</KepalaUrut>
                    <KepalaUrut kolom="status" urut={urut} onUrut={gantiUrut}>Status NPR</KepalaUrut>
                    <th className="px-4 py-2 text-right font-medium"><span className="sr-only">PDF</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {hasil.map((n) => {
                    const r = remoteById(n.remote_id);
                    const t = n.ticket;
                    return (
                      <tr key={n.id} onClick={() => go("npr-detail", n.id)} className="cursor-pointer align-top hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <div className="font-semibold tabular-nums">{t.number}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">{n.number}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{r.site_id}</div>
                          <div className="text-xs text-muted-foreground">{customerById(r.customer_id).name} · {r.location}</div>
                        </td>
                        <td className="px-4 py-3">{t.instruction}</td>
                        <td className="px-4 py-3 tabular-nums">{waktu(t.created_at)}</td>
                        <td className="px-4 py-3">
                          {t.report ? (
                            <>
                              <div>Sudah Diterima</div>
                              <div className="text-xs text-muted-foreground">{t.technician}</div>
                            </>
                          ) : (
                            <span className="text-amber-700">Menunggu Report</span>
                          )}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={n.status} /></td>
                        <td className="px-2 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-foreground"
                            title={`Unduh PDF ${t.number}`}
                            aria-label={`Unduh PDF ${t.number}`}
                            onClick={(e) => { e.stopPropagation(); unduhPdf(t.number); }}
                          >
                            <FileDown className="size-4" />
                          </Button>
                        </td>
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
                const t = n.ticket;
                return (
                  <li key={n.id} className="flex items-start">
                    <button onClick={() => go("npr-detail", n.id)} className="min-w-0 flex-1 py-3.5 pl-4 pr-2 text-left active:bg-muted/60">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold tabular-nums">{t.number}</span>
                        <StatusBadge status={n.status} />
                      </div>
                      <div className="mt-1.5 text-sm font-medium">{r.site_id} · {customerById(r.customer_id).name}</div>
                      <div className="text-xs text-muted-foreground">{t.instruction} · {waktu(t.created_at)}</div>
                      <div className={cn("mt-2 text-xs", t.report ? "text-muted-foreground" : "font-medium text-amber-700")}>
                        {t.report ? `Report diterima · ${t.technician}` : "Menunggu Report"}
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mr-2 mt-2.5 size-9 shrink-0 text-muted-foreground"
                      aria-label={`Unduh PDF ${t.number}`}
                      onClick={() => unduhPdf(t.number)}
                    >
                      <FileDown className="size-4" />
                    </Button>
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
        ) : adaFilter && adaTt ? (
          <EmptyState
            icon={Search}
            title="Tidak ada TT yang cocok"
            desc="Ubah kata kunci atau hapus filter."
            action={<Button variant="outline" onClick={() => { setCari(""); hapusFilter(); }}>Hapus Semua Filter</Button>}
          />
        ) : (
          <EmptyState
            icon={Ticket}
            title="Belum ada Trouble Ticket"
            desc="Buka sebuah NPR, lalu pilih tindakan Eskalasi Service untuk membuat TT."
            action={<Button variant="outline" onClick={() => go("npr")}>Buka Daftar NPR</Button>}
          />
        )}
      </div>
    </>
  );
}
