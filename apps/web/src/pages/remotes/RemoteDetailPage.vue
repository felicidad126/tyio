<script setup lang="ts">
import { IconPhone } from '@tabler/icons-vue';
import { APP_NAME, type RemoteDetail, type RemoteZone, type TicketSummary } from '@tyio/shared';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '../../components/PageHeader.vue';
import { useSessionStore } from '../../stores/session';
import { ticketApi } from '../tickets/ticket-api';
import { formatZoned } from '../tickets/zoned-time';
import { remoteApi } from './remote-api';

// Halaman remote (langkah 1.2): "rekam medis" site. NPR terbuka tampil sejak 1.3; riwayat
// lengkap (termasuk yang sudah ditutup) menyusul di 1.6.

const route = useRoute();
const session = useSessionStore();
const remote = ref<RemoteDetail | null>(null);
const openTickets = ref<TicketSummary[] | null>(null);
const ticketsError = ref('');
const error = ref('');
const loading = ref(true);

const OFFSET: Record<RemoteZone, string> = { WIB: 'UTC+7', WITA: 'UTC+8', WIT: 'UTC+9' };
const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

watch(
  () => route.params.id,
  async (id) => {
    if (typeof id !== 'string') return;
    loading.value = true;
    error.value = '';
    openTickets.value = null;
    ticketsError.value = '';
    try {
      remote.value = await remoteApi.get(id);
      document.title = `${remote.value.code} · ${remote.value.name} · ${APP_NAME}`;
      ticketApi
        .openTicketsOf(id)
        .then((tickets) => {
          if (route.params.id === id) openTickets.value = tickets;
        })
        .catch((cause: unknown) => {
          if (route.params.id === id) ticketsError.value = cause instanceof Error ? cause.message : 'NPR gagal dimuat.';
        });
    } catch (cause) {
      remote.value = null;
      error.value = cause instanceof Error ? cause.message : 'Remote gagal dimuat.';
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const customerName = computed(
  () => session.user?.tenants.find((tenant) => tenant.id === remote.value?.tenantId)?.name ?? '',
);
const onlineSince = computed(() =>
  remote.value?.onlineSince ? dateFormat.format(new Date(`${remote.value.onlineSince}T00:00:00Z`)) : '—',
);
const coordinates = computed(() =>
  remote.value?.latitude !== null && remote.value?.longitude !== null && remote.value
    ? `${remote.value.latitude}, ${remote.value.longitude}`
    : '—',
);

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
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
          Remote ini tidak ada atau bukan milik customer yang boleh Anda lihat.
        </p>
        <div class="empty-action">
          <RouterLink
            :to="{ name: 'remote' }"
            class="btn"
          >
            Kembali ke daftar remote
          </RouterLink>
        </div>
      </div>
    </div>

    <template v-else-if="remote">
      <PageHeader :title="remote.name">
        <template #pretitle>
          <RouterLink :to="{ name: 'remote' }">
            Remote
          </RouterLink>
          · <span class="font-monospace">{{ remote.code }}</span>
          <template v-if="customerName">
            · {{ customerName }}
          </template>
        </template>
        <template #actions>
          <span
            class="pill"
            :class="remote.active ? 'pill--on' : 'pill--off'"
          >{{ remote.active ? 'Aktif' : 'Nonaktif' }}</span>
        </template>
      </PageHeader>

      <div class="row row-cards">
        <div class="col-12 col-lg-6">
          <section
            class="card h-100"
            aria-labelledby="judul-lokasi"
          >
            <div class="card-header">
              <h2
                id="judul-lokasi"
                class="card-title"
              >
                Lokasi
              </h2>
            </div>
            <div class="card-body">
              <dl class="datagrid">
                <div class="datagrid-item">
                  <dt class="datagrid-title">
                    Alamat
                  </dt>
                  <dd class="datagrid-content">
                    {{ remote.address ?? '—' }}
                  </dd>
                </div>
                <div class="datagrid-item">
                  <dt class="datagrid-title">
                    Kota / Provinsi
                  </dt>
                  <dd class="datagrid-content">
                    {{ [remote.city, remote.province].filter(Boolean).join(', ') || '—' }}
                  </dd>
                </div>
                <div class="datagrid-item">
                  <dt class="datagrid-title">
                    Zona waktu
                  </dt>
                  <dd class="datagrid-content">
                    {{ remote.zone }} ({{ OFFSET[remote.zone] }})
                  </dd>
                </div>
                <div class="datagrid-item">
                  <dt class="datagrid-title">
                    Koordinat
                  </dt>
                  <dd class="datagrid-content font-monospace">
                    {{ coordinates }}
                  </dd>
                </div>
                <div class="datagrid-item">
                  <dt class="datagrid-title">
                    Kanwil / Kanca
                  </dt>
                  <dd class="datagrid-content">
                    {{ [remote.kanwil, remote.kanca].filter(Boolean).join(' / ') || '—' }}
                  </dd>
                </div>
                <div class="datagrid-item">
                  <dt class="datagrid-title">
                    Pengelola
                  </dt>
                  <dd class="datagrid-content">
                    {{ remote.manager ?? '—' }}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        </div>

        <div class="col-12 col-lg-6">
          <section
            class="card h-100"
            aria-labelledby="judul-jaringan"
          >
            <div class="card-header">
              <h2
                id="judul-jaringan"
                class="card-title"
              >
                Jaringan
              </h2>
            </div>
            <div class="card-body">
              <dl class="datagrid">
                <div class="datagrid-item">
                  <dt class="datagrid-title">
                    Jarkom
                  </dt>
                  <dd class="datagrid-content">
                    {{ remote.networkName }} ({{ remote.networkCode }})
                  </dd>
                </div>
                <div class="datagrid-item">
                  <dt class="datagrid-title">
                    IP SNMP
                  </dt>
                  <dd class="datagrid-content font-monospace">
                    {{ remote.ipSnmp ?? '—' }}
                  </dd>
                </div>
                <div class="datagrid-item">
                  <dt class="datagrid-title">
                    IP LAN
                  </dt>
                  <dd class="datagrid-content font-monospace">
                    {{ remote.ipLan ?? '—' }}
                  </dd>
                </div>
                <div class="datagrid-item">
                  <dt class="datagrid-title">
                    User IP
                  </dt>
                  <dd class="datagrid-content font-monospace">
                    {{ remote.userIp ?? '—' }}
                  </dd>
                </div>
                <div class="datagrid-item">
                  <dt class="datagrid-title">
                    User ID
                  </dt>
                  <dd class="datagrid-content font-monospace">
                    {{ remote.userIdent ?? '—' }}
                  </dd>
                </div>
                <div class="datagrid-item">
                  <dt class="datagrid-title">
                    Online sejak
                  </dt>
                  <dd class="datagrid-content">
                    {{ onlineSince }}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        </div>

        <div class="col-12 col-lg-6">
          <section
            class="card h-100"
            aria-labelledby="judul-kontak"
          >
            <div class="card-header">
              <h2
                id="judul-kontak"
                class="card-title"
              >
                Kontak di lokasi
              </h2>
            </div>
            <ul
              v-if="remote.contacts.length > 0"
              class="list-group list-group-flush"
            >
              <li
                v-for="(contact, index) in remote.contacts"
                :key="index"
                class="list-group-item d-flex flex-wrap gap-2 align-items-center"
              >
                <span class="me-auto">
                  <strong>{{ contact.name }}</strong>
                  <span
                    v-if="contact.role"
                    class="text-secondary"
                  > · {{ contact.role }}</span>
                </span>
                <a
                  v-if="contact.phone"
                  :href="telHref(contact.phone)"
                  class="btn btn-sm"
                >
                  <IconPhone
                    size="16"
                    class="me-1"
                    aria-hidden="true"
                  />
                  {{ contact.phone }}
                </a>
              </li>
            </ul>
            <div
              v-else
              class="card-body text-secondary"
            >
              Belum ada kontak.
            </div>
          </section>
        </div>

        <div class="col-12 col-lg-6">
          <section
            class="card h-100"
            aria-labelledby="judul-riwayat"
          >
            <div class="card-header">
              <h2
                id="judul-riwayat"
                class="card-title"
              >
                NPR terbuka
              </h2>
              <div
                v-if="remote.active"
                class="card-actions"
              >
                <RouterLink
                  :to="{ name: 'ticket-new', query: { remote: remote.id } }"
                  class="btn btn-sm"
                >
                  Buat NPR untuk remote ini
                </RouterLink>
              </div>
            </div>
            <ul
              v-if="openTickets && openTickets.length > 0"
              class="list-group list-group-flush"
            >
              <li
                v-for="ticket in openTickets"
                :key="ticket.id"
                class="list-group-item"
              >
                <RouterLink
                  :to="{ name: 'ticket-detail', params: { id: ticket.id } }"
                  class="font-monospace"
                >
                  {{ ticket.number }}
                </RouterLink>
                <span class="d-block text-secondary">
                  {{ ticket.categoryName }} · dibuat {{ formatZoned(ticket.createdAt, remote.zone) }} oleh
                  {{ ticket.createdByName }}
                </span>
              </li>
            </ul>
            <div
              v-else
              class="card-body text-secondary"
            >
              <span
                v-if="ticketsError"
                class="text-danger"
                role="alert"
              >{{ ticketsError }}</span>
              <template v-else-if="openTickets">
                Tidak ada NPR terbuka.
              </template>
              <template v-else>
                Memuat NPR…
              </template>
              <span class="d-block mt-1">Riwayat lengkap, termasuk NPR yang sudah ditutup, menyusul di langkah 1.6.</span>
            </div>
          </section>
        </div>
      </div>

      <p class="text-secondary mt-3 mb-0">
        Data remote hanya bisa diubah admin, lewat
        <RouterLink
          v-if="session.user?.role === 'admin'"
          :to="{ name: 'remote-import' }"
        >
          impor Excel
        </RouterLink>
        <template v-else>
          impor Excel
        </template>
        dengan kode remote yang sama.
      </p>
    </template>

    <p
      v-else-if="loading"
      class="text-secondary"
      role="status"
    >
      Memuat remote…
    </p>
  </div>
</template>

<style scoped>
.datagrid,
.datagrid dd {
  margin: 0;
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

.pill--on {
  background: #dcf2e1;
  color: #1b6430;
}

.pill--off {
  background: #eaedf1;
  color: #454f5c;
}

.list-group-item .btn-sm,
.card-actions .btn-sm {
  min-height: 32px;
}

@media (max-width: 575.98px) {
  .list-group-item .btn-sm,
  .card-actions .btn-sm {
    min-height: 44px;
  }
}
</style>
