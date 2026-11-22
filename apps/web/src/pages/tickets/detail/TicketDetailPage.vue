<script setup lang="ts">
import { IconLockOpen, IconPlus } from '@tabler/icons-vue';
import { APP_NAME, type TicketAction, type TicketDetail, type TicketStatus, type TicketTimeline } from '@tyio/shared';
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '../../../components/PageHeader.vue';
import { useSessionStore } from '../../../stores/session';
import RemoteFacts from '../RemoteFacts.vue';
import TicketStatusPill from '../TicketStatusPill.vue';
import { ticketApi } from '../ticket-api';
import { formatZoned } from '../zoned-time';
import ActionDialog from './ActionDialog.vue';
import TicketTimelineList from './TicketTimeline.vue';

// Halaman NPR: data gangguan (1.3), linimasa tindakan dan perubahan status (1.4), dan data
// remote terkini. Penutupan NPR menyusul di 1.6 (T69).

const route = useRoute();
const session = useSessionStore();
const ticket = ref<TicketDetail | null>(null);
const actions = ref<TicketAction[]>([]);
const error = ref('');
const loading = ref(true);
const saved = ref('');

/** Panel tindakan yang sedang terbuka, beserta isian awalnya. */
const panel = ref<{ correcting: TicketAction | null; initialStatus: TicketStatus | null } | null>(null);
const savedNotice = ref<HTMLElement | null>(null);

watch(
  () => route.params.id,
  async (id) => {
    if (typeof id !== 'string') return;
    loading.value = true;
    error.value = '';
    saved.value = '';
    try {
      const [detail, timeline] = await Promise.all([ticketApi.get(id), ticketApi.actions(id)]);
      ticket.value = detail;
      actions.value = timeline;
      document.title = `${detail.number} · ${APP_NAME}`;
    } catch (cause) {
      ticket.value = null;
      error.value = cause instanceof Error ? cause.message : 'NPR gagal dimuat.';
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const justCreated = computed(() => route.query.baru === '1' && !saved.value);
const customerName = computed(
  () => session.user?.tenants.find((tenant) => tenant.id === ticket.value?.tenantId)?.name ?? '',
);
const closed = computed(() => ticket.value?.status === 'ditutup');
const canReopen = computed(() => session.user?.role === 'l2' || session.user?.role === 'admin');
const startCorrected = computed(() => actions.value.some((action) => action.startedAtCorrection !== null));

function openPanel(correcting: TicketAction | null = null, initialStatus: TicketStatus | null = null): void {
  saved.value = '';
  panel.value = { correcting, initialStatus };
}

async function onSaved(timeline: TicketTimeline): Promise<void> {
  ticket.value = timeline.ticket;
  actions.value = timeline.actions;
  saved.value = panel.value?.correcting ? 'Koreksi tersimpan di linimasa.' : 'Tindakan tersimpan di linimasa.';
  await nextTick();
  savedNotice.value?.focus();
}
</script>

<template>
  <div>
    <div
      v-if="error"
      class="card"
    >
      <div class="empty">
        <p class="empty-title">
          {{ error }}
        </p>
        <p class="empty-subtitle text-secondary">
          NPR ini tidak ada atau bukan milik customer yang boleh Anda lihat.
        </p>
        <div class="empty-action">
          <RouterLink
            :to="{ name: 'tiket' }"
            class="btn"
          >
            Kembali ke Tiket
          </RouterLink>
        </div>
      </div>
    </div>

    <template v-else-if="ticket">
      <PageHeader :title="ticket.number">
        <template #pretitle>
          <RouterLink :to="{ name: 'tiket' }">
            Tiket
          </RouterLink>
          · NPR
          <template v-if="customerName">
            · {{ customerName }}
          </template>
        </template>
        <template #actions>
          <TicketStatusPill :status="ticket.status" />
          <button
            v-if="!closed"
            type="button"
            class="btn btn-primary header-action"
            @click="openPanel()"
          >
            <IconPlus
              size="18"
              aria-hidden="true"
            />
            Tambah tindakan
          </button>
          <button
            v-else-if="canReopen"
            type="button"
            class="btn header-action"
            @click="openPanel(null, 'dikerjakan')"
          >
            <IconLockOpen
              size="18"
              aria-hidden="true"
            />
            Buka kembali
          </button>
        </template>
      </PageHeader>

      <div
        v-if="justCreated"
        class="alert alert-success"
        role="status"
      >
        NPR tersimpan dengan nomor {{ ticket.number }}.
      </div>
      <div
        v-if="saved"
        ref="savedNotice"
        class="alert alert-success"
        role="status"
        tabindex="-1"
      >
        {{ saved }}
      </div>
      <p
        v-if="closed && !canReopen"
        class="text-secondary"
      >
        NPR ini sudah ditutup. Hanya L2 atau admin yang bisa membukanya kembali.
      </p>

      <section
        class="card mb-3"
        aria-labelledby="judul-gangguan"
      >
        <div class="card-header">
          <h2
            id="judul-gangguan"
            class="card-title"
          >
            Gangguan
          </h2>
        </div>
        <div class="card-body">
          <dl class="datagrid">
            <div class="datagrid-item">
              <dt class="datagrid-title">
                Remote
              </dt>
              <dd class="datagrid-content">
                <RouterLink :to="{ name: 'remote-detail', params: { id: ticket.remote.id } }">
                  {{ ticket.remote.name }}
                </RouterLink>
                <span class="d-block font-monospace text-secondary">{{ ticket.remote.code }}</span>
              </dd>
            </div>
            <div class="datagrid-item">
              <dt class="datagrid-title">
                Kategori / System
              </dt>
              <dd class="datagrid-content">
                {{ ticket.category.name }} / {{ ticket.system.name }}
              </dd>
            </div>
            <div class="datagrid-item">
              <dt class="datagrid-title">
                Mulai gangguan
              </dt>
              <dd class="datagrid-content">
                {{ formatZoned(ticket.startedAt, ticket.remote.zone) }}
                <span
                  v-if="startCorrected"
                  class="d-block text-secondary"
                >dikoreksi, lihat linimasa</span>
              </dd>
            </div>
            <div class="datagrid-item">
              <dt class="datagrid-title">
                No. tiket customer
              </dt>
              <dd class="datagrid-content">
                <span
                  v-if="ticket.customerTicketNumber"
                  class="font-monospace"
                >{{ ticket.customerTicketNumber }}</span>
                <span
                  v-else
                  class="text-secondary"
                >Belum ada</span>
              </dd>
            </div>
            <div class="datagrid-item">
              <dt class="datagrid-title">
                Dibuat
              </dt>
              <dd class="datagrid-content">
                {{ formatZoned(ticket.createdAt, ticket.remote.zone) }} · {{ ticket.createdBy.name }}
              </dd>
            </div>
          </dl>
          <h3 class="description-title">
            Keterangan
          </h3>
          <p class="description">
            {{ ticket.description }}
          </p>
        </div>
      </section>

      <section
        class="card mb-3"
        aria-labelledby="judul-linimasa"
      >
        <div class="card-header">
          <h2
            id="judul-linimasa"
            class="card-title"
          >
            Linimasa ({{ actions.length }})
          </h2>
        </div>
        <div class="card-body">
          <p class="text-secondary timeline-hint">
            Terbaru di atas. Entri tidak bisa dihapus atau diubah; perbaikan dicatat sebagai entri koreksi.
          </p>
          <TicketTimelineList
            :actions="actions"
            :zone="ticket.remote.zone"
            :can-correct="!closed"
            @correct="(action) => openPanel(action)"
          />
        </div>
      </section>

      <section
        class="card mb-3"
        aria-labelledby="judul-data-remote"
      >
        <div class="card-header">
          <h2
            id="judul-data-remote"
            class="card-title"
          >
            Data remote
          </h2>
        </div>
        <div class="card-body">
          <RemoteFacts :remote="ticket.remote" />
        </div>
      </section>

      <ActionDialog
        v-if="panel"
        :ticket="ticket"
        :correcting="panel.correcting"
        :initial-status="panel.initialStatus"
        @saved="onSaved"
        @close="panel = null"
      />
    </template>

    <p
      v-else-if="loading"
      class="text-secondary"
      role="status"
    >
      Memuat NPR…
    </p>
  </div>
</template>

<style scoped>
/* Nomor NPR panjang (kode jarkom/customer sampai 10 huruf) tetap muat di ponsel. */
:deep(.page-title) {
  overflow-wrap: anywhere;
}

.datagrid,
.datagrid dd {
  margin: 0;
}

.description-title {
  margin: 20px 0 6px;
  font-size: 14px;
  font-weight: 600;
}

.description {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.header-action {
  min-height: 44px;
}

.timeline-hint {
  margin: 0 0 4px;
  font-size: 13px;
}
</style>
