<script setup lang="ts">
import { APP_NAME, TICKET_STATUS_LABELS, type TicketDetail } from '@tyio/shared';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '../../../components/PageHeader.vue';
import { useSessionStore } from '../../../stores/session';
import RemoteFacts from '../RemoteFacts.vue';
import { ticketApi } from '../ticket-api';
import { formatZoned } from '../zoned-time';

// Halaman NPR (langkah 1.3): data saat NPR dibuat dan data remote terkini. Linimasa
// tindakan dan perubahan status menyusul di langkah 1.4.

const route = useRoute();
const session = useSessionStore();
const ticket = ref<TicketDetail | null>(null);
const error = ref('');
const loading = ref(true);

watch(
  () => route.params.id,
  async (id) => {
    if (typeof id !== 'string') return;
    loading.value = true;
    error.value = '';
    try {
      ticket.value = await ticketApi.get(id);
      document.title = `${ticket.value.number} · ${APP_NAME}`;
    } catch (cause) {
      ticket.value = null;
      error.value = cause instanceof Error ? cause.message : 'NPR gagal dimuat.';
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const justCreated = computed(() => route.query.baru === '1');
const customerName = computed(
  () => session.user?.tenants.find((tenant) => tenant.id === ticket.value?.tenantId)?.name ?? '',
);
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
          <span class="pill pill--open">{{ TICKET_STATUS_LABELS[ticket.status] }}</span>
        </template>
      </PageHeader>

      <div
        v-if="justCreated"
        class="alert alert-success"
        role="status"
      >
        NPR tersimpan dengan nomor {{ ticket.number }}.
      </div>

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

      <p class="text-secondary mb-0">
        Linimasa tindakan, perubahan status, dan penutupan NPR menyusul di langkah 1.4.
      </p>
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

.pill {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

/* ATURAN.md §3: NPR Terbuka. */
.pill--open {
  background: #dfeafb;
  color: #0b4f99;
}
</style>
