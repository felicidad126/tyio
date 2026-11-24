// Pembuat aset peta dasar portal (langkah 2.3, T142): garis pantai dan batas provinsi Indonesia
// yang disimpan di portal, jadi peta remote tidak butuh internet.
//
// Sumber: Natural Earth 1:10m Cultural, Admin 1 – States, Provinces, versi 5.1.1 (domain publik)
//   https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip
// Skrip ini membaca shapefile + dbf-nya, mengambil provinsi Indonesia (adm0_a3 = IDN), membuang
// pulau yang sangat kecil, menyederhanakan garis (Douglas–Peucker, toleransi 0,02° ≈ 2 km), lalu
// menulis GeoJSON kecil (±86 KB) ke src/pages/remotes/map/indonesia.json.
//
// Pemakaian (dari apps/web, setelah zip sumber diekstrak ke folder lain):
//   node scripts/peta-indonesia.mjs <ne_10m_admin_1_states_provinces.shp> \
//     <ne_10m_admin_1_states_provinces.dbf> src/pages/remotes/map/indonesia.json 0.02
//
// Catatan: Natural Earth 5.1.1 masih memakai 33 provinsi (belum ada Kalimantan Utara dan
// pemekaran Papua). Peta hanya menggambar garis; wilayah remote tetap dari kolom provinsinya.
import { readFileSync, writeFileSync } from 'node:fs';

const [shpPath, dbfPath, outPath, toleranceArg = '0.02'] = process.argv.slice(2);
const TOLERANCE = Number(toleranceArg); // derajat (~2 km)
const MIN_AREA = TOLERANCE * TOLERANCE * 2; // pulau yang lebih kecil dibuang

function readDbf(buffer) {
  const records = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  const fields = [];
  for (let offset = 32; buffer[offset] !== 0x0d; offset += 32) {
    const name = buffer.toString('latin1', offset, offset + 11).replace(/\0.*$/, '');
    fields.push({ name: name.toLowerCase(), length: buffer[offset + 16] });
  }
  const rows = [];
  for (let i = 0; i < records; i += 1) {
    let pos = headerLength + i * recordLength + 1;
    const row = {};
    for (const field of fields) {
      row[field.name] = buffer.toString('utf8', pos, pos + field.length).replace(/\0+/g, '').trim();
      pos += field.length;
    }
    rows.push(row);
  }
  return rows;
}

function readShp(buffer) {
  const shapes = [];
  let offset = 100;
  while (offset < buffer.length) {
    const contentLength = buffer.readInt32BE(offset + 4) * 2;
    const start = offset + 8;
    const type = buffer.readInt32LE(start);
    if (type === 5) {
      const parts = buffer.readInt32LE(start + 36);
      const points = buffer.readInt32LE(start + 40);
      const partStarts = [];
      for (let p = 0; p < parts; p += 1) partStarts.push(buffer.readInt32LE(start + 44 + p * 4));
      const pointsStart = start + 44 + parts * 4;
      const rings = partStarts.map((first, p) => {
        const last = p + 1 < parts ? partStarts[p + 1] : points;
        const ring = [];
        for (let k = first; k < last; k += 1) {
          ring.push([buffer.readDoubleLE(pointsStart + k * 16), buffer.readDoubleLE(pointsStart + k * 16 + 8)]);
        }
        return ring;
      });
      shapes.push(rings);
    } else {
      shapes.push([]);
    }
    offset = start + contentLength;
  }
  return shapes;
}

function perpendicular(point, a, b) {
  const [x, y] = point;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / Math.hypot(dx, dy);
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let index = -1;
    let max = 0;
    for (let i = first + 1; i < last; i += 1) {
      const distance = perpendicular(points[i], points[first], points[last]);
      if (distance > max) {
        max = distance;
        index = i;
      }
    }
    if (index >= 0 && max > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function area(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum / 2);
}

const round = (value) => Math.round(value * 1000) / 1000;

const rows = readDbf(readFileSync(dbfPath));
const shapes = readShp(readFileSync(shpPath));
if (rows.length !== shapes.length) throw new Error(`Jumlah baris dbf (${rows.length}) ≠ bentuk shp (${shapes.length}).`);

const features = [];
let before = 0;
let after = 0;
rows.forEach((row, i) => {
  if (row.adm0_a3 !== 'IDN') return;
  const polygons = [];
  for (const ring of shapes[i]) {
    before += ring.length;
    if (area(ring) < MIN_AREA) continue;
    const simple = simplify(ring, TOLERANCE).map(([x, y]) => [round(x), round(y)]);
    if (simple.length < 4) continue;
    after += simple.length;
    polygons.push([simple]);
  }
  if (polygons.length > 0) {
    features.push({ type: 'Feature', properties: { name: row.name }, geometry: { type: 'MultiPolygon', coordinates: polygons } });
  }
});
features.sort((a, b) => a.properties.name.localeCompare(b.properties.name));
writeFileSync(outPath, JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`${features.length} provinsi; titik ${before} → ${after}`);
console.log(features.map((feature) => feature.properties.name).join(', '));
