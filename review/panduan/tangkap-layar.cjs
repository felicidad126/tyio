// Tangkapan layar untuk panduan penggunaan NPR (review/PANDUAN-PENGGUNAAN-NPR.pdf).
//
// Jalankan pada server LOKAL yang berisi data demo (`node dist/server/demo.js`), dari
// folder monitoring-vsat/ setelah build. Akun admin diambil dari variabel lingkungan,
// sama seperti test:api dan uji-browser.cjs:
//
//   TEST_BASE_URL=http://127.0.0.1:3100 TEST_USERNAME=<admin> TEST_PASSWORD=<sandi> \
//     UJI_OUT=<folder-gambar> node ../review/panduan/tangkap-layar.cjs
//
// - Nama akun admin tampil di gambar, jadi beri nama "Admin NPR" saat setup.
// - Bila belum ada, dibuat dua akun helpdesk contoh dengan password acak (hanya di
//   database lokal) supaya halaman Pengguna tidak kosong.
// - Contoh NPR dan TT Gamas dipilih otomatis dari data demo.
// - Butuh ImageMagick (`convert`) dan poppler (`pdftoppm`) untuk gambar gabungan.
//
// Hasilnya dipakai oleh susun-pdf.cjs di folder yang sama.

const { chromium, devices } = require("playwright");
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3100";
const USER = process.env.TEST_USERNAME;
const SANDI = process.env.TEST_PASSWORD;
const OUT = path.resolve(process.env.UJI_OUT ?? "gambar-panduan");
if (!USER || !SANDI) {
  console.error("Isi TEST_USERNAME dan TEST_PASSWORD.");
  process.exit(1);
}
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) {
  console.error("Skrip ini hanya untuk server lokal (membuat akun contoh).");
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
const keluar = (nama) => path.join(OUT, nama);
const tunggu = (p, ms = 900) => p.waitForTimeout(ms);

// ---------- Persiapan lewat API ----------

let cookie = "";
async function api(alamat, body) {
  const r = await fetch(BASE + alamat, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json", Origin: BASE }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${alamat}: ${r.status} ${JSON.stringify(data)}`);
  if (alamat === "/api/login")
    cookie = r.headers.get("set-cookie").split(";")[0];
  return data;
}

async function siapkanData() {
  await api("/api/login", { username: USER, password: SANDI });
  const akun = (await api("/api/users")).users.map((u) => u.username);
  for (const [username, full_name] of [
    ["helpdesk.pagi", "Helpdesk Shift Pagi"],
    ["helpdesk.malam", "Helpdesk Shift Malam"],
  ]) {
    if (akun.includes(username)) continue;
    await api("/api/users", {
      username,
      full_name,
      peran: "helpdesk",
      password: crypto.randomBytes(18).toString("base64url"),
    });
  }
  const npr = (await api("/api/nprs?per=100")).rows;
  const gamas = (await api("/api/gamas")).rows;
  const eskalasi = npr.find((r) => r.status === "ESKALASI");
  const open = npr.find((r) => r.status === "OPEN");
  const ditangani = gamas.find((g) => g.status === "IN PROGRESS");
  if (!eskalasi || !open || !ditangani)
    throw new Error(
      "Data demo tidak lengkap: perlu NPR Eskalasi, NPR Open, dan TT Gamas Ditangani.",
    );
  console.log(
    `Contoh: ${eskalasi.number} (Eskalasi), ${open.number} (Open), ${ditangani.number} (Ditangani)`,
  );
  return { eskalasi: eskalasi.id, open: open.id, gamas: ditangani.id };
}

// ---------- Tangkapan layar ----------

async function masuk(p) {
  await p.goto(BASE + "/");
  await p.fill('input[name="username"]', USER);
  await p.fill('input[name="password"]', SANDI);
  await p.click('button[type="submit"]');
  await tunggu(p, 1500);
}

// Tinggi viewport disamakan dengan isi halaman supaya sidebar ikut penuh.
async function halamanPenuh(p, nama) {
  const tinggi = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.setViewportSize({ width: 1366, height: Math.max(820, tinggi) });
  await tunggu(p, 400);
  await p.screenshot({ path: keluar(nama) });
  await p.setViewportSize({ width: 1366, height: 820 });
}

async function unduh(p, tombol, nama) {
  const [berkas] = await Promise.all([
    p.waitForEvent("download"),
    p.getByRole("button", { name: tombol }).click(),
  ]);
  await berkas.saveAs(keluar(nama));
}

async function laptop(b, id) {
  const ctx = await b.newContext({
    viewport: { width: 1366, height: 820 },
    deviceScaleFactor: 2,
    acceptDownloads: true,
  });
  const p = await ctx.newPage();

  await p.goto(BASE + "/");
  await tunggu(p);
  await p.screenshot({ path: keluar("01-login.png") });
  await masuk(p);
  await halamanPenuh(p, "02-dashboard.png");

  // Menu akun dan Ganti Password
  await p.locator('header [aria-haspopup="menu"]').click();
  await tunggu(p, 500);
  const menu = await p.locator('[role="menu"]').boundingBox();
  await p.screenshot({
    path: keluar("03-menu-akun.png"),
    clip: {
      x: 760,
      y: 0,
      width: 606,
      height: Math.ceil(menu.y + menu.height + 16),
    },
  });
  await p.getByRole("menuitem", { name: "Ganti Password" }).click();
  await tunggu(p, 600);
  await p
    .locator('[role="dialog"]')
    .screenshot({ path: keluar("04-ganti-password.png") });
  await p.keyboard.press("Escape");
  await tunggu(p, 400);

  // NPR
  await p.goto(BASE + "/npr");
  await tunggu(p);
  await p.screenshot({ path: keluar("05-npr-daftar.png") });
  await p.getByRole("button", { name: "Filter" }).click();
  await tunggu(p, 600);
  const panel = await p
    .locator("[data-radix-popper-content-wrapper]")
    .last()
    .boundingBox();
  await p.screenshot({
    path: keluar("06-npr-filter.png"),
    clip: {
      x: 640,
      y: 150,
      width: 726,
      height: Math.ceil(panel.y + panel.height + 16 - 150),
    },
  });
  await p.keyboard.press("Escape");

  await p.goto(BASE + "/npr/baru");
  await tunggu(p);
  await p.locator('[role="combobox"]').nth(0).click();
  await tunggu(p, 300);
  await p.getByRole("option").nth(1).click();
  await tunggu(p, 300);
  await p.locator('[role="combobox"]').nth(1).click();
  await tunggu(p, 300);
  await p.getByRole("option").first().click();
  await tunggu(p, 300);
  await p
    .locator("textarea")
    .first()
    .fill(
      "Remote terpantau down dari NMS. Follow-up PIC untuk cek listrik di lokasi.",
    );
  await p.screenshot({ path: keluar("07-npr-baru.png") });

  await p.goto(`${BASE}/npr/${id.eskalasi}`);
  await tunggu(p);
  await p.screenshot({
    path: keluar("08-npr-detail.png"),
    clip: { x: 240, y: 56, width: 1126, height: 640 },
  });
  await unduh(p, "Unduh PDF TT", "tt.pdf");

  // Form tindakan pada NPR Open: pengingat Pending Customer, Eskalasi, dan Close
  await p.goto(`${BASE}/npr/${id.open}`);
  await tunggu(p);
  const form = p.locator("form").last();
  const pending = form.getByRole("combobox", { name: "Pending oleh" });
  await pending.click();
  await tunggu(p, 300);
  await p.getByRole("option", { name: "Pending Customer" }).click();
  await tunggu(p, 400);
  await form.screenshot({ path: keluar("09-tindakan-problem.png") });
  await pending.click();
  await tunggu(p, 300);
  await p.getByRole("option", { name: "Pending TM" }).click();
  await tunggu(p, 300);
  await p.getByRole("radio", { name: "Eskalasi Service" }).click();
  await tunggu(p, 400);
  await form.screenshot({ path: keluar("10-tindakan-eskalasi.png") });
  await p.getByRole("radio", { name: "Close" }).click();
  await tunggu(p, 400);
  await form.screenshot({ path: keluar("11-tindakan-close.png") });

  // Trouble Ticket
  await p.goto(BASE + "/tt");
  await tunggu(p);
  await p.screenshot({
    path: keluar("12-tt-daftar.png"),
    clip: { x: 0, y: 0, width: 1366, height: 620 },
  });

  // TT Gamas
  await p.goto(BASE + "/gamas");
  await tunggu(p);
  await p.screenshot({
    path: keluar("14-gamas-daftar.png"),
    clip: { x: 0, y: 0, width: 1366, height: 540 },
  });
  await p.getByRole("button", { name: "TT Gamas Baru" }).click();
  await tunggu(p, 600);
  const dialog = p.locator('[role="dialog"]');
  await dialog.locator("input").first().fill("Hub Jakarta");
  await dialog
    .locator("textarea")
    .first()
    .fill("Gangguan perangkat HUB, beberapa site VSAT offline.");
  await dialog.locator('[role="checkbox"]').nth(0).click();
  await dialog.locator('[role="checkbox"]').nth(2).click();
  await tunggu(p, 300);
  await dialog.screenshot({ path: keluar("15-gamas-baru.png") });
  await p.keyboard.press("Escape");
  await tunggu(p, 400);
  await p.goto(`${BASE}/gamas/${id.gamas}`);
  await tunggu(p);
  await halamanPenuh(p, "16-gamas-detail.png");
  await unduh(p, "Unduh PDF", "gamas.pdf");

  // Laporan SLA bulan berjalan, bagian atas saja
  await p.goto(BASE + "/sla");
  await tunggu(p, 1200);
  await p.screenshot({
    path: keluar("18-sla.png"),
    clip: { x: 0, y: 0, width: 1366, height: 760 },
  });

  // Customer dan Remote
  await p.goto(BASE + "/customer");
  await tunggu(p);
  await p.screenshot({
    path: keluar("19-customer.png"),
    clip: { x: 0, y: 0, width: 1366, height: 520 },
  });
  await p.goto(BASE + "/remote");
  await tunggu(p);
  await p.screenshot({
    path: keluar("20-remote.png"),
    clip: { x: 0, y: 0, width: 1366, height: 680 },
  });
  await p.getByRole("button", { name: "Tambah Remote" }).click();
  await tunggu(p, 600);
  await p
    .locator('[role="dialog"]')
    .screenshot({ path: keluar("21-remote-tambah.png") });
  await p.keyboard.press("Escape");
  await tunggu(p, 400);

  // Pengguna
  await p.goto(BASE + "/pengguna");
  await tunggu(p);
  await p.screenshot({
    path: keluar("22-pengguna.png"),
    clip: { x: 0, y: 0, width: 1366, height: 520 },
  });
  await p.getByRole("button", { name: "Tambah Akun" }).click();
  await tunggu(p, 600);
  await p
    .locator('[role="dialog"]')
    .screenshot({ path: keluar("23-tambah-akun.png") });
  await p.keyboard.press("Escape");
  await tunggu(p, 400);
  await p.locator("button:has(svg.lucide-ellipsis)").nth(1).click();
  await tunggu(p, 500);
  const menuAkun = await p.locator('[role="menu"]').boundingBox();
  await p.screenshot({
    path: keluar("24-menu-pengguna.png"),
    clip: {
      x: 700,
      y: Math.max(0, menuAkun.y - 70),
      width: 666,
      height: Math.ceil(menuAkun.height + 86),
    },
  });
  await ctx.close();
}

async function hp(b) {
  const ctx = await b.newContext({ ...devices["Pixel 7"] });
  const p = await ctx.newPage();
  await masuk(p);
  await p.screenshot({ path: keluar("25-hp-dashboard.png") });
  await p.getByRole("button", { name: /menu/i }).first().click();
  await tunggu(p, 600);
  await p.screenshot({ path: keluar("26-hp-menu.png") });
  await p.goto(BASE + "/npr");
  await tunggu(p);
  await p.screenshot({ path: keluar("27-hp-npr.png") });
  await ctx.close();
}

// ---------- Gambar gabungan (ImageMagick dan poppler) ----------

const convert = (...arg) => execFileSync("convert", arg);
const tinggiGambar = (f) =>
  execFileSync("identify", ["-format", "%h", f]).toString().trim();

function gabungan() {
  // Isian Eskalasi Service (kiri) dan Close (kanan)
  const h = tinggiGambar(keluar("10-tindakan-eskalasi.png"));
  convert(
    keluar("10-tindakan-eskalasi.png"),
    "+repage",
    "(",
    "-size",
    `48x${h}`,
    "xc:white",
    ")",
    keluar("11-tindakan-close.png"),
    "+repage",
    "-background",
    "white",
    "-gravity",
    "north",
    "+append",
    "+repage",
    "-depth",
    "8",
    keluar("11-tindakan-gabung.png"),
  );
  // Tampilan HP: menu, daftar NPR, Dashboard
  for (const n of ["26-hp-menu", "27-hp-npr", "25-hp-dashboard"])
    convert(
      keluar(`${n}.png`),
      "+repage",
      "-resize",
      "x1600",
      "+repage",
      keluar(`k-${n}.png`),
    );
  convert(
    keluar("k-26-hp-menu.png"),
    "(",
    "-size",
    "48x1600",
    "xc:white",
    ")",
    keluar("k-27-hp-npr.png"),
    "(",
    "-size",
    "48x1600",
    "xc:white",
    ")",
    keluar("k-25-hp-dashboard.png"),
    "-background",
    "white",
    "+append",
    "+repage",
    "-depth",
    "8",
    keluar("05-hp-gabung.png"),
  );
  // Halaman pertama PDF TT dan PDF TT Gamas, berdampingan
  for (const [pdf, nama] of [
    ["tt.pdf", "pdf-tt"],
    ["gamas.pdf", "pdf-gamas"],
  ]) {
    execFileSync("pdftoppm", [
      "-png",
      "-r",
      "110",
      "-f",
      "1",
      "-l",
      "1",
      "-singlefile",
      keluar(pdf),
      keluar(nama),
    ]);
    convert(
      keluar(`${nama}.png`),
      "+repage",
      "-crop",
      "100%x92%+0+0",
      "+repage",
      "-bordercolor",
      "#d0d5dd",
      "-border",
      "2",
      "+repage",
      keluar(`k-${nama}.png`),
    );
  }
  const hp = tinggiGambar(keluar("k-pdf-tt.png"));
  convert(
    keluar("k-pdf-tt.png"),
    "(",
    "-size",
    `40x${hp}`,
    "xc:white",
    ")",
    keluar("k-pdf-gamas.png"),
    "-background",
    "white",
    "-gravity",
    "north",
    "+append",
    "+repage",
    "-depth",
    "8",
    keluar("13-pdf-tt-gamas.png"),
  );
  for (const f of fs.readdirSync(OUT))
    if (f.startsWith("k-")) fs.rmSync(keluar(f));
}

(async () => {
  const id = await siapkanData();
  const b = await chromium.launch();
  try {
    await laptop(b, id);
    await hp(b);
  } finally {
    await b.close();
  }
  gabungan();
  console.log(`Tangkapan layar tersimpan di ${OUT}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
