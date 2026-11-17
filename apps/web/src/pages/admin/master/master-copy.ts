import type { MasterList } from '@tyio/shared';

/** Teks penjelas tiap daftar master di halaman admin. */
export const MASTER_COPY: Readonly<
  Record<MasterList, { description: string; codeHint: string; namePlaceholder: string }>
> = {
  customer: {
    description:
      'Bank pemilik remote. Customer nonaktif tidak muncul di pilihan baru; datanya tetap ada.',
    codeHint: 'Huruf besar dan angka, 2–16 karakter. Dipakai di nomor tiket, jadi tidak bisa diubah.',
    namePlaceholder: 'mis. Bank Merapi Sejahtera',
  },
  kategori: {
    description: 'Kategori NPR. Kategori nonaktif tidak muncul di pilihan baru.',
    codeHint: 'Huruf besar dan angka, 2–16 karakter. Tidak bisa diubah setelah disimpan.',
    namePlaceholder: 'mis. Remote Down',
  },
  system: {
    description: 'Nilai "System" pada tiket. System nonaktif tidak muncul di pilihan baru.',
    codeHint: 'Huruf besar dan angka, 2–16 karakter. Tidak bisa diubah setelah disimpan.',
    namePlaceholder: 'Nama system',
  },
  jarkom: {
    description: 'Jaringan komputer remote. Jarkom nonaktif tidak muncul di pilihan baru.',
    codeHint: 'Huruf besar dan angka, 2–16 karakter. Dipakai di nomor tiket, jadi tidak bisa diubah.',
    namePlaceholder: 'mis. VSAT',
  },
};
