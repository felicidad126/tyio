import { useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, StatusBadge, lama, waktu } from "@/components/npr";
import { useApp } from "@/lib/app";
import { customerById, gamas, grafik7Hari, nprs, remoteById } from "@/lib/data";
import { cn } from "@/lib/utils";

type Npr = (typeof nprs)[number];
const jamBerjalan = (n: Npr) => (Date.now() - Date.parse(n.started_at)) / 3600_000;

// Ringkasan: satu strip bersekat empat. Angka diberi warna hanya jika
// perlu perhatian.
function Ringkasan({
  items,
}: {
  items: { label: string; value: number; hint: string; warna?: string; onClick: () => void }[];
}) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-md border bg-card xl:grid-cols-4">
      {items.map((it, i) => (
        <button
          key={it.label}
          onClick={it.onClick}
          className={cn(
            "group flex flex-col items-start px-5 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none",
            i % 2 === 1 && "border-l",
            i >= 2 && "border-t xl:border-t-0",
            i === 2 && "xl:border-l",
          )}
        >
          <span className="text-[13px] font-medium text-muted-foreground">{it.label}</span>
          <span className={cn("mt-1.5 text-[28px] font-bold leading-none tabular-nums", it.value > 0 && it.warna)}>
            {it.value}
          </span>
          <span className="mt-2 flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
            {it.hint}
            <ArrowRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </span>
        </button>
      ))}
    </div>
  );
}

// Grafik batang dengan sumbu angka dan garis bantu, supaya tinggi batang
// bisa dibaca nilainya.
function GrafikHarian({ data }: { data: { label: string; tanggal: string; nilai: number }[] }) {
  const [aktif, setAktif] = useState<number | null>(null);
  const maks = Math.max(...data.map((d) => d.nilai));
  // Skala sumbu: bilangan bulat, minimal sampai 4 supaya angka kecil tidak
  // terlihat berlebihan.
  const atas = Math.max(4, maks + (maks % 2));
  const garis = [atas, atas * 0.75, atas / 2, atas / 4, 0];
  const total = data.reduce((a, d) => a + d.nilai, 0);
  const sorot = aktif ?? data.length - 1;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="text-xl font-bold tabular-nums">{total}</span>{" "}
          <span className="text-muted-foreground">NPR dalam 7 Hari</span>
        </span>
        <span className="text-muted-foreground">
          Rata-rata <span className="font-semibold text-foreground">{(total / data.length).toLocaleString("id-ID", { maximumFractionDigits: 1 })}</span> per hari
        </span>
        <span className="ml-auto text-muted-foreground">
          {data[sorot].tanggal}:{" "}
          <span className="font-semibold text-foreground">{data[sorot].nilai} NPR</span>
        </span>
      </div>
      <div className="grid grid-cols-[28px_1fr] gap-2">
        {/* Sumbu Y */}
        <div className="relative h-44 text-right text-[11px] tabular-nums text-muted-foreground">
          {garis.map((g) => (
            <span key={g} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - g / atas) * 100}%` }}>
              {Number.isInteger(g) ? g : ""}
            </span>
          ))}
        </div>
        <div className="relative h-44">
          {garis.map((g) => (
            <div key={g} className={cn("absolute inset-x-0 border-t", g === 0 ? "border-slate-400" : "border-dashed border-slate-200")} style={{ top: `${(1 - g / atas) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-3 px-2 sm:gap-6">
            {data.map((d, i) => (
              <button
                key={i}
                onMouseEnter={() => setAktif(i)}
                onMouseLeave={() => setAktif(null)}
                onFocus={() => setAktif(i)}
                onBlur={() => setAktif(null)}
                className="flex h-full flex-1 items-end justify-center focus-visible:outline-none"
                aria-label={`${d.tanggal}: ${d.nilai} NPR`}
              >
                <div
                  className={cn("w-full max-w-9 transition-colors", i === sorot ? "bg-navy" : "bg-navy/55")}
                  style={{ height: `${(d.nilai / atas) * 100}%` }}
                />
              </button>
            ))}
          </div>
        </div>
        <div />
        <div className="flex gap-3 px-2 sm:gap-6">
          {data.map((d, i) => (
            <div key={i} className={cn("flex-1 pt-1.5 text-center text-[11px] leading-tight", i === sorot ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {d.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Distribusi: satu baris per kategori. Panjang bar = bagian dari seluruh NPR
// aktif, angka dan persentase ditulis di sampingnya.
function Distribusi({
  total,
  data,
  onPilih,
}: {
  total: number;
  data: { key: string; label: string; ket: string; n: number; cls: string }[];
  onPilih: (key: string) => void;
}) {
  return (
    <ul className="space-y-4">
      {data.map((d) => {
        const persen = total ? Math.round((d.n / total) * 100) : 0;
        return (
          <li key={d.key}>
            <button onClick={() => onPilih(d.key)} className="group w-full text-left">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium group-hover:text-navy group-hover:underline">{d.label}</span>
                <span className="tabular-nums">
                  <span className="font-semibold">{d.n}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{persen}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-2 bg-muted">
                <div className={cn("h-full", d.cls)} style={{ width: `${persen}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{d.ket}</p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Dashboard() {
  const { go, kosong } = useApp();
  const daftar = kosong ? [] : nprs;
  const aktif = daftar.filter((n) => n.status !== "CLOSED");
  const lebih48 = aktif.filter((n) => jamBerjalan(n) > 48).length;
  const antara = aktif.filter((n) => jamBerjalan(n) >= 24 && jamBerjalan(n) <= 48).length;
  const menunggu = aktif.filter((n) => n.ticket && !n.ticket.report).length;
  const distribusi = [
    { key: "pending_tm", label: "Pending TM", ket: "Menunggu tindakan PT. Tangara Mitrakom", n: aktif.filter((n) => n.pending_by === "TM").length, cls: "bg-navy" },
    { key: "pending_customer", label: "Pending Customer", ket: "Menunggu bank atau pengelola lokasi", n: aktif.filter((n) => n.pending_by === "Customer").length, cls: "bg-amber-500" },
    { key: "belum_kategori", label: "Belum Dikategorikan", ket: "Pihak yang ditunggu belum dipilih", n: aktif.filter((n) => !n.pending_by).length, cls: "bg-slate-400" },
  ];
  const grafik = (kosong ? grafik7Hari.map(() => 0) : grafik7Hari).map((nilai, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400_000);
    const opsi = { timeZone: "Asia/Jakarta" } as const;
    return {
      nilai,
      label: i === 6 ? "Hari Ini" : d.toLocaleDateString("id-ID", { ...opsi, weekday: "short", day: "numeric" }),
      tanggal: d.toLocaleDateString("id-ID", { ...opsi, weekday: "long", day: "numeric", month: "long" }),
    };
  });
  const gamasAktif = kosong ? [] : gamas.filter((g) => g.status !== "CLOSED");
  const terlama = [...aktif].sort((a, b) => a.started_at.localeCompare(b.started_at)).slice(0, 10);

  return (
    <>
      <PageHeader
        title="Dashboard"
        desc="Ringkasan gangguan yang sedang ditangani."
        actions={
          <Button onClick={() => go("npr-baru")}>
            <Plus className="size-4" /> NPR Baru
          </Button>
        }
      />

      <Ringkasan
        items={[
          { label: "NPR Aktif", value: aktif.length, hint: "Semua NPR yang belum ditutup", onClick: () => go("npr", "aktif") },
          { label: "Aktif Lebih dari 48 Jam", value: lebih48, hint: "Prioritas penanganan", warna: "text-rose-700", onClick: () => go("npr", "kritis") },
          { label: "Aktif 24–48 Jam", value: antara, hint: "Perlu dipantau", warna: "text-amber-700", onClick: () => go("npr", "aging") },
          { label: "TT Menunggu Report", value: menunggu, hint: "Report teknisi belum masuk", onClick: () => go("npr", "menunggu_report") },
        ]}
      />

      <div className="mt-5 grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 gap-5">
        <Panel
          title="NPR Aktif"
          desc="Urut dari yang paling lama terganggu"
          flush
          actions={
            aktif.length > 0 && (
              <button onClick={() => go("npr", "aktif")} className="text-[13px] font-medium text-navy hover:underline">
                Buka Daftar Lengkap
              </button>
            )
          }
        >
          {terlama.length ? (
            <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-5 py-2 font-medium">No. NPR</th>
                    <th className="px-3 py-2 font-medium">Lokasi</th>
                    <th className="px-3 py-2 font-medium">Mulai Gangguan</th>
                    <th className="px-3 py-2 font-medium">Durasi</th>
                    <th className="px-3 py-2 font-medium">Pending</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {terlama.map((n) => {
                    const r = remoteById(n.remote_id);
                    const jam = jamBerjalan(n);
                    return (
                      <tr key={n.id} onClick={() => go("npr-detail", n.id)} className="cursor-pointer align-top hover:bg-muted/40">
                        <td className="whitespace-nowrap px-5 py-3">
                          <div className="font-semibold tabular-nums">{n.number}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{n.remote_status}</div>
                        </td>
                        <td className="min-w-[200px] px-3 py-3">
                          <div className="font-medium">{r.site_id}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{customerById(r.customer_id).name}, {r.location}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{waktu(n.started_at)}</td>
                        <td className={cn("whitespace-nowrap px-3 py-3 font-semibold tabular-nums", jam > 48 ? "text-rose-700" : jam >= 24 ? "text-amber-700" : "")}>
                          {lama(n.started_at)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">{n.pending_by || <span className="text-muted-foreground">Belum Dipilih</span>}</td>
                        <td className="whitespace-nowrap px-5 py-3"><StatusBadge status={n.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* HP: daftar kartu */}
            <ul className="divide-y md:hidden">
              {terlama.map((n) => {
                const r = remoteById(n.remote_id);
                const jam = jamBerjalan(n);
                return (
                  <li key={n.id}>
                    <button onClick={() => go("npr-detail", n.id)} className="w-full px-4 py-3 text-left active:bg-muted/60">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold tabular-nums">{n.number}</span>
                        <span className={cn("text-sm font-semibold tabular-nums", jam > 48 ? "text-rose-700" : jam >= 24 ? "text-amber-700" : "")}>{lama(n.started_at)}</span>
                      </div>
                      <div className="mt-1 text-sm">{r.site_id} · {n.remote_status}</div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{customerById(r.customer_id).name}</span>
                        <StatusBadge status={n.status} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            </>
          ) : (
            <div className="px-5 py-12 text-center">
              <p className="font-medium">Tidak ada NPR aktif</p>
              <p className="mt-1 text-sm text-muted-foreground">Semua gangguan sudah ditutup.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => go("npr-baru")}>
                <Plus className="size-4" /> NPR Baru
              </Button>
            </div>
          )}
        </Panel>
      <Panel title="NPR Masuk per Hari" desc="7 hari terakhir, menurut tanggal mulai gangguan (WIB)">
        {grafik.some((d) => d.nilai > 0) ? (
          <GrafikHarian data={grafik} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">Belum ada NPR dalam 7 hari terakhir.</p>
        )}
      </Panel>
        </div>

        {/* Kolom kanan (layar ≥1536 px): panel terakhir mengisi sisa tinggi
            supaya tepi bawah kedua kolom sejajar. Di layar laptop kedua panel
            berdampingan di bawah tabel. */}
        <div className="grid gap-5 lg:grid-cols-2 2xl:flex 2xl:flex-col">
          <Panel title="Pihak yang Ditunggu" desc={`dari ${aktif.length} NPR aktif`}>
            {aktif.length ? (
              <Distribusi total={aktif.length} data={distribusi} onPilih={(k) => go("npr", k)} />
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">Belum ada NPR aktif.</p>
            )}
          </Panel>

          <Panel
            title="Gangguan Massal Aktif"
            className="flex-1"
            flush
            actions={
              <button onClick={() => go("gamas")} className="text-[13px] font-medium text-navy hover:underline">
                Buka TT Gamas
              </button>
            }
          >
            {gamasAktif.length ? (
              <ul className="divide-y">
                {gamasAktif.map((g) => (
                  <li key={g.id}>
                    <button onClick={() => go("gamas-detail", g.id)} className="w-full px-5 py-3 text-left hover:bg-muted/40">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold tabular-nums">{g.number}</span>
                        <StatusBadge status={g.status} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {g.location}, {g.sites.length} site terdampak, berjalan {lama(g.started_at)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">Tidak ada gangguan massal aktif.</p>
            )}
          </Panel>
        </div>
      </div>

    </>
  );
}
