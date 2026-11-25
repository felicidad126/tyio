<script setup lang="ts">
import 'leaflet/dist/leaflet.css';
import type { RemoteMap, RemoteMapPoint } from '@npr/shared';
import * as L from 'leaflet';
import Supercluster, { type ClusterFeature, type PointFeature } from 'supercluster';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { type RouteLocationRaw, useRouter } from 'vue-router';
import LiveStatus from '../../../components/LiveStatus.vue';
import { debounced, useStream } from '../../../composables/useStream';
import { remoteApi, type RemoteMapQuery } from '../remote-api';
import indonesia from './indonesia.json';

// Peta remote (langkah 2.3, T140–T143).
// - Peta dasar: garis pantai dan batas provinsi yang disimpan di portal (T142), tanpa ubin peta
//   dari internet. Sumber dan cara membuatnya: scripts/peta-indonesia.mjs.
// - Titik merah = remote dengan NPR berjalan (angkanya = jumlah NPR), abu = tidak ada (T141).
//   Titik berdekatan digabung menjadi kelompok berisi jumlah remote; angka merah di kelompok =
//   remote dengan NPR berjalan. Klik kelompok memperbesar peta; klik titik membuka remote.
// - Remote tanpa koordinat disebut jumlahnya dengan tautan ke daftar (T143).
// - Berubah sendiri saat ada perubahan NPR (langkah 2.2), tanpa menggeser tampilan peta.

const props = defineProps<{
  query: RemoteMapQuery;
  /** Tautan ke daftar remote yang cocok dengan saringan ini tetapi tanpa koordinat. */
  withoutCoordinatesLink: RouteLocationRaw;
}>();

const router = useRouter();
const number = new Intl.NumberFormat('id-ID');

/** Batas tampilan: Indonesia dengan sedikit ruang. */
const INDONESIA: L.LatLngBoundsExpression = [
  [-11.2, 94.8],
  [6.3, 141.1],
];
const MAX_ZOOM = 14;
/** Jarak gabung titik, piksel layar; sekaligus menjaga area klik (32/44 px) tidak bertumpuk. */
const CLUSTER_RADIUS = 48;

type PointProps = { index: number; open: number };
type ClusterProps = { problems: number };

const element = useTemplateRef<HTMLDivElement>('peta');
const data = shallowRef<RemoteMap | null>(null);
const loading = ref(true);
const error = ref('');
const loadedAt = ref<number | null>(null);
const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
const hit = coarse ? 44 : 32;

let map: L.Map | null = null;
let markers: L.LayerGroup | null = null;
let index: Supercluster<PointProps, ClusterProps> | null = null;
let request = 0;

const summary = computed(() => {
  const points = data.value?.points ?? [];
  return {
    shown: points.length,
    problems: points.filter((point) => point[5] > 0).length,
    without: data.value?.withoutCoordinates ?? 0,
  };
});
const activeLabel = computed(() => (props.query.active === 'false' ? 'nonaktif' : 'aktif'));

async function load(fit: boolean): Promise<void> {
  const mine = ++request;
  loading.value = true;
  error.value = '';
  try {
    const result = await remoteApi.map(props.query);
    if (mine !== request) return;
    data.value = result;
    loadedAt.value = Date.now();
    index = new Supercluster<PointProps, ClusterProps>({
      radius: CLUSTER_RADIUS,
      extent: 256,
      maxZoom: MAX_ZOOM,
      map: (item) => ({ problems: item.open > 0 ? 1 : 0 }),
      reduce: (total, item) => {
        total.problems += item.problems;
      },
    }).load(
      result.points.map(
        (point, i): PointFeature<PointProps> => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [point[4], point[3]] },
          properties: { index: i, open: point[5] },
        }),
      ),
    );
    if (fit) fitToPoints(result.points);
    draw();
  } catch (cause) {
    if (mine !== request) return;
    error.value = cause instanceof Error ? cause.message : 'Peta remote gagal dimuat.';
  } finally {
    if (mine === request) loading.value = false;
  }
}

function fitToPoints(points: RemoteMapPoint[]): void {
  if (!map) return;
  if (points.length === 0) {
    map.fitBounds(INDONESIA);
    return;
  }
  const bounds = L.latLngBounds(points.map((point) => [point[3], point[4]] as L.LatLngTuple));
  map.fitBounds(bounds, { padding: [32, 32], maxZoom: 11 });
}

function draw(): void {
  if (!map || !markers || !index || !data.value) return;
  markers.clearLayers();
  const bounds = map.getBounds();
  // Perbesaran pecahan dibulatkan ke bawah: jarak gabung di layar tidak pernah kurang dari radius.
  const zoom = Math.floor(map.getZoom());
  const items = index.getClusters([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], zoom);
  for (const item of items) {
    if ('cluster' in item.properties && item.properties.cluster) {
      addCluster(item as ClusterFeature<ClusterProps>);
    } else {
      const point = data.value.points[(item as PointFeature<PointProps>).properties.index];
      if (point) addPoint(point);
    }
  }
}

function addPoint(point: RemoteMapPoint): void {
  const [id, code, name, latitude, longitude, open] = point;
  const label = `${code} · ${name} · ${open > 0 ? `${number.format(open)} NPR berjalan` : 'tidak ada NPR berjalan'}`;
  const dot = document.createElement('span');
  dot.className = open > 0 ? 'peta-titik__tanda peta-titik__tanda--masalah' : 'peta-titik__tanda';
  if (open > 0) dot.textContent = number.format(open);
  const marker = L.marker([latitude, longitude], {
    icon: L.divIcon({ html: dot, className: 'peta-titik', iconSize: [hit, hit] }),
    keyboard: true,
    riseOnHover: true,
    zIndexOffset: open > 0 ? 1000 : 0,
  });
  const tooltip = document.createElement('span');
  tooltip.textContent = label;
  marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -hit / 2] });
  activate(marker, `Buka remote ${label}`, () => void router.push({ name: 'remote-detail', params: { id } }));
  markers?.addLayer(marker);
}

/**
 * Klik, Enter, dan Spasi menjalankan `action`. Leaflet 1.9 membuat penanda bisa difokus
 * (role=button) tetapi Enter hanya membuka popup, jadi tombol keyboard ditangani di sini.
 */
function activate(marker: L.Marker, label: string, action: () => void): void {
  marker.on('click', action);
  marker.on('add', () => {
    const icon = marker.getElement();
    if (!icon) return;
    icon.setAttribute('aria-label', label);
    icon.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      action();
    });
  });
}

function addCluster(cluster: ClusterFeature<ClusterProps>): void {
  const [longitude, latitude] = cluster.geometry.coordinates as [number, number];
  const { cluster_id: clusterId, point_count: count, problems } = cluster.properties;
  const size = Math.max(hit, count < 10 ? 32 : count < 100 ? 38 : 44);
  const icon = document.createElement('span');
  icon.className = problems > 0 ? 'peta-kelompok__isi peta-kelompok__isi--masalah' : 'peta-kelompok__isi';
  icon.style.width = icon.style.height = `${Math.min(size, 44)}px`;
  icon.textContent = number.format(count);
  if (problems > 0) {
    const badge = document.createElement('span');
    badge.className = 'peta-kelompok__masalah';
    badge.textContent = number.format(problems);
    icon.append(badge);
  }
  const label =
    `Kelompok ${number.format(count)} remote` +
    (problems > 0 ? `, ${number.format(problems)} dengan NPR berjalan` : ', tidak ada NPR berjalan');
  const marker = L.marker([latitude, longitude], {
    icon: L.divIcon({ html: icon, className: 'peta-kelompok', iconSize: [size, size] }),
    keyboard: true,
    zIndexOffset: problems > 0 ? 2000 : 500,
  });
  activate(marker, `${label}. Perbesar peta`, () => expand(clusterId, L.latLng(latitude, longitude), count));
  markers?.addLayer(marker);
}

/** Perbesar ke kelompok; bila titiknya berimpit (tidak bisa dipisah), tampilkan daftarnya. */
function expand(clusterId: number, at: L.LatLng, count: number): void {
  if (!map || !index || !data.value) return;
  const zoom = index.getClusterExpansionZoom(clusterId);
  if (zoom <= MAX_ZOOM) {
    map.setView(at, zoom);
    // Penanda lama hilang saat digambar ulang; fokus keyboard pindah ke peta.
    map.getContainer().focus({ preventScroll: true });
    return;
  }
  const box = document.createElement('div');
  box.className = 'peta-daftar';
  const title = document.createElement('p');
  title.className = 'peta-daftar__judul';
  title.textContent = `${number.format(count)} remote di titik yang sama`;
  const list = document.createElement('ul');
  for (const leaf of index.getLeaves(clusterId, 50)) {
    const point = data.value.points[leaf.properties.index];
    if (!point) continue;
    const [id, code, name, , , open] = point;
    const target = { name: 'remote-detail', params: { id } } as const;
    const link = document.createElement('a');
    link.href = router.resolve(target).href;
    link.textContent = `${code} · ${name}${open > 0 ? ` · ${number.format(open)} NPR berjalan` : ''}`;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      void router.push(target);
    });
    const item = document.createElement('li');
    item.append(link);
    list.append(item);
  }
  box.append(title, list);
  L.popup({ maxWidth: 320 }).setLatLng(at).setContent(box).openOn(map);
}

onMounted(() => {
  if (!element.value) return;
  map = L.map(element.value, {
    minZoom: 3,
    maxZoom: MAX_ZOOM,
    maxBounds: [
      [-18, 88],
      [13, 148],
    ],
    maxBoundsViscosity: 0.8,
    // Pecahan agar seluruh Indonesia pas di layar sempit maupun lebar.
    zoomSnap: 0.25,
  });
  map.attributionControl.setPrefix('Leaflet');
  L.geoJSON(indonesia as Parameters<typeof L.geoJSON>[0], {
    interactive: false,
    style: { className: 'peta-darat', weight: 0.8 },
    attribution: 'Batas wilayah: Natural Earth',
  }).addTo(map);
  map.fitBounds(INDONESIA);
  markers = L.layerGroup().addTo(map);
  map.on('moveend', draw);
  void load(true);
});

onBeforeUnmount(() => {
  request += 1;
  map?.remove();
  map = null;
});

watch(
  () => JSON.stringify(props.query),
  () => void load(true),
);

const refresh = debounced(() => void load(false), 1_000);
useStream({
  onChange: (event) => {
    if (!props.query.tenantId || event.tenantId === props.query.tenantId) refresh.schedule();
  },
  onResync: () => refresh.schedule(),
});
</script>

<template>
  <div class="peta-remote">
    <div class="card-body border-bottom peta-remote__ringkas">
      <p
        class="m-0 me-auto"
        role="status"
      >
        <template v-if="data">
          <strong>{{ number.format(summary.shown) }}</strong> remote {{ activeLabel }} di peta ·
          <strong :class="{ 'text-danger': summary.problems > 0 }">{{ number.format(summary.problems) }}</strong>
          dengan NPR berjalan
        </template>
        <template v-else-if="loading">
          Memuat peta remote…
        </template>
      </p>
      <LiveStatus :data-at="loadedAt" />
    </div>
    <div
      v-if="data && summary.without > 0"
      class="card-body border-bottom py-2 peta-remote__tanpa"
    >
      {{ number.format(summary.without) }} remote {{ activeLabel }} belum punya koordinat, jadi tidak tampil di peta.
      <RouterLink :to="withoutCoordinatesLink">
        Lihat {{ number.format(summary.without) }} remote tanpa koordinat
      </RouterLink>
    </div>
    <div
      v-if="error"
      class="card-body border-bottom text-danger"
      role="alert"
    >
      {{ error }}
    </div>
    <div class="peta-remote__bingkai">
      <div
        ref="peta"
        class="peta-remote__peta"
        role="region"
        aria-label="Peta remote"
        :aria-busy="loading"
      />
      <p
        v-if="data && summary.shown === 0 && !loading"
        class="peta-remote__kosong"
      >
        Tidak ada remote {{ activeLabel }} berkoordinat yang cocok dengan saringan.
      </p>
    </div>
    <ul
      class="card-footer peta-remote__legenda"
      aria-label="Legenda peta"
    >
      <li>
        <span
          class="peta-titik__tanda peta-titik__tanda--masalah"
          aria-hidden="true"
        >2</span>
        Ada NPR berjalan (angka = jumlah NPR)
      </li>
      <li>
        <span
          class="peta-titik__tanda"
          aria-hidden="true"
        />
        Tidak ada NPR berjalan
      </li>
      <li>
        <span
          class="peta-kelompok__isi peta-kelompok__isi--masalah peta-remote__contoh"
          aria-hidden="true"
        >12<span class="peta-kelompok__masalah">3</span></span>
        Kelompok remote; angka merah = remote dengan NPR berjalan. Klik untuk memperbesar.
      </li>
    </ul>
  </div>
</template>

<style scoped>
.peta-remote {
  --peta-laut: #dce7f2;
  --peta-darat: #ffffff;
  --peta-batas: #a9b5c2;
  --peta-masalah: #c42b2b;
  --peta-aman: #7b8794;
  --peta-cincin: #ffffff;
  --peta-kelompok: #ffffff;
  --peta-kelompok-garis: #536173;
  --peta-kelompok-teks: #182433;
}

[data-bs-theme='dark'] .peta-remote {
  --peta-laut: #111b27;
  --peta-darat: #1f2b39;
  --peta-batas: #46566a;
  --peta-masalah: #e05252;
  --peta-aman: #8d99a6;
  --peta-cincin: #111b27;
  --peta-kelompok: #263445;
  --peta-kelompok-garis: #9aa7b5;
  --peta-kelompok-teks: #f1f4f7;
}

.peta-remote__ringkas {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.peta-remote__bingkai {
  position: relative;
}

.peta-remote__peta {
  height: min(62vh, 600px);
  min-height: 380px;
  background: var(--peta-laut);
}

.peta-remote__kosong {
  position: absolute;
  inset: 16px 16px auto;
  z-index: 500;
  margin: 0 auto;
  max-width: 420px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--tblr-bg-surface);
  box-shadow: var(--tblr-shadow-card);
  text-align: center;
}

.peta-remote__legenda {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 0;
  padding-left: var(--tblr-card-cap-padding-x, 16px);
  list-style: none;
  color: var(--tblr-secondary);
}

.peta-remote__legenda li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.peta-remote__contoh {
  position: relative;
  margin-right: 6px;
  width: 32px;
  height: 32px;
  flex: none;
}

/* Elemen di bawah ini dibuat Leaflet di luar templat; karena itu memakai :deep. */
.peta-remote :deep(.leaflet-container) {
  background: var(--peta-laut);
  font: inherit;
}

.peta-remote :deep(.leaflet-bar a),
.peta-remote :deep(.leaflet-bar a:hover) {
  background: var(--tblr-bg-surface);
  color: var(--tblr-body-color);
  border-color: var(--tblr-border-color);
}

.peta-remote :deep(.leaflet-bar a.leaflet-disabled) {
  background: var(--tblr-bg-surface-secondary);
  color: var(--tblr-disabled-color);
}

.peta-remote :deep(.leaflet-control-attribution) {
  background: color-mix(in srgb, var(--tblr-bg-surface) 85%, transparent);
  color: var(--tblr-secondary);
  font-size: 12px;
}

.peta-remote :deep(.leaflet-tooltip),
.peta-remote :deep(.leaflet-popup-content-wrapper),
.peta-remote :deep(.leaflet-popup-tip) {
  background: var(--tblr-bg-surface);
  color: var(--tblr-body-color);
  border-color: var(--tblr-border-color);
  font-size: 13px;
}

.peta-remote :deep(.leaflet-tooltip-top::before) {
  border-top-color: var(--tblr-bg-surface);
}

.peta-remote :deep(.leaflet-popup-close-button) {
  width: 32px;
  height: 32px;
  font-size: 20px;
  line-height: 32px;
}

.peta-remote :deep(.peta-darat) {
  fill: var(--peta-darat);
  fill-opacity: 1;
  stroke: var(--peta-batas);
  stroke-opacity: 1;
}

.peta-remote :deep(.peta-titik),
.peta-remote :deep(.peta-kelompok) {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.peta-remote :deep(.peta-titik:focus-visible),
.peta-remote :deep(.peta-kelompok:focus-visible) {
  outline: 2px solid var(--tblr-primary);
  outline-offset: 2px;
}

.peta-titik__tanda,
.peta-remote :deep(.peta-titik__tanda) {
  display: inline-block;
  width: 10px;
  height: 10px;
  flex: none;
  border: 2px solid var(--peta-cincin);
  border-radius: 50%;
  background: var(--peta-aman);
  box-sizing: content-box;
}

.peta-titik__tanda--masalah,
.peta-remote :deep(.peta-titik__tanda--masalah) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--peta-masalah);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  box-sizing: border-box;
  box-shadow: 0 0 0 2px var(--peta-cincin);
  border: 0;
}

.peta-kelompok__isi,
.peta-remote :deep(.peta-kelompok__isi) {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--peta-kelompok-garis);
  border-radius: 50%;
  background: var(--peta-kelompok);
  color: var(--peta-kelompok-teks);
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 1px 3px rgb(0 0 0 / 25%);
  box-sizing: border-box;
}

.peta-kelompok__isi--masalah,
.peta-remote :deep(.peta-kelompok__isi--masalah) {
  border-color: var(--peta-masalah);
}

.peta-kelompok__masalah,
.peta-remote :deep(.peta-kelompok__masalah) {
  position: absolute;
  top: -8px;
  right: -10px;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--peta-masalah);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
  box-shadow: 0 0 0 2px var(--peta-cincin);
}

.peta-remote :deep(.peta-daftar__judul) {
  margin: 0 0 4px;
  font-weight: 600;
}

.peta-remote :deep(.peta-daftar ul) {
  max-height: 240px;
  margin: 0;
  padding-left: 16px;
  overflow-y: auto;
}

.peta-remote :deep(.peta-daftar a) {
  display: inline-block;
  min-height: 32px;
  line-height: 32px;
}

/* Layar sentuh: tombol perbesar/perkecil 44 px (ATURAN.md §5). */
@media (pointer: coarse) {
  .peta-remote :deep(.leaflet-touch .leaflet-bar a) {
    width: 44px;
    height: 44px;
    line-height: 44px;
  }
}

@media (max-width: 575.98px) {
  .peta-remote__peta {
    height: 55vh;
    min-height: 340px;
  }
}
</style>
