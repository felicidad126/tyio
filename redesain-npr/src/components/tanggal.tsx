import { useEffect, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { DayPicker } from "react-day-picker";
import { id as localeId } from "date-fns/locale/id";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** "2026-11-23" → Date lokal (tanpa geser zona waktu). */
const keDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const keIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const keTeks = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

/** Ubah ketikan menjadi dd/mm/yyyy: garis miring disisipkan otomatis. */
function rapikan(ketik: string) {
  const a = ketik.replace(/\D/g, "").slice(0, 8);
  return [a.slice(0, 2), a.slice(2, 4), a.slice(4)].filter(Boolean).join("/");
}

/** dd/mm/yyyy → ISO, atau null kalau tanggalnya tidak ada (mis. 31/02). */
function bacaTeks(teks: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(teks);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
  return keIso(d);
}

/** true di layar ≥768 px. Di layar lebar kalender melayang di samping panel;
    di HP kalender terbuka di bawah isian karena ruang samping tidak cukup. */
function useLayarLebar() {
  const q = "(min-width: 768px)";
  const [lebar, setLebar] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const ubah = () => setLebar(m.matches);
    m.addEventListener("change", ubah);
    return () => m.removeEventListener("change", ubah);
  }, []);
  return lebar;
}

/**
 * Isian tanggal yang bisa diketik (dd/mm/yyyy) atau dipilih dari kalender.
 * Nilai keluar/masuk dalam format ISO "YYYY-MM-DD", kosong = "".
 */
export function TanggalInput({
  value,
  onChange,
  min,
  max,
  label,
  required,
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  label: string;
  required?: boolean;
}) {
  const [teks, setTeks] = useState(keTeks(value));
  const [salah, setSalah] = useState("");
  const [buka, setBuka] = useState(false);
  const lebar = useLayarLebar();

  // Ikuti perubahan dari luar, mis. tombol "Hapus Filter".
  useEffect(() => {
    setTeks(keTeks(value));
    setSalah("");
  }, [value]);

  const cekRentang = (iso: string) =>
    min && iso < min ? `Tidak boleh sebelum ${keTeks(min)}` : max && iso > max ? `Tidak boleh setelah ${keTeks(max)}` : "";

  const ketik = (v: string) => {
    const t = rapikan(v);
    setTeks(t);
    setSalah("");
    if (!t) return onChange("");
    const iso = t.length === 10 ? bacaTeks(t) : null;
    if (iso && !cekRentang(iso)) onChange(iso);
  };

  const selesai = () => {
    if (!teks) return;
    const iso = bacaTeks(teks);
    if (!iso) return setSalah("Tanggal tidak valid, gunakan dd/mm/yyyy");
    setSalah(cekRentang(iso));
  };


  const kalender = (
    <Kalender
      value={value}
      min={min}
      max={max}
      onPilih={(iso) => {
        onChange(iso);
        setBuka(false);
      }}
    />
  );

  return (
    <div>
      <Popover open={buka && lebar} onOpenChange={setBuka}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              "flex h-9 items-center rounded-md border border-input bg-white pl-3 shadow-sm focus-within:ring-1 focus-within:ring-ring",
              salah && "border-rose-500 focus-within:ring-rose-500",
            )}
          >
            <input
              value={teks}
              onChange={(e) => ketik(e.target.value)}
              onBlur={selesai}
              inputMode="numeric"
              placeholder="dd/mm/yyyy"
              required={required}
              pattern="\d{2}/\d{2}/\d{4}"
              aria-label={label}
              aria-invalid={!!salah}
              className="h-full min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => setBuka((v) => !v)}
              aria-expanded={buka}
              aria-label={`Pilih ${label.toLowerCase()} dari kalender`}
              className={cn(
                "grid h-full w-9 shrink-0 place-items-center rounded-r-md text-muted-foreground hover:bg-muted hover:text-foreground",
                buka && "bg-muted text-foreground",
              )}
            >
              <CalendarDays className="size-4" />
            </button>
          </div>
        </PopoverAnchor>
        {/* Layar lebar: di samping kiri panel Filter, tidak menutupi isian. */}
        <PopoverContent side="left" align="start" sideOffset={28} className="w-auto p-2">
          {kalender}
        </PopoverContent>
      </Popover>
      {salah && <p className="mt-1 text-xs text-rose-700">{salah}</p>}
      {/* HP: terbuka di bawah isian. */}
      {buka && !lebar && <div className="mt-2 w-fit rounded-md border bg-white p-2">{kalender}</div>}
    </div>
  );
}

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/**
 * Kalender dengan bulan (pilihan) dan tahun (bisa diketik), supaya pindah ke
 * bulan/tahun jauh tidak perlu menekan panah berkali-kali.
 */
function Kalender({
  value,
  min,
  max,
  onPilih,
}: {
  value: string;
  min?: string;
  max?: string;
  onPilih: (iso: string) => void;
}) {
  const awal = value ? keDate(value) : max ? keDate(max) : new Date();
  const [bulan, setBulan] = useState(new Date(awal.getFullYear(), awal.getMonth(), 1));
  const [teksTahun, setTeksTahun] = useState(String(awal.getFullYear()));

  const pindah = (d: Date) => {
    setBulan(new Date(d.getFullYear(), d.getMonth(), 1));
    setTeksTahun(String(d.getFullYear()));
  };
  const ketikTahun = (v: string) => {
    const t = v.replace(/\D/g, "").slice(0, 4);
    setTeksTahun(t);
    if (t.length === 4 && Number(t) >= 2000 && Number(t) <= 2100) {
      setBulan(new Date(Number(t), bulan.getMonth(), 1));
    }
  };
  const geser = (n: number) => pindah(new Date(bulan.getFullYear(), bulan.getMonth() + n, 1));
  const tombol = "grid size-8 shrink-0 place-items-center rounded-md border hover:bg-muted";
  const kotak = "h-8 rounded-md border border-input bg-white text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="w-[232px]">
      <div className="flex items-center gap-1">
        <select
          value={bulan.getMonth()}
          onChange={(e) => pindah(new Date(bulan.getFullYear(), Number(e.target.value), 1))}
          aria-label="Bulan"
          className={cn(kotak, "min-w-0 flex-1 cursor-pointer px-1.5")}
        >
          {NAMA_BULAN.map((n, i) => (
            <option key={n} value={i}>{n}</option>
          ))}
        </select>
        <input
          value={teksTahun}
          onChange={(e) => ketikTahun(e.target.value)}
          onBlur={() => setTeksTahun(String(bulan.getFullYear()))}
          inputMode="numeric"
          aria-label="Tahun"
          className={cn(kotak, "w-[58px] px-2 text-center tabular-nums")}
        />
        <button type="button" onClick={() => geser(-1)} aria-label="Bulan sebelumnya" className={tombol}>
          <ChevronLeft className="size-4" />
        </button>
        <button type="button" onClick={() => geser(1)} aria-label="Bulan berikutnya" className={tombol}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      <DayPicker
        mode="single"
        locale={localeId}
        month={bulan}
        onMonthChange={pindah}
        hideNavigation
        selected={value ? keDate(value) : undefined}
        disabled={[...(min ? [{ before: keDate(min) }] : []), ...(max ? [{ after: keDate(max) }] : [])]}
        onSelect={(d) => d && onPilih(keIso(d))}
        showOutsideDays
        classNames={{
          root: "text-sm",
          month_caption: "sr-only",
          month_grid: "mt-2 w-full border-collapse",
          weekday: "h-8 text-xs font-medium text-muted-foreground",
          day: "p-0 text-center",
          day_button:
            "size-8 rounded-md text-[13px] tabular-nums hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          today: "font-semibold text-navy",
          selected: "[&>button]:bg-navy [&>button]:text-white [&>button:hover]:bg-navy",
          outside: "text-muted-foreground/50",
          disabled: "pointer-events-none opacity-30",
        }}
      />
    </div>
  );
}

/** Jam 24 jam (HH:MM): titik dua disisipkan otomatis. */
function rapikanJam(ketik: string) {
  const a = ketik.replace(/\D/g, "").slice(0, 4);
  return a.length > 2 ? `${a.slice(0, 2)}:${a.slice(2)}` : a;
}

/** Waktu sekarang di WIB, format "YYYY-MM-DDTHH:MM". */
export const sekarangWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16);

/**
 * Isian tanggal + jam (24 jam, WIB). Tanggal bisa diketik atau dipilih dari
 * kalender; jam diketik, mis. "1628" menjadi "16:28".
 */
export function WaktuInput({
  label,
  defaultValue = "",
  required,
}: {
  label: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const [tanggal, setTanggal] = useState(defaultValue.slice(0, 10));
  const [jam, setJam] = useState(defaultValue.slice(11, 16));
  const salahJam = jam.length === 5 && !/^([01]\d|2[0-3]):[0-5]\d$/.test(jam);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_72px] items-start gap-2">
      <TanggalInput label={`Tanggal ${label.toLowerCase()}`} value={tanggal} onChange={setTanggal} required={required} />
      <div>
        <input
          value={jam}
          onChange={(e) => setJam(rapikanJam(e.target.value))}
          inputMode="numeric"
          placeholder="hh:mm"
          required={required}
          pattern="([01]\d|2[0-3]):[0-5]\d"
          aria-label={`Jam ${label.toLowerCase()}`}
          aria-invalid={salahJam}
          className={cn(
            "h-9 w-full rounded-md border border-input bg-white px-2 text-center text-sm tabular-nums shadow-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring",
            salahJam && "border-rose-500 focus:ring-rose-500",
          )}
        />
        {salahJam && <p className="mt-1 text-xs text-rose-700">Jam 00:00–23:59</p>}
      </div>
    </div>
  );
}
