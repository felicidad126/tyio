import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  Search,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EmptyState,
  FieldLabel,
  PageHeader,
  StatusBadge,
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
import { TanggalInput } from "@/components/tanggal";
import { useApp } from "@/lib/app";
import type { TicketRow } from "@/lib/tipe";
import { pdfTicket } from "@/pdf";
import { useMuat } from "@/useMuat";
import { cn } from "@/lib/utils";

/** Satu baris tabel: data NPR induk + TT-nya. */
type Baris = {
  id: number;
  number: string;
  status: string;
  site_id: string;
  customer_name: string;
  location: string;
  ticket: TicketRow;
};
const keBaris = (t: TicketRow): Baris => ({
  id: t.npr_id,
  number: t.npr_number,
  status: t.npr_status,
  site_id: t.site_id,
  customer_name: t.customer_name,
  location: t.location,
  ticket: t,
});
type Kolom = "nomor" | "site" | "instruksi" | "dibuat" | "report" | "status";

const INSTRUKSI = ["Maintenance", "Preventive Maintenance"];
const URUTAN_STATUS = ["OPEN", "PENDING", "ESKALASI", "CLOSED"] as const;
const LABEL_STATUS: Record<string, string> = {
  OPEN: "Open",
  PENDING: "Pending",
  ESKALASI: "Eskalasi",
  CLOSED: "Closed",
};
const LABEL_REPORT: Record<string, string> = {
  menunggu: "Menunggu Report",
  sudah: "Sudah Diterima",
};

const PILIHAN_URUT: { value: string; label: string; urut: Urut<Kolom> }[] = [
  {
    value: "nomor-turun",
    label: "No. TT, Terbaru",
    urut: { kolom: "nomor", arah: "turun" },
  },
  {
    value: "nomor-naik",
    label: "No. TT, Terlama",
    urut: { kolom: "nomor", arah: "naik" },
  },
  {
    value: "report-naik",
    label: "Menunggu Report dulu",
    urut: { kolom: "report", arah: "naik" },
  },
  {
    value: "site-naik",
    label: "Site, A–Z",
    urut: { kolom: "site", arah: "naik" },
  },
  {
    value: "status-naik",
    label: "Status NPR, Open dulu",
    urut: { kolom: "status", arah: "naik" },
  },
];

function nilaiUrut(n: Baris, kolom: Kolom): string | number {
  switch (kolom) {
    case "nomor":
      return n.ticket.number;
    case "site":
      return n.site_id;
    case "instruksi":
      return n.ticket.instruction;
    case "dibuat":
      return Date.parse(n.ticket.created_at);
    case "report":
      // Yang masih menunggu report di atas saat urut naik.
      return n.ticket.report ? 1 : 0;
    case "status":
      return (URUTAN_STATUS as readonly string[]).indexOf(n.status);
  }
}

export function TroubleTicket() {
  const { go, api, versi, user, galat } = useApp();
  const [cari, setCari] = useState("");
  const [instruksi, setInstruksi] = useState("semua");
  const [report, setReport] = useState("semua");
  const [status, setStatus] = useState("semua");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [urut, gantiUrut, setUrut] = useUrut<Kolom>(
    { kolom: "nomor", arah: "turun" },
    ["nomor", "dibuat"],
  );
  const [per, setPer] = useState("25");
  const [halaman, setHalaman] = useState(1);
  // Semua TT (maks. 500 terbaru) diambil sekali; cari, filter, dan urut di browser.
  const data = useMuat<{ rows: TicketRow[] }>("/api/tickets", api, versi);

  const hasil = useMemo(() => {
    const semua = (data.data?.rows ?? []).map(keBaris);
    const q = cari.toLowerCase();
    return urutkan(
      semua.filter((n) => {
        const r = n;
        const t = n.ticket;
        const tgl = tanggalWib(t.created_at);
        return (
          `${t.number} ${n.number} ${r.site_id} ${r.location} ${r.customer_name} ${t.technician}`
            .toLowerCase()
            .includes(q) &&
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
  }, [data.data, cari, instruksi, report, status, dari, sampai, urut]);

  const chip = [
    instruksi !== "semua" && {
      label: `Instruksi: ${instruksi}`,
      hapus: () => setInstruksi("semua"),
    },
    report !== "semua" && {
      label: `Report: ${LABEL_REPORT[report]}`,
      hapus: () => setReport("semua"),
    },
    status !== "semua" && {
      label: `Status NPR: ${LABEL_STATUS[status]}`,
      hapus: () => setStatus("semua"),
    },
    (dari || sampai) && {
      label: labelRentang("Dibuat", dari, sampai),
      hapus: () => {
        setDari("");
        setSampai("");
      },
    },
  ].filter(Boolean) as Chip[];
  const hapusFilter = () => {
    setInstruksi("semua");
    setReport("semua");
    setStatus("semua");
    setDari("");
    setSampai("");
  };
  const adaFilter = cari || chip.length > 0;
  const adaTt = !!data.data?.rows.length;
  const unduhPdf = (t: TicketRow) =>
    pdfTicket(t, user.full_name).catch(() =>
      galat("PDF gagal dibuat. Silakan coba unduh kembali."),
    );
  // Halaman di sisi browser (server mengirim maksimal 500 TT terbaru).
  const jumlahHalaman = Math.max(1, Math.ceil(hasil.length / Number(per)));
  const hal = Math.min(halaman, jumlahHalaman);
  const tampil = hasil.slice((hal - 1) * Number(per), hal * Number(per));

  return (
    <>
      <PageHeader
        title="Trouble Ticket"
        desc="TT dibuat dari tindakan Eskalasi Service pada NPR."
      />

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
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Instruksi</SelectItem>
                {INSTRUKSI.map((i) => (
                  <SelectItem key={i} value={i}>
                    {i}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block">
            <FieldLabel>Report Teknisi</FieldLabel>
            <Select value={report} onValueChange={setReport}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
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
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Status</SelectItem>
                {URUTAN_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LABEL_STATUS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div>
            <FieldLabel hint="WIB">Tanggal TT Dibuat</FieldLabel>
            <div className="space-y-2">
              <div>
                <span className="mb-1 block text-xs text-muted-foreground">
                  Dari
                </span>
                <TanggalInput
                  label="Dari tanggal"
                  value={dari}
                  max={sampai || undefined}
                  onChange={setDari}
                />
              </div>
              <div>
                <span className="mb-1 block text-xs text-muted-foreground">
                  Sampai
                </span>
                <TanggalInput
                  label="Sampai tanggal"
                  value={sampai}
                  min={dari || undefined}
                  onChange={setSampai}
                />
              </div>
            </div>
          </div>
          {/* Di HP tabel diganti kartu, jadi urutan dipilih di sini. */}
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
          satuan="TT"
          chip={chip}
          onHapusSemua={hapusFilter}
        />

        {!data.data ? (
          <p
            className={cn(
              "px-4 py-10 text-center text-sm",
              data.error ? "text-rose-700" : "text-muted-foreground",
            )}
          >
            {data.error || "Memuat data…"}
          </p>
        ) : hasil.length ? (
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
                    <KepalaUrut kolom="nomor" urut={urut} onUrut={gantiUrut}>
                      No. TT
                    </KepalaUrut>
                    <KepalaUrut kolom="site" urut={urut} onUrut={gantiUrut}>
                      Site
                    </KepalaUrut>
                    <KepalaUrut
                      kolom="instruksi"
                      urut={urut}
                      onUrut={gantiUrut}
                    >
                      Instruksi
                    </KepalaUrut>
                    <KepalaUrut kolom="dibuat" urut={urut} onUrut={gantiUrut}>
                      Dibuat
                    </KepalaUrut>
                    <KepalaUrut kolom="report" urut={urut} onUrut={gantiUrut}>
                      Report Teknisi
                    </KepalaUrut>
                    <KepalaUrut kolom="status" urut={urut} onUrut={gantiUrut}>
                      Status NPR
                    </KepalaUrut>
                    <th className="px-4 py-2 text-right font-medium">
                      <span className="sr-only">PDF</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tampil.map((n) => {
                    const r = n;
                    const t = n.ticket;
                    return (
                      <tr
                        key={n.id}
                        onClick={() => go("npr-detail", n.id)}
                        className="cursor-pointer align-top hover:bg-muted/40"
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold tabular-nums">
                            {t.number}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                            {n.number}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{r.site_id}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.customer_name} · {r.location}
                          </div>
                        </td>
                        <td className="px-4 py-3">{t.instruction}</td>
                        <td className="px-4 py-3 tabular-nums">
                          {waktu(t.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          {t.report ? (
                            <>
                              <div>Sudah Diterima</div>
                              <div className="text-xs text-muted-foreground">
                                {t.technician}
                              </div>
                            </>
                          ) : (
                            <span className="text-amber-700">
                              Menunggu Report
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={n.status} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-foreground"
                            title={`Unduh PDF ${t.number}`}
                            aria-label={`Unduh PDF ${t.number}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void unduhPdf(t);
                            }}
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
              {tampil.map((n) => {
                const r = n;
                const t = n.ticket;
                return (
                  <li key={n.id} className="flex items-start">
                    <button
                      onClick={() => go("npr-detail", n.id)}
                      className="min-w-0 flex-1 py-3.5 pl-4 pr-2 text-left active:bg-muted/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold tabular-nums">
                          {t.number}
                        </span>
                        <StatusBadge status={n.status} />
                      </div>
                      <div className="mt-1.5 text-sm font-medium">
                        {r.site_id} · {r.customer_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.instruction} · {waktu(t.created_at)}
                      </div>
                      <div
                        className={cn(
                          "mt-2 text-xs",
                          t.report
                            ? "text-muted-foreground"
                            : "font-medium text-amber-700",
                        )}
                      >
                        {t.report
                          ? `Report diterima · ${t.technician}`
                          : "Menunggu Report"}
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mr-2 mt-2.5 size-9 shrink-0 text-muted-foreground"
                      aria-label={`Unduh PDF ${t.number}`}
                      onClick={() => void unduhPdf(t)}
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
                  <SelectTrigger
                    className="h-8 w-[110px]"
                    aria-label="Baris per halaman"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["10", "25", "50"].map((v) => (
                      <SelectItem key={v} value={v}>
                        {v} Baris
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="tabular-nums">
                  {hal} / {jumlahHalaman}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={hal <= 1}
                  onClick={() => setHalaman(hal - 1)}
                  aria-label="Halaman sebelumnya"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={hal >= jumlahHalaman}
                  onClick={() => setHalaman(hal + 1)}
                  aria-label="Halaman berikutnya"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        ) : adaFilter && adaTt ? (
          <EmptyState
            icon={Search}
            title="Tidak ada TT yang cocok"
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
            icon={Ticket}
            title="Belum ada Trouble Ticket"
            desc="Buka sebuah NPR, lalu pilih tindakan Eskalasi Service untuk membuat TT."
            action={
              <Button variant="outline" onClick={() => go("npr")}>
                Buka Daftar NPR
              </Button>
            }
          />
        )}
      </div>
    </>
  );
}
