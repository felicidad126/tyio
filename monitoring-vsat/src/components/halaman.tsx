// Halaman aplikasi dimuat terpisah (code splitting), supaya berkas JS yang
// diunduh saat membuka Login atau Dashboard kecil. Login dan dialog Ganti
// Password tetap di berkas utama karena selalu dipakai.
import { Component, lazy, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

const muat = {
  dashboard: () => import("@/pages/Dashboard"),
  npr: () => import("@/pages/Npr"),
  tiket: () => import("@/pages/Tiket"),
  gamas: () => import("@/pages/Gamas"),
  sla: () => import("@/pages/Sla"),
  master: () => import("@/pages/Master"),
  pengguna: () => import("@/pages/Pengguna"),
};

export const Dashboard = lazy(() =>
  muat.dashboard().then((m) => ({ default: m.Dashboard })),
);
export const NprList = lazy(() =>
  muat.npr().then((m) => ({ default: m.NprList })),
);
export const NprBaru = lazy(() =>
  muat.npr().then((m) => ({ default: m.NprBaru })),
);
export const NprDetail = lazy(() =>
  muat.npr().then((m) => ({ default: m.NprDetail })),
);
export const TroubleTicket = lazy(() =>
  muat.tiket().then((m) => ({ default: m.TroubleTicket })),
);
export const GamasList = lazy(() =>
  muat.gamas().then((m) => ({ default: m.GamasList })),
);
export const GamasDetail = lazy(() =>
  muat.gamas().then((m) => ({ default: m.GamasDetail })),
);
export const LaporanSla = lazy(() =>
  muat.sla().then((m) => ({ default: m.LaporanSla })),
);
export const CustomerPage = lazy(() =>
  muat.master().then((m) => ({ default: m.CustomerPage })),
);
export const RemotePage = lazy(() =>
  muat.master().then((m) => ({ default: m.RemotePage })),
);
export const PenggunaPage = lazy(() =>
  muat.pengguna().then((m) => ({ default: m.PenggunaPage })),
);

/**
 * Setelah login, semua halaman diunduh saat browser senggang. Pindah menu
 * jadi instan, dan tab yang sudah terbuka tetap bisa pindah halaman walaupun
 * server sudah memasang versi baru (berkas versi lama sudah tidak ada).
 * Ditunda 2 detik supaya tidak berebut jaringan dengan halaman yang sedang
 * dibuka dan datanya.
 */
export function useUnduhSemuaHalaman(aktif: boolean) {
  useEffect(() => {
    if (!aktif) return;
    const unduh = () => {
      // Galat diabaikan di sini; ditangani saat halaman itu dibuka.
      for (const f of Object.values(muat)) f().catch(() => {});
    };
    const t = setTimeout(() => {
      if (typeof window.requestIdleCallback === "function")
        window.requestIdleCallback(unduh, { timeout: 3000 });
      else unduh();
    }, 2000);
    return () => clearTimeout(t);
  }, [aktif]);
}

/** Tampil hanya bila halaman belum siap setelah 300 ms, supaya tidak berkedip. */
export function MemuatHalaman() {
  const [tampil, setTampil] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTampil(true), 300);
    return () => clearTimeout(t);
  }, []);
  return tampil ? (
    <p className="text-sm text-muted-foreground">Memuat halaman…</p>
  ) : null;
}

// Berkas halaman gagal diunduh (pesan Chrome, Firefox, dan Safari).
const galatBerkas = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|Unable to preload/i.test(
    e instanceof Error ? e.message : String(e),
  );

// Muat ulang otomatis paling banyak sekali per 10 detik, supaya tidak
// berputar bila penyebabnya koneksi putus. Bila penyimpanan sesi diblokir,
// tanpa muat ulang otomatis (langsung pesan dan tombol).
const KUNCI_MUAT_ULANG = "npr-muat-ulang-terakhir";
function bolehMuatUlang() {
  try {
    const terakhir = Number(sessionStorage.getItem(KUNCI_MUAT_ULANG)) || 0;
    return Date.now() - terakhir >= 10_000;
  } catch {
    return false;
  }
}

/**
 * Halaman yang sedang dibuka gagal dimuat. Bila berkasnya tidak ditemukan
 * (biasanya server baru memasang versi baru dan berkas versi lama sudah
 * tidak ada), halaman dimuat ulang sekali supaya browser memakai versi baru.
 * Bila tetap gagal, tampil pesan dengan tombol muat ulang, bukan layar
 * kosong. Unduhan halaman di latar (useUnduhSemuaHalaman) yang gagal tidak
 * memicu muat ulang, jadi isian form tidak hilang. Diberi key halaman di App,
 * jadi pindah menu mencoba lagi.
 */
export class BatasHalaman extends Component<
  { children: ReactNode },
  { galat: boolean; muatUlang: boolean }
> {
  state = { galat: false, muatUlang: false };

  static getDerivedStateFromError(e: unknown) {
    return { galat: true, muatUlang: galatBerkas(e) && bolehMuatUlang() };
  }

  componentDidCatch(e: unknown) {
    if (!galatBerkas(e) || !bolehMuatUlang()) return;
    try {
      sessionStorage.setItem(KUNCI_MUAT_ULANG, String(Date.now()));
    } catch {
      this.setState({ muatUlang: false });
      return;
    }
    window.location.reload();
  }

  render() {
    if (!this.state.galat) return this.props.children;
    if (this.state.muatUlang) return <MemuatHalaman />;
    return (
      <div className="rounded-md border bg-card px-5 py-6">
        <p className="font-medium">Halaman gagal dimuat</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Periksa koneksi internet, lalu muat ulang. Data yang sudah tersimpan
          tidak hilang.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Muat ulang
        </Button>
      </div>
    );
  }
}
