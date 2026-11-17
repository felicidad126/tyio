<script setup lang="ts">
import { formatInZone, TICKET_STATUS_LABELS, type TicketDetail } from '@tyio/shared';
import { ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { ApiError } from '../../../api/client';
import { ticketsApi } from '../../../api/tickets';

// Pola halaman: detail. 1.3 menampilkan ringkasan tiket; linimasa tindakan dan perubahan
// status menyusul di langkah 1.4.
const route = useRoute();
const ticket = ref<TicketDetail | null>(null);
const state = ref<'loading' | 'ready' | 'missing' | 'error'>('loading');
const loadError = ref('');

async function load(id: string): Promise<void> {
  state.value = 'loading';
  try {
    ticket.value = await ticketsApi.get(id);
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
      <p class="mb-0 mt-1">
        <span class="badge bg-primary-subtle text-primary-emphasis">{{ TICKET_STATUS_LABELS[ticket.status] }}</span>
      </p>
    </div>

    <div class="row row-cards">
      <div class="col-12 col-lg-7">
        <section
          class="card h-100"
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
                  System
                </dt>
                <dd class="datagrid-content">
                  {{ ticket.system?.name ?? '—' }}
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
      </div>
      <div class="col-12 col-lg-5">
        <section
          class="card h-100"
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
