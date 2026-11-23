<script setup lang="ts">
import { IconHandGrab, IconLockOpen, IconPlus, IconSend } from '@tabler/icons-vue';
import { APP_NAME, isRole, ROLE_LABELS, type TicketAction, type TicketDetail, type TicketStatus, type TicketTimeline } from '@tyio/shared';
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '../../../components/PageHeader.vue';
import { useSessionStore } from '../../../stores/session';
import RemoteFacts from '../RemoteFacts.vue';
import TicketStatusPill from '../TicketStatusPill.vue';
import { ticketApi } from '../ticket-api';
import { formatZoned } from '../zoned-time';
import TroubleTicketCard from '../tt/TroubleTicketCard.vue';
import TroubleTicketDialog from '../tt/TroubleTicketDialog.vue';
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

/** Panel "Buat TT ke SD" (1.5b). */
const ttPanel = ref(false);

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
      // Dari pencarian global: alamat #tt-<id> menunjuk satu TT di halaman ini.
      if (route.hash.startsWith('#tt-')) {
        await nextTick();
        document.getElementById(route.hash.slice(1))?.focus();
      }
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
const isAssignee = computed(() => !!ticket.value?.assignee && ticket.value.assignee.id === session.user?.id);
const taking = ref(false);
const takeError = ref('');
const roleLabel = (role: string) => (isRole(role) ? ROLE_LABELS[role] : role);

/** "Ambil" (T81): penanggung yang terlihat dikirim, agar pergantian oleh orang lain ketahuan (409). */
async function take(): Promise<void> {
  if (!ticket.value) return;
  taking.value = true;
  takeError.value = '';
  saved.value = '';
  try {
    const timeline = await ticketApi.take(ticket.value.id, ticket.value.assignee?.id ?? null);
    ticket.value = timeline.ticket;
    actions.value = timeline.actions;
    saved.value = 'Anda sekarang penanggung NPR ini.';
    await nextTick();
    savedNotice.value?.focus();
  } catch (cause) {
    takeError.value = cause instanceof Error ? cause.message : 'NPR gagal diambil.';
    await reload().catch(() => undefined);
  } finally {
    taking.value = false;
  }
}

const startCorrected = computed(() => actions.value.some((action) => action.startedAtCorrection !== null));

function openPanel(correcting: TicketAction | null = null, initialStatus: TicketStatus | null = null): void {
  saved.value = '';
  panel.value = { correcting, initialStatus };
}

/** Muat ulang NPR dan linimasa tanpa menutup panel (status diubah pengguna lain). */
async function reload(): Promise<void> {
  if (!ticket.value) return;
  const [detail, timeline] = await Promise.all([ticketApi.get(ticket.value.id), ticketApi.actions(ticket.value.id)]);
  ticket.value = detail;
  actions.value = timeline;
}

async function onTroubleTicketSaved(timeline: TicketTimeline): Promise<void> {
  ticket.value = timeline.ticket;
  actions.value = timeline.actions;
  const created = timeline.ticket.troubleTickets.at(-1);
  saved.value = created ? `${created.number} tersimpan. Teruskan ke SD dengan "Salin ringkasan TT".` : 'TT tersimpan.';
  await nextTick();
  savedNotice.value?.focus();
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
            v-if="!closed && !isAssignee"
            type="button"
            class="btn header-action"
            :disabled="taking"
            @click="take"
          >
            <IconHandGrab
              size="18"
              aria-hidden="true"
            />
            {{ taking ? 'Mengambil…' : ticket.assignee ? 'Ambil alih' : 'Ambil' }}
          </button>
          <button
            v-if="!closed"
            type="button"
            class="btn header-action"
            @click="saved = ''; ttPanel = true"
          >
            <IconSend
              size="18"
              aria-hidden="true"
            />
            Buat TT ke SD
          </button>
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
      <div
        v-if="takeError"
        class="alert alert-danger"
        role="alert"
      >
        {{ takeError }}
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
                Penanggung
              </dt>
              <dd class="datagrid-content">
                <template v-if="ticket.assignee">
                  {{ ticket.assignee.name }}
                  <span class="text-secondary">· {{ roleLabel(ticket.assignee.role) }}</span>
                </template>
                <span
                  v-else
                  class="text-secondary"
                >Belum ada</span>
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
        v-if="ticket.troubleTickets.length > 0"
        class="card mb-3"
        aria-labelledby="judul-tt"
      >
        <div class="card-header">
          <h2
            id="judul-tt"
            class="card-title"
          >
            TT ke SD ({{ ticket.troubleTickets.length }})
          </h2>
        </div>
        <div class="card-body tt-list">
          <TroubleTicketCard
            v-for="tt in ticket.troubleTickets"
            :key="tt.id"
            :tt="tt"
            :zone="ticket.remote.zone"
            :can-copy="!closed"
            @copied="reload"
          />
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

      <TroubleTicketDialog
        v-if="ttPanel"
        :ticket="ticket"
        @saved="onTroubleTicketSaved"
        @close="ttPanel = false"
      />
      <ActionDialog
        v-if="panel"
        :ticket="ticket"
        :correcting="panel.correcting"
        :initial-status="panel.initialStatus"
        @saved="onSaved"
        @stale="reload"
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
  gap: 6px;
  min-height: 44px;
}

.tt-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-hint {
  margin: 0 0 4px;
  font-size: 13px;
}
</style>
