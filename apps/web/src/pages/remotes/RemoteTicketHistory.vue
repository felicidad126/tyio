<script setup lang="ts">
import { formatInZone, TICKET_STATUS_LABELS, type TicketListResponse, type TimeZoneName } from '@tyio/shared';
import { computed, nextTick, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { ApiError } from '../../api/client';
import { ticketsApi } from '../../api/tickets';
import TicketNumber from '../../components/TicketNumber.vue';
import { formatDuration, TICKET_STATUS_BADGE } from '../tickets/detail/ticket-display';

// Riwayat tiket satu remote (1.6): semua NPR-nya, terbaru menurut waktu kejadian, termasuk yang
// sudah Selesai dengan waktu online kembali dan lama gangguannya. Daftar bertumpuk (bukan tabel)
// agar terbaca di ponsel tanpa gulir samping.
const props = defineProps<{ remoteId: string; timeZone: TimeZoneName }>();
const route = useRoute();

const page = ref(1);
const result = ref<TicketListResponse | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref('');
let latest = 0;
let scrolled = false;

async function load(): Promise<void> {
  const request = ++latest;
  state.value = 'loading';
  try {
    const response = await ticketsApi.list({ view: 'semua', remoteId: props.remoteId, page: page.value });
    if (request !== latest) return;
    result.value = response;
    state.value = 'ready';
    // Tautan "Riwayat tiket remote ini" dari halaman tiket: gulir ke sini setelah isinya tampil.
    if (!scrolled && route.hash === '#riwayat-tiket') {
      scrolled = true;
      await nextTick();
      document.getElementById('riwayat-tiket')?.scrollIntoView();
    }
  } catch (error) {
    if (request !== latest) return;
    loadError.value = error instanceof ApiError ? error.message : 'Riwayat tiket gagal dimuat.';
    state.value = 'error';
  }
}
watch(() => props.remoteId, () => {
  page.value = 1;
  void load();
}, { immediate: true });

const lastPage = computed(() =>
  result.value ? Math.max(1, Math.ceil(result.value.total / result.value.pageSize)) : 1,
);
function go(to: number): void {
  page.value = to;
  void load();
}
</script>

<template>
  <section
    class="card"
    aria-labelledby="riwayat-tiket"
  >
    <div class="card-header">
      <h2
        id="riwayat-tiket"
        class="card-title"
      >
        Riwayat tiket
        <span
          v-if="result"
          class="badge bg-secondary-lt ms-1"
        >{{ result.total.toLocaleString('id-ID') }}</span>
      </h2>
    </div>

    <p
      v-if="state === 'loading' && !result"
      class="card-body text-secondary mb-0"
      aria-busy="true"
    >
      Memuat riwayat tiket…
    </p>
    <div
      v-else-if="state === 'error'"
      class="card-body"
    >
      <p
        class="text-danger mb-2"
        role="alert"
      >
        {{ loadError }}
      </p>
      <button
        type="button"
        class="btn action-target"
        @click="load"
      >
        Muat ulang
      </button>
    </div>
    <p
      v-else-if="result && result.total === 0"
      class="card-body text-secondary mb-0"
    >
      Belum ada tiket untuk remote ini.
    </p>
    <template v-else-if="result">
      <ul
        class="list-group list-group-flush"
        :aria-busy="state === 'loading'"
      >
        <li
          v-for="t in result.items"
          :key="t.id"
          class="list-group-item d-flex flex-wrap align-items-start gap-2"
        >
          <div class="me-auto history-main">
            <RouterLink
              :to="{ name: 'ticket-detail', params: { id: t.id } }"
              class="history-link font-monospace"
            >
              <TicketNumber :number="t.number" />
            </RouterLink>
            <div class="small">
              Kejadian {{ formatInZone(t.occurredAt, timeZone) }} · {{ t.category.name }}
            </div>
            <div
              v-if="t.closedAt"
              class="small text-secondary"
            >
              Online kembali {{ formatInZone(t.closedAt, timeZone) }} · lama gangguan
              {{ formatDuration(t.occurredAt, t.closedAt) }}
            </div>
            <div
              v-if="t.tt"
              class="small"
            >
              <span class="badge bg-azure-lt">TT</span> <span class="font-monospace">{{ t.tt.number }}</span>
            </div>
          </div>
          <span :class="TICKET_STATUS_BADGE[t.status]">{{ TICKET_STATUS_LABELS[t.status] }}</span>
        </li>
      </ul>
      <div
        v-if="lastPage > 1"
        class="card-footer d-flex align-items-center gap-2"
      >
        <span class="text-secondary me-auto">Halaman {{ result.page }} dari {{ lastPage }}</span>
        <button
          type="button"
          class="btn action-target"
          :disabled="result.page <= 1 || state === 'loading'"
          @click="go(result.page - 1)"
        >
          Sebelumnya
        </button>
        <button
          type="button"
          class="btn action-target"
          :disabled="result.page >= lastPage || state === 'loading'"
          @click="go(result.page + 1)"
        >
          Berikutnya
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.action-target {
  min-height: 44px;
}
.history-main {
  min-width: 0;
}
.history-link {
  display: inline-block;
  padding-block: 0.5rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
</style>
