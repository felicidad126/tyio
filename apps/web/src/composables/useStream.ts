import { STREAM_EVENTS, type StreamHello, type TicketChangeEvent } from '@npr/shared';
import { onBeforeUnmount, reactive, readonly } from 'vue';
import { ApiError, apiRequest } from '../api';

// Pembaruan langsung (langkah 2.2, T128–T130): satu sambungan EventSource ke /api/stream per
// tab, dipakai bersama semua komponen yang mendaftar. Pesan di aliran hanya pemberitahuan;
// setiap halaman memuat ulang datanya sendiri lewat API biasa.
// - Tanpa pesan (perubahan atau detak) lebih dari 2,5 × jeda detak = sambungan dianggap putus.
// - Putus: disambung ulang dengan jeda bertambah. Sebelumnya sesi dicek (/auth/me); sesi yang
//   berakhir dibawa ke halaman login oleh penanganan 401 global.
// - Setelah tersambung lagi, semua pendaftar diminta memuat ulang (perubahan selama putus
//   tidak terkirim ulang).

export type StreamStatus = 'menyambung' | 'langsung' | 'terputus';

interface StreamState {
  status: StreamStatus;
  /** Waktu pesan terakhir dari server (ms epoch). */
  lastMessageAt: number | null;
  /** Sejak kapan terputus (ms epoch). */
  disconnectedAt: number | null;
}

type ChangeHandler = (event: TicketChangeEvent) => void;
type ResyncHandler = () => void;

const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

const state = reactive<StreamState>({ status: 'menyambung', lastMessageAt: null, disconnectedAt: null });
const changeHandlers = new Set<ChangeHandler>();
const resyncHandlers = new Set<ResyncHandler>();
let subscribers = 0;
let source: EventSource | null = null;
let heartbeatMs = 15_000;
let watchdog: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let failures = 0;
let connectedBefore = false;

function connect(): void {
  clearTimeout(retryTimer);
  retryTimer = undefined;
  const stream = new EventSource('/api/stream');
  source = stream;
  stream.addEventListener(STREAM_EVENTS.hello, (message) => {
    const hello = parse<StreamHello>(message);
    if (hello?.heartbeatMs) heartbeatMs = hello.heartbeatMs;
    const reconnected = connectedBefore;
    connectedBefore = true;
    failures = 0;
    state.status = 'langsung';
    state.disconnectedAt = null;
    received();
    if (reconnected) resync();
  });
  stream.addEventListener(STREAM_EVENTS.ticket, (message) => {
    received();
    const event = parse<TicketChangeEvent>(message);
    if (event) for (const handler of [...changeHandlers]) handler(event);
  });
  stream.addEventListener(STREAM_EVENTS.beat, received);
  stream.addEventListener(STREAM_EVENTS.resync, () => {
    received();
    resync();
  });
  // EventSource menyambung ulang sendiri tanpa jeda yang bisa diatur dan berhenti pada 401;
  // sambung ulang diatur di sini.
  stream.onerror = () => lost(stream);
}

function parse<T>(message: Event): T | null {
  try {
    return JSON.parse((message as MessageEvent<string>).data) as T;
  } catch {
    return null;
  }
}

function received(): void {
  state.lastMessageAt = Date.now();
  clearTimeout(watchdog);
  const stream = source;
  watchdog = setTimeout(() => {
    if (stream) lost(stream);
  }, heartbeatMs * 2.5);
}

function resync(): void {
  for (const handler of [...resyncHandlers]) handler();
}

function lost(stream: EventSource): void {
  if (source !== stream) return;
  stream.close();
  source = null;
  clearTimeout(watchdog);
  if (state.status !== 'terputus') {
    state.status = 'terputus';
    state.disconnectedAt = Date.now();
  }
  if (subscribers === 0 || retryTimer) return;
  const delay = RETRY_MS[Math.min(failures, RETRY_MS.length - 1)] ?? 30_000;
  failures += 1;
  retryTimer = setTimeout(() => void reconnect(), delay);
}

async function reconnect(): Promise<void> {
  try {
    await apiRequest('GET', '/auth/me');
  } catch (error) {
    // 401: penanganan global membawa ke halaman login; tidak perlu menyambung lagi.
    if (error instanceof ApiError && error.status === 401) {
      retryTimer = undefined;
      return;
    }
  }
  retryTimer = undefined;
  if (subscribers > 0 && !source) connect();
}

function release(): void {
  subscribers -= 1;
  if (subscribers > 0) return;
  clearTimeout(watchdog);
  clearTimeout(retryTimer);
  retryTimer = undefined;
  source?.close();
  source = null;
  connectedBefore = false;
  failures = 0;
  Object.assign(state, { status: 'menyambung', lastMessageAt: null, disconnectedAt: null });
}

/**
 * Mendaftar ke aliran selama komponen terpasang. `onChange` dipanggil untuk setiap entri
 * linimasa baru di NPR dalam cakupan pengguna; `onResync` setelah sambungan pulih atau bila
 * server meminta (mungkin ada perubahan yang terlewat).
 */
export function useStream(handlers: { onChange?: ChangeHandler; onResync?: ResyncHandler } = {}) {
  subscribers += 1;
  if (handlers.onChange) changeHandlers.add(handlers.onChange);
  if (handlers.onResync) resyncHandlers.add(handlers.onResync);
  if (!source && !retryTimer) connect();
  onBeforeUnmount(() => {
    if (handlers.onChange) changeHandlers.delete(handlers.onChange);
    if (handlers.onResync) resyncHandlers.delete(handlers.onResync);
    release();
  });
  return { state: readonly(state) };
}

/** Penjadwal muat ulang: beberapa perubahan berdekatan menjadi satu permintaan. */
export function debounced(run: () => void, waitMs: number): { schedule: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  onBeforeUnmount(() => clearTimeout(timer));
  return {
    schedule: () => {
      clearTimeout(timer);
      timer = setTimeout(run, waitMs);
    },
    cancel: () => clearTimeout(timer),
  };
}
