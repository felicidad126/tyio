// Komponen kecil yang dipakai di semua halaman, supaya tampilannya seragam.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function waktu(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/** Lama gangguan: "48 menit", "5 jam", "1 hari 2 jam". Di bawah 1 jam ditulis
 *  dalam menit supaya gangguan singkat tidak tampil "0 jam". */
export function lama(iso: string, sampai?: string | null) {
  const menit = Math.max(
    0,
    Math.floor(
      ((sampai ? Date.parse(sampai) : Date.now()) - Date.parse(iso)) / 60_000,
    ),
  );
  if (menit < 60) return `${menit} menit`;
  const jam = Math.floor(menit / 60);
  const hari = Math.floor(jam / 24);
  if (!hari) return `${jam} jam`;
  return jam % 24 ? `${hari} hari ${jam % 24} jam` : `${hari} hari`;
}

// Status ditulis sebagai teks berwarna dengan penanda kotak kecil.
// Sengaja tanpa pil, latar, atau bingkai supaya tabel tetap tenang.
const gayaStatus: Record<
  string,
  { label: string; teks: string; tanda: string }
> = {
  OPEN: { label: "Open", teks: "text-sky-800", tanda: "bg-sky-600" },
  PENDING: { label: "Pending", teks: "text-amber-800", tanda: "bg-amber-500" },
  ESKALASI: {
    label: "Eskalasi",
    teks: "text-indigo-800",
    tanda: "bg-indigo-600",
  },
  "IN PROGRESS": {
    label: "Ditangani",
    teks: "text-indigo-800",
    tanda: "bg-indigo-600",
  },
  CLOSED: { label: "Closed", teks: "text-slate-500", tanda: "bg-slate-400" },
};

export function StatusBadge({ status }: { status: string }) {
  const g = gayaStatus[status] ?? gayaStatus.OPEN;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap text-[13px] font-semibold",
        g.teks,
      )}
    >
      <span className={cn("size-2 shrink-0", g.tanda)} />
      {g.label}
    </span>
  );
}

export function Pill({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "navy" | "amber" | "emerald" | "rose";
}) {
  const cls = {
    slate: "bg-slate-100 text-slate-700",
    navy: "bg-navy text-white",
    amber: "bg-amber-100 text-amber-900",
    emerald: "bg-emerald-100 text-emerald-900",
    rose: "bg-rose-100 text-rose-900",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-[3px] px-1.5 py-px text-[11px] font-semibold tracking-wide",
        cls,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  desc,
  actions,
  back,
}: {
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-foreground">
          {title}
        </h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  desc,
  action,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  desc?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-6 text-center",
        compact ? "py-8" : "py-14",
      )}
    >
      <Icon
        className="mb-3 size-6 text-muted-foreground/70"
        strokeWidth={1.6}
      />
      <p className="font-semibold text-foreground">{title}</p>
      {desc && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{desc}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Panel putih berbingkai tipis dengan judul opsional.
export function Panel({
  title,
  desc,
  actions,
  children,
  className,
  flush,
}: {
  title?: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-md border bg-card",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex min-h-[52px] flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-2.5 sm:px-5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <h2 className="text-[14px] font-semibold">{title}</h2>
            {desc && (
              <span className="text-xs text-muted-foreground">{desc}</span>
            )}
          </div>
          {actions}
        </header>
      )}
      <div className={cn("flex-1", flush ? "" : "p-4 sm:p-5")}>{children}</div>
    </section>
  );
}

export function InfoList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="divide-y text-sm">
      {items.map(([k, v]) => (
        <div
          key={k}
          className="grid grid-cols-[120px_1fr] gap-3 py-2.5 first:pt-0 last:pb-0"
        >
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FieldLabel({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium">
      {children}
      {hint && (
        <span className="text-xs font-normal text-muted-foreground">
          {hint}
        </span>
      )}
    </span>
  );
}
