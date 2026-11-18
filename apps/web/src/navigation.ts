import {
  IconAntenna,
  IconBellRinging,
  IconLayoutDashboard,
  IconReportAnalytics,
  IconSettings,
  IconTicket,
} from '@tabler/icons-vue';
import type { AppModule, MasterList } from '@tyio/shared';
import type { Component } from 'vue';

export interface NavItem {
  module: AppModule;
  label: string;
  path: string;
  icon: Component;
  /** Rilis yang membangun isi modul ini (lihat rencana bagian 8). */
  release: string;
  /** Isi modul, untuk halaman penanda sampai modul itu dibangun. */
  summary: string;
}

/** Menu utama, urut per pekerjaan. Siapa boleh membuka: MODULE_ROLES di @tyio/shared. */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    module: 'overview',
    label: 'Overview',
    path: '/',
    icon: IconLayoutDashboard,
    release: 'R2',
    summary: 'Ringkasan kondisi semua remote, analitik kejadian, peta, dan mode layar dinding.',
  },
  {
    module: 'alert',
    label: 'Alert',
    path: '/alert',
    icon: IconBellRinging,
    release: 'R6',
    summary: 'Alert dari sistem VSAT (Jupiter) dan SNMP, diverifikasi helpdesk, lalu menjadi kandidat NPR.',
  },
  {
    module: 'tiket',
    label: 'Tiket',
    path: '/tiket',
    icon: IconTicket,
    release: 'R1',
    summary: 'Antrean NPR dan TT, buat NPR, detail dengan linimasa tindakan, dan penutupan.',
  },
  {
    module: 'remote',
    label: 'Remote',
    path: '/remote',
    icon: IconAntenna,
    release: 'R1',
    summary: 'Data site: lokasi, jaringan, kontak, dan riwayat gangguan tiap remote.',
  },
  {
    module: 'laporan',
    label: 'Laporan',
    path: '/laporan',
    icon: IconReportAnalytics,
    release: 'R4',
    summary: 'Template laporan NPR dan SLA dengan ekspor Excel dan PDF.',
  },
  {
    module: 'admin',
    label: 'Admin',
    path: '/admin',
    icon: IconSettings,
    release: 'R1',
    summary: 'Customer, pengguna dan peran, master data, aturan SLA, dan daftar remote.',
  },
];

export function navItem(module: AppModule): NavItem {
  const item = NAV_ITEMS.find((i) => i.module === module);
  if (!item) throw new Error(`Modul tanpa menu: ${module}`);
  return item;
}

/** Daftar master yang dikelola di Admin. System disembunyikan (K29); datanya tetap di database. */
export const ADMIN_MASTER_LISTS: readonly MasterList[] = ['customer', 'kategori', 'jarkom'];
