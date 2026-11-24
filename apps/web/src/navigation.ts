import {
  IconAdjustmentsHorizontal,
  IconChartBar,
  IconDeviceDesktop,
  IconFolder,
  IconLayoutDashboard,
  IconMapPin,
  IconTicket,
} from '@tabler/icons-vue';
import type { Role } from '@tyio/shared';
import type { Component } from 'vue';

// Satu daftar menu untuk sidebar, rute, judul halaman, dan hak akses per peran.
// Urutan dan pengelompokan mengikuti mockup (design/mockup/project/Main.dc.html), tanpa Alert
// dan Gamas: keduanya dihapus dari rencana (T124, T126).

export interface ModulePage {
  /** Nama rute, juga dipakai uji layar. */
  name: string;
  path: string;
  label: string;
  icon: Component;
  /** Peran yang boleh membuka. Tidak diisi = semua peran yang login. */
  roles?: readonly Role[];
  /** Isi modul, untuk halaman "menyusul". */
  summary: string;
  /** Rilis yang mengisi modul ini (rencana §8). */
  release: string;
}

export interface NavGroup {
  title: string;
  items: readonly ModulePage[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: 'Kerja',
    items: [
      {
        name: 'overview',
        path: '/',
        label: 'Overview',
        icon: IconLayoutDashboard,
        summary: 'Kondisi remote dan tiket saat ini, peta remote berwarna status, dan analitik kejadian.',
        release: 'R2 · Overview dan monitor 24/7',
      },
      {
        name: 'tiket',
        path: '/tiket',
        label: 'Tiket',
        icon: IconTicket,
        summary: 'Antrean NPR dan TT, buat NPR, dan detail tiket dengan linimasa tindakan.',
        release: 'R1 · Remote dan tiket',
      },
    ],
  },
  {
    title: 'Data',
    items: [
      {
        name: 'remote',
        path: '/remote',
        label: 'Remote',
        icon: IconMapPin,
        summary: 'Data site, jaringan, kontak, dan riwayat gangguan per remote.',
        release: 'R1 · Remote dan tiket',
      },
      {
        name: 'laporan',
        path: '/laporan',
        label: 'Laporan',
        icon: IconChartBar,
        summary: 'Template laporan dan ekspor Excel/PDF.',
        release: 'R4 · SLA dan laporan',
      },
      {
        name: 'dokumen',
        path: '/dokumen',
        label: 'Dokumen',
        icon: IconFolder,
        summary: 'Berkas bersama dan runbook.',
        release: 'R8 · Go-live penuh',
      },
    ],
  },
  {
    title: 'Sistem',
    items: [
      {
        name: 'admin',
        path: '/admin',
        label: 'Admin',
        icon: IconAdjustmentsHorizontal,
        roles: ['admin'],
        summary: 'Customer, pengguna dan perannya, aturan SLA, dan data master remote.',
        release: 'R1 · Remote dan tiket',
      },
    ],
  },
];

/** Tautan di kaki sidebar, terpisah dari menu kerja (mockup). */
export const MONITOR_PAGE: ModulePage = {
  name: 'monitor',
  path: '/monitor',
  label: 'Mode monitor 24/7',
  icon: IconDeviceDesktop,
  summary: 'Layar dinding tanpa interaksi: teks besar, berputar antarpanel, berbunyi saat kejadian kritis.',
  release: 'R2 · Overview dan monitor 24/7',
};

export const MODULE_PAGES: readonly ModulePage[] = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  MONITOR_PAGE,
];

export function canOpen(page: { roles?: readonly Role[] }, role: Role): boolean {
  return !page.roles || page.roles.includes(role);
}

/** Menu untuk satu peran; kelompok yang kosong tidak ditampilkan. */
export function navFor(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    title: group.title,
    items: group.items.filter((item) => canOpen(item, role)),
  })).filter((group) => group.items.length > 0);
}
