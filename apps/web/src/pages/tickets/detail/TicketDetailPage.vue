<script setup lang="ts">
import { IconCircleCheck, IconHandGrab, IconLock, IconLockOpen, IconPlus, IconSend } from '@tabler/icons-vue';
import {
  APP_NAME,
  isRole,
  ROLE_LABELS,
  TICKET_CLOSE_CAUSE_LABELS,
  type TicketAction,
  type TicketDetail,
  type TicketStatus,
  type TicketTimeline,
  type TroubleTicket,
} from '@tyio/shared';
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import LiveStatus from '../../../components/LiveStatus.vue';
import PageHeader from '../../../components/PageHeader.vue';
import { debounced, useStream } from '../../../composables/useStream';
import { useSessionStore } from '../../../stores/session';
import RemoteFacts from '../RemoteFacts.vue';
import TicketStatusPill from '../TicketStatusPill.vue';
import { ticketApi } from '../ticket-api';
import { formatZoned } from '../zoned-time';
import TroubleTicketCard from '../tt/TroubleTicketCard.vue';
import TroubleTicketDialog from '../tt/TroubleTicketDialog.vue';
import ActionDialog from './ActionDialog.vue';
import CloseDialog from './CloseDialog.vue';
import TicketTimelineList from './TicketTimeline.vue';

// Halaman NPR: data gangguan (1.3), linimasa tindakan dan perubahan status (1.4), TT (1.5b),
// penutupan NPR dan TT (1.6), dan data remote terkini. "Tutup NPR" hanya di Pulih · siap
// ditutup; tombol mati dengan alasan tertulis bila aturan K21/T99 tidak terpenuhi (API tetap
// penjaga yang sebenarnya). Pembaruan langsung (2.2, T128): perubahan oleh orang lain dimuat
// ulang sendiri; panel yang terbuka tetap memakai NPR saat panel dibuka, jadi status yang sudah
// berganti tetap ditolak 409 (T73), bukan diam-diam dipakai sebagai status asal yang baru.

const route = useRoute();
const session = useSessionStore();
const ticket = ref<TicketDetail | null>(null);
const actions = ref<TicketAction[]>([]);
const error = ref('');
const loading = ref(true);
const saved = ref('');

/** Panel "Buat TT ke SD" (1.5b). */
const ttPanel = ref(false);

/** Panel penutupan (1.6): NPR (`troubleTicket` kosong) atau satu TT. */
const closePanel = ref<{ troubleTicket: TroubleTicket | null } | null>(null);

/** Panel tindakan yang sedang terbuka, beserta isian awalnya. */
const panel = ref<{ correcting: TicketAction | null; initialStatus: TicketStatus | null } | null>(null);
const savedNotice = ref<HTMLElement | null>(null);
/** Waktu NPR yang tampil diterima (ms epoch), untuk penanda langsung. */
const loadedAt = ref<number | null>(null);
/** NPR saat panel dibuka; panel memakai salinan ini, bukan NPR yang diperbarui langsung. */
const dialogTicket = ref<TicketDetail | null>(null);
/** Pengumuman untuk pembaca layar saat linimasa berubah karena orang lain. */
const liveNotice = ref('');

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
      loadedAt.value = Date.now();
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
/** L2 dan admin: buka kembali (T66), tutup NPR yang punya TT, tutup TT (K21). */
const canReopen = computed(() => session.user?.role === 'l2' || session.user?.role === 'admin');
const recovered = computed(() => ticket.value?.status === 'pulih');
const openTroubleTickets = computed(() => ticket.value?.troubleTickets.filter((tt) => tt.status !== 'ditutup') ?? []);
/** Alasan "Tutup NPR" mati (K21, T99); kosong = boleh ditutup. */
const closeBlockedReason = computed(() => {
  if (!ticket.value || ticket.value.troubleTickets.length === 0) return '';
  if (!canReopen.value) return 'NPR yang punya TT hanya ditutup L2 atau admin.';
  if (openTroubleTickets.value.length > 0) {
    return `Tutup dulu TT yang masih berjalan: ${openTroubleTickets.value.map((tt) => tt.number).join(', ')}.`;
  }
  return '';
});
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
  const id = ticket.value.id;
  const [detail, timeline] = await Promise.all([ticketApi.get(id), ticketApi.actions(id)]);
  if (ticket.value?.id !== id) return; // sudah pindah ke NPR lain
  ticket.value = detail;
  actions.value = timeline;
  loadedAt.value = Date.now();
}

/** Panel melaporkan status usang (409): muat ulang, lalu panel memakai NPR terbaru. */
async function onStale(): Promise<void> {
  await reload();
  dialogTicket.value = ticket.value;
}

watch(
  () => Boolean(panel.value || closePanel.value || ttPanel.value),
  (open) => {
    dialogTicket.value = open ? ticket.value : null;
  },
);

/** Pembaruan langsung: entri baru di NPR ini (oleh siapa pun) memuat ulang halaman diam-diam. */
const liveReload = debounced(async () => {
  const before = actions.value.length;
  try {
    await reload();
  } catch {
    return; // gagal di latar: layar tetap
  }
  if (actions.value.length > before) liveNotice.value = `Linimasa diperbarui: ${actions.value.length - before} entri baru.`;
}, 500);
useStream({
  onChange: (event) => {
    if (event.ticketId === ticket.value?.id) liveReload.schedule();
  },
  onResync: liveReload.schedule,
});

async function onTroubleTicketSaved(timeline: TicketTimeline): Promise<void> {
  ticket.value = timeline.ticket;
  actions.value = timeline.actions;
  const created = timeline.ticket.troubleTickets.at(-1);
  saved.value = created ? `${created.number} tersimpan. Teruskan ke SD dengan "Salin ringkasan TT".` : 'TT tersimpan.';
  await nextTick();
  savedNotice.value?.focus();
}

function openClose(troubleTicket: TroubleTicket | null): void {
  saved.value = '';
  closePanel.value = { troubleTicket };
}

async function onClosed(timeline: TicketTimeline): Promise<void> {
  const troubleTicket = closePanel.value?.troubleTicket ?? null;
  ticket.value = timeline.ticket;
  actions.value = timeline.actions;
  saved.value = troubleTicket ? `${troubleTicket.number} ditutup.` : 'NPR ditutup.';
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
          <span class="pretitle-row">
            <span>
              <RouterLink :to="{ name: 'tiket' }">
                Tiket
              </RouterLink>
              · NPR
              <template v-if="customerName">
                · {{ customerName }}
              </template>
            </span>
            <LiveStatus :data-at="loadedAt" />
          </span>
          <span
            class="visually-hidden"
            role="status"
          >{{ liveNotice }}</span>
        </template>
        <template #actions>
          <TicketStatusPill :status="ticket.status" />
          <button
            v-if="recovered"
            type="button"
            class="btn header-action btn-close-npr"
            :disabled="closeBlockedReason !== ''"
            :aria-describedby="closeBlockedReason ? 'alasan-tutup' : undefined"
            @click="openClose(null)"
          >
            <IconLock
              v-if="closeBlockedReason"
              size="18"
              aria-hidden="true"
            />
            <IconCircleCheck
              v-else
              size="18"
              aria-hidden="true"
            />
            Tutup NPR
          </button>
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
      <p
        v-if="recovered && closeBlockedReason"
        id="alasan-tutup"
        class="close-reason text-secondary"
      >
        <IconLock
          size="16"
          aria-hidden="true"
        />
        {{ closeBlockedReason }}
      </p>

      <section
        v-if="closed && ticket.closure"
        class="card mb-3 closure-card"
        aria-labelledby="judul-penutupan"
      >
        <div class="card-header">
          <h2
            id="judul-penutupan"
            class="card-title"
          >
            Penutupan
          </h2>
        </div>
        <div class="card-body">
          <dl class="datagrid">
            <div class="datagrid-item">
              <dt class="datagrid-title">
                Penyebab
              </dt>
              <dd class="datagrid-content">
                {{ TICKET_CLOSE_CAUSE_LABELS[ticket.closure.cause] }}
              </dd>
            </div>
            <div class="datagrid-item">
              <dt class="datagrid-title">
                Ditutup
              </dt>
              <dd class="datagrid-content">
                {{ formatZoned(ticket.closure.closedAt, ticket.remote.zone) }} · {{ ticket.closure.closedBy.name }}
                <span class="text-secondary">· {{ roleLabel(ticket.closure.closedBy.role) }}</span>
              </dd>
            </div>
          </dl>
          <h3 class="description-title">
            Penyelesaian
          </h3>
          <p class="description">
            {{ ticket.closure.resolution }}
          </p>
        </div>
      </section>

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
            :ticket-open="!closed"
            :can-close="canReopen"
            @copied="reload"
            @close="openClose"
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
        :ticket="dialogTicket ?? ticket"
        @saved="onTroubleTicketSaved"
        @close="ttPanel = false"
      />
      <CloseDialog
        v-if="closePanel"
        :ticket="dialogTicket ?? ticket"
        :trouble-ticket="closePanel.troubleTicket"
        @saved="onClosed"
        @close="closePanel = null"
      />
      <ActionDialog
        v-if="panel"
        :ticket="dialogTicket ?? ticket"
        :correcting="panel.correcting"
        :initial-status="panel.initialStatus"
        @saved="onSaved"
        @stale="onStale"
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
.pretitle-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
}

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

/* "Tutup NPR" bergaris hijau seperti mockup DetailTiket; tombol utama tetap "Tambah tindakan". */
.btn-close-npr:not(:disabled) {
  border-color: #1b6430;
  color: #1b6430;
}

[data-bs-theme='dark'] .btn-close-npr:not(:disabled) {
  border-color: #6fcf8a;
  color: #6fcf8a;
}

.close-reason {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0 0 12px;
}

.close-reason svg {
  flex: none;
  margin-top: 3px;
}

.closure-card {
  border-left: 3px solid #8a96a3;
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
