// Mengekspor setiap berkas *.drawio di folder ini menjadi PNG dan SVG,
// memakai mesin gambar draw.io sendiri (versi dikunci) di Chromium.
//
// - PNG: skala 2x, latar putih, persis seperti tampilan di draw.io.
// - SVG: label ditulis sebagai teks SVG biasa (tanpa foreignObject), supaya
//   tetap terbaca bila SVG dimasukkan ke Word.
//
// Cara pakai (dari folder repo, butuh Node 22 dan Playwright + Chromium):
//   node review/gambar/diagram/render-drawio.mjs
//   SAJA=01-erd,02-use-case node review/gambar/diagram/render-drawio.mjs
//
// Berkas draw.io diunduh dari jsDelivr sekali, lalu disimpan di CACHE
// (bawaan: folder .cache-drawio di folder sementara sistem).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const VERSI = "32.7.7";
const SUMBER = `https://cdn.jsdelivr.net/gh/jgraph/drawio@v${VERSI}/src/main/webapp/`;
const FOLDER = dirname(fileURLToPath(import.meta.url));
const CACHE = process.env.CACHE ?? join(tmpdir(), `.cache-drawio-${VERSI}`);
const SAJA = (process.env.SAJA ?? "").split(",").filter(Boolean);
const TEPI = 20; // jarak putih di sekeliling gambar (px)

const JENIS = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".xml": "application/xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

async function ambil(jalur) {
  const lokal = join(CACHE, jalur);
  if (existsSync(lokal)) return readFileSync(lokal);
  const res = await fetch(SUMBER + jalur);
  if (!res.ok) return null;
  const isi = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(lokal), { recursive: true });
  writeFileSync(lokal, isi);
  return isi;
}

const HALAMAN = `<!doctype html><html><head><meta charset="utf-8">
<script src="js/export-init.js"></script>
<link rel="stylesheet" href="mxgraph/css/common.css">
<script src="js/app.min.js"></script>
<style>html,body{margin:0;background:#fff}#wadah{display:inline-block;background:#fff}</style>
</head><body><div id="kanvas" style="position:absolute;left:-10000px;top:0;width:4000px;height:4000px"></div>
<div id="wadah"></div></body></html>`;

const berkas = readdirSync(FOLDER)
  .filter((n) => n.endsWith(".drawio"))
  .map((n) => n.slice(0, -".drawio".length))
  .filter((n) => !SAJA.length || SAJA.includes(n))
  .sort();
if (!berkas.length) {
  console.error("Tidak ada berkas .drawio.");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
const ASAL = "http://drawio.lokal/";
await page.route(`${ASAL}**`, async (route) => {
  const jalur = new URL(route.request().url()).pathname.slice(1);
  if (jalur === "" || jalur === "index.html")
    return route.fulfill({ contentType: "text/html", body: HALAMAN });
  const isi = await ambil(jalur);
  if (!isi) return route.fulfill({ status: 404, body: "" });
  return route.fulfill({
    contentType: JENIS[extname(jalur)] ?? "application/octet-stream",
    body: isi,
  });
});
await page.goto(`${ASAL}index.html`);
await page.waitForFunction(() => typeof window.Graph === "function");
// Tema terang tetap, seperti ekspor draw.io dengan tema "light": warna ditulis
// apa adanya, tanpa light-dark(), supaya SVG terbaca di Word dan Inkscape.
await page.evaluate(() => {
  mxUtils.lightDarkColorSupported = false;
  mxUtils.preferDarkColor = false;
});

let gagal = 0;
for (const nama of berkas) {
  try {
    const xml = readFileSync(join(FOLDER, `${nama}.drawio`), "utf8");
    const hasil = await page.evaluate(
      ({ xml, tepi }) => {
        const doc = mxUtils.parseXml(xml);
        const model = doc.getElementsByTagName("mxGraphModel")[0];
        const kanvas = document.getElementById("kanvas");
        kanvas.innerHTML = "";
        const graph = new Graph(kanvas);
        graph.setEnabled(false);
        new mxCodec(model.ownerDocument).decode(model, graph.getModel());
        const buat = (teksBiasa) => {
          mxSvgCanvas2D.prototype.foEnabled = !teksBiasa;
          try {
            const svg = graph.getSvg("#ffffff", 1, tepi, false, null, true,
              null, null, null, null, null, "light");
            return svg;
          } finally {
            mxSvgCanvas2D.prototype.foEnabled = true;
          }
        };
        const tampil = buat(false);
        // Untuk SVG: label dijadikan teks biasa (html=0). Label di berkas
        // .drawio memakai baris baru biasa, bukan tag HTML, jadi isinya sama.
        const m = graph.getModel();
        m.beginUpdate();
        try {
          for (const id in m.cells) {
            const st = m.cells[id].style;
            // draw.io juga menganggap whiteSpace=wrap sebagai label HTML.
            if (st && (st.includes("html=1") || st.includes("whiteSpace=wrap")))
              m.setStyle(
                m.cells[id],
                st.replaceAll("html=1", "html=0").replaceAll("whiteSpace=wrap;", ""),
              );
          }
        } finally {
          m.endUpdate();
        }
        const biasa = buat(true);
        const wadah = document.getElementById("wadah");
        wadah.innerHTML = "";
        wadah.appendChild(tampil);
        const s = new XMLSerializer();
        return {
          svg: s.serializeToString(biasa),
          ada_fo: s.serializeToString(biasa).includes("foreignObject"),
          lebar: tampil.getAttribute("width"),
          tinggi: tampil.getAttribute("height"),
        };
      },
      { xml, tepi: TEPI },
    );
    await page.evaluate(() => document.fonts.ready);
    writeFileSync(
      join(FOLDER, `${nama}.svg`),
      `<?xml version="1.0" encoding="UTF-8"?>\n${hasil.svg}\n`,
    );
    const el = await page.$("#wadah > svg");
    await el.screenshot({ path: join(FOLDER, `${nama}.png`) });
    console.log(
      `OK ${nama}: ${hasil.lebar} × ${hasil.tinggi}${hasil.ada_fo ? " (SVG masih berisi foreignObject)" : ""}`,
    );
  } catch (e) {
    gagal++;
    console.error(`GAGAL ${nama}: ${e.message.split("\n")[0]}`);
  }
}
await browser.close();
process.exit(gagal ? 1 : 0);
