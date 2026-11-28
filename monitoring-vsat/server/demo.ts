// Data demo untuk mencoba NPR: 6 customer bank fiktif, 20 remote, ±50 NPR
// (Open, Pending, Eskalasi, Closed) dengan kasus gangguan yang umum, TT, dan
// TT Gamas, tersebar sejak awal bulan lalu sampai sekarang.
//
//   node dist/server/demo.js               isi data demo
//   node dist/server/demo.js --jika-kosong  isi hanya bila database belum
//                                           berisi NPR/Gamas; bila sudah
//                                           berisi, lewati tanpa galat
//                                           (dipakai MULAI-WINDOWS.cmd)
//   node dist/server/demo.js --hapus       hapus data demo saja
//
// - Data dimasukkan lewat logika aplikasi yang sama (worker/domain.ts), jadi
//   nomor, status, dan SLA sama seperti bila diketik helpdesk.
// - Pengisian hanya mau berjalan di database yang belum berisi NPR atau Gamas,
//   supaya data demo tidak tercampur dengan data asli.
// - --hapus menghapus customer demo beserta remote, NPR, TT, dan Gamas-nya,
//   lalu menyetel ulang penghitung nomor. Akun dan data lain tidak diubah.
// - Sebelum mengisi atau menghapus, database dicadangkan ke folder cadangan.
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { domain } from "../worker/domain.js";
import type { Pengguna } from "../worker/pengguna.js";
import { bulanWIB } from "../shared/waktu.js";
import { DatabaseD1 } from "./d1.js";
import { siapkanDatabase } from "./migrasi.js";

const DB_PATH = resolve(process.env.DB_PATH ?? "data/npr.sqlite");
const FOLDER_SQL = resolve(process.env.SQL_DIR ?? ".");
const FOLDER_CADANGAN = resolve(
  process.env.FOLDER_CADANGAN ?? join(dirname(DB_PATH), "cadangan"),
);
const JAM = 3600_000;
const HARI = 24 * JAM;

type Jarkom = "VSAT" | "M2M";

// Nama bank fiktif. Alamat memakai nama jalan umum, IP memakai blok
// dokumentasi (RFC 5737), dan nomor telepon berawalan 0800 (bukan nomor HP).
// Satu baris per remote: site | lokasi | alamat | kota | provinsi | jarkom.
// prettier-ignore
const CUSTOMER: { nama: string; kode: string; remote: string[] }[] = [
  { nama: "Bank Swastamita", kode: "SWM", remote: [
    "SWM-0101 | ATM Kantor Cabang Ketapang | Jl. Gajah Mada No. 21 | Ketapang | Kalimantan Barat | VSAT",
    "SWM-0102 | ATM Pasar Rakyat Ketapang | Jl. Merdeka No. 5 | Ketapang | Kalimantan Barat | VSAT",
    "SWM-0103 | ATM SPBU Sungai Pinyuh | Jl. Raya Pontianak Km 50 | Mempawah | Kalimantan Barat | VSAT",
    "SWM-0104 | ATM Kantor Kas Sintang | Jl. Lintas Melawi No. 8 | Sintang | Kalimantan Barat | M2M",
  ] },
  { nama: "Bank Lembayung", kode: "LBY", remote: [
    "LBY-0201 | ATM Terminal Oebobo | Jl. Frans Seda No. 3 | Kupang | Nusa Tenggara Timur | M2M",
    "LBY-0202 | ATM Kampus Penfui | Jl. Adisucipto No. 14 | Kupang | Nusa Tenggara Timur | M2M",
    "LBY-0203 | ATM Pelabuhan Waingapu | Jl. Pelabuhan No. 1 | Sumba Timur | Nusa Tenggara Timur | VSAT",
  ] },
  { nama: "Bank Pramudita", kode: "PMD", remote: [
    "PMD-0301 | ATM Rumah Sakit Daerah Mojokerto | Jl. Pahlawan No. 2 | Mojokerto | Jawa Timur | M2M",
    "PMD-0302 | ATM Alun-alun Jombang | Jl. Wahid Hasyim No. 10 | Jombang | Jawa Timur | M2M",
    "PMD-0303 | ATM Kantor Cabang Pacitan | Jl. Ahmad Yani No. 45 | Pacitan | Jawa Timur | VSAT",
  ] },
  { nama: "Bank Baskara", kode: "BSK", remote: [
    "BSK-0401 | ATM Bandara Merauke | Jl. Bandara No. 1 | Merauke | Papua Selatan | VSAT",
    "BSK-0402 | ATM Kantor Kas Nabire | Jl. Merdeka No. 17 | Nabire | Papua Tengah | VSAT",
    "BSK-0403 | ATM Pasar Sentral Timika | Jl. Budi Utomo No. 9 | Mimika | Papua Tengah | VSAT",
  ] },
  { nama: "Bank Sagara", kode: "SGR", remote: [
    "SGR-0501 | ATM Pelabuhan Bitung | Jl. Sam Ratulangi No. 30 | Bitung | Sulawesi Utara | M2M",
    "SGR-0502 | ATM Kantor Cabang Tahuna | Jl. Raja Manalang No. 4 | Kepulauan Sangihe | Sulawesi Utara | VSAT",
    "SGR-0503 | ATM Pasar Tondano | Jl. Sudirman No. 12 | Minahasa | Sulawesi Utara | M2M",
  ] },
  { nama: "Bank Jenggala", kode: "JGL", remote: [
    "JGL-0601 | ATM Kantor Cabang Garut | Jl. Ciledug No. 77 | Garut | Jawa Barat | M2M",
    "JGL-0602 | ATM Stasiun Cibatu | Jl. Stasiun No. 2 | Garut | Jawa Barat | M2M",
    "JGL-0603 | ATM Pantai Pangandaran | Jl. Pamugaran No. 6 | Pangandaran | Jawa Barat | VSAT",
    "JGL-0604 | ATM Kantor Kas Sindangbarang | Jl. Raya Sindangbarang No. 3 | Cianjur | Jawa Barat | VSAT",
  ] },
];
const PIC = [
  "Pak Andi",
  "Bu Sari",
  "Pak Dedi",
  "Bu Rina",
  "Pak Yusuf",
  "Bu Maya",
  "Pak Hendra",
  "Bu Lestari",
];
const TEKNISI = ["Agus", "Rudi", "Fajar", "Dimas", "Yoga", "Bayu"];
const BLOK_IP = ["192.0.2", "198.51.100", "203.0.113"];

// Kasus gangguan. Angka "jam" dihitung dari awal gangguan.
type Langkah =
  | {
      jenis: "Problem";
      jam: number;
      catatan: string;
      pending: "TM" | "Customer";
    }
  | {
      jenis: "Eskalasi Service";
      jam: number;
      catatan: string;
      instruksi: "Maintenance" | "Preventive Maintenance";
    }
  | { jenis: "Report Teknisi"; jam: number; catatan: string }
  | { jenis: "Close"; jam: number; catatan: string; online: number };
type Kasus = {
  status: string;
  jarkom?: Jarkom;
  awal: string;
  langkah: Langkah[];
};

// prettier-ignore
const KASUS: Record<string, Kasus> = {
  adaptor: {
    status: "Remote Down",
    awal: "Remote down, modem tidak merespons ping dari NOC.",
    langkah: [
      { jenis: "Problem", jam: 0.5, pending: "TM", catatan: "PIC dihubungi, semua lampu modem mati. Dugaan adaptor modem rusak." },
      { jenis: "Eskalasi Service", jam: 1, instruksi: "Maintenance", catatan: "Mohon teknisi cek dan ganti adaptor modem." },
      { jenis: "Report Teknisi", jam: 26, catatan: "Adaptor modem rusak, sudah diganti dengan unit baru. Link normal." },
      { jenis: "Close", jam: 27, online: 26, catatan: "Remote online kembali setelah adaptor diganti." },
    ],
  },
  hujan: {
    status: "Remote Down",
    jarkom: "VSAT",
    awal: "Link VSAT putus saat hujan deras di lokasi.",
    langkah: [
      { jenis: "Problem", jam: 0.3, pending: "TM", catatan: "Kualitas sinyal turun karena hujan (rain fade). Menunggu hujan reda." },
      { jenis: "Close", jam: 3, online: 2.5, catatan: "Hujan reda, link normal kembali tanpa tindakan di lokasi." },
    ],
  },
  pln: {
    status: "Remote Down",
    awal: "Remote down, PIC melaporkan listrik di lokasi padam.",
    langkah: [
      { jenis: "Problem", jam: 0.5, pending: "Customer", catatan: "Pemadaman listrik PLN di area lokasi. Menunggu listrik menyala." },
      { jenis: "Close", jam: 6, online: 5.5, catatan: "Listrik PLN menyala, remote online kembali." },
    ],
  },
  "kabel-lan": {
    status: "ATM Offline",
    awal: "ATM offline, modem up tetapi mesin ATM tidak terhubung.",
    langkah: [
      { jenis: "Problem", jam: 1, pending: "TM", catatan: "Port LAN modem tidak mendeteksi perangkat. Dugaan kabel LAN bermasalah." },
      { jenis: "Eskalasi Service", jam: 1.5, instruksi: "Maintenance", catatan: "Mohon teknisi cek kabel LAN dari modem ke mesin ATM." },
      { jenis: "Report Teknisi", jam: 22, catatan: "Kabel LAN putus digigit tikus, sudah diganti dan diberi pelindung." },
      { jenis: "Close", jam: 23, online: 22, catatan: "ATM kembali bertransaksi." },
    ],
  },
  "atm-error": {
    status: "ATM Offline",
    awal: "ATM offline, remote masih up.",
    langkah: [
      { jenis: "Problem", jam: 0.5, pending: "Customer", catatan: "Jaringan aman. Mesin ATM error, PIC menghubungi vendor ATM." },
      { jenis: "Close", jam: 30, online: 29, catatan: "Vendor ATM selesai memperbaiki mesin, ATM bertransaksi kembali." },
    ],
  },
  renovasi: {
    status: "Remote Idle",
    awal: "Remote idle, tidak ada trafik transaksi sejak pagi.",
    langkah: [
      { jenis: "Problem", jam: 1, pending: "Customer", catatan: "PIC mengonfirmasi lokasi sedang renovasi, ATM dimatikan sementara." },
      { jenis: "Close", jam: 72, online: 70, catatan: "Renovasi selesai, ATM aktif kembali." },
    ],
  },
  antena: {
    status: "Remote Down",
    jarkom: "VSAT",
    awal: "Sinyal VSAT turun drastis setelah angin kencang.",
    langkah: [
      { jenis: "Problem", jam: 0.5, pending: "TM", catatan: "Sinyal tetap rendah walau cuaca cerah. Dugaan arah antena bergeser." },
      { jenis: "Eskalasi Service", jam: 1, instruksi: "Maintenance", catatan: "Mohon teknisi arahkan ulang (repointing) antena VSAT." },
      { jenis: "Report Teknisi", jam: 28, catatan: "Antena bergeser karena angin, sudah diarahkan ulang. Sinyal normal." },
      { jenis: "Close", jam: 29, online: 28, catatan: "Link stabil setelah repointing antena." },
    ],
  },
  "sinyal-m2m": {
    status: "Remote Down",
    jarkom: "M2M",
    awal: "Modem M2M tidak mendapat sinyal operator.",
    langkah: [
      { jenis: "Problem", jam: 0.5, pending: "TM", catatan: "Reset modem jarak jauh belum berhasil, sinyal operator lemah." },
      { jenis: "Eskalasi Service", jam: 2, instruksi: "Maintenance", catatan: "Mohon teknisi cek SIM card dan pasang antena eksternal." },
      { jenis: "Report Teknisi", jam: 30, catatan: "SIM card diganti dan antena eksternal dipasang. Sinyal bagus." },
      { jenis: "Close", jam: 31, online: 30, catatan: "Remote online kembali." },
    ],
  },
  router: {
    status: "Remote Down",
    awal: "Link putus-sambung berulang sejak dini hari.",
    langkah: [
      { jenis: "Problem", jam: 0.3, pending: "TM", catatan: "Router hang, sudah di-restart dari jarak jauh." },
      { jenis: "Close", jam: 1, online: 0.8, catatan: "Link stabil setelah router di-restart." },
    ],
  },
  relokasi: {
    status: "Relokasi",
    awal: "Permintaan relokasi ATM ke lobi gedung baru.",
    langkah: [
      { jenis: "Problem", jam: 1, pending: "Customer", catatan: "Menunggu jadwal dan izin gedung dari PIC." },
      { jenis: "Eskalasi Service", jam: 48, instruksi: "Maintenance", catatan: "Mohon teknisi pindahkan modem dan antena ke lokasi baru." },
      { jenis: "Report Teknisi", jam: 72, catatan: "Relokasi selesai, perangkat terpasang di lobi gedung baru." },
      { jenis: "Close", jam: 73, online: 72, catatan: "ATM di lokasi baru sudah bertransaksi." },
    ],
  },
  pm: {
    status: "Preventive Maintenance",
    awal: "Jadwal preventive maintenance triwulan.",
    langkah: [
      { jenis: "Eskalasi Service", jam: 0.25, instruksi: "Preventive Maintenance", catatan: "Mohon teknisi lakukan preventive maintenance sesuai checklist." },
      { jenis: "Report Teknisi", jam: 50, catatan: "PM selesai: grounding, konektor, dan kabel dicek; modem dibersihkan." },
      { jenis: "Close", jam: 51, online: 0.25, catatan: "Preventive maintenance selesai." },
    ],
  },
  "ac-mati": {
    status: "Other",
    awal: "Modem sering restart sendiri sejak siang.",
    langkah: [
      { jenis: "Problem", jam: 1, pending: "Customer", catatan: "Suhu ruang ATM panas karena AC mati. PIC diminta memperbaiki AC." },
      { jenis: "Close", jam: 20, online: 19, catatan: "AC sudah diperbaiki, modem stabil." },
    ],
  },
};
// Kasus yang lebih sering terjadi muncul lebih dari sekali.
// prettier-ignore
const POOL_KASUS = [
  "adaptor", "adaptor", "hujan", "hujan", "pln", "pln", "pln", "kabel-lan",
  "atm-error", "atm-error", "renovasi", "antena", "sinyal-m2m", "sinyal-m2m",
  "router", "router", "relokasi", "pm", "ac-mati",
];
// NPR terbaru dengan keadaan yang ditentukan: [umur jam, kasus, jumlah
// langkah yang sudah dijalankan]. Sisanya belum terjadi.
const TERBARU: [number, string, number][] = [
  [100, "adaptor", 2], //    Eskalasi, menunggu report, lebih dari 48 jam
  [60, "relokasi", 1], //    Pending Customer, lebih dari 48 jam
  [40, "atm-error", 1], //   Pending Customer, 24–48 jam
  [30, "antena", 3], //      Report teknisi diterima, belum Close
  [20, "sinyal-m2m", 2], //  Eskalasi, menunggu report
  [9, "kabel-lan", 2], //    Eskalasi, menunggu report
  [5, "hujan", 1], //        Pending TM
  [2, "pln", 1], //          Pending Customer
  [1.2, "router", 0], //     Open, Pending TM
  [0.4, "adaptor", 0], //    Open, Pending TM
];
const JUMLAH_LAMA = 40;

// Angka acak yang selalu sama setiap dijalankan (mulberry32).
function acak(benih: number) {
  return () => {
    benih = (benih + 0x6d2b79f5) | 0;
    let t = Math.imul(benih ^ (benih >>> 15), 1 | benih);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = acak(20261126);
const pilih = <T>(daftar: T[]) => daftar[Math.floor(rnd() * daftar.length)];

function berhenti(pesan: string): never {
  console.error(pesan);
  process.exit(1);
}

function cadangkan(db: DatabaseD1, keterangan: string) {
  mkdirSync(FOLDER_CADANGAN, { recursive: true });
  const waktu = new Date(Date.now() + 7 * JAM)
    .toISOString()
    .slice(0, 16)
    .replace(/[-:]/g, "")
    .replace("T", "-");
  const tujuan = join(FOLDER_CADANGAN, `npr-${waktu}-${keterangan}.sqlite`);
  db.exec(`VACUUM INTO '${tujuan.replaceAll("'", "''")}'`);
  console.log(`Cadangan dibuat: ${tujuan}`);
}

const db = new DatabaseD1(DB_PATH);
await siapkanDatabase(db, FOLDER_SQL);
const angka = async (sql: string, ...args: (string | number)[]) =>
  (await db
    .prepare(sql)
    .bind(...args)
    .first<{ n: number }>())!.n;
const kodeDemo = CUSTOMER.map((c) => `${c.kode}|${c.nama}`);
const tandaDemo = kodeDemo.map(() => "?").join(",");
const REMOTE_DEMO = `SELECT r.id FROM remotes r JOIN customers c ON c.id = r.customer_id WHERE c.code || '|' || c.name IN (${tandaDemo})`;

if (process.argv.includes("--hapus")) await hapus();
else await isi();
db.close();

async function hapus() {
  const customer = await angka(
    `SELECT COUNT(*) AS n FROM customers WHERE code || '|' || name IN (${tandaDemo})`,
    ...kodeDemo,
  );
  if (!customer) {
    console.log("Tidak ada data demo. Tidak ada yang dihapus.");
    return;
  }
  const npr = await angka(
    `SELECT COUNT(*) AS n FROM nprs WHERE remote_id IN (${REMOTE_DEMO})`,
    ...kodeDemo,
  );
  cadangkan(db, "sebelum-hapus-demo");
  const nprDemo = `SELECT id FROM nprs WHERE remote_id IN (${REMOTE_DEMO})`;
  // Gamas yang semua site-nya milik customer demo ikut dihapus. Gamas yang
  // juga berisi site lain hanya kehilangan site demonya.
  const idGamas = (
    await db
      .prepare(
        `SELECT g.id FROM gamas g WHERE NOT EXISTS (SELECT 1 FROM gamas_sites s WHERE s.gamas_id = g.id AND s.remote_id NOT IN (${REMOTE_DEMO}))`,
      )
      .bind(...kodeDemo)
      .all<{ id: number }>()
  ).results.map((g) => g.id);
  const tandaGamas = idGamas.map(() => "?").join(",") || "NULL";
  const sql = (s: string) => db.prepare(s).bind(...kodeDemo);
  const sqlGamas = (s: string) => db.prepare(s).bind(...idGamas);
  await db.batch([
    sql(`DELETE FROM actions WHERE npr_id IN (${nprDemo})`),
    sql(`DELETE FROM tickets WHERE npr_id IN (${nprDemo})`),
    sql(`DELETE FROM nprs WHERE id IN (${nprDemo})`),
    sqlGamas(`DELETE FROM gamas_actions WHERE gamas_id IN (${tandaGamas})`),
    sqlGamas(`DELETE FROM gamas_sites WHERE gamas_id IN (${tandaGamas})`),
    sqlGamas(`DELETE FROM gamas WHERE id IN (${tandaGamas})`),
    sql(`DELETE FROM gamas_sites WHERE remote_id IN (${REMOTE_DEMO})`),
    sql(`DELETE FROM remotes WHERE id IN (${REMOTE_DEMO})`),
    sql(`DELETE FROM customers WHERE code || '|' || name IN (${tandaDemo})`),
    // Penghitung nomor disetel ke nomor terbesar yang tersisa di bulan itu.
    // Bila tidak ada yang tersisa, nomor bulan itu mulai lagi dari 0001.
    ...(
      [
        ["NPR", "nprs"],
        ["TT", "tickets"],
        ["GAMAS", "gamas"],
      ] as const
    ).map(([jenis, tabel]) =>
      db
        .prepare(
          `UPDATE penghitung_nomor SET terakhir = COALESCE((SELECT MAX(CAST(substr(number, ${jenis.length + 10}) AS INTEGER)) FROM ${tabel} WHERE number LIKE jenis || '/' || substr(periode, 1, 4) || '/' || substr(periode, 6, 2) || '/%'), 0) WHERE jenis = ?`,
        )
        .bind(jenis),
    ),
    db.prepare("DELETE FROM penghitung_nomor WHERE terakhir = 0"),
  ]);
  console.log(
    `Data demo dihapus: ${customer} customer, ${npr} NPR beserta TT-nya, dan ${idGamas.length} TT Gamas.`,
  );
  console.log("Akun pengguna dan data lain tidak diubah.");
}

async function isi() {
  const terpakai = await angka(
    "SELECT (SELECT COUNT(*) FROM nprs) + (SELECT COUNT(*) FROM gamas) AS n",
  );
  if (terpakai && process.argv.includes("--jika-kosong")) {
    console.log(
      "Database sudah berisi NPR atau TT Gamas, data demo tidak diisi ulang.",
    );
    return;
  }
  if (terpakai)
    berhenti(
      "Database sudah berisi NPR atau TT Gamas. Data demo hanya diisi ke database yang belum dipakai, supaya tidak tercampur dengan data asli.",
    );
  const bentrok = await angka(
    `SELECT COUNT(*) AS n FROM customers WHERE code IN (${tandaDemo}) OR name IN (${tandaDemo})`,
    ...CUSTOMER.map((c) => c.kode),
    ...CUSTOMER.map((c) => c.nama),
  );
  if (bentrok)
    berhenti(
      "Customer demo sudah ada. Hapus dulu dengan: node dist/server/demo.js --hapus",
    );
  const admin = await db
    .prepare(
      "SELECT id, username, full_name, peran FROM users WHERE peran = 'admin' AND aktif = 1 ORDER BY id LIMIT 1",
    )
    .first<Pengguna>();
  if (!admin)
    berhenti("Belum ada akun admin. Jalankan dulu: node dist/server/setup.js");
  cadangkan(db, "sebelum-demo");

  const env = { DB: db } as unknown as Env;
  const kirim = async (path: string, body: object) => {
    const hasil = await domain(
      new Request(`http://demo${path}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      env,
      admin,
    );
    return hasil as { id: number };
  };

  // Customer dan remote dicatat lebih dulu, dengan jam sebenarnya.
  type RemoteDemo = {
    id: number;
    jarkom: Jarkom;
    kota: string;
    sibukSampai: number;
    kasusTerakhir: string;
  };
  const remote: RemoteDemo[] = [];
  let urutIp = 0;
  for (const c of CUSTOMER) {
    const { id: customerId } = await kirim("/api/customers", {
      name: c.nama,
      code: c.kode,
    });
    for (const baris of c.remote) {
      const [site, lokasi, alamat, kota, provinsi, jarkom] = baris
        .split("|")
        .map((isian) => isian.trim());
      const ip = `${BLOK_IP[urutIp % 3]}.${10 + Math.floor(urutIp / 3)}`;
      const { id } = await kirim("/api/remotes", {
        customer_id: customerId,
        site_id: site,
        location: lokasi,
        address: alamat,
        city: kota,
        province: provinsi,
        jarkom,
        ip_lan: ip,
        pic_name: PIC[urutIp % PIC.length],
        pic_phone: `0800${String(1000000 + urutIp * 137).padStart(8, "0")}`,
      });
      remote.push({
        id,
        jarkom: jarkom as Jarkom,
        kota,
        sibukSampai: 0,
        kasusTerakhir: "",
      });
      urutIp++;
    }
  }

  // Semua kejadian disusun menurut waktu, lalu dijalankan berurutan.
  const sekarang = Date.now();
  const [tahun, bulan] = bulanWIB(sekarang).split("-").map(Number);
  const awal = Date.UTC(tahun, bulan - 2, 1) - 7 * JAM; // awal bulan lalu, WIB
  type Kejadian = { waktu: number; jalankan: () => Promise<unknown> };
  const kejadian: Kejadian[] = [];
  const iso = (t: number) => new Date(t).toISOString();

  function rencanakanNpr(mulai: number, kunci: string, sampaiLangkah?: number) {
    const kasus = KASUS[kunci];
    const langkah = kasus.langkah.slice(0, sampaiLangkah);
    const selesai = mulai + (kasus.langkah.at(-1)!.jam + 1) * JAM;
    // Satu remote tidak punya dua gangguan yang bertumpang tindih, dan bila
    // bisa tidak mendapat kasus yang sama dua kali berturut-turut.
    const bebas = remote.filter(
      (r) =>
        (!kasus.jarkom || r.jarkom === kasus.jarkom) && r.sibukSampai < mulai,
    );
    const calon = bebas.filter((r) => r.kasusTerakhir !== kunci);
    if (!bebas.length) return;
    const r = pilih(calon.length ? calon : bebas);
    r.sibukSampai = sampaiLangkah === undefined ? selesai : Infinity;
    r.kasusTerakhir = kunci;
    const npr = { id: 0 };
    kejadian.push({
      waktu: mulai + 0.1 * JAM, // dicatat helpdesk beberapa menit kemudian
      jalankan: async () => {
        npr.id = (
          await kirim("/api/nprs", {
            remote_id: r.id,
            remote_status: kasus.status,
            started_at: iso(mulai),
            notes: kasus.awal,
          })
        ).id;
      },
    });
    const teknisi = pilih(TEKNISI);
    for (const l of langkah) {
      const waktu = mulai + l.jam * JAM;
      if (waktu > sekarang - 60_000) break; // belum terjadi
      const body: Record<string, unknown> = {
        kind: l.jenis,
        notes: l.catatan,
        occurred_at: iso(waktu),
      };
      if (l.jenis === "Problem") body.pending_by = l.pending;
      if (l.jenis === "Eskalasi Service") body.instruction = l.instruksi;
      if (l.jenis === "Report Teknisi") body.technician = teknisi;
      if (l.jenis === "Close") body.online_at = iso(mulai + l.online * JAM);
      kejadian.push({
        waktu,
        jalankan: () => kirim(`/api/nprs/${npr.id}/actions`, body),
      });
    }
  }

  // NPR lama: tersebar dari awal bulan lalu sampai 5 hari lalu, sudah Close.
  const akhirLama = sekarang - 5 * HARI;
  const jarak = (akhirLama - awal) / JUMLAH_LAMA;
  for (let i = 0; i < JUMLAH_LAMA; i++) {
    const hari = awal + i * jarak + rnd() * jarak * 0.8;
    // Jam kejadian antara 05.00 dan 22.00 WIB.
    const tengahMalamWib = hari - ((hari + 7 * JAM) % HARI);
    const mulai = tengahMalamWib + (5 + rnd() * 17) * JAM;
    rencanakanNpr(Math.min(mulai, akhirLama), pilih(POOL_KASUS));
  }
  for (const [umur, kunci, sampai] of TERBARU)
    rencanakanNpr(sekarang - umur * JAM, kunci, sampai);

  // TT Gamas: [mulai, lokasi, catatan, site, lama jam (null = masih
  // berjalan), report, perkembangan].
  const siteKota = (kota: string) =>
    remote.filter((r) => r.kota === kota).map((r) => r.id);
  const siteVsat = remote
    .filter((r) => r.jarkom === "VSAT")
    .slice(0, 6)
    .map((r) => r.id);
  const GAMAS: [
    number,
    string,
    string,
    number[],
    number | null,
    string,
    string,
  ][] = [
    [
      awal + 7 * HARI + 13.2 * JAM,
      "Site VSAT beberapa wilayah",
      "Gangguan satelit: sinyal ke beberapa site VSAT terputus sementara.",
      siteVsat,
      0.4,
      "Satelit normal kembali, semua site VSAT online tanpa tindakan di lokasi.",
      "Operator satelit mengonfirmasi gangguan di transponder.",
    ],
    [
      awal + 19 * HARI + 15.5 * JAM,
      "Ketapang, Kalimantan Barat",
      "Pemadaman listrik PLN se-Kabupaten Ketapang.",
      siteKota("Ketapang"),
      7,
      "Listrik PLN menyala kembali, semua site di Ketapang online.",
      "PLN memperkirakan listrik menyala sore hari.",
    ],
    [
      sekarang - 10 * HARI - 5 * JAM,
      "Kupang, Nusa Tenggara Timur",
      "Gangguan jaringan operator seluler di Kota Kupang, site M2M tidak dapat terhubung.",
      siteKota("Kupang"),
      9,
      "Operator seluler memperbaiki BTS, site M2M di Kupang normal kembali.",
      "Operator seluler sedang memperbaiki BTS yang rusak.",
    ],
    [
      sekarang - 3 * JAM,
      "Garut, Jawa Barat",
      "Kabel serat optik operator putus, site M2M di area Garut tidak terhubung.",
      siteKota("Garut"),
      null,
      "",
      "Operator sedang menyambung kabel, perkiraan selesai 3 jam lagi.",
    ],
  ];
  for (const [mulai, lokasi, catatan, site, lama, report, kabar] of GAMAS) {
    const gamas = { id: 0 };
    kejadian.push({
      waktu: mulai + 0.1 * JAM,
      jalankan: async () => {
        gamas.id = (
          await kirim("/api/gamas", {
            location: lokasi,
            notes: catatan,
            started_at: iso(mulai),
            remote_ids: site,
          })
        ).id;
      },
    });
    const waktuKabar =
      mulai + (lama === null ? 1 : Math.min(lama / 2, 1)) * JAM;
    kejadian.push({
      waktu: waktuKabar,
      jalankan: () =>
        kirim(`/api/gamas/${gamas.id}/actions`, {
          notes: kabar,
          occurred_at: iso(waktuKabar),
        }),
    });
    if (lama !== null) {
      const tutup = mulai + (lama + 0.5) * JAM;
      kejadian.push({
        waktu: tutup,
        jalankan: () =>
          kirim(`/api/gamas/${gamas.id}/actions`, {
            notes: "Semua site terdampak sudah online.",
            report,
            online_at: iso(mulai + lama * JAM),
            occurred_at: iso(tutup),
            close: true,
          }),
      });
    }
  }

  // Jam dimundurkan ke waktu tiap kejadian, seolah helpdesk mencatat saat
  // itu. Dengan begitu nomor dokumen mengikuti bulan kejadian (mis. gangguan
  // Oktober bernomor NPR/2026/10/…), dan pemeriksaan "tidak boleh di masa
  // depan" tetap berlaku.
  kejadian.sort((a, b) => a.waktu - b.waktu);
  const jamAsli = Date.now;
  try {
    for (const k of kejadian) {
      Date.now = () => k.waktu;
      await k.jalankan();
    }
  } catch (error) {
    Date.now = jamAsli;
    const pesan = error instanceof Error ? error.message : String(error);
    berhenti(
      `Pengisian berhenti: ${pesan}\nData demo yang sudah masuk bisa dihapus dengan: node dist/server/demo.js --hapus`,
    );
  }
  Date.now = jamAsli;

  const status = await db
    .prepare(
      "SELECT status, COUNT(*) AS n FROM nprs GROUP BY status ORDER BY status",
    )
    .all<{ status: string; n: number }>();
  const tt = await angka("SELECT COUNT(*) AS n FROM tickets");
  const gamas = await angka("SELECT COUNT(*) AS n FROM gamas");
  console.log(
    `Data demo diisi atas nama ${admin.full_name} (${admin.username}):`,
  );
  console.log(`- ${CUSTOMER.length} customer, ${remote.length} remote`);
  console.log(
    `- NPR: ${status.results.map((s) => `${s.n} ${s.status}`).join(", ")}`,
  );
  console.log(`- ${tt} TT, ${gamas} TT Gamas`);
  console.log("Hapus data demo dengan: node dist/server/demo.js --hapus");
}
