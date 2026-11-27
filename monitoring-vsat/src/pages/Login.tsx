import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/npr";
import { InputSandi } from "@/components/sandi";
import type { User } from "@/lib/tipe";
import type { Api } from "@/useMuat";
import logoTm from "@/aset/logo-tm.png";

/** Isi aplikasi, ditulis apa adanya: apa yang dicatat di tiap menu. */
const MODUL = [
  ["NPR", "Catat gangguan per site dan setiap tindakan penanganannya."],
  ["Trouble Ticket", "Eskalasi ke teknisi lapangan, lengkap dengan report."],
  ["TT Gamas", "Gangguan massal yang mengenai banyak site sekaligus."],
  [
    "Laporan SLA",
    "Ketersediaan layanan tiap site, dihitung otomatis per bulan.",
  ],
];

export function Login({
  api,
  onMasuk,
}: {
  api: Api;
  onMasuk: (u: User) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState(false);

  // Halaman login tidak pernah bergulir: ruang scrollbar tidak perlu disediakan.
  useEffect(() => {
    const html = document.documentElement;
    html.style.scrollbarGutter = "auto";
    return () => {
      html.style.scrollbarGutter = "";
    };
  }, []);

  async function masuk(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSibuk(true);
    setGalat("");
    try {
      const hasil = await api<{ user: User }>("/api/login", {
        username: username.trim(),
        password,
      });
      setPassword("");
      onMasuk(hasil.user);
    } catch (err) {
      setGalat((err as Error).message);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[440px_minmax(0,1fr)]">
      {/* Panel kiri: identitas dan isi aplikasi, tanpa ornamen. */}
      <aside className="hidden flex-col bg-navy px-10 py-9 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-white">
            <img src={logoTm} alt="" className="size-8" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">PT. Tangara Mitrakom</div>
            <div className="text-xs text-slate-300">
              Helpdesk VSAT &amp; M2M
            </div>
          </div>
        </div>

        <div className="mt-auto">
          <h1 className="text-2xl font-bold tracking-[-0.01em]">
            Network Problem Report
          </h1>
          <dl className="mt-6 divide-y divide-white/10 border-y border-white/10 text-sm">
            {MODUL.map(([nama, ket]) => (
              <div key={nama} className="grid grid-cols-[112px_1fr] gap-3 py-3">
                <dt className="font-medium">{nama}</dt>
                <dd className="text-slate-300">{ket}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="mt-10 text-xs text-slate-400">
          Proyek Kerja Praktek, Universitas Dian Nusantara
        </p>
      </aside>

      {/* Form login */}
      <main className="flex flex-col px-6 py-10 sm:px-12">
        <div className="flex items-center gap-3 lg:hidden">
          <span className="grid size-10 place-items-center rounded-md border">
            <img src={logoTm} alt="" className="size-8" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Network Problem Report</div>
            <div className="text-xs text-muted-foreground">
              PT. Tangara Mitrakom · Helpdesk VSAT &amp; M2M
            </div>
          </div>
        </div>

        <form
          className="my-auto w-full max-w-sm py-10 lg:mx-auto"
          onSubmit={masuk}
        >
          <h2 className="text-[22px] font-bold tracking-[-0.01em]">Masuk</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Gunakan akun yang dibuatkan admin.
          </p>

          <label className="mt-7 block">
            <FieldLabel>Username</FieldLabel>
            <Input
              name="username"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-10"
              aria-invalid={!!galat}
            />
          </label>
          <label className="mt-4 block">
            <FieldLabel>Password</FieldLabel>
            <InputSandi
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10"
              aria-invalid={!!galat}
            />
          </label>

          {/* Pesan gagal tepat di atas tombol, tempat mata berada setelah menekan Masuk. */}
          {galat && (
            <p
              role="alert"
              className="mt-4 border-l-2 border-rose-600 pl-3 text-sm text-rose-800"
            >
              {galat}
            </p>
          )}

          <Button type="submit" className="mt-6 h-10 w-full" disabled={sibuk}>
            {sibuk ? "Memeriksa…" : "Masuk"}
          </Button>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Lupa password?{" "}
            <span className="font-medium text-foreground">Chat mimin yaa.</span>
          </p>
        </form>

        <p className="text-xs text-muted-foreground lg:hidden">
          Proyek Kerja Praktek, Universitas Dian Nusantara
        </p>
      </main>
    </div>
  );
}
