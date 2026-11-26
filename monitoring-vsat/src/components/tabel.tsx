import { useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/*
 * Bagian tabel yang dipakai bersama oleh halaman daftar (NPR, Trouble
 * Ticket, ...), supaya perilaku dan tampilannya sama di semua halaman.
 */

export type Arah = "naik" | "turun";
export type Urut<K extends string> = { kolom: K; arah: Arah };
export type Chip = { label: string; hapus: () => void };

/**
 * Status urutan tabel. Klik kolom yang sama membalik arah; klik kolom lain
 * memakai arah awal kolom itu (kolom waktu/nomor biasanya mulai dari terbaru).
 *
 * Selama pengguna belum memilih urutan, `awal` yang berlaku. `awal` boleh
 * berubah antar-render (mis. daftar NPR dari Dashboard: terlama dulu), dan
 * panah di kepala kolom selalu mengikuti urutan yang benar-benar dipakai.
 */
export function useUrut<K extends string>(awal: Urut<K>, mulaiTurun: K[] = []) {
  const [pilihan, setPilihan] = useState<Urut<K> | null>(null);
  const urut = pilihan ?? awal;
  const ganti = (kolom: K) =>
    setPilihan(
      urut.kolom === kolom
        ? { kolom, arah: urut.arah === "naik" ? "turun" : "naik" }
        : { kolom, arah: mulaiTurun.includes(kolom) ? "turun" : "naik" },
    );
  const setUrut = (u: Urut<K>) => setPilihan(u);
  return [urut, ganti, setUrut] as const;
}

/** Urutkan salinan daftar. Nilai sama: urutan cadangan supaya hasil selalu tetap. */
export function urutkan<T>(
  daftar: T[],
  nilai: (x: T) => string | number,
  arah: Arah,
  cadangan: (a: T, b: T) => number = () => 0,
) {
  const k = arah === "naik" ? 1 : -1;
  return [...daftar].sort((a, b) => {
    const x = nilai(a);
    const y = nilai(b);
    const beda =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y), "id");
    return beda * k || cadangan(a, b);
  });
}

/** Kepala kolom yang bisa diklik untuk mengurutkan (⇅, ↑ naik, ↓ turun). */
export function KepalaUrut<K extends string>({
  kolom,
  urut,
  onUrut,
  children,
  className,
}: {
  kolom: K;
  urut: Urut<K>;
  onUrut: (k: K) => void;
  children: ReactNode;
  className?: string;
}) {
  const aktif = urut.kolom === kolom;
  const Ikon = !aktif
    ? ChevronsUpDown
    : urut.arah === "naik"
      ? ArrowUp
      : ArrowDown;
  return (
    <th
      className={cn("px-4 py-0 font-medium", className)}
      aria-sort={
        aktif ? (urut.arah === "naik" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onUrut(kolom)}
        className={cn(
          "-mx-1.5 inline-flex h-9 items-center gap-1 whitespace-nowrap rounded px-1.5 hover:bg-muted hover:text-foreground",
          aktif && "text-foreground",
        )}
      >
        {children}
        <Ikon className={cn("size-3.5", !aktif && "opacity-40")} />
      </button>
    </th>
  );
}

/** Toolbar: kotak cari mengisi ruang di kiri, satu tombol Filter di kanan. */
export function Toolbar({
  cari,
  onCari,
  placeholder,
  jumlahFilter,
  onHapusFilter,
  children,
}: {
  cari: string;
  onCari: (v: string) => void;
  placeholder: string;
  jumlahFilter: number;
  onHapusFilter: () => void;
  /** Isi panel Filter. Tanpa isi, tombol Filter tidak ditampilkan. */
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b p-3">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={cari}
          onChange={(e) => onCari(e.target.value)}
          placeholder={placeholder}
          className="h-9 pl-9 pr-9"
          aria-label={placeholder}
        />
        {cari && (
          <button
            type="button"
            onClick={() => onCari("")}
            aria-label="Hapus pencarian"
            title="Hapus pencarian"
            className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {children && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 shrink-0 bg-white">
              <SlidersHorizontal className="size-4" />
              Filter
              {jumlahFilter > 0 && (
                <span className="grid size-5 place-items-center rounded bg-navy text-[11px] font-semibold text-white tabular-nums">
                  {jumlahFilter}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            collisionPadding={12}
            className="max-h-[var(--radix-popover-content-available-height)] w-[300px] overflow-y-auto p-0"
          >
            <div className="space-y-3 p-4">{children}</div>
            <div className="flex justify-end border-t px-4 py-2.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={!jumlahFilter}
                onClick={onHapusFilter}
              >
                Hapus Filter
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/**
 * Baris di bawah toolbar: jumlah hasil dan chip filter aktif. Selalu tampil
 * dengan tinggi tetap, supaya tabel tidak naik-turun saat filter berubah.
 */
export function BarisRingkasan({
  jumlah,
  satuan,
  chip,
  onHapusSemua,
}: {
  jumlah: number;
  satuan: string;
  chip: Chip[];
  onHapusSemua: () => void;
}) {
  return (
    <div className="flex h-11 items-center gap-2 border-b px-3 text-[13px]">
      <span className="shrink-0 text-muted-foreground tabular-nums">
        {jumlah} {satuan}
        {chip.length > 0 && " sesuai filter"}
      </span>
      {chip.length > 0 && (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {chip.map((c) => (
              <span
                key={c.label}
                className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded border bg-muted/50 pl-2.5 pr-1 font-medium"
              >
                {c.label}
                <button
                  onClick={c.hapus}
                  aria-label={`Hapus filter ${c.label}`}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
          <button
            onClick={onHapusSemua}
            className="shrink-0 font-medium text-navy hover:underline"
          >
            Hapus Semua
          </button>
        </>
      )}
    </div>
  );
}

/** "2026-11-20" → "20 Nov 2026" */
export const tanggalPendek = (tgl: string) =>
  new Date(`${tgl}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** Tanggal WIB (YYYY-MM-DD) dari waktu ISO. */
export const tanggalWib = (iso: string) =>
  new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);

/** Label chip rentang tanggal. */
export function labelRentang(nama: string, dari: string, sampai: string) {
  if (dari && sampai)
    return `${nama}: ${tanggalPendek(dari)} – ${tanggalPendek(sampai)}`;
  if (dari) return `${nama} sejak ${tanggalPendek(dari)}`;
  return `${nama} sampai ${tanggalPendek(sampai)}`;
}
