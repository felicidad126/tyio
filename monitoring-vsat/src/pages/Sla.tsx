import { useMemo, useState } from "react";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, FieldLabel, PageHeader } from "@/components/npr";
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
import { unduhCsv, type Sla, type SlaRow } from "@/lib/tipe";
import { useMuat } from "@/useMuat";
import { cn } from "@/lib/utils";

const TARGET = 99.5;
const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const persen = (v: number) =>
  v.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + "%";
const angka = (v: number) => Math.round(v).toLocaleString("id-ID");
/** 3420 menit → "57 jam", 95 → "1 jam 35 menit" */
function jamMenit(menit: number) {
  const j = Math.floor(menit / 60);
  const m = Math.round(menit % 60);
  if (!j) return `${m} menit`;
  return m ? `${j} jam ${m} menit` : `${j} jam`;
}

/** Baris yang sudah punya nilai SLA (periode sudah berjalan). */
type Baris = SlaRow & { sla: number };
type Kolom = "site" | "customer" | "downtime" | "sla" | "capaian";

const PILIHAN_URUT: { value: string; label: string; urut: Urut<Kolom> }[] = [
  {
    value: "sla-naik",
    label: "SLA, Terendah dulu",
    urut: { kolom: "sla", arah: "naik" },
  },
  {
    value: "sla-turun",
    label: "SLA, Tertinggi dulu",
    urut: { kolom: "sla", arah: "turun" },
  },
  {
    value: "downtime-turun",
    label: "Downtime, Terlama dulu",
    urut: { kolom: "downtime", arah: "turun" },
  },
  {
    value: "site-naik",
    label: "Site, A–Z",
    urut: { kolom: "site", arah: "naik" },
  },
];

function nilaiUrut(r: Baris, kolom: Kolom): string | number {
  switch (kolom) {
    case "site":
      return r.site_id;
    case "customer":
      return `${r.customer_name} ${r.location}`;
    case "downtime":
      return r.downtime_minutes;
    case "sla":
    case "capaian":
      return r.sla;
  }
}

/** Bulan sekarang di WIB, format "YYYY-MM". */
const bulanIni = () =>
  new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
function geserBulan(bulan: string, n: number) {
  const [y, m] = bulan.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
const namaBulan = (bulan: string) =>
  `${NAMA_BULAN[Number(bulan.slice(5, 7)) - 1]} ${bulan.slice(0, 4)}`;

/** Pemilih periode bulanan: ‹ November 2026 › (bulan depan tidak bisa dipilih). */
function PilihPeriode({
  bulan,
  onChange,
}: {
  bulan: string;
  onChange: (b: string) => void;
}) {
  const terakhir = bulan >= bulanIni();
  return (
    <div
      className="flex h-9 items-stretch overflow-hidden rounded-md border bg-white"
      role="group"
      aria-label="Periode laporan"
    >
      <button
        type="button"
        onClick={() => onChange(geserBulan(bulan, -1))}
        aria-label="Bulan sebelumnya"
        className="grid w-9 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span
        className="flex min-w-[118px] items-center justify-center border-x px-2.5 text-sm font-medium tabular-nums"
        aria-live="polite"
      >
        {namaBulan(bulan)}
      </span>
      <button
        type="button"
        onClick={() => onChange(geserBulan(bulan, 1))}
        disabled={terakhir}
        aria-label="Bulan berikutnya"
        className="grid w-9 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

export function LaporanSla() {
  const { api, versi, param, gantiParam } = useApp();
  // Periode tersimpan di alamat (/sla?bulan=2026-10); tanpa itu, bulan ini.
  const bulan =
    typeof param === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(param) &&
    param <= bulanIni()
      ? param
      : bulanIni();
  const setBulan = (b: string) => gantiParam(b === bulanIni() ? undefined : b);
  const [cari, setCari] = useState("");
  const [customer, setCustomer] = useState("semua");
  const [capaian, setCapaian] = useState("semua");
  const [urut, gantiUrut, setUrut] = useUrut<Kolom>(
    { kolom: "sla", arah: "naik" },
    ["downtime"],
  );

  // Dihitung server per bulan WIB (lihat worker/domain.ts).
  const data = useMuat<Sla>(`/api/sla?month=${bulan}`, api, versi);
  const target = data.data?.target ?? TARGET;
  const semua = useMemo(
    () => (data.data?.rows ?? []).filter((r): r is Baris => r.sla !== null),
    [data.data],
  );
  const namaCustomer = [...new Set(semua.map((r) => r.customer_name))].sort();
  const hasil = useMemo(() => {
    const q = cari.toLowerCase();
    return urutkan(
      semua.filter(
        (r) =>
          `${r.site_id} ${r.location} ${r.customer_name}`
            .toLowerCase()
            .includes(q) &&
          (customer === "semua" || r.customer_name === customer) &&
          (capaian === "semua" || (capaian === "tercapai") === r.sla >= target),
      ),
      (r) => nilaiUrut(r, urut.kolom),
      urut.arah,
      (a, b) => a.site_id.localeCompare(b.site_id),
    );
  }, [semua, cari, customer, capaian, urut, target]);

  const chip = [
    customer !== "semua" && {
      label: `Customer: ${customer}`,
      hapus: () => setCustomer("semua"),
    },
    capaian !== "semua" && {
      label: capaian === "tercapai" ? "Tercapai" : "Di Bawah Target",
      hapus: () => setCapaian("semua"),
    },
  ].filter(Boolean) as Chip[];
  const hapusFilter = () => {
    setCustomer("semua");
    setCapaian("semua");
  };

  // Ringkasan periode dihitung dari semua site (bukan hasil filter).
  const dibawah = semua.filter((r) => r.sla < target).length;
  const rata = semua.length
    ? semua.reduce((t, r) => t + r.sla, 0) / semua.length
    : 0;
  const totalDown = semua.reduce((t, r) => t + r.downtime_minutes, 0);
  const berjalan = bulan === bulanIni();
  const [hariIni] = useState(() =>
    new Date(Date.now() + 7 * 3600_000).getUTCDate(),
  );

  return (
    <>
      <PageHeader
        title="Laporan SLA"
        desc="Ketersediaan layanan tiap site dalam satu bulan, dihitung otomatis dari data NPR dan TT Gamas."
        actions={
          <>
            <PilihPeriode bulan={bulan} onChange={setBulan} />
            <Button
              variant="outline"
              className="bg-white"
              disabled={!semua.length}
              onClick={() =>
                unduhCsv(`SLA-${bulan}.csv`, [
                  [
                    "Site ID",
                    "Customer",
                    "Lokasi",
                    "Menit periode",
                    "Downtime TM (menit)",
                    "SLA %",
                    "Capaian",
                  ],
                  ...hasil.map((r) => [
                    r.site_id,
                    r.customer_name,
                    r.location,
                    Math.round(r.total_minutes),
                    Math.round(r.downtime_minutes),
                    r.sla.toFixed(2),
                    r.sla >= target ? "Tercapai" : "Di bawah target",
                  ]),
                ])
              }
            >
              <Download className="size-4" />
              {/* HP: label dipendekkan supaya sebaris dengan pemilih periode. */}
              <span className="sm:hidden">CSV</span>
              <span className="hidden sm:inline">Ekspor CSV</span>
            </Button>
          </>
        }
      />

      {semua.length > 0 && (
        <dl className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border md:grid-cols-5">
          {[
            [
              "Periode",
              namaBulan(bulan),
              berjalan
                ? `1–${hariIni} ${NAMA_BULAN[Number(bulan.slice(5, 7)) - 1].slice(0, 3)}, masih berjalan`
                : "Satu bulan penuh",
              "",
            ],
            ["Target SLA", persen(target), "Per site, per bulan", ""],
            [
              "Rata-rata SLA",
              persen(rata),
              `${semua.length} site`,
              rata < target ? "text-rose-700" : "",
            ],
            [
              "Di Bawah Target",
              `${dibawah} site`,
              `dari ${semua.length} site`,
              dibawah ? "text-rose-700" : "",
            ],
            [
              "Total Downtime TM",
              jamMenit(totalDown),
              `${angka(totalDown)} menit`,
              "",
            ],
          ].map(([label, nilai, ket, warna]) => (
            // HP: 5 kotak dalam 2 kolom, kotak terakhir dibuat selebar 2 kolom
            // supaya tidak ada kotak kosong.
            <div
              key={label}
              className="min-w-0 bg-card px-4 py-3 last:col-span-2 md:last:col-span-1"
            >
              <dt className="text-xs font-medium text-muted-foreground">
                {label}
              </dt>
              <dd
                className={cn(
                  "mt-1 break-words text-sm font-semibold tabular-nums",
                  warna,
                )}
              >
                {nilai}
              </dd>
              <dd className="mt-0.5 break-words text-xs text-muted-foreground">
                {ket}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="rounded-md border bg-card">
        <Toolbar
          cari={cari}
          onCari={setCari}
          placeholder="Cari Site, Lokasi, atau Customer"
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
                {namaCustomer.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block">
            <FieldLabel>Capaian</FieldLabel>
            <Select value={capaian} onValueChange={setCapaian}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Capaian</SelectItem>
                <SelectItem value="dibawah">Di Bawah Target</SelectItem>
                <SelectItem value="tercapai">Tercapai</SelectItem>
              </SelectContent>
            </Select>
          </label>
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
          satuan="site"
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
            {data.error || "Menghitung SLA…"}
          </p>
        ) : hasil.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] table-fixed text-[13px]">
                <colgroup>
                  <col className="w-[160px]" />
                  <col />
                  <col className="w-[190px]" />
                  <col className="w-[130px]" />
                  <col className="w-[170px]" />
                </colgroup>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <KepalaUrut kolom="site" urut={urut} onUrut={gantiUrut}>
                      Site
                    </KepalaUrut>
                    <KepalaUrut kolom="customer" urut={urut} onUrut={gantiUrut}>
                      Customer / Lokasi
                    </KepalaUrut>
                    <KepalaUrut
                      kolom="downtime"
                      urut={urut}
                      onUrut={gantiUrut}
                      className="text-right [&>button]:flex-row-reverse"
                    >
                      Downtime TM
                    </KepalaUrut>
                    <KepalaUrut
                      kolom="sla"
                      urut={urut}
                      onUrut={gantiUrut}
                      className="text-right [&>button]:flex-row-reverse"
                    >
                      SLA
                    </KepalaUrut>
                    <KepalaUrut kolom="capaian" urut={urut} onUrut={gantiUrut}>
                      Capaian
                    </KepalaUrut>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {hasil.map((r) => {
                    const capai = r.sla >= target;
                    return (
                      <tr key={r.remote_id} className="align-top">
                        <td className="px-4 py-3 font-semibold tabular-nums">
                          {r.site_id}
                        </td>
                        <td className="px-4 py-3">
                          <div>{r.customer_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.location}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {r.downtime_minutes ? (
                            <>
                              <div>{jamMenit(r.downtime_minutes)}</div>
                              <div className="text-xs text-muted-foreground">
                                {angka(r.downtime_minutes)} menit
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">
                              Tidak ada
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-right font-semibold tabular-nums",
                            !capai && "text-rose-700",
                          )}
                        >
                          {persen(r.sla)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-2 font-semibold",
                              capai ? "text-emerald-700" : "text-rose-700",
                            )}
                          >
                            <span
                              className={cn(
                                "size-2 shrink-0",
                                capai ? "bg-emerald-600" : "bg-rose-600",
                              )}
                            />
                            {capai ? "Tercapai" : "Di Bawah Target"}
                          </span>
                          {!capai && (
                            <div className="mt-0.5 pl-4 text-xs text-muted-foreground tabular-nums">
                              selisih{" "}
                              {(target - r.sla).toLocaleString("id-ID", {
                                maximumFractionDigits: 2,
                              })}{" "}
                              poin persen
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Kartu: HP */}
            <ul className="divide-y md:hidden">
              {hasil.map((r) => {
                const capai = r.sla >= target;
                return (
                  <li key={r.remote_id} className="px-4 py-3.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold tabular-nums">
                        {r.site_id}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          !capai && "text-rose-700",
                        )}
                      >
                        {persen(r.sla)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm">{r.customer_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.location}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Downtime:{" "}
                        {r.downtime_minutes
                          ? jamMenit(r.downtime_minutes)
                          : "tidak ada"}
                      </span>
                      <span
                        className={cn(
                          "font-semibold",
                          capai ? "text-emerald-700" : "text-rose-700",
                        )}
                      >
                        {capai ? "Tercapai" : "Di Bawah Target"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : cari || chip.length ? (
          <EmptyState
            icon={Search}
            title="Tidak ada site yang cocok"
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
            icon={BarChart3}
            title="Belum ada data pada periode ini"
            desc="Laporan muncul setelah ada data remote. Tambahkan remote di menu Remote."
          />
        )}

        {/* Cara hitung: catatan biasa di bawah tabel, bukan kotak info terpisah. */}
        <div className="border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Cara hitung.</span> SLA
          = (waktu periode − downtime TM) ÷ waktu periode × 100%. Downtime TM
          dihitung dari NPR ber-TT Maintenance selama penanganan ada di PT.
          Tangara Mitrakom, ditambah TT Gamas per site. Preventive Maintenance
          dan gangguan yang menunggu customer tidak dihitung. Waktu yang tumpang
          tindih dihitung sekali. Bulan berjalan dihitung sampai saat ini.
        </div>
      </div>
    </>
  );
}
