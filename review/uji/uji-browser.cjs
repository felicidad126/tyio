// Uji browser NPR dengan data: urut No. NPR dan Status, filter kondisi
// (termasuk urutan dan panah saat dibuka dari Dashboard),
// link /npr/<id> di tab baru, PDF TT dan Gamas, /sla?bulan=… lalu F5,
// serta kartu di HP. Jalankan pada database uji yang sudah diisi data demo
// (DB_PATH=<db-uji> node dist/server/demo.js).
//
//   TEST_BASE_URL=http://127.0.0.1:3100 TEST_USERNAME=<admin> \
//     TEST_PASSWORD=<sandi> UJI_OUT=<folder-hasil> node review/uji/uji-browser.cjs
//
// Butuh Playwright + Chromium (sudah terpasang di container Claude Code).
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3100";
const USER = process.env.TEST_USERNAME;
const SANDI = process.env.TEST_PASSWORD;
if (!USER || !SANDI) {
  console.error("Isi TEST_USERNAME dan TEST_PASSWORD.");
  process.exit(1);
}
const OUT = path.resolve(process.env.UJI_OUT ?? "hasil-uji");
const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const namaBulan = (b) =>
  `${NAMA_BULAN[Number(b.slice(5, 7)) - 1]} ${b.slice(0, 4)}`;
fs.mkdirSync(OUT, { recursive: true });
const hasil = [];
const cek = (ok, nama, info = "") => {
  hasil.push({ ok: !!ok, nama, info });
  console.log(
    `${ok ? "LULUS" : "GAGAL"}  ${nama}${info ? "  (" + info + ")" : ""}`,
  );
};
const galatKonsol = [];

async function masuk(page) {
  await page.goto(BASE + "/");
  await page.locator("input[name=username]").fill(USER);
  await page.locator("input[name=password]").fill(SANDI);
  await page.locator("button[type=submit]").click();
  await page
    .locator("input[name=username]")
    .waitFor({ state: "detached", timeout: 10000 });
  await page.waitForTimeout(500);
}
const tanpaGeserHorizontal = (page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );

async function nomorTabelNpr(page) {
  await page.waitForTimeout(400);
  return page.$$eval("table tbody tr td:first-child div.font-semibold", (el) =>
    el.map((e) => e.textContent.trim()),
  );
}
const urutNaik = (a) =>
  a.every((v, i) => i === 0 || a[i - 1].localeCompare(v) <= 0);
const urutTurun = (a) =>
  a.every((v, i) => i === 0 || a[i - 1].localeCompare(v) >= 0);
const BULAN_PENDEK = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  Mei: 4,
  Jun: 5,
  Jul: 6,
  Agu: 7,
  Sep: 8,
  Okt: 9,
  Nov: 10,
  Des: 11,
};
// Kolom Mulai ("18 Okt 2026, 00.14") diubah ke angka supaya bisa dibandingkan.
async function mulaiTabelNpr(page) {
  await page.waitForTimeout(400);
  const teks = await page.$$eval("table tbody tr td:nth-child(4)", (td) =>
    td.map((t) => t.innerText.split("\n")[0].trim()),
  );
  return teks.map((t) => {
    const m = t.match(/^(\d{1,2}) (\w{3}) (\d{4}), (\d{2})\.(\d{2})/);
    return m ? Date.UTC(+m[3], BULAN_PENDEK[m[2]], +m[1], +m[4], +m[5]) : NaN;
  });
}
const naikAngka = (a) =>
  a.length > 1 &&
  a.every((v, i) => !Number.isNaN(v) && (i === 0 || a[i - 1] <= v));
const turunAngka = (a) =>
  a.length > 1 &&
  a.every((v, i) => !Number.isNaN(v) && (i === 0 || a[i - 1] >= v));

async function unduhDanCek(page, pemicu, awalan, nama) {
  const [unduhan] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    pemicu(),
  ]);
  const file = path.join(OUT, unduhan.suggestedFilename());
  await unduhan.saveAs(file);
  const ukuran = fs.statSync(file).size;
  const kepala = fs.readFileSync(file).subarray(0, 5).toString();
  cek(
    kepala === "%PDF-" &&
      ukuran > 3000 &&
      unduhan.suggestedFilename().startsWith(awalan),
    nama,
    `${unduhan.suggestedFilename()}, ${Math.round(ukuran / 1024)} KB`,
  );
  return file;
}

(async () => {
  const browser = await chromium.launch();

  // ---------- Laptop 1366×820 ----------
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 820 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && galatKonsol.push(m.text()));
  await masuk(page);

  // 1. Urutan kolom No. NPR (diurutkan di server)
  await page.goto(BASE + "/npr");
  await page.waitForSelector("table tbody tr");
  const kepalaNomor = page.locator("th", { hasText: "No. NPR" });
  await kepalaNomor.locator("button").click();
  let nomor = await nomorTabelNpr(page);
  const arah1 = await kepalaNomor.getAttribute("aria-sort");
  await kepalaNomor.locator("button").click();
  let nomor2 = await nomorTabelNpr(page);
  const arah2 = await kepalaNomor.getAttribute("aria-sort");
  const benar1 = arah1 === "ascending" ? urutNaik(nomor) : urutTurun(nomor);
  const benar2 = arah2 === "ascending" ? urutNaik(nomor2) : urutTurun(nomor2);
  cek(
    benar1 && benar2 && arah1 !== arah2 && nomor.length > 1,
    "Urut No. NPR naik dan turun",
    `${arah1}: ${nomor[0]} … ${nomor.at(-1)}; ${arah2}: ${nomor2[0]} … ${nomor2.at(-1)}`,
  );
  // Halaman 2 tetap mengikuti urutan
  const berikut = page.getByRole("button", { name: "Halaman berikutnya" });
  if (await berikut.isEnabled().catch(() => false)) {
    await berikut.click();
    const nomorHal2 = await nomorTabelNpr(page);
    const lanjut =
      arah2 === "ascending"
        ? nomor2.at(-1).localeCompare(nomorHal2[0]) <= 0
        : nomor2.at(-1).localeCompare(nomorHal2[0]) >= 0;
    cek(
      lanjut,
      "Halaman 2 melanjutkan urutan No. NPR",
      `${nomor2.at(-1)} → ${nomorHal2[0]}`,
    );
  } else
    cek(
      false,
      "Halaman 2 melanjutkan urutan No. NPR",
      "tombol halaman berikutnya tidak aktif",
    );

  // 1b. Urut Status (gagal di sesi lalu karena hanya 1 NPR)
  await page.goto(BASE + "/npr");
  await page.waitForSelector("table tbody tr");
  const kepalaStatus = page.locator("th", { hasText: "Status" });
  await kepalaStatus.locator("button").click();
  await page.waitForTimeout(400);
  const status1 = await page.$$eval("table tbody tr td:nth-child(5)", (e) =>
    e.map((x) => x.textContent.trim()),
  );
  await kepalaStatus.locator("button").click();
  await page.waitForTimeout(400);
  const status2 = await page.$$eval("table tbody tr td:nth-child(5)", (e) =>
    e.map((x) => x.textContent.trim()),
  );
  cek(
    new Set(status1).size > 1 && status1[0] !== status2[0],
    "Urut Status (server)",
    `${status1[0]} … ${status1.at(-1)} lalu ${status2[0]} … ${status2.at(-1)}`,
  );

  // 1c. Posisi kolom tidak bergeser saat filter diganti
  await page.goto(BASE + "/npr");
  await page.waitForSelector("table tbody tr");
  const posisi = () =>
    page.$$eval("table thead th", (th) =>
      th.map((t) => Math.round(t.getBoundingClientRect().left)),
    );
  const posAwal = await posisi();
  const jumlahAwal = await page.locator("table tbody tr").count();
  for (const k of ["belum_kategori", "menunggu_report", "pending_tm"]) {
    await page.goto(BASE + "/npr?kondisi=" + k);
    await page.waitForTimeout(800);
    const pos = await posisi();
    const jumlah = await page.locator("table tbody tr").count();
    const ringkas = (
      await page
        .locator("text=/^\\d+ NPR/")
        .first()
        .textContent()
        .catch(() => "?")
    ).trim();
    cek(
      JSON.stringify(posAwal) === JSON.stringify(pos) &&
        jumlah > 0 &&
        jumlah < jumlahAwal,
      `Filter kondisi=${k} menyaring dan kolom tidak bergeser`,
      `${ringkas}, ${jumlah} baris dari ${jumlahAwal}`,
    );
    if (k === "belum_kategori")
      await page.screenshot({ path: path.join(OUT, "laptop-npr-filter.png") });
  }
  await page.screenshot({ path: path.join(OUT, "laptop-npr.png") });

  // 1d. Dari Dashboard (?kondisi=…) tanpa urutan dipilih: terlama dulu, dan
  // panah urut tampil di kolom Mulai (↑), bukan di No. NPR.
  const arahKolom = (teks) =>
    page.locator("table thead th", { hasText: teks }).getAttribute("aria-sort");
  const klikKepala = (teks) =>
    page.locator("table thead th", { hasText: teks }).locator("button").click();
  await page.goto(BASE + "/npr?kondisi=pending_tm");
  await page.waitForSelector("table tbody tr");
  let mulai = await mulaiTabelNpr(page);
  cek(
    (await arahKolom("Mulai")) === "ascending" &&
      (await arahKolom("No. NPR")) === "none" &&
      naikAngka(mulai),
    "Dari Dashboard: terlama dulu dan panah di Mulai ↑",
    `No. NPR ${await arahKolom("No. NPR")}, Mulai ${await arahKolom("Mulai")}, ${mulai.length} baris`,
  );
  await page.screenshot({ path: path.join(OUT, "laptop-npr-dashboard.png") });
  await klikKepala("No. NPR");
  nomor = await nomorTabelNpr(page);
  cek(
    (await arahKolom("No. NPR")) === "descending" &&
      (await arahKolom("Mulai")) === "none" &&
      urutTurun(nomor) &&
      nomor.length > 1,
    "Dari Dashboard: klik No. NPR memberi nomor terbaru dulu",
    `${nomor[0]} … ${nomor.at(-1)}`,
  );
  await klikKepala("No. NPR");
  nomor = await nomorTabelNpr(page);
  cek(
    (await arahKolom("No. NPR")) === "ascending" && urutNaik(nomor),
    "Dari Dashboard: klik No. NPR lagi membalik ke nomor terlama dulu",
    `${nomor[0]} … ${nomor.at(-1)}`,
  );
  await page.goto(BASE + "/npr?kondisi=pending_tm");
  await page.waitForSelector("table tbody tr");
  await klikKepala("Mulai");
  mulai = await mulaiTabelNpr(page);
  cek(
    (await arahKolom("Mulai")) === "descending" && turunAngka(mulai),
    "Dari Dashboard: klik Mulai membalik ke gangguan terbaru dulu",
  );
  await page.goto(BASE + "/npr?kondisi=pending_tm");
  await page.waitForSelector("table tbody tr");
  await page.getByRole("button", { name: "Hapus filter Pending TM" }).click();
  await page.waitForTimeout(600);
  nomor = await nomorTabelNpr(page);
  cek(
    page.url() === BASE + "/npr" &&
      (await arahKolom("No. NPR")) === "descending" &&
      (await arahKolom("Mulai")) === "none" &&
      urutTurun(nomor),
    "Hapus filter Dashboard: kembali ke urutan biasa No. NPR ↓",
    `${page.url().replace(BASE, "")}, ${nomor[0]} … ${nomor.at(-1)}`,
  );

  // 2. Link /npr/<id> dibuka di tab baru
  await page.goto(BASE + "/npr");
  await page.waitForSelector("table tbody tr");
  const noPertama = (await nomorTabelNpr(page))[0];
  await page.locator("table tbody tr").first().click();
  await page.waitForURL(/\/npr\/\d+$/);
  const alamatDetail = page.url();
  const tabBaru = await ctx.newPage();
  await tabBaru.goto(alamatDetail);
  await tabBaru
    .waitForSelector(`text=${noPertama}`, { timeout: 10000 })
    .catch(() => {});
  const adaNomor = await tabBaru.locator(`text=${noPertama}`).count();
  cek(
    adaNomor > 0,
    "Link /npr/<id> dibuka di tab baru menampilkan NPR yang sama",
    `${alamatDetail.replace(BASE, "")} → ${noPertama}, judul "${await tabBaru.title()}"`,
  );
  await tabBaru.reload();
  await tabBaru.waitForTimeout(800);
  cek(
    (await tabBaru.locator(`text=${noPertama}`).count()) > 0 &&
      tabBaru.url() === alamatDetail,
    "Detail NPR tetap terbuka setelah F5",
  );
  await tabBaru.screenshot({ path: path.join(OUT, "laptop-npr-detail.png") });
  await tabBaru.close();

  // 2b. Link dibuka tanpa sesi (browser lain): setelah login, ke halaman mana?
  const ctxLain = await browser.newContext({
    viewport: { width: 1366, height: 820 },
  });
  const pLain = await ctxLain.newPage();
  await pLain.goto(alamatDetail);
  await pLain.locator("input[name=username]").fill(USER);
  await pLain.locator("input[name=password]").fill(SANDI);
  await pLain.locator("button[type=submit]").click();
  await pLain.waitForTimeout(1500);
  const sampaiDetail = (await pLain.locator(`text=${noPertama}`).count()) > 0;
  cek(
    sampaiDetail,
    "Link /npr/<id> tanpa sesi: setelah login langsung ke NPR tersebut",
    `alamat setelah login ${pLain.url().replace(BASE, "")}`,
  );
  await ctxLain.close();

  // 3. Unduh PDF TT (dari daftar TT dan dari detail NPR)
  await page.goto(BASE + "/tt");
  await page.waitForSelector("table tbody tr");
  const tombolPdfTt = page
    .locator("table")
    .getByRole("button", { name: /^Unduh PDF TT/ })
    .first();
  const pdfTt = await unduhDanCek(
    page,
    () => tombolPdfTt.click(),
    "TT-",
    "Unduh PDF TT dari daftar TT",
  );
  await page.screenshot({ path: path.join(OUT, "laptop-tt.png") });
  // Detail NPR yang punya TT
  await page.goto(BASE + "/npr?kondisi=menunggu_report");
  await page.waitForTimeout(600);
  const barisEsk = page.locator("table tbody tr").first();
  if (await barisEsk.count()) {
    await barisEsk.click();
    await page.waitForURL(/\/npr\/\d+$/);
    await page.waitForTimeout(600);
    const st = await page
      .locator("text=/^(Eskalasi|Closed|Pending|Open)$/")
      .first()
      .textContent()
      .catch(() => "?");
    await unduhDanCek(
      page,
      () => page.getByRole("button", { name: "Unduh PDF TT" }).click(),
      "TT-",
      `Unduh PDF TT dari detail NPR berstatus ${st} (TT belum Close)`,
    );
    await page.screenshot({ path: path.join(OUT, "laptop-npr-eskalasi.png") });
  } else cek(false, "Unduh PDF TT dari detail NPR", "filter eskalasi kosong");

  // 4. Unduh PDF Gamas (dari daftar dan dari detail /gamas/:id)
  await page.goto(BASE + "/gamas");
  await page.waitForSelector("table tbody tr");
  const pdfGamas = await unduhDanCek(
    page,
    () =>
      page
        .locator("table")
        .getByRole("button", { name: /^Unduh PDF GAMAS/i })
        .first()
        .click(),
    "GAMAS-",
    "Unduh PDF Gamas dari daftar Gamas",
  );
  await page.screenshot({ path: path.join(OUT, "laptop-gamas.png") });
  await page.locator("table tbody tr").first().click();
  await page.waitForURL(/\/gamas\/\d+$/);
  const alamatGamas = page.url();
  await unduhDanCek(
    page,
    () => page.getByRole("button", { name: "Unduh PDF" }).click(),
    "GAMAS-",
    "Unduh PDF Gamas dari detail Gamas",
  );
  await page.reload();
  await page.waitForTimeout(800);
  cek(
    page.url() === alamatGamas &&
      (await page.getByRole("button", { name: "Unduh PDF" }).count()) > 0,
    "Detail Gamas tetap terbuka setelah F5",
    alamatGamas.replace(BASE, ""),
  );

  // 5. /sla?bulan=… lalu F5
  const bulanLalu = (() => {
    const d = new Date(Date.now() + 7 * 3600e3);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();
  await page.goto(BASE + `/sla?bulan=${bulanLalu}`);
  await page.waitForTimeout(1000);
  const periode1 =
    (await page
      .getByRole("group", { name: "Periode laporan" })
      .textContent()
      .catch(() => "")) ||
    (await page.locator("[aria-label='Periode laporan']").textContent());
  await page.reload();
  await page.waitForTimeout(1000);
  const periode2 = await page
    .locator("[aria-label='Periode laporan']")
    .textContent();
  cek(
    page.url().endsWith(`/sla?bulan=${bulanLalu}`) &&
      periode1 === periode2 &&
      periode2.trim() === namaBulan(bulanLalu),
    "/sla?bulan=… tetap di bulan yang sama setelah F5",
    `${bulanLalu} → "${periode2.trim()}"`,
  );
  await page.screenshot({ path: path.join(OUT, "laptop-sla.png") });
  // Bulan berikutnya → kembali ke bulan ini, alamat tanpa ?bulan
  await page.getByRole("button", { name: "Bulan berikutnya" }).click();
  await page.waitForTimeout(600);
  cek(
    page.url() === BASE + "/sla",
    "Pindah ke bulan ini menghapus ?bulan dari alamat",
    page.url().replace(BASE, ""),
  );
  await page.goBack();
  await page.waitForTimeout(600);
  cek(
    page.url() === alamatGamas,
    "Back setelah ganti bulan kembali ke halaman sebelum SLA (ganti bulan tidak menambah riwayat)",
    page.url().replace(BASE, ""),
  );

  // ---------- HP: Pixel 7 ----------
  const hp = await browser.newContext({
    ...devices["Pixel 7"],
    acceptDownloads: true,
  });
  const p = await hp.newPage();
  p.on(
    "console",
    (m) => m.type() === "error" && galatKonsol.push("[HP] " + m.text()),
  );
  await masuk(p);
  await p.goto(BASE + "/npr");
  await p.waitForTimeout(1000);
  const kartu = p.locator("ul.divide-y li button");
  const jumlahKartu = await kartu.count();
  const tabelTerlihat = await p
    .locator("table")
    .first()
    .isVisible()
    .catch(() => false);
  cek(
    jumlahKartu > 1 && !tabelTerlihat,
    "Kartu NPR di HP (tabel tersembunyi)",
    `${jumlahKartu} kartu`,
  );
  cek(await tanpaGeserHorizontal(p), "Daftar NPR di HP tanpa geser horizontal");
  await p.screenshot({ path: path.join(OUT, "hp-npr.png") });
  const teksKartu = (await kartu.first().innerText()).split("\n")[0];
  await kartu.first().click();
  await p.waitForURL(/\/npr\/\d+$/);
  await p.waitForTimeout(600);
  cek(
    (await p.locator(`text=${teksKartu}`).count()) > 0,
    "Ketuk kartu NPR membuka detail",
    `${teksKartu} → ${p.url().replace(BASE, "")}`,
  );
  cek(await tanpaGeserHorizontal(p), "Detail NPR di HP tanpa geser horizontal");
  await p.screenshot({
    path: path.join(OUT, "hp-npr-detail.png"),
    fullPage: true,
  });

  // Dari Dashboard di HP: pilihan urutan (di panel Filter) sesuai urutan
  // yang tampil.
  await p.goto(BASE + "/npr?kondisi=pending_tm");
  await p.waitForTimeout(1000);
  await p.getByRole("button", { name: /^Filter/ }).click();
  const pilihUrut = p
    .locator("label", { hasText: "Urutkan" })
    .getByRole("combobox");
  const pilihanAwal = (await pilihUrut.innerText()).trim();
  cek(
    pilihanAwal === "Mulai Gangguan, Terlama",
    "HP dari Dashboard: pilihan urutan sesuai yang tampil",
    pilihanAwal,
  );
  await p.waitForTimeout(400); // tunggu animasi panel Filter selesai
  await p.screenshot({ path: path.join(OUT, "hp-npr-dashboard.png") });
  await pilihUrut.click();
  await p.getByRole("option", { name: "No. NPR, Terbaru" }).click();
  await p.waitForTimeout(800);
  await p.keyboard.press("Escape");
  const nomorKartu = await p.$$eval("ul.divide-y li button", (b) =>
    b.map((x) => x.innerText.split("\n")[0].trim()),
  );
  cek(
    nomorKartu.length > 1 && urutTurun(nomorKartu),
    "HP dari Dashboard: No. NPR, Terbaru bisa dipilih",
    `${nomorKartu[0]} … ${nomorKartu.at(-1)}`,
  );

  await p.goto(BASE + "/tt");
  await p.waitForTimeout(1000);
  cek(await tanpaGeserHorizontal(p), "Daftar TT di HP tanpa geser horizontal");
  await p.screenshot({ path: path.join(OUT, "hp-tt.png") });
  const pdfKartuTt = p
    .getByRole("button", { name: /^Unduh PDF TT/ })
    .locator("visible=true")
    .first();
  await unduhDanCek(
    p,
    () => pdfKartuTt.click(),
    "TT-",
    "Unduh PDF TT dari kartu di HP",
  );

  await p.goto(BASE + "/gamas");
  await p.waitForTimeout(1000);
  cek(
    await tanpaGeserHorizontal(p),
    "Daftar Gamas di HP tanpa geser horizontal",
  );
  await p.screenshot({ path: path.join(OUT, "hp-gamas.png") });
  const pdfKartuGamas = p
    .getByRole("button", { name: /^Unduh PDF GAMAS/i })
    .locator("visible=true")
    .first();
  await unduhDanCek(
    p,
    () => pdfKartuGamas.click(),
    "GAMAS-",
    "Unduh PDF Gamas dari kartu di HP",
  );

  await p.goto(BASE + `/sla?bulan=${bulanLalu}`);
  await p.waitForTimeout(1000);
  await p.reload();
  await p.waitForTimeout(1000);
  const periodeHp = await p
    .locator("[aria-label='Periode laporan']")
    .textContent();
  cek(
    periodeHp.trim() === namaBulan(bulanLalu) &&
      (await tanpaGeserHorizontal(p)),
    "SLA di HP: bulan tetap setelah F5, tanpa geser horizontal",
    periodeHp.trim(),
  );
  await p.screenshot({ path: path.join(OUT, "hp-sla.png") });

  await browser.close();
  const lulus = hasil.filter((h) => h.ok).length;
  console.log(`\n${lulus}/${hasil.length} lulus`);
  const galatLain = galatKonsol.filter((g) => !/401/.test(g));
  console.log(
    "Galat konsol (selain 401):",
    galatLain.length ? galatLain : "tidak ada",
  );
  console.log("Tangkapan layar dan PDF:", OUT);
  process.exitCode = lulus === hasil.length ? 0 : 1;
  fs.writeFileSync(
    path.join(OUT, "hasil.json"),
    JSON.stringify({ hasil, galatKonsol }, null, 2),
  );
})().catch((e) => {
  console.error("SKRIP BERHENTI:", e);
  process.exit(1);
});
