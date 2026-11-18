<script setup lang="ts">
import { MAP_STATE_LABELS, MAP_STATES, type MapRemote, type MapResponse, type MapState } from '@tyio/shared';
import type { CircleMarker, Map as LeafletMap, Marker, MarkerCluster, MarkerClusterGroup } from 'leaflet';
import { computed, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '../../../api/client';
import { mapApi } from '../../../api/map';
import DataReceived from '../../../components/DataReceived.vue';
import { useLiveNotices } from '../../../stores/live';
import { type Leaflet, loadLeaflet } from './leaflet';
import { INDONESIA_BOUNDS, MAP_STATE_COLORS, worstState } from './map-display';

// Peta remote (2.3): satu titik per remote, berwarna kondisi (NPR aktif, pending, normal,
// nonaktif); titik yang berdekatan dikelompokkan dan kelompoknya berwarna kondisi terparah.
// Keterangan di luar peta memuat label, jumlah, dan saringan per kondisi. Diperbarui saat ada
// kabar perubahan tiket (2.2). Di layar dinding: tanpa popup dan tanpa saringan.
const props = withDefaults(defineProps<{ height?: string; interactive?: boolean }>(), {
  height: '420px',
  interactive: true,
});

const router = useRouter();
const container = useTemplateRef<HTMLDivElement>('container');
const data = ref<MapResponse | null>(null);
const receivedAt = ref<Date | null>(null);
const loadError = ref('');
const shown = reactive<Record<MapState, boolean>>({ gangguan: true, pending: true, normal: true, nonaktif: true });

const counts = computed(() => {
  const result: Record<MapState, number> = { gangguan: 0, pending: 0, normal: 0, nonaktif: 0 };
  for (const r of data.value?.remotes ?? []) result[r.state] += 1;
  return result;
});

let L: Leaflet | undefined;
let map: LeafletMap | undefined;
let cluster: MarkerClusterGroup | undefined;
const markers = new Map<string, { marker: CircleMarker; remote: MapRemote }>();
let fitted = false;
let disposed = false;

function markerStyle(state: MapState) {
  return { radius: 8, color: '#ffffff', weight: 2, fillColor: MAP_STATE_COLORS[state], fillOpacity: 1 };
}

/** Isi popup dengan DOM (nama remote berasal dari data, bukan HTML). */
function popupContent(remote: MapRemote): HTMLElement {
  const root = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = remote.name;
  const detail = document.createElement('div');
  detail.className = 'text-secondary small';
  detail.textContent = `${remote.siteId} · ${remote.city} · ${remote.tenant}`;
  const state = document.createElement('div');
  state.className = 'mt-1';
  state.textContent =
    remote.activeTickets > 0
      ? `${MAP_STATE_LABELS[remote.state]} · ${remote.activeTickets} NPR aktif`
      : MAP_STATE_LABELS[remote.state];
  const link = document.createElement('a');
  link.href = `/remote/${remote.id}`;
  link.className = 'd-inline-block mt-2 py-1';
  link.textContent = 'Buka remote';
  link.addEventListener('click', (event) => {
    event.preventDefault();
    void router.push({ name: 'remote-detail', params: { id: remote.id } });
  });
  root.append(title, detail, state, link);
  return root;
}

function createMarker(remote: MapRemote): CircleMarker {
  const marker = L!.circleMarker([remote.lat, remote.lng], { ...markerStyle(remote.state), state: remote.state } as never);
  marker.bindTooltip(`${remote.siteId} · ${remote.name}`);
  if (props.interactive) marker.bindPopup(() => popupContent(markers.get(remote.id)?.remote ?? remote));
  return marker;
}

/** Menyelaraskan titik dengan data baru: tambah, ubah warna, hapus, dan saringan kondisi. */
function sync(remotes: MapRemote[]): void {
  if (!L || !cluster) return;
  const incoming = new Set(remotes.map((r) => r.id));
  const remove: CircleMarker[] = [];
  for (const [id, entry] of markers) {
    if (!incoming.has(id)) {
      remove.push(entry.marker);
      markers.delete(id);
    }
  }
  const add: CircleMarker[] = [];
  const changed: CircleMarker[] = [];
  for (const remote of remotes) {
    const entry = markers.get(remote.id);
    if (!entry) {
      const marker = createMarker(remote);
      markers.set(remote.id, { marker, remote });
      if (shown[remote.state]) add.push(marker);
      continue;
    }
    const before = entry.remote;
    entry.remote = remote;
    if (before.state !== remote.state) {
      (entry.marker.options as { state?: MapState }).state = remote.state;
      entry.marker.setStyle(markerStyle(remote.state));
      changed.push(entry.marker);
    }
    if (before.lat !== remote.lat || before.lng !== remote.lng) entry.marker.setLatLng([remote.lat, remote.lng]);
    const visible = cluster.hasLayer(entry.marker);
    if (shown[remote.state] && !visible) add.push(entry.marker);
    if (!shown[remote.state] && visible) remove.push(entry.marker);
  }
  if (remove.length) cluster.removeLayers(remove);
  if (add.length) cluster.addLayers(add);
  // Tipe plugin hanya menyebut Marker; CircleMarker juga didukung (punya getLatLng).
  if (changed.length) cluster.refreshClusters(changed as unknown as Marker[]);
}

function toggle(state: MapState): void {
  shown[state] = !shown[state];
  if (data.value) sync(data.value.remotes);
}

async function load(): Promise<void> {
  try {
    const response = await mapApi.get();
    if (disposed) return;
    data.value = response;
    receivedAt.value = new Date();
    loadError.value = '';
    sync(response.remotes);
    if (!fitted && map && response.remotes.length > 0) {
      fitted = true;
      map.fitBounds(L!.latLngBounds(response.remotes.map((r) => [r.lat, r.lng])), { padding: [24, 24], maxZoom: 9 });
    }
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : 'Peta gagal dimuat.';
  }
}

/** Kabar perubahan tiket: cukup kondisi terkini (kecil), bukan seluruh data peta. */
async function refreshStates(): Promise<void> {
  const current = data.value;
  if (!current) return;
  try {
    const { states } = await mapApi.states();
    if (disposed || data.value !== current) return;
    const byId = new Map(states.map((s) => [s.id, s]));
    const remotes = current.remotes.map((r) => {
      const s = byId.get(r.id);
      const state: MapState = s?.state ?? 'normal';
      const activeTickets = s?.activeTickets ?? 0;
      return state === r.state && activeTickets === r.activeTickets ? r : { ...r, state, activeTickets };
    });
    data.value = { ...current, remotes };
    receivedAt.value = new Date();
    loadError.value = '';
    sync(remotes);
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : 'Peta gagal diperbarui.';
  }
}

// Kabar perubahan → kondisi terkini; setelah putus (resync) dan tiap 10 menit → data lengkap
// (remote baru atau koordinat yang berubah).
useLiveNotices((notice) => void (notice.type === 'resync' ? load() : refreshStates()));
const FULL_RELOAD_MS = 10 * 60 * 1000;
let fullReload: ReturnType<typeof setInterval> | undefined;

onMounted(async () => {
  fullReload = setInterval(() => void load(), FULL_RELOAD_MS);
  L = await loadLeaflet();
  if (disposed || !container.value) return;
  const first = await mapApi.get().catch(() => null);
  if (disposed || !container.value) return;
  map = L.map(container.value, {
    zoomControl: props.interactive,
    attributionControl: true,
    scrollWheelZoom: props.interactive,
    dragging: props.interactive,
    doubleClickZoom: props.interactive,
    keyboard: props.interactive,
  });
  map.attributionControl.setPrefix('Leaflet');
  map.fitBounds(INDONESIA_BOUNDS);
  L.tileLayer(first?.tiles.url ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: first?.tiles.attribution ?? '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map);
  cluster = L.markerClusterGroup({
    chunkedLoading: true,
    showCoverageOnHover: false,
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: props.interactive,
    zoomToBoundsOnClick: props.interactive,
    iconCreateFunction: (group: MarkerCluster) => {
      const children = group.getAllChildMarkers();
      const state = worstState(children.map((m) => (m.options as { state?: MapState }).state ?? 'nonaktif'));
      const count = group.getChildCount();
      const size = count < 10 ? 34 : count < 100 ? 42 : 50;
      return L!.divIcon({
        html: `<span>${count}</span>`,
        className: `map-cluster map-cluster-${state}`,
        iconSize: [size, size],
      });
    },
  });
  map.addLayer(cluster);
  if (first) {
    data.value = first;
    receivedAt.value = new Date();
    sync(first.remotes);
    if (first.remotes.length > 0) {
      fitted = true;
      map.fitBounds(L.latLngBounds(first.remotes.map((r) => [r.lat, r.lng])), { padding: [24, 24], maxZoom: 9 });
    }
  } else {
    void load();
  }
});

onBeforeUnmount(() => {
  disposed = true;
  clearInterval(fullReload);
  map?.remove();
  markers.clear();
});
</script>

<template>
  <div class="remote-map">
    <div
      class="map-legend d-flex flex-wrap align-items-center gap-2 mb-2"
      :aria-label="interactive ? 'Keterangan dan saringan peta' : 'Keterangan peta'"
      role="group"
    >
      <template v-if="interactive">
        <label
          v-for="state in MAP_STATES"
          :key="state"
          class="legend-item form-check mb-0"
        >
          <input
            class="form-check-input"
            type="checkbox"
            :checked="shown[state]"
            @change="toggle(state)"
          >
          <span
            class="legend-dot"
            :style="{ background: MAP_STATE_COLORS[state] }"
            aria-hidden="true"
          />
          <span>{{ MAP_STATE_LABELS[state] }}</span>
          <span
            class="badge bg-secondary-lt"
            :data-testid="`peta-jumlah-${state}`"
          >{{ counts[state].toLocaleString('id-ID') }}</span>
        </label>
      </template>
      <template v-else>
        <span
          v-for="state in MAP_STATES"
          :key="state"
          class="legend-item"
        >
          <span
            class="legend-dot"
            :style="{ background: MAP_STATE_COLORS[state] }"
            aria-hidden="true"
          />
          <span>{{ MAP_STATE_LABELS[state] }}</span>
          <strong>{{ counts[state].toLocaleString('id-ID') }}</strong>
        </span>
      </template>
      <span class="ms-auto d-flex flex-wrap align-items-center gap-2">
        <span
          v-if="data && data.withoutCoordinates > 0"
          class="text-secondary small"
        >{{ data.withoutCoordinates.toLocaleString('id-ID') }} remote tanpa koordinat tidak tampil</span>
        <DataReceived :at="receivedAt" />
      </span>
    </div>
    <p
      v-if="loadError"
      class="text-danger small mb-2"
      role="alert"
    >
      {{ loadError }}
    </p>
    <div
      ref="container"
      class="map-canvas"
      :style="{ height }"
      role="region"
      aria-label="Area peta"
      data-testid="peta-remote"
    />
  </div>
</template>

<style scoped>
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  min-height: 44px;
  padding-left: 0;
  margin-right: 0.5em;
}
.legend-item .form-check-input {
  float: none;
  margin: 0;
}
.legend-dot {
  display: inline-block;
  width: 0.85em;
  height: 0.85em;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--tblr-bg-surface);
}
.map-canvas {
  width: 100%;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--tblr-border-color);
  background: var(--tblr-bg-surface-secondary);
}
:deep(.map-cluster) {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid #fff;
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  box-shadow: 0 1px 4px rgb(0 0 0 / 35%);
}
:deep(.map-cluster-gangguan) {
  background: #d03b3b;
}
:deep(.map-cluster-pending) {
  background: #fab219;
  color: #0b0b0b;
}
:deep(.map-cluster-normal) {
  background: #0ca30c;
}
:deep(.map-cluster-nonaktif) {
  background: #8a8a86;
}
</style>

<style>
/* Tidak scoped: `:global(...)` di blok scoped memasang aturan ini di <html> (seluruh halaman
   ikut terbalik warnanya). Peta dasar dibuat gelap di tema gelap; titik tetap berwarna asli. */
[data-bs-theme='dark'] .remote-map .leaflet-tile-pane {
  filter: invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9);
}
</style>
