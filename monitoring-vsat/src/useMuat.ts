import { useEffect, useState } from "react";

export type Api = <T>(path: string, body?: unknown) => Promise<T>;

// Mengambil data dari server untuk satu alamat. Data dimuat ulang saat alamat
// atau `versi` berubah (versi dinaikkan setelah ada data yang disimpan).
// Selama memuat ulang alamat yang sama, data lama tetap ditampilkan.
export function useMuat<T>(path: string | null, api: Api, versi = 0) {
  const [hasil, setHasil] = useState<{
    path: string;
    versi: number;
    data?: T;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!path) return;
    let aktif = true;
    api<T>(path)
      .then((data) => {
        if (aktif) setHasil({ path, versi, data });
      })
      .catch((e: Error) => {
        if (aktif) setHasil({ path, versi, error: e.message });
      });
    return () => {
      aktif = false;
    };
  }, [path, versi, api]);

  const samaAlamat = !!path && hasil?.path === path;
  return {
    data: samaAlamat ? hasil?.data : undefined,
    error: samaAlamat ? (hasil?.error ?? "") : "",
    loading: !samaAlamat || hasil?.versi !== versi,
  };
}

// Nilai yang baru diperbarui setelah pengguna berhenti mengetik sebentar,
// supaya pencarian tidak mengirim permintaan di setiap ketukan tombol.
export function useTunda<T>(nilai: T, jeda = 300) {
  const [tertunda, setTertunda] = useState(nilai);
  useEffect(() => {
    const timer = setTimeout(() => setTertunda(nilai), jeda);
    return () => clearTimeout(timer);
  }, [nilai, jeda]);
  return tertunda;
}
