// Mengisi database UJI dengan 30 NPR (Open, Pending, Eskalasi, Closed), TT,
// dan 3 Gamas untuk uji-browser.cjs. Jangan dijalankan ke server produksi.
// Butuh data contoh: node dist/server/setup.js --contoh
//
//   TEST_BASE_URL=http://127.0.0.1:3100 TEST_USERNAME=<admin> \
//     TEST_PASSWORD=<sandi> node review/uji/isi-data-uji.mjs
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3100";
const user = process.env.TEST_USERNAME;
const sandi = process.env.TEST_PASSWORD;
if (!user || !sandi) {
  console.error("Isi TEST_USERNAME dan TEST_PASSWORD.");
  process.exit(1);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(base + "/")) {
  console.error(
    "Skrip ini hanya untuk server uji lokal (127.0.0.1 atau localhost).",
  );
  process.exit(1);
}
let cookie = "";
async function kirim(path, body) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(d)}`);
  if (path === "/api/login") cookie = r.headers.get("set-cookie").split(";")[0];
  return d;
}
await kirim("/api/login", { username: user, password: sandi });
const daftar = (await kirim("/api/master")).remotes;
const ids = daftar.map((r) => r.id).slice(0, 6);
console.log("remote", ids.length);
const status = [
  "ATM Offline",
  "Remote Down",
  "Remote Idle",
  "Maintenance",
  "Other",
];
const jam = 3600e3;
const sekarang = Date.now();
let n = 0;
// 30 NPR (lebih dari satu halaman 25 baris): tersebar 2–40 hari ke belakang,
// campuran Open, Pending, Eskalasi, dan Closed.
for (let i = 0; i < 30; i++) {
  const mulai = new Date(sekarang - (40 - i * 1.3) * 24 * jam);
  const npr = await kirim("/api/nprs", {
    remote_id: ids[i % ids.length],
    remote_status: status[i % status.length],
    started_at: mulai.toISOString(),
    notes: `Gangguan uji ke-${i + 1}: link putus, cek modem.`,
  });
  n++;
  const t = (h) => new Date(mulai.getTime() + h * jam).toISOString();
  const jenis = i % 4;
  if (jenis === 0) continue; // tetap OPEN
  await kirim(`/api/nprs/${npr.id}/actions`, {
    kind: "Problem",
    notes: "Sudah dicek, menunggu konfirmasi.",
    pending_by: i % 2 ? "TM" : "Customer",
    occurred_at: t(1),
  });
  if (jenis === 1) continue; // PENDING
  await kirim(`/api/nprs/${npr.id}/actions`, {
    kind: "Eskalasi Service",
    instruction: i % 3 ? "Maintenance" : "Preventive Maintenance",
    notes: "Mohon teknisi cek perangkat di lokasi.",
    occurred_at: t(2),
  });
  if (jenis === 2) continue; // ESKALASI
  await kirim(`/api/nprs/${npr.id}/actions`, {
    kind: "Report Teknisi",
    technician: `Teknisi ${i}`,
    notes: "Ganti adaptor, remote sudah normal.",
    occurred_at: t(5),
  });
  await kirim(`/api/nprs/${npr.id}/actions`, {
    kind: "Close",
    notes: "Remote online kembali.",
    online_at: t(5),
    occurred_at: t(6),
  });
}
// 3 Gamas: satu ditutup.
for (let i = 0; i < 3; i++) {
  const mulai = new Date(sekarang - (20 - i * 6) * 24 * jam);
  const g = await kirim("/api/gamas", {
    location: `Area uji ${i + 1}`,
    notes: "Gangguan massal karena pemadaman listrik.",
    started_at: mulai.toISOString(),
    remote_ids: ids.slice(i, i + 3),
  });
  if (i === 0)
    await kirim(`/api/gamas/${g.id}/actions`, {
      notes: "Listrik menyala.",
      report: "Semua remote normal setelah listrik menyala.",
      occurred_at: new Date(mulai.getTime() + 4 * jam).toISOString(),
      online_at: new Date(mulai.getTime() + 3 * jam).toISOString(),
      close: true,
    });
}
console.log("NPR dibuat", n);
