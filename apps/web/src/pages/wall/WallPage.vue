<script setup lang="ts">
import { IconAlertTriangle, IconBellRinging } from '@tabler/icons-vue';
import {
  APP_NAME,
  type OverviewResponse,
  TICKET_FLAG_DAYS,
  TICKET_STATUS_LABELS,
  type TicketListItem,
} from '@tyio/shared';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError } from '../../api/client';
import { overviewApi } from '../../api/overview';
import { ticketsApi } from '../../api/tickets';
import DataReceived from '../../components/DataReceived.vue';
import LiveStatus from '../../components/LiveStatus.vue';
import { useLiveNotices, useLiveStore } from '../../stores/live';
import { formatDuration, TICKET_STATUS_BADGE } from '../tickets/detail/ticket-display';
import RemoteMap from '../overview/map/RemoteMap.vue';
import RankedBars from '../overview/RankedBars.vue';
import TrendChart from '../overview/TrendChart.vue';
import { Chime } from './chime';

// Pola halaman: layar dinding 24/7 (2.4). Tanpa interaksi: angka utama selalu tampil, panel
// berganti sendiri, NPR baru memunculkan peringatan besar dan bunyi. Pulih sendiri setelah
// jaringan putus (pembaruan langsung + muat ulang tiap menit); tidak keluar sesi selama sesi
// masih berlaku (setiap muat ulang memperpanjangnya). Satu klik (opsional) untuk layar penuh
// dan izin bunyi; di mode kios Chrome bunyi aktif tanpa klik.
const QUEUE_SIZE = 8;
const ALERT_MS = 90_000;
const REFRESH_MS = 60_000;
const PANELS = [
  { key: 'antrean', title: 'NPR aktif terbaru', short: 'Antrean' },
  { key: 'peta', title: 'Peta remote', short: 'Peta' },
  { key: 'tren', title: 'NPR baru dan Selesai per hari', short: 'Tren' },
  { key: 'sebaran', title: 'Tiket aktif per kategori dan customer', short: 'Sebaran' },
  { key: 'remote', title: 'Remote paling sering bermasalah', short: 'Remote teratas' },
] as const;

const route = useRoute();
const live = useLiveStore();
const startedAt = Date.now();
const { status: liveStatus, lastReceivedAt } = storeToRefs(live);

/** Detik per panel; `?putar=` 2–300 (bawaan 20). */
const rotateSeconds = computed(() => {
  const value = Number(route.query.putar);
  return Number.isInteger(value) && value >= 2 && value <= 300 ? value : 20;
});

const overview = ref<OverviewResponse | null>(null);
const queue = ref<TicketListItem[]>([]);
const receivedAt = ref<Date | null>(null);
const loadError = ref('');

function toLogin(): void {
  live.stop();
  window.location.assign(`/login?next=${encodeURIComponent(route.fullPath)}`);
}

/** NPR yang sudah pernah tampil di antrean (agar hanya yang benar-benar baru diumumkan). */
const seen = new Set<string>();
let baseline = false;

async function load(): Promise<void> {
  try {
    const [o, list] = await Promise.all([overviewApi.get(), ticketsApi.list({ page: 1 })]);
    overview.value = o;
    queue.value = list.items.slice(0, QUEUE_SIZE);
    receivedAt.value = new Date();
    loadError.value = '';
    // NPR baru yang kabarnya terlewat (mis. dibuat tepat saat jaringan putus) tetap diumumkan
    // saat antrean dimuat ulang: yang baru masuk antrean dan dicatat setelah layar dibuka. NPR
    // dengan waktu kejadian mundur (di luar antrean) diumumkan lewat kabar langsung saja.
    for (const t of queue.value) {
      if (baseline && !seen.has(t.id) && Date.parse(t.createdAt) >= startedAt) void announce(t.id);
      seen.add(t.id);
    }
    baseline = true;
    if (seen.size > 5000) seen.clear();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) toLogin();
    else loadError.value = error instanceof ApiError ? error.message : 'Data gagal dimuat.';
  }
}

// Panel berganti; peringatan NPR baru menahan panel antrean satu putaran penuh.
const panel = ref(0);
const current = computed(() => PANELS[panel.value]!);
let rotateTimer: ReturnType<typeof setInterval> | undefined;
const rotationKey = ref(0);
function restartRotation(): void {
  clearInterval(rotateTimer);
  rotationKey.value += 1;
  rotateTimer = setInterval(() => {
    panel.value = (panel.value + 1) % PANELS.length;
    rotationKey.value += 1;
  }, rotateSeconds.value * 1000);
}
watch(rotateSeconds, restartRotation);

// Peringatan NPR baru: paling banyak tiga, masing-masing tampil 90 detik.
interface WallAlert {
  id: string;
  number: string;
  remote: string;
  siteId: string;
  tenant: string;
  problem: string;
  at: Date;
}
const alerts = ref<WallAlert[]>([]);
const chime = new Chime();
const soundReady = ref(chime.ready);
/** Jumlah bunyi yang benar-benar dimainkan (untuk uji dan pemeriksaan di lokasi). */
const chimes = ref(0);

const announced = new Set<string>();
async function announce(ticketId: string): Promise<void> {
  // Sekali per NPR, baik dari kabar langsung maupun dari antrean yang dimuat ulang.
  if (announced.has(ticketId)) return;
  announced.add(ticketId);
  if (announced.size > 1000) announced.clear();
  try {
    const t = await ticketsApi.get(ticketId);
    alerts.value = [
      {
        id: t.id,
        number: t.number,
        remote: t.remote.name,
        siteId: t.remote.siteId,
        tenant: t.tenant.name,
        problem: t.problem,
        at: new Date(),
      },
      ...alerts.value,
    ].slice(0, 3);
    setTimeout(() => (alerts.value = alerts.value.filter((a) => a.id !== t.id)), ALERT_MS);
    if (chime.play()) chimes.value += 1;
    panel.value = 0;
    restartRotation();
  } catch {
    // Tiket tidak terbaca (mis. sudah tidak boleh dilihat): cukup muat ulang angka.
  }
}

useLiveNotices((notice) => {
  void load();
  if (notice.type !== 'changes') return;
  for (const change of notice.changes) {
    if (change.kind === 'tickets' && change.op === 'insert') void announce(change.ticketId);
  }
});

// Jam dinding, detik demi detik (WIB).
const CLOCK = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
});
const DATE = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' });
const now = ref(new Date());
const clock = computed(() => `${CLOCK.format(now.value).replace(/:/g, '.')} WIB`);
const today = computed(() => DATE.format(now.value));
const offlineSince = computed(() =>
  lastReceivedAt.value ? `${CLOCK.format(lastReceivedAt.value).replace(/:/g, '.')} WIB` : '',
);

// Layar tidak tidur (Wake Lock), layar penuh dan bunyi setelah klik pertama.
let wakeLock: WakeLockSentinel | null = null;
async function keepAwake(): Promise<void> {
  try {
    if (document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {
    // Tidak didukung atau ditolak: atur juga "jangan tidur" di sistem operasi (panduan).
  }
}
async function onInteract(): Promise<void> {
  soundReady.value = await chime.unlock();
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.().catch(() => undefined);
  void keepAwake();
}
function onVisibility(): void {
  if (document.visibilityState === 'visible') {
    void keepAwake();
    void load();
  }
}

// Layar dinding selalu bertema gelap (silau lebih rendah di ruang NOC); tema pengguna dikembalikan
// saat keluar dari halaman ini.
const html = document.documentElement;
const previousTheme = html.getAttribute('data-bs-theme');

/** Umur tiket untuk layar dinding: "baru saja" untuk di bawah semenit. */
function age(occurredAt: string): string {
  const text = formatDuration(occurredAt, now.value.toISOString());
  return text === 'kurang dari 1 menit' ? 'baru saja' : text;
}

// Grafik tren mengikuti tinggi layar.
const viewportHeight = ref(window.innerHeight);
const chartHeight = computed(() => Math.max(200, Math.round(viewportHeight.value * 0.4)));
function onResize(): void {
  viewportHeight.value = window.innerHeight;
}

let clockTimer: ReturnType<typeof setInterval> | undefined;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  html.setAttribute('data-bs-theme', 'dark');
  live.start();
  void load();
  restartRotation();
  void keepAwake();
  clockTimer = setInterval(() => {
    now.value = new Date();
    // Sekali sehari (03.00 WIB) halaman dimuat ulang untuk membersihkan memori browser.
    const wib = CLOCK.format(now.value);
    if (wib.startsWith('03.00.0') && Date.now() - startedAt > 60 * 60 * 1000) window.location.reload();
  }, 1000);
  refreshTimer = setInterval(() => void load(), REFRESH_MS);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => {
  if (previousTheme) html.setAttribute('data-bs-theme', previousTheme);
  else html.removeAttribute('data-bs-theme');
  live.stop();
  clearInterval(rotateTimer);
  clearInterval(clockTimer);
  clearInterval(refreshTimer);
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('resize', onResize);
  void wakeLock?.release().catch(() => undefined);
  chime.close();
});

const kpis = computed(() => {
  const a = overview.value?.active;
  if (!a) return [];
  return [
    { key: 'terbuka', label: TICKET_STATUS_LABELS.terbuka, value: a.byStatus.terbuka, badge: TICKET_STATUS_BADGE.terbuka },
    { key: 'dikerjakan', label: TICKET_STATUS_LABELS.dikerjakan, value: a.byStatus.dikerjakan, badge: TICKET_STATUS_BADGE.dikerjakan },
    { key: 'pending', label: TICKET_STATUS_LABELS.pending, value: a.byStatus.pending, badge: TICKET_STATUS_BADGE.pending },
    { key: 'eskalasi', label: TICKET_STATUS_LABELS.eskalasi, value: a.byStatus.eskalasi, badge: TICKET_STATUS_BADGE.eskalasi },
    { key: 'tt', label: 'TT aktif', value: a.tt, badge: 'badge bg-azure-lt' },
    { key: 'lama', label: `Down ≥ ${TICKET_FLAG_DAYS} hari`, value: a.flagged, badge: 'badge bg-danger text-white' },
  ];
});
const categoryBars = computed(() =>
  (overview.value?.byCategory ?? []).map((c) => ({ key: c.category.id, label: c.category.name, count: c.count, to: '' })),
);
const customerBars = computed(() =>
  (overview.value?.byCustomer ?? []).map((c) => ({ key: c.tenant.id, label: c.tenant.name, count: c.count, to: '' })),
);
</script>

<template>
  <div
    class="wall"
    :data-bunyi="chimes"
    @pointerdown="onInteract"
  >
    <header class="wall-top">
      <div class="wall-brand">
        <img
          src="/favicon.svg"
          alt=""
          width="40"
          height="40"
        >
        {{ APP_NAME }}
      </div>
      <div class="wall-time">
        <div
          class="wall-clock"
          data-testid="jam-dinding"
        >
          {{ clock }}
        </div>
        <div class="wall-date">
          {{ today }}
        </div>
      </div>
      <div class="wall-meta">
        <LiveStatus />
        <DataReceived :at="receivedAt" />
      </div>
    </header>

    <div
      v-if="liveStatus === 'offline' || loadError"
      class="wall-offline"
      role="alert"
      data-testid="dinding-terputus"
    >
      <IconAlertTriangle
        :size="48"
        aria-hidden="true"
      />
      <span>
        Koneksi terputus<template v-if="offlineSince"> sejak {{ offlineSince }}</template>. Data di layar mungkin
        tidak terbaru; menyambung ulang otomatis.
      </span>
    </div>

    <section
      v-if="alerts.length > 0"
      class="wall-alerts"
      aria-label="NPR baru"
      aria-live="assertive"
    >
      <article
        v-for="alert in alerts"
        :key="alert.id"
        class="wall-alert"
        data-testid="peringatan-npr-baru"
      >
        <IconBellRinging
          :size="56"
          aria-hidden="true"
        />
        <div class="wall-alert-body">
          <div class="wall-alert-title">
            NPR baru · {{ alert.remote }} ({{ alert.siteId }})
          </div>
          <div class="wall-alert-detail">
            {{ alert.tenant }} · {{ alert.number }} · {{ alert.problem }}
          </div>
        </div>
      </article>
    </section>

    <section
      class="wall-kpis"
      aria-label="Tiket aktif"
    >
      <div class="wall-kpi wall-kpi-total">
        <div class="wall-kpi-label">
          Tiket aktif
        </div>
        <div
          class="wall-kpi-value"
          data-testid="dinding-aktif"
        >
          {{ overview?.active.total.toLocaleString('id-ID') ?? '–' }}
        </div>
      </div>
      <div
        v-for="kpi in kpis"
        :key="kpi.key"
        class="wall-kpi"
      >
        <div class="wall-kpi-label">
          <span :class="kpi.badge">{{ kpi.label }}</span>
        </div>
        <div class="wall-kpi-value">
          {{ kpi.value.toLocaleString('id-ID') }}
        </div>
      </div>
    </section>

    <main
      class="wall-panel"
      :aria-label="current.title"
    >
      <h1 class="wall-panel-title">
        {{ current.title }}
      </h1>
      <div
        v-if="!overview"
        class="wall-empty"
      >
        Memuat…
      </div>

      <template v-else-if="current.key === 'antrean'">
        <p
          v-if="queue.length === 0"
          class="wall-empty"
        >
          Tidak ada tiket aktif.
        </p>
        <ol
          v-else
          class="wall-queue"
        >
          <li
            v-for="t in queue"
            :key="t.id"
            class="wall-queue-row"
          >
            <span class="wall-queue-remote">
              {{ t.remote.name }}
              <span class="wall-muted">{{ t.remote.siteId }} · {{ t.tenant.name }}</span>
            </span>
            <span class="wall-queue-number">{{ t.number }}</span>
            <span><span :class="TICKET_STATUS_BADGE[t.status]">{{ TICKET_STATUS_LABELS[t.status] }}</span></span>
            <span class="wall-queue-age">{{ age(t.occurredAt) }}</span>
          </li>
        </ol>
      </template>

      <RemoteMap
        v-else-if="current.key === 'peta'"
        :height="`${chartHeight + 60}px`"
        :interactive="false"
      />

      <TrendChart
        v-else-if="current.key === 'tren'"
        :trend="overview.trend"
        :height="chartHeight"
        :table="false"
        :links="false"
      />

      <div
        v-else-if="current.key === 'sebaran'"
        class="wall-split"
      >
        <div>
          <h2 class="wall-subtitle">
            Per kategori
          </h2>
          <RankedBars
            :items="categoryBars"
            unit="tiket aktif"
            empty="Tidak ada tiket aktif."
            :links="false"
          />
        </div>
        <div>
          <h2 class="wall-subtitle">
            Per customer
          </h2>
          <RankedBars
            :items="customerBars"
            unit="tiket aktif"
            empty="Tidak ada tiket aktif."
            :links="false"
          />
        </div>
      </div>

      <ol
        v-else
        class="wall-queue"
      >
        <li
          v-for="item in overview.topRemotes.items.slice(0, QUEUE_SIZE)"
          :key="item.remote.id"
          class="wall-queue-row wall-top-row"
        >
          <span class="wall-queue-remote">
            {{ item.remote.name }}
            <span class="wall-muted">{{ item.remote.siteId }} · {{ item.remote.city }} · {{ item.tenant.name }}</span>
          </span>
          <span class="wall-queue-age">{{ item.count.toLocaleString('id-ID') }} NPR / 30 hari</span>
        </li>
      </ol>
    </main>

    <footer
      class="wall-footer"
      aria-hidden="true"
    >
      <span
        v-for="(p, index) in PANELS"
        :key="p.key"
        class="wall-dot"
        :class="{ active: index === panel }"
      >{{ p.short }}</span>
      <span
        :key="rotationKey"
        class="wall-progress"
        :style="{ animationDuration: `${rotateSeconds}s` }"
      />
      <span
        v-if="!soundReady"
        class="wall-hint"
      >Klik sekali di layar untuk layar penuh dan bunyi.</span>
    </footer>
  </div>
</template>

<style scoped>
/* Dirancang untuk 1920×1080 dan terbaca dari jauh; ukuran mengikuti lebar layar. */
.wall {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 1vh;
  padding: 1.5vh 2vw;
  overflow: hidden;
  font-size: clamp(14px, 1.25vw, 32px);
  color: var(--tblr-body-color);
  background: var(--tblr-body-bg);
}
.wall-top {
  display: flex;
  align-items: center;
  gap: 2vw;
}
.wall-brand {
  display: flex;
  align-items: center;
  gap: 0.5em;
  font-size: 1.2em;
  font-weight: 600;
  flex: 1;
  min-width: 0;
}
.wall-time {
  text-align: center;
}
.wall-clock {
  font-size: 2.4em;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.wall-date {
  color: var(--tblr-secondary);
}
.wall-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25em;
}
.wall-meta :deep(.small) {
  font-size: 0.8em;
}
.wall-offline {
  display: flex;
  align-items: center;
  gap: 0.75em;
  padding: 0.6em 1em;
  border-radius: 8px;
  background: var(--tblr-danger);
  color: #fff;
  font-size: 1.3em;
  font-weight: 600;
}
.wall-alerts {
  display: grid;
  gap: 0.5em;
}
.wall-alert {
  display: flex;
  align-items: center;
  gap: 0.75em;
  padding: 0.6em 1em;
  border-radius: 8px;
  background: var(--tblr-warning);
  color: #1d1d1d;
  animation: wall-alert-in 0.4s ease-out;
}
.wall-alert-title {
  font-size: 1.5em;
  font-weight: 700;
}
.wall-alert-detail {
  font-size: 1em;
}
@keyframes wall-alert-in {
  from {
    transform: translateY(-0.5em);
    opacity: 0;
  }
}
.wall-kpis {
  display: grid;
  grid-template-columns: 1.4fr repeat(6, 1fr);
  gap: 0.75em;
}
.wall-kpi {
  padding: 0.6em 0.8em;
  border: 1px solid var(--tblr-border-color);
  border-radius: 8px;
  background: var(--tblr-bg-surface);
}
.wall-kpi-label {
  font-size: 0.9em;
  color: var(--tblr-secondary);
}
.wall-kpi-label .badge {
  font-size: 0.85em;
}
.wall-kpi-value {
  font-size: 3em;
  font-weight: 600;
  line-height: 1.1;
}
.wall-kpi-total .wall-kpi-value {
  font-size: 3.6em;
}
.wall-panel {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0.8em 1em;
  border: 1px solid var(--tblr-border-color);
  border-radius: 8px;
  background: var(--tblr-bg-surface);
}
.wall-panel-title {
  font-size: 1.5em;
  margin-bottom: 0.6em;
}
.wall-subtitle {
  font-size: 1.1em;
  color: var(--tblr-secondary);
}
.wall-empty {
  font-size: 1.3em;
  color: var(--tblr-secondary);
}
.wall-queue {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 1.15em;
}
.wall-queue-row {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr) auto 7em;
  align-items: center;
  gap: 1em;
  padding: 0.35em 0;
  border-bottom: 1px solid var(--tblr-border-color);
}
.wall-top-row {
  grid-template-columns: minmax(0, 1fr) auto;
}
.wall-queue-remote {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 600;
}
.wall-muted {
  margin-left: 0.5em;
  font-weight: 400;
  color: var(--tblr-secondary);
}
.wall-queue-number {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: var(--tblr-font-monospace);
  font-size: 0.8em;
  color: var(--tblr-secondary);
}
.wall-queue-row .badge {
  font-size: 0.8em;
}
.wall-queue-age {
  text-align: end;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.wall-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3em;
  font-size: 1.15em;
}
.wall-footer {
  position: relative;
  display: flex;
  gap: 1.5em;
  padding-top: 0.4em;
  font-size: 0.85em;
  color: var(--tblr-secondary);
}
.wall-dot.active {
  color: var(--tblr-body-color);
  font-weight: 600;
}
.wall-progress {
  position: absolute;
  top: 0;
  left: 0;
  height: 3px;
  background: var(--tblr-primary);
  animation: wall-progress linear forwards;
}
@keyframes wall-progress {
  from {
    width: 0;
  }
  to {
    width: 100%;
  }
}
.wall-footer {
  white-space: nowrap;
}
.wall-hint {
  margin-left: auto;
  color: var(--tblr-body-color);
}
@media (prefers-reduced-motion: reduce) {
  .wall-alert,
  .wall-progress {
    animation: none;
  }
}
</style>
