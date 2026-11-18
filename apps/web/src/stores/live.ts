import { API_PREFIX, type StreamChange, type StreamReady } from '@tyio/shared';
import { defineStore } from 'pinia';
import { getCurrentInstance, onBeforeUnmount, ref } from 'vue';
import { authApi } from '../api/auth';
import { useAuthStore } from './auth';

export type LiveStatus = 'idle' | 'connecting' | 'live' | 'offline';
/** Kabar ke halaman: tiket yang berubah, atau `resync` bila ada kabar yang mungkin terlewat. */
export type LiveNotice = { type: 'changes'; changes: StreamChange[] } | { type: 'resync' };

const FLUSH_MS = 400;
const MAX_RETRY_MS = 15_000;

/**
 * Pembaruan langsung (2.2): satu koneksi `/api/stream` per tab untuk seluruh aplikasi.
 * - Kabar perubahan dikumpulkan sebentar lalu diteruskan ke halaman yang berlangganan.
 * - Putus (galat, tidak ada detak, browser offline): status `offline`, sambung ulang dengan
 *   jeda yang makin panjang; setelah tersambung lagi halaman diminta memuat ulang (`resync`).
 * - Server menutup koneksi dengan rapi (`bye`) tiap beberapa menit: sambung ulang segera, tanpa
 *   terlihat putus. Gagal berulang: sesi diperiksa; bila sudah habis, pengguna diarahkan masuk.
 */
export const useLiveStore = defineStore('live', () => {
  const status = ref<LiveStatus>('idle');
  /** Kabar apa pun (termasuk detak) terakhir diterima dari server. */
  const lastReceivedAt = ref<Date | null>(null);
  const listeners = new Set<(notice: LiveNotice) => void>();

  let source: EventSource | null = null;
  let heartbeatMs = 25_000;
  let failures = 0;
  let missed = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let queue: StreamChange[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  function start(): void {
    if (status.value !== 'idle') return;
    window.addEventListener('offline', onBrowserOffline);
    window.addEventListener('online', onBrowserOnline);
    watchdog = setInterval(checkHeartbeat, 2000);
    open();
  }

  function stop(): void {
    window.removeEventListener('offline', onBrowserOffline);
    window.removeEventListener('online', onBrowserOnline);
    clearInterval(watchdog);
    clearTimeout(retryTimer);
    clearTimeout(flushTimer);
    close();
    queue = [];
    failures = 0;
    missed = false;
    status.value = 'idle';
  }

  /** Sambung ulang sekarang (tombol di spanduk putus). */
  function reconnectNow(): void {
    if (status.value === 'idle') return;
    clearTimeout(retryTimer);
    close();
    open();
  }

  function open(): void {
    if (status.value !== 'offline') status.value = 'connecting';
    const es = new EventSource(`/${API_PREFIX}/stream`);
    source = es;
    es.addEventListener('ready', (event) => {
      const ready = JSON.parse((event as MessageEvent<string>).data) as StreamReady;
      heartbeatMs = ready.heartbeatMs;
      touch();
      failures = 0;
      status.value = 'live';
      if (missed) {
        missed = false;
        emit({ type: 'resync' });
      }
    });
    es.addEventListener('change', (event) => {
      touch();
      queue.push(JSON.parse((event as MessageEvent<string>).data) as StreamChange);
      flushTimer ??= setTimeout(flush, FLUSH_MS);
    });
    es.addEventListener('resync', () => {
      touch();
      emit({ type: 'resync' });
    });
    es.addEventListener('ping', touch);
    es.addEventListener('bye', () => {
      // Penutupan rapi dari server: sambung ulang segera; tidak ada kabar yang terlewat.
      touch();
      close();
      open();
    });
    es.onerror = () => {
      if (source !== es) return;
      lost();
    };
  }

  function close(): void {
    source?.close();
    source = null;
  }

  function lost(): void {
    close();
    missed = true;
    status.value = 'offline';
    failures += 1;
    clearTimeout(retryTimer);
    if (!navigator.onLine) return; // menunggu event "online"
    const delay = Math.min(MAX_RETRY_MS, 1000 * 2 ** Math.min(failures - 1, 4));
    retryTimer = setTimeout(open, delay);
    if (failures === 2) void checkSession();
  }

  async function checkSession(): Promise<void> {
    try {
      if ((await authApi.me()) === null) {
        // Sesi habis: penjaga rute membawa pengguna ke halaman masuk.
        const auth = useAuthStore();
        auth.user = null;
        stop();
        window.location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      }
    } catch {
      // Server tidak terjangkau: tetap mencoba menyambung.
    }
  }

  function checkHeartbeat(): void {
    if (status.value !== 'live' || !lastReceivedAt.value) return;
    if (Date.now() - lastReceivedAt.value.getTime() > heartbeatMs * 2.5) lost();
  }

  function onBrowserOffline(): void {
    if (status.value !== 'idle') lost();
  }

  function onBrowserOnline(): void {
    if (status.value === 'offline') reconnectNow();
  }

  function touch(): void {
    lastReceivedAt.value = new Date();
  }

  function flush(): void {
    flushTimer = undefined;
    const changes = queue;
    queue = [];
    if (changes.length > 0) emit({ type: 'changes', changes });
  }

  function emit(notice: LiveNotice): void {
    for (const listener of listeners) listener(notice);
  }

  function subscribe(listener: (notice: LiveNotice) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { status, lastReceivedAt, start, stop, reconnectNow, subscribe };
});

/** Berlangganan kabar selama komponen ini ada. */
export function useLiveNotices(listener: (notice: LiveNotice) => void): void {
  const unsubscribe = useLiveStore().subscribe(listener);
  if (getCurrentInstance()) onBeforeUnmount(unsubscribe);
}
