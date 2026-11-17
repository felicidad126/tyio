<script setup lang="ts">
import {
  type AddTicketActionResponse,
  formatInZone,
  PENDING_PARTY_LABELS,
  TICKET_STATUS_LABELS,
  type TicketAction,
  type TicketDetail,
  TICKET_FLAG_DAYS,
  ticketNeedsUpdate,
} from '@tyio/shared';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { ApiError } from '../../../api/client';
import { ticketsApi } from '../../../api/tickets';
import CustomerTicketNumber from './CustomerTicketNumber.vue';
import { TICKET_STATUS_BADGE } from './ticket-display';
import TicketActionForm from './TicketActionForm.vue';
import TimelineEntry from './TimelineEntry.vue';

// Pola halaman: detail. Kiri: tambah tindakan dan linimasa (terbaru di atas); kanan:
// ringkasan gangguan dan remote. Linimasa hanya bisa ditambah; kesalahan dikoreksi.
const route = useRoute();
const ticket = ref<TicketDetail | null>(null);
const actions = ref<TicketAction[]>([]);
const state = ref<'loading' | 'ready' | 'missing' | 'error'>('loading');
const loadError = ref('');
const notice = ref('');
/** Peringatan yang harus tetap terlihat, mis. status sudah diubah rekan. */
const warning = ref('');

function onStale(message: string): void {
  warning.value = message;
  if (ticket.value) void load(ticket.value.id);
}

async function load(id: string): Promise<void> {
  state.value = ticket.value?.id === id ? 'ready' : 'loading';
  try {
    const [detail, timeline] = await Promise.all([ticketsApi.get(id), ticketsApi.actions(id)]);
    ticket.value = detail;
    actions.value = timeline;
    state.value = 'ready';
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) state.value = 'missing';
    else {
      loadError.value = error instanceof ApiError ? error.message : 'Tiket gagal dimuat.';
      state.value = 'error';
    }
  }
}
watch(() => route.params.id as string, load, { immediate: true });

const byId = computed(() => new Map(actions.value.map((a) => [a.id, a])));

function onSaved(result: AddTicketActionResponse): void {
  ticket.value = result.ticket;
  warning.value = '';
  notice.value = result.action.statusTo
    ? `Status menjadi ${TICKET_STATUS_LABELS[result.action.statusTo]}.`
    : 'Tindakan disimpan.';
  // Muat ulang linimasa agar tanda "Dikoreksi" pada entri lama ikut terbaru.
  void ticketsApi.actions(result.ticket.id).then((list) => (actions.value = list));
}
</script>

<template>
  <p
    v-if="state === 'loading'"
    class="text-secondary"
  >
    Memuat tiket…
  </p>

  <div
    v-else-if="state === 'missing'"
    class="card"
  >
    <div class="empty">
      <p class="empty-title">
        Tiket tidak ditemukan
      </p>
      <p class="empty-subtitle text-secondary">
        Tiket ini tidak ada, atau milik customer yang tidak bisa Anda lihat.
      </p>
    </div>
  </div>

  <div
    v-else-if="state === 'error'"
    class="alert alert-danger"
    role="alert"
  >
    {{ loadError }}
  </div>

  <template v-else-if="ticket">
    <div
      v-if="route.query.baru"
      class="alert alert-success"
      role="status"
    >
      Tiket {{ ticket.number }} dibuat.
    </div>

    <div class="page-header mb-3">
      <div class="page-pretitle">
        {{ ticket.tenant.name }} · {{ ticket.category.name }}
      </div>
      <h1 class="page-title font-monospace ticket-number">
        {{ ticket.number }}
      </h1>
      <p class="mb-0 mt-1 d-flex flex-wrap align-items-center gap-2">
        <span
          :class="TICKET_STATUS_BADGE[ticket.status]"
          data-testid="status-tiket"
        >{{ TICKET_STATUS_LABELS[ticket.status] }}</span>
        <span
          v-if="ticketNeedsUpdate(ticket)"
          class="badge bg-danger text-white"
          :title="`Masih aktif setelah ${TICKET_FLAG_DAYS} hari sejak kejadian: perbarui NPR ini.`"
        >Down ≥ {{ TICKET_FLAG_DAYS }} hari</span>
        <span
          v-if="ticket.pending"
          class="text-secondary"
        >Menunggu {{ PENDING_PARTY_LABELS[ticket.pending.party] }}: {{ ticket.pending.reason }}</span>
      </p>
      <div class="mt-2">
        <CustomerTicketNumber
          :ticket="ticket"
          @updated="(t) => { ticket = t; void load(t.id); }"
        />
      </div>
    </div>

    <div
      class="visually-hidden"
      role="status"
    >
      {{ notice }}
    </div>

    <div class="row row-cards">
      <div class="col-12 col-lg-7 d-flex flex-column gap-3">
        <div
          v-if="warning"
          class="alert alert-warning mb-0"
          role="alert"
        >
          {{ warning }}
        </div>
        <TicketActionForm
          :key="ticket.status"
          :ticket="ticket"
          @saved="onSaved"
          @stale="onStale"
        />
        <section
          class="card"
          aria-labelledby="linimasa"
        >
          <div class="card-header">
            <h2
              id="linimasa"
              class="card-title"
            >
              Linimasa
            </h2>
          </div>
          <ol
            class="list-group list-group-flush timeline-list"
            aria-labelledby="linimasa"
          >
            <TimelineEntry
              v-for="action in actions"
              :key="action.id"
              :ticket-id="ticket.id"
              :action="action"
              :zone="ticket.remote.timeZone"
              :by-id="byId"
              @corrected="onSaved"
            />
          </ol>
        </section>
      </div>
      <div class="col-12 col-lg-5 d-flex flex-column gap-3">
        <section
          class="card"
          aria-labelledby="gangguan"
        >
          <div class="card-header">
            <h2
              id="gangguan"
              class="card-title"
            >
              Gangguan
            </h2>
          </div>
          <div class="card-body">
            <dl class="datagrid">
              <div class="datagrid-item">
                <dt class="datagrid-title">
                  Waktu kejadian
                </dt>
                <dd class="datagrid-content">
                  {{ formatInZone(ticket.occurredAt, ticket.remote.timeZone) }}
                </dd>
              </div>
              <div class="datagrid-item">
                <dt class="datagrid-title">
                  Kategori
                </dt>
                <dd class="datagrid-content">
                  {{ ticket.category.name }}
                </dd>
              </div>
              <div class="datagrid-item">
                <dt class="datagrid-title">
                  Dicatat
                </dt>
                <dd class="datagrid-content">
                  {{ formatInZone(ticket.createdAt, ticket.remote.timeZone) }} oleh {{ ticket.createdBy.displayName }}
                </dd>
              </div>
            </dl>
            <h3 class="h4 mt-4 mb-1">
              Keterangan
            </h3>
            <p class="mb-0 problem">
              {{ ticket.problem }}
            </p>
          </div>
        </section>
        <section
          class="card"
          aria-labelledby="remote"
        >
          <div class="card-header">
            <h2
              id="remote"
              class="card-title"
            >
              Remote
            </h2>
          </div>
          <div class="card-body">
            <p class="mb-1">
              <RouterLink :to="{ name: 'remote-detail', params: { id: ticket.remote.id } }">
                {{ ticket.remote.name }}
              </RouterLink>
            </p>
            <p class="text-secondary mb-0">
              <span class="font-monospace">{{ ticket.remote.siteId }}</span> · {{ ticket.jarkom.name }} ·
              {{ ticket.remote.city }}, {{ ticket.remote.province }}
            </p>
          </div>
        </section>
      </div>
    </div>
  </template>
</template>

<style scoped>
.ticket-number {
  overflow-wrap: anywhere;
}
.problem {
  white-space: pre-line;
}
.datagrid,
.datagrid dd {
  margin: 0;
}
.datagrid {
  --tblr-datagrid-item-width: 11rem;
}
</style>
