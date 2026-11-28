// Susun review/PANDUAN-PENGGUNAAN-NPR.pdf dari dokumen Claude Docs "Panduan Penggunaan NPR".
//
// Ekspor PDF bawaan Claude Docs tidak memuat gambar, jadi PDF dibuat di sini:
// 1. Ekspor tab dokumen sebagai HTML lewat konektor Claude Docs, simpan sebagai berkas.
// 2. Ambil tangkapan layar dengan tangkap-layar.cjs.
// 3. Jalankan dari folder monitoring-vsat/ (font diambil dari node_modules di sana):
//
//      node ../review/panduan/susun-pdf.cjs <ekspor.html> <folder-gambar> <keluar.pdf>
//
// Gambar di HTML dikenali dari teks alt-nya (lihat GAMBAR). Bila alt di dokumen diubah atau
// gambar baru ditambah, perbarui daftar itu. Diagram alur diambil dari diagram-alur.png
// (tangkapan widget diagram di dokumen); ganti berkas itu bila diagramnya berubah.
// Butuh ImageMagick (`convert`) untuk mengecilkan gambar.

const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const [masuk, folderGambar, keluarPdf] = process.argv.slice(2);
if (!masuk || !folderGambar || !keluarPdf) {
  console.error(
    "Pakai: node susun-pdf.cjs <ekspor.html> <folder-gambar> <keluar.pdf>",
  );
  process.exit(1);
}
const REPO = path.resolve(__dirname, "../..");
const NM = path.join(REPO, "monitoring-vsat/node_modules");
const DIAGRAM = path.join(__dirname, "diagram-alur.png");

// Teks alt gambar di dokumen -> berkas hasil tangkap-layar.cjs.
const GAMBAR = {
  "Halaman Masuk NPR": "01-login",
  "Menu akun berisi Ganti Password dan Keluar": "03-menu-akun",
  "Dialog Ganti Password": "04-ganti-password",
  "Susunan halaman di laptop dengan contoh daftar NPR": "05-npr-daftar",
  "Tampilan NPR di HP": "05-hp-gabung",
  "Dashboard NPR": "02-dashboard",
  "Panel Filter daftar NPR": "06-npr-filter",
  "Form NPR Baru": "07-npr-baru",
  "Detail NPR yang sudah dieskalasi": "08-npr-detail",
  "Form Tambah Tindakan dengan pengingat Pending Customer":
    "09-tindakan-problem",
  "Isian Eskalasi Service dan Close": "11-tindakan-gabung",
  "Halaman Trouble Ticket": "12-tt-daftar",
  "Contoh PDF TT dan PDF TT Gamas": "13-pdf-tt-gamas",
  "Form TT Gamas Baru": "15-gamas-baru",
  "Detail TT Gamas": "16-gamas-detail",
  "Halaman TT Gamas": "14-gamas-daftar",
  "Laporan SLA": "18-sla",
  "Halaman Customer": "19-customer",
  "Halaman Remote": "20-remote",
  "Form Tambah Remote": "21-remote-tambah",
  "Halaman Pengguna": "22-pengguna",
  "Form Tambah Akun": "23-tambah-akun",
  "Menu pada baris akun": "24-menu-pengguna",
};
// Gambar yang selalu selebar halaman (gabungan atau bukan tangkapan skala 2x).
const SELEBAR_HALAMAN = new Set([
  "05-hp-gabung",
  "13-pdf-tt-gamas",
  "11-tindakan-gabung",
]);
const BULAN = [
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

// Lebar PNG dibaca dari header IHDR (byte 16-19).
const lebarPng = (f) => fs.readFileSync(f).readUInt32BE(16);

const kerja = fs.mkdtempSync(path.join(os.tmpdir(), "panduan-"));
// Folder kerja selalu dihapus, juga bila skrip berhenti karena galat.
process.on("exit", () => fs.rmSync(kerja, { recursive: true, force: true }));
fs.mkdirSync(path.join(kerja, "gambar"));

let h = fs.readFileSync(masuk, "utf8");

// Tanggal versi diambil dari baris penulis, lalu judul dan baris penulis diganti sampul.
const tanggal =
  /<time data-atom="date" datetime="(\d{4})-(\d{2})-(\d{2})"/.exec(h);
const versi = tanggal
  ? `${Number(tanggal[3])} ${BULAN[Number(tanggal[2]) - 1]} ${tanggal[1]}`
  : "";
h = h.replace(/<h1[^>]*>[\s\S]*?<\/h1>\s*/, "");
h = h.replace(/<p><time data-atom="date"[\s\S]*?<\/p>\s*/, "");

// Gambar + keterangan "Gambar N." menjadi satu figure dengan berkas lokal.
let jumlahGambar = 0;
h = h.replace(
  /<p><img src="blob\/[0-9a-f-]+" alt="([^"]*)"><\/p>\s*<p><em>(Gambar[^<]*)<\/em><\/p>/g,
  (_, alt, ket) => {
    const nama = GAMBAR[alt];
    if (!nama)
      throw new Error(
        `Alt gambar tidak dikenal: "${alt}". Tambahkan ke GAMBAR.`,
      );
    const asli = path.join(folderGambar, `${nama}.png`);
    if (!fs.existsSync(asli)) throw new Error(`Berkas tidak ada: ${asli}`);
    execFileSync("convert", [
      asli,
      "+repage",
      "-resize",
      "1600x>",
      "-strip",
      "-depth",
      "8",
      path.join(kerja, "gambar", `${nama}.png`),
    ]);
    // Tangkapan layar berskala 2x: lebar CSS = piksel / 2. Gambar sempit (dialog, menu)
    // dicetak sebanding ukuran aslinya, tidak dilebarkan.
    const css = lebarPng(asli) / 2;
    const gaya =
      SELEBAR_HALAMAN.has(nama) || css >= 1200
        ? ""
        : ` style="width:${Math.round(css * 0.62)}px"`;
    jumlahGambar++;
    return `<figure><img src="gambar/${nama}.png" alt="${alt}"${gaya}><figcaption>${ket}</figcaption></figure>`;
  },
);
if (h.includes('src="blob/'))
  throw new Error(
    "Masih ada gambar blob yang tidak terpasang. Periksa pola gambar dan keterangan.",
  );

// Diagram alur (widget di dokumen).
fs.copyFileSync(DIAGRAM, path.join(kerja, "gambar", "diagram-alur.png"));
h = h.replace(
  /<figure data-embed="node\/[^"]+"><figcaption>([^<]*)<\/figcaption><\/figure>/,
  '<figure class="diagram"><img src="gambar/diagram-alur.png" alt="$1"><figcaption>Diagram: $1.</figcaption></figure>',
);

// Rumus SLA (blok latex) sebagai pecahan.
h = h.replace(
  /<pre><code class="language-latex">[\s\S]*?<\/code><\/pre>/,
  '<div class="rumus"><span>SLA =</span><span class="pecahan">' +
    '<span class="atas">menit periode − downtime TM</span>' +
    '<span class="bawah">menit periode</span></span><span>× 100%</span></div>',
);

// Daftar isi dari judul bagian.
const isi = [...h.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)]
  .map(([, id, judul]) => `<li><a href="#${id}">${judul}</a></li>`)
  .join("");

const font = (berkas) =>
  `file://${NM}/@fontsource-variable/plus-jakarta-sans/files/${berkas}`;
const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>Panduan Penggunaan NPR</title>
<style>
@font-face { font-family: "Jakarta"; src: url("${font("plus-jakarta-sans-latin-wght-normal.woff2")}") format("woff2"); font-weight: 200 800; font-style: normal; }
@font-face { font-family: "Jakarta"; src: url("${font("plus-jakarta-sans-latin-wght-italic.woff2")}") format("woff2"); font-weight: 200 800; font-style: italic; }
@font-face { font-family: "Jakarta"; src: url("${font("plus-jakarta-sans-latin-ext-wght-normal.woff2")}") format("woff2"); font-weight: 200 800; unicode-range: U+0100-024F, U+2000-206F, U+20A0-20CF, U+2100-218F, U+2190-21FF, U+2212; }
@font-face { font-family: "Mono"; src: url("file://${NM}/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2") format("woff2"); }
@page { size: A4; }
:root { --navy: #032459; --garis: #d0d5dd; --redup: #5b6475; }
* { box-sizing: border-box; }
body { font-family: "Jakarta", "DejaVu Sans", sans-serif; font-size: 10pt; line-height: 1.55; color: #1c2433; margin: 0; }
a { color: inherit; text-decoration: none; }
.sampul { padding-top: 40mm; }
.sampul img { width: 30mm; height: 30mm; }
.sampul .judul { font-size: 26pt; font-weight: 700; color: var(--navy); line-height: 1.2; margin: 10mm 0 3mm; }
.sampul .sub { font-size: 13pt; color: var(--redup); }
.sampul .versi { margin-top: 8mm; font-size: 10pt; color: var(--redup); border-top: 2px solid var(--navy); padding-top: 3mm; }
.daftar-isi { margin-top: 18mm; }
.daftar-isi .kepala { font-size: 12pt; font-weight: 700; color: var(--navy); margin-bottom: 3mm; }
.daftar-isi ol { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 10mm; }
.daftar-isi li { padding: 1.5mm 0; border-bottom: 1px solid var(--garis); break-inside: avoid; }
h2 { break-before: page; font-size: 17pt; color: var(--navy); margin: 0 0 4mm; padding-bottom: 2mm; border-bottom: 2px solid var(--navy); }
h3 { font-size: 12pt; color: var(--navy); margin: 6mm 0 2mm; break-after: avoid; }
p { margin: 0 0 2.5mm; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1mm; } li p { margin: 0; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9pt; line-height: 1.45; }
th, td { border: 1px solid var(--garis); padding: 1.6mm 2.2mm; text-align: left; vertical-align: top; }
th { background: #eef2f8; color: var(--navy); font-weight: 600; }
tr { break-inside: avoid; }
figure { margin: 4mm 0 5mm; text-align: center; break-inside: avoid; }
figure img { max-width: 100%; max-height: 205mm; border: 1px solid var(--garis); }
figure.diagram img { border: none; max-height: 150mm; }
figcaption { font-size: 8.5pt; color: var(--redup); font-style: italic; margin-top: 1.5mm; }
pre { background: #f2f4f7; border-left: 3px solid var(--navy); padding: 2.5mm 3.5mm; margin: 1mm 0 4mm; font-size: 8.5pt; white-space: pre-wrap; break-inside: avoid; }
code { font-family: "Mono", "DejaVu Sans Mono", monospace; font-size: 0.92em; }
p code, li code, td code { background: #f2f4f7; padding: 0 1mm; }
.rumus { display: flex; align-items: center; justify-content: center; gap: 3mm; margin: 4mm 0; font-size: 11pt; }
.pecahan { display: inline-flex; flex-direction: column; text-align: center; }
.pecahan .atas { border-bottom: 1.2px solid #1c2433; padding: 0 2mm 1mm; }
.pecahan .bawah { padding-top: 1mm; }
</style></head><body>
<section class="sampul">
  <img src="file://${REPO}/review/aset/logo-tangara-mitrakom.png" alt="Logo PT. Tangara Mitrakom">
  <div class="judul">Panduan Penggunaan NPR</div>
  <div class="sub">Network Problem Report<br>PT. Tangara Mitrakom</div>
  ${versi ? `<div class="versi">Versi ${versi}</div>` : ""}
  <nav class="daftar-isi"><div class="kepala">Daftar isi</div><ol>${isi}</ol></nav>
</section>
${h}
</body></html>`;
const halaman = path.join(kerja, "panduan.html");
fs.writeFileSync(halaman, html);

(async () => {
  const b = await chromium.launch();
  try {
    const p = await b.newPage();
    await p.goto("file://" + halaman, { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    const rusak = await p.evaluate(() =>
      [...document.images]
        .filter((i) => !i.complete || i.naturalWidth === 0)
        .map((i) => i.src),
    );
    if (rusak.length)
      throw new Error(`Gambar gagal dimuat: ${rusak.join(", ")}`);
    await p.pdf({
      path: path.resolve(keluarPdf),
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "18mm", left: "18mm", right: "18mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        '<div style="width:100%;font-size:7.5px;color:#5b6475;padding:0 18mm;display:flex;justify-content:space-between;font-family:sans-serif">' +
        '<span>Panduan Penggunaan NPR</span><span>Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span></div>',
    });
    console.log(
      `PDF tersimpan: ${path.resolve(keluarPdf)} (${jumlahGambar} gambar, versi ${versi || "tanpa tanggal"})`,
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
