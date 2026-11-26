// Merender setiap blok Mermaid di review/DIAGRAM-NPR.md menjadi SVG dan PNG.
//
// Setiap blok diberi penanda nama berkas tepat di atasnya. Tata letak ELK
// bisa dipilih per diagram; tanpa itu dipakai tata letak bawaan (dagre):
//   <!-- gambar: 01-erd -->
//   <!-- gambar: 03b-activity-siklus-npr layout=elk -->
//   ```mermaid
//   ...
//   ```
//
// Cara pakai (dari folder repo):
//   npm install --prefix /tmp/alat-mermaid mermaid@11.12.2 @mermaid-js/layout-elk@0.2.0
//   ALAT=/tmp/alat-mermaid node review/gambar/diagram/render-diagram.mjs
//
// Butuh Playwright dengan Chromium. Hasil ditulis ke folder skrip ini.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const SINI = dirname(fileURLToPath(import.meta.url));
const FOLDER = process.env.KELUAR ?? SINI;
const DOKUMEN = process.env.DOKUMEN ?? resolve(SINI, "../../DIAGRAM-NPR.md");
const ALAT = process.env.ALAT;
if (!ALAT) {
  console.error("Isi ALAT dengan folder tempat mermaid dan layout-elk dipasang.");
  process.exit(1);
}
const MODUL = resolve(ALAT, "node_modules");
// Hanya render diagram tertentu, mis. SAJA=01-erd,02-use-case
const SAJA = (process.env.SAJA ?? "").split(",").filter(Boolean);

// Font Arial (di Linux diganti Liberation Sans yang ukurannya sama), supaya
// lebar teks di SVG tetap pas saat dibuka di Word atau browser lain.
const FONT = "Arial, 'Liberation Sans', Helvetica, sans-serif";
const KONFIG = {
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  fontFamily: FONT,
  // Label sebagai teks SVG biasa (tanpa foreignObject), supaya terbaca di Word.
  htmlLabels: false,
  themeVariables: {
    fontFamily: FONT,
    fontSize: "14px",
    background: "#ffffff",
    primaryColor: "#eef3fb",
    primaryBorderColor: "#032459",
    primaryTextColor: "#14213d",
    secondaryColor: "#f4f6f9",
    tertiaryColor: "#ffffff",
    lineColor: "#3d4a5c",
    textColor: "#14213d",
    clusterBkg: "#fafbfc",
    clusterBorder: "#9aa7b8",
    edgeLabelBackground: "#ffffff",
    noteBkgColor: "#fff8e1",
    noteBorderColor: "#c9a227",
    noteTextColor: "#14213d",
    actorBkg: "#eef3fb",
    actorBorder: "#032459",
    actorTextColor: "#14213d",
    signalColor: "#14213d",
    signalTextColor: "#14213d",
    labelBoxBkgColor: "#eef3fb",
    labelBoxBorderColor: "#032459",
    loopTextColor: "#14213d",
    activationBkgColor: "#dfe8f6",
    activationBorderColor: "#032459",
  },
  // Latar label garis putih dan teksnya gelap. Tanpa ini, label relasi ERD
  // tertutup kotak berwarna sama dengan teksnya.
  themeCSS: `
    .edgeLabel rect.background, .edgeLabel .label rect { fill: #ffffff !important; opacity: 1 !important; }
    .edgeLabel text, .edgeLabel .label text, .edgeLabel tspan { fill: #14213d !important; }
    .cluster-label text, .cluster-label tspan { font-weight: bold; }
    .cluster-label text { paint-order: stroke; stroke: #fafbfc; stroke-width: 6px; stroke-linejoin: round; }
    g.node circle.outer-circle { fill: #ffffff !important; stroke: #14213d !important; stroke-width: 1.5px; }
    g.node circle.inner-circle { fill: #14213d !important; stroke: #14213d !important; }
    .edgeTerminals text { paint-order: stroke; stroke: #ffffff; stroke-width: 4px; stroke-linejoin: round; font-size: 13px; }
  `,
  flowchart: {
    htmlLabels: false,
    useMaxWidth: false,
    nodeSpacing: 34,
    rankSpacing: 46,
    padding: 10,
    wrappingWidth: 400,
  },
  // Baris pesan dipisah manual dengan <br/>; jarak antarpeserta mengikuti
  // pesan terpanjang, jadi teks tidak menimpa garis hidup.
  sequence: {
    useMaxWidth: false,
    mirrorActors: false,
    actorMargin: 40,
    messageMargin: 30,
    boxMargin: 10,
    noteMargin: 10,
    wrap: false,
    width: 150,
  },
  er: { useMaxWidth: false, minEntityWidth: 90 },
  class: { useMaxWidth: false, htmlLabels: false },
  elk: { nodePlacementStrategy: "BRANDES_KOEPF", mergeEdges: false },
};

function ambilBlok(teks) {
  const pola =
    /<!--\s*gambar:\s*([\w-]+)((?:\s+\w+=[\w-]+)*)\s*-->\s*```mermaid\n([\s\S]*?)```/g;
  const hasil = [];
  for (const m of teks.matchAll(pola)) {
    const opsi = Object.fromEntries(
      m[2]
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((s) => s.split("=")),
    );
    hasil.push({ nama: m[1], opsi, kode: m[3] });
  }
  return hasil;
}

const blok = ambilBlok(readFileSync(DOKUMEN, "utf8")).filter(
  (b) => !SAJA.length || SAJA.includes(b.nama),
);
if (!blok.length) {
  console.error("Tidak ada blok Mermaid berpenanda di dokumen.");
  process.exit(1);
}

// Halaman render dilayani dari alamat semu supaya modul ESM bisa dimuat.
const ASAL = "http://render.lokal";
const HALAMAN = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#fff}
  #wadah{display:inline-block;padding:24px;background:#fff}
</style></head><body><div id="wadah"></div>
<script type="module">
  import mermaid from "/modul/mermaid/dist/mermaid.esm.min.mjs";
  import elk from "/modul/@mermaid-js/layout-elk/dist/mermaid-layout-elk.esm.min.mjs";
  mermaid.registerLayoutLoaders(elk);
  window.mermaid = mermaid;
  window.siap = true;
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.route(`${ASAL}/**`, async (route) => {
  const jalur = new URL(route.request().url()).pathname;
  if (jalur === "/")
    return route.fulfill({ contentType: "text/html", body: HALAMAN });
  if (jalur.startsWith("/modul/")) {
    const berkas = normalize(join(MODUL, jalur.slice("/modul/".length)));
    if (berkas.startsWith(MODUL))
      return route.fulfill({
        contentType: "text/javascript",
        body: readFileSync(berkas),
      });
  }
  return route.fulfill({ status: 404, body: "" });
});
await page.goto(`${ASAL}/`);
await page.waitForFunction(() => window.siap === true);

let gagal = 0;
for (const [i, b] of blok.entries()) {
  try {
    const konfig = { ...KONFIG, layout: b.opsi.layout ?? "dagre" };
    const svg = await page.evaluate(
      async ({ id, kode, konfig }) => {
        window.mermaid.initialize(konfig);
        const { svg } = await window.mermaid.render(id, kode);
        const wadah = document.getElementById("wadah");
        wadah.innerHTML = svg;
        // Label garis (termasuk multiplisitas) dipindah ke lapisan paling
        // atas, supaya tidak tertutup kotak kelas atau tabel.
        for (const root of wadah.querySelectorAll("g.root")) {
          const label = root.querySelector(":scope > g.edgeLabels");
          if (label) root.appendChild(label);
        }
        // Judul kelompok (subgraph) juga dipindah ke lapisan paling atas,
        // dengan posisi yang dihitung ulang, supaya garis yang lewat di
        // belakangnya tidak menutupi teks.
        const svgEl = wadah.querySelector("svg");
        const lapisan = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "g",
        );
        lapisan.setAttribute("class", "judul-kelompok");
        for (const judul of svgEl.querySelectorAll("g.cluster-label")) {
          const m = svgEl
            .getScreenCTM()
            .inverse()
            .multiply(judul.getScreenCTM());
          judul.setAttribute(
            "transform",
            `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`,
          );
          lapisan.appendChild(judul);
        }
        if (lapisan.childNodes.length) svgEl.appendChild(lapisan);
        // Ukuran asli dari viewBox, bukan lebar 100%.
        const el = wadah.querySelector("svg");
        const [, , w, h] = el.getAttribute("viewBox").split(/\s+/).map(Number);
        el.removeAttribute("style");
        el.setAttribute("width", String(Math.ceil(w)));
        el.setAttribute("height", String(Math.ceil(h)));
        el.style.backgroundColor = "#ffffff";
        return el.outerHTML;
      },
      { id: `diagram${i}`, kode: b.kode, konfig },
    );
    if (svg.includes("<foreignObject"))
      console.warn(`  ${b.nama}: masih ada foreignObject (teks HTML).`);
    writeFileSync(
      join(FOLDER, `${b.nama}.svg`),
      `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`,
    );
    const el = await page.$("#wadah");
    await el.screenshot({ path: join(FOLDER, `${b.nama}.png`) });
    const ukuran = await el.boundingBox();
    console.log(
      `OK ${b.nama} (${konfig.layout}): ${Math.round(ukuran.width)}×${Math.round(ukuran.height)} px, PNG 2x`,
    );
  } catch (e) {
    gagal++;
    console.error(`GAGAL ${b.nama}: ${e.message.split("\n")[0]}`);
  }
}
await browser.close();
process.exit(gagal ? 1 : 0);
