// Data contoh untuk prototipe. Bentuknya mengikuti data dari API NPR.
export type Status = "OPEN" | "PENDING" | "ESKALASI" | "CLOSED";
export type Peran = "admin" | "helpdesk";

export type Customer = { id: number; code: string; name: string };
export type Remote = {
  id: number;
  customer_id: number;
  site_id: string;
  location: string;
  address: string;
  city: string;
  province: string;
  jarkom: "VSAT" | "M2M";
  ip_lan: string;
  pic_name: string;
  pic_phone: string;
};
export type Action = {
  id: number;
  kind: string;
  notes: string;
  remote_status: string;
  pending_by: string;
  occurred_at: string;
  created_by: string;
  attachment_name?: string;
};
export type Ticket = {
  number: string;
  instruction: string;
  notes: string;
  created_at: string;
  technician: string;
  report: string;
};
export type Npr = {
  id: number;
  number: string;
  remote_id: number;
  remote_status: string;
  status: Status;
  pending_by: "" | "TM" | "Customer";
  started_at: string;
  online_at: string | null;
  last_action: string;
  created_by: string;
  ticket?: Ticket;
  actions: Action[];
};
export type Gamas = {
  id: number;
  number: string;
  location: string;
  notes: string;
  started_at: string;
  online_at: string | null;
  status: "OPEN" | "IN PROGRESS" | "CLOSED";
  report: string;
  sites: number[];
  actions: { id: number; notes: string; report?: string; at: string; by: string }[];
};
export type User = {
  id: number;
  username: string;
  full_name: string;
  peran: Peran;
  aktif: boolean;
};

export const JENIS_GANGGUAN = [
  "ATM Offline",
  "Remote Down",
  "Remote Idle",
  "Relokasi",
  "Reposisi",
  "Maintenance",
  "Preventive Maintenance",
  "Other",
];

// Waktu contoh dihitung mundur dari sekarang supaya "lama gangguan" masuk akal.
const jamLalu = (jam: number) =>
  new Date(Date.now() - jam * 3600_000).toISOString();

export const customers: Customer[] = [
  { id: 1, code: "BRI", name: "Bank Rakyat Nusantara" },
  { id: 2, code: "BMD", name: "Bank Mandala" },
  { id: 3, code: "BJT", name: "Bank Jatim Raya" },
];

export const remotes: Remote[] = [
  { id: 1, customer_id: 1, site_id: "BRI-SBY-014", location: "ATM Pasar Atom", address: "Jl. Bunguran No. 45", city: "Surabaya", province: "Jawa Timur", jarkom: "VSAT", ip_lan: "10.21.14.2", pic_name: "Hendra Wijaya", pic_phone: "0812 3301 2214" },
  { id: 2, customer_id: 1, site_id: "BRI-MJK-003", location: "ATM SPBU Trowulan", address: "Jl. Raya Trowulan Km 3", city: "Mojokerto", province: "Jawa Timur", jarkom: "M2M", ip_lan: "10.21.33.7", pic_name: "Sri Lestari", pic_phone: "0813 5512 9087" },
  { id: 3, customer_id: 2, site_id: "BMD-SDA-021", location: "ATM Indomaret Gedangan", address: "Jl. Raya Gedangan No. 12", city: "Sidoarjo", province: "Jawa Timur", jarkom: "VSAT", ip_lan: "10.40.21.5", pic_name: "Agus Salim", pic_phone: "0857 3011 4421" },
  { id: 4, customer_id: 2, site_id: "BMD-GSK-007", location: "ATM Kantor Kecamatan Kebomas", address: "Jl. Dr. Wahidin 88", city: "Gresik", province: "Jawa Timur", jarkom: "M2M", ip_lan: "10.40.7.9", pic_name: "Rina Kurniasih", pic_phone: "0821 4300 7765" },
  { id: 5, customer_id: 3, site_id: "BJT-MLG-030", location: "ATM RSUD Kanjuruhan", address: "Jl. Panji No. 100", city: "Malang", province: "Jawa Timur", jarkom: "VSAT", ip_lan: "10.55.30.4", pic_name: "Bayu Prasetyo", pic_phone: "0811 3610 5520" },
  { id: 6, customer_id: 3, site_id: "BJT-PSR-011", location: "ATM Alun-alun Pasuruan", address: "Jl. Pahlawan No. 2", city: "Pasuruan", province: "Jawa Timur", jarkom: "VSAT", ip_lan: "10.55.11.3", pic_name: "Dewi Anggraini", pic_phone: "0812 4900 1180" },
];

export const nprs: Npr[] = [
  {
    id: 15, number: "NPR/2026/11/0015", remote_id: 1, remote_status: "Remote Down", status: "ESKALASI", pending_by: "TM",
    started_at: jamLalu(57), online_at: null, last_action: "Teknisi dijadwalkan berangkat pagi ini.", created_by: "Rina Helpdesk",
    ticket: { number: "TT/2026/11/0006", instruction: "Maintenance", notes: "Modem tidak merespons ping, sinyal Rx 0.", created_at: jamLalu(54), technician: "", report: "" },
    actions: [
      { id: 1, kind: "Create NPR", notes: "Remote terpantau down dari NMS. Follow-up PIC lokasi.", remote_status: "Remote Down", pending_by: "", occurred_at: jamLalu(57), created_by: "Rina Helpdesk" },
      { id: 2, kind: "Problem", notes: "PIC konfirmasi listrik normal, modem lampu merah.", remote_status: "Remote Down", pending_by: "TM", occurred_at: jamLalu(56), created_by: "Rina Helpdesk", attachment_name: "foto-modem.jpg" },
      { id: 3, kind: "Eskalasi Service", notes: "Modem tidak merespons ping, sinyal Rx 0.", remote_status: "Remote Down", pending_by: "TM", occurred_at: jamLalu(54), created_by: "mimin suhendar" },
      { id: 4, kind: "Problem", notes: "Teknisi dijadwalkan berangkat pagi ini.", remote_status: "Remote Down", pending_by: "TM", occurred_at: jamLalu(30), created_by: "Rina Helpdesk" },
    ],
  },
  {
    id: 14, number: "NPR/2026/11/0014", remote_id: 3, remote_status: "ATM Offline", status: "PENDING", pending_by: "Customer",
    started_at: jamLalu(31), online_at: null, last_action: "Menunggu akses ruang ATM dari pengelola gedung.", created_by: "Rina Helpdesk",
    actions: [
      { id: 5, kind: "Create NPR", notes: "ATM offline sejak pagi.", remote_status: "ATM Offline", pending_by: "", occurred_at: jamLalu(31), created_by: "Rina Helpdesk" },
      { id: 6, kind: "Problem", notes: "Menunggu akses ruang ATM dari pengelola gedung.", remote_status: "ATM Offline", pending_by: "Customer", occurred_at: jamLalu(29), created_by: "Rina Helpdesk" },
    ],
  },
  {
    id: 13, number: "NPR/2026/11/0013", remote_id: 5, remote_status: "Remote Idle", status: "OPEN", pending_by: "",
    started_at: jamLalu(3), online_at: null, last_action: "Remote idle, belum ada transaksi sejak 06.00.", created_by: "mimin suhendar",
    actions: [
      { id: 7, kind: "Create NPR", notes: "Remote idle, belum ada transaksi sejak 06.00.", remote_status: "Remote Idle", pending_by: "", occurred_at: jamLalu(3), created_by: "mimin suhendar" },
    ],
  },
  {
    id: 12, number: "NPR/2026/11/0012", remote_id: 4, remote_status: "Preventive Maintenance", status: "CLOSED", pending_by: "TM",
    started_at: jamLalu(96), online_at: jamLalu(90), last_action: "Perawatan selesai, kondisi normal.", created_by: "Rina Helpdesk",
    ticket: { number: "TT/2026/11/0005", instruction: "Preventive Maintenance", notes: "Jadwal PM triwulan.", created_at: jamLalu(95), technician: "Dimas Saputra", report: "Pembersihan perangkat dan pengecekan kabel. Normal." },
    actions: [
      { id: 8, kind: "Create NPR", notes: "Jadwal PM triwulan.", remote_status: "Preventive Maintenance", pending_by: "", occurred_at: jamLalu(96), created_by: "Rina Helpdesk" },
      { id: 9, kind: "Eskalasi Service", notes: "Jadwal PM triwulan.", remote_status: "Preventive Maintenance", pending_by: "TM", occurred_at: jamLalu(95), created_by: "Rina Helpdesk" },
      { id: 10, kind: "Report Teknisi", notes: "Pembersihan perangkat dan pengecekan kabel. Normal.", remote_status: "Preventive Maintenance", pending_by: "TM", occurred_at: jamLalu(91), created_by: "Rina Helpdesk" },
      { id: 11, kind: "Close", notes: "Perawatan selesai, kondisi normal.", remote_status: "Preventive Maintenance", pending_by: "TM", occurred_at: jamLalu(90), created_by: "Rina Helpdesk" },
    ],
  },
  {
    id: 11, number: "NPR/2026/11/0011", remote_id: 2, remote_status: "ATM Offline", status: "CLOSED", pending_by: "Customer",
    started_at: jamLalu(120), online_at: jamLalu(117), last_action: "Listrik lokasi sudah normal, ATM online.", created_by: "mimin suhendar",
    actions: [
      { id: 12, kind: "Create NPR", notes: "ATM offline.", remote_status: "ATM Offline", pending_by: "", occurred_at: jamLalu(120), created_by: "mimin suhendar" },
      { id: 13, kind: "Close", notes: "Listrik lokasi sudah normal, ATM online.", remote_status: "ATM Offline", pending_by: "Customer", occurred_at: jamLalu(117), created_by: "mimin suhendar" },
    ],
  },
];

export const gamas: Gamas[] = [
  {
    id: 5, number: "GAMAS/2026/11/0005", location: "HUB Surabaya", notes: "Gangguan transponder satelit, beberapa site VSAT down bersamaan.",
    started_at: jamLalu(5), online_at: null, status: "IN PROGRESS", report: "", sites: [1, 3, 5, 6],
    actions: [
      { id: 1, notes: "Gangguan transponder satelit, beberapa site VSAT down bersamaan.", at: jamLalu(5), by: "mimin suhendar" },
      { id: 2, notes: "Provider satelit konfirmasi sedang ditangani.", at: jamLalu(3), by: "Rina Helpdesk" },
    ],
  },
  {
    id: 3, number: "GAMAS/2026/11/0003", location: "Data Center Rungkut", notes: "Pemadaman listrik data center.",
    started_at: jamLalu(200), online_at: jamLalu(196), status: "CLOSED", report: "Genset aktif, seluruh site normal.", sites: [2, 4],
    actions: [
      { id: 3, notes: "Pemadaman listrik data center.", at: jamLalu(200), by: "Rina Helpdesk" },
      { id: 4, notes: "Seluruh site normal.", report: "Genset aktif, seluruh site normal.", at: jamLalu(196), by: "Rina Helpdesk" },
    ],
  },
  {
    id: 4, number: "GAMAS/2026/11/0004", location: "Provider Satelit", notes: "Rain fade di wilayah Malang, sinyal VSAT turun.",
    started_at: jamLalu(90), online_at: jamLalu(87.5), status: "CLOSED", report: "Cuaca membaik, seluruh site kembali online tanpa penanganan di lokasi.", sites: [1, 5],
    actions: [
      { id: 5, notes: "Rain fade di wilayah Malang, sinyal VSAT turun.", at: jamLalu(90), by: "mimin suhendar" },
      { id: 6, notes: "Seluruh site kembali online.", report: "Cuaca membaik, seluruh site kembali online tanpa penanganan di lokasi.", at: jamLalu(87.5), by: "mimin suhendar" },
    ],
  },
  {
    id: 2, number: "GAMAS/2026/11/0002", location: "BTS Sidoarjo", notes: "BTS operator seluler mati, site M2M tidak terhubung.",
    started_at: jamLalu(260), online_at: jamLalu(254), status: "CLOSED", report: "Operator memulihkan BTS, sinyal M2M normal.", sites: [2, 4],
    actions: [
      { id: 7, notes: "BTS operator seluler mati, site M2M tidak terhubung.", at: jamLalu(260), by: "Rina Helpdesk" },
      { id: 8, notes: "BTS pulih.", report: "Operator memulihkan BTS, sinyal M2M normal.", at: jamLalu(254), by: "Rina Helpdesk" },
    ],
  },
  {
    id: 1, number: "GAMAS/2026/11/0001", location: "Jalur Fiber Gresik", notes: "Kabel fiber backbone putus akibat galian.",
    started_at: jamLalu(330), online_at: jamLalu(321), status: "CLOSED", report: "Kabel disambung ulang oleh tim fiber.", sites: [4],
    actions: [
      { id: 9, notes: "Kabel fiber backbone putus akibat galian.", at: jamLalu(330), by: "Rina Helpdesk" },
      { id: 10, notes: "Sambungan selesai.", report: "Kabel disambung ulang oleh tim fiber.", at: jamLalu(321), by: "Rina Helpdesk" },
    ],
  },
];

export const users: User[] = [
  { id: 1, username: "mimin", full_name: "mimin suhendar", peran: "admin", aktif: true },
  { id: 2, username: "rina", full_name: "Rina Helpdesk", peran: "helpdesk", aktif: true },
  { id: 3, username: "dimas", full_name: "Dimas Saputra", peran: "helpdesk", aktif: false },
];

export const slaRows = remotes.map((r, i) => {
  const total = 36000;
  const down = [3420, 0, 95, 0, 180, 0][i];
  return {
    remote_id: r.id,
    site_id: r.site_id,
    location: r.location,
    customer_name: customers.find((c) => c.id === r.customer_id)!.name,
    total_minutes: total,
    downtime_minutes: down,
    sla: ((total - down) / total) * 100,
  };
});

export const grafik7Hari = [2, 0, 1, 3, 1, 2, 2];

export const remoteById = (id: number) => remotes.find((r) => r.id === id)!;
export const customerById = (id: number) => customers.find((c) => c.id === id)!;

// NPR lama yang sudah ditutup, supaya daftar NPR terlihat seperti data
// sungguhan (lebih dari satu layar).
const catatanTutup = [
  "Modem di-restart oleh PIC, remote kembali online.",
  "Kabel LAN longgar, sudah dipasang ulang oleh PIC.",
  "Listrik lokasi padam, ATM online setelah PLN normal.",
  "Konfigurasi router dipulihkan dari NOC.",
  "Antena VSAT di-pointing ulang oleh teknisi.",
  "Kartu SIM M2M diganti, sinyal normal.",
];
for (let i = 0; i < 10; i++) {
  const id = 10 - i;
  const remote = remotes[i % remotes.length];
  const mulai = 130 + i * 22;
  const durasi = 2 + ((i * 5) % 11);
  const kasus = JENIS_GANGGUAN[[0, 1, 2, 0, 1, 7][i % 6]];
  const pending: Npr["pending_by"] = i % 3 === 0 ? "TM" : "Customer";
  // NPR yang pending di TM dieskalasi menjadi TT (nomor urut menurut waktu
  // dibuat: yang paling lama mendapat nomor terkecil).
  const tt: Ticket | undefined =
    i % 3 === 0
      ? {
          number: `TT/2026/11/${String(4 - i / 3).padStart(4, "0")}`,
          instruction: i === 6 ? "Preventive Maintenance" : "Maintenance",
          notes: ["Modem tidak merespons, perlu cek di lokasi.", "Sinyal Rx lemah, perlu pointing ulang.", "Jadwal PM bulanan.", "Router hang berulang, perlu penggantian adaptor."][i / 3],
          created_at: jamLalu(mulai - 1),
          technician: ["Dimas Saputra", "Fajar Nugroho", "Dimas Saputra", "Yoga Pratama"][i / 3],
          report: ["Modem diganti, remote online.", "Antena di-pointing ulang, sinyal normal.", "Perangkat dibersihkan, kondisi normal.", "Adaptor router diganti, stabil."][i / 3],
        }
      : undefined;
  nprs.push({
    id,
    number: `NPR/2026/11/${String(id).padStart(4, "0")}`,
    remote_id: remote.id,
    remote_status: kasus,
    status: "CLOSED",
    pending_by: pending,
    started_at: jamLalu(mulai),
    online_at: jamLalu(mulai - durasi),
    last_action: catatanTutup[i % catatanTutup.length],
    created_by: i % 2 ? "Rina Helpdesk" : "mimin suhendar",
    actions: [
      { id: 100 + i * 4, kind: "Create NPR", notes: `${kasus} terpantau dari NMS.`, remote_status: kasus, pending_by: "", occurred_at: jamLalu(mulai), created_by: "Rina Helpdesk" },
      ...(tt
        ? [
            { id: 101 + i * 4, kind: "Eskalasi Service", notes: tt.notes, remote_status: kasus, pending_by: "TM" as const, occurred_at: tt.created_at, created_by: "Rina Helpdesk" },
            { id: 102 + i * 4, kind: "Report Teknisi", notes: tt.report, remote_status: kasus, pending_by: "TM" as const, occurred_at: jamLalu(mulai - durasi + 0.5), created_by: "Rina Helpdesk" },
          ]
        : []),
      { id: 103 + i * 4, kind: "Close", notes: catatanTutup[i % catatanTutup.length], remote_status: kasus, pending_by: pending, occurred_at: jamLalu(mulai - durasi), created_by: "Rina Helpdesk" },
    ],
    ticket: tt,
  });
}
