<script setup lang="ts">
import { IconArrowLeft, IconPhone } from '@tabler/icons-vue';
import { canOpenModule, REMOTE_STATUS_LABELS, type RemoteDetail } from '@tyio/shared';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { ApiError } from '../../api/client';
import { remotesApi } from '../../api/remotes';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '../../stores/auth';
import { formatDate, STATUS_BADGE, zoneLabel } from './remote-display';
import RemoteTicketHistory from './RemoteTicketHistory.vue';

// Pola halaman: detail ("rekam medis" site), dengan riwayat tiketnya di bawah (1.6).
const route = useRoute();
const { user } = storeToRefs(useAuthStore());
const canOpenTickets = computed(() => (user.value ? canOpenModule(user.value.role, 'tiket') : false));
const remote = ref<RemoteDetail | null>(null);
const state = ref<'loading' | 'ready' | 'missing' | 'error'>('loading');
const loadError = ref('');

// Kembali ke daftar dengan pencarian dan saringan yang sama bila datang dari sana.
const backTo = computed(() => {
  const back = (window.history.state as { back?: unknown } | null)?.back;
  return typeof back === 'string' && back.startsWith('/remote') && !back.startsWith('/remote/') ? back : '/remote';
});

async function load(id: string): Promise<void> {
  state.value = 'loading';
  try {
    remote.value = await remotesApi.get(id);
    state.value = 'ready';
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) state.value = 'missing';
    else {
      loadError.value = error instanceof ApiError ? error.message : 'Data remote gagal dimuat.';
      state.value = 'error';
    }
  }
}
watch(() => route.params.id as string, load, { immediate: true });

const dash = (value: string | null | undefined) => value || '—';
const coordinates = computed(() =>
  remote.value?.latitude == null || remote.value.longitude == null
    ? '—'
    : `${remote.value.latitude.toFixed(6)}, ${remote.value.longitude.toFixed(6)}`,
);
</script>

<template>
  <RouterLink
    :to="backTo"
    class="btn btn-ghost-secondary mb-3 back-link"
  >
    <IconArrowLeft
      class="icon"
      :size="18"
      aria-hidden="true"
    />
    Daftar remote
  </RouterLink>

  <p
    v-if="state === 'loading'"
    class="text-secondary"
  >
    Memuat remote…
  </p>

  <div
    v-else-if="state === 'missing'"
    class="card"
  >
    <div class="empty">
      <p class="empty-title">
        Remote tidak ditemukan
      </p>
      <p class="empty-subtitle text-secondary">
        Remote ini tidak ada, atau milik customer yang tidak bisa Anda lihat.
      </p>
    </div>
  </div>

  <div
    v-else-if="state === 'error'"
    class="alert alert-danger"
    role="alert"
  >
    {{ loadError }}
    <button
      type="button"
      class="btn btn-sm ms-2"
      @click="load(route.params.id as string)"
    >
      Muat ulang
    </button>
  </div>

  <template v-else-if="remote">
    <div class="page-header mb-3">
      <div class="page-pretitle">
        {{ remote.tenant.name }}
      </div>
      <h1 class="page-title">
        {{ remote.name }}
      </h1>
      <p class="mb-0 mt-1 d-flex flex-wrap align-items-center gap-2">
        <span class="font-monospace">{{ remote.siteId }}</span>
        <span :class="STATUS_BADGE[remote.status]">{{ REMOTE_STATUS_LABELS[remote.status] }}</span>
      </p>
      <RouterLink
        v-if="canOpenTickets && remote.status !== 'dibongkar'"
        :to="{ name: 'ticket-create', query: { remote: remote.id } }"
        class="btn btn-primary mt-3 back-link"
      >
        Buat tiket untuk remote ini
      </RouterLink>
    </div>

    <div class="row row-cards">
      <div class="col-12 col-lg-6">
        <section
          class="card h-100"
          aria-labelledby="lokasi"
        >
          <div class="card-header">
            <h2
              id="lokasi"
              class="card-title"
            >
              Lokasi
            </h2>
          </div>
          <div class="card-body">
            <dl class="datagrid">
              <div class="datagrid-item datagrid-wide">
                <dt class="datagrid-title">
                  Alamat
                </dt>
                <dd class="datagrid-content">
                  {{ dash(remote.address) }}
                </dd>
              </div>
              <div class="datagrid-item">
                <dt class="datagrid-title">
                  Kota
                </dt>
                <dd class="datagrid-content">
                  {{ remote.city }}
                </dd>
              </div>
              <div class="datagrid-item">
                <dt class="datagrid-title">
                  Provinsi
                </dt>
                <dd class="datagrid-content">
                  {{ remote.province }}
                </dd>
              </div>
              <div class="datagrid-item">
                <dt class="datagrid-title">
                  Zona waktu
                </dt>
                <dd class="datagrid-content">
                  {{ zoneLabel(remote.timeZone) }}
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
            </dl>
          </div>
        </section>
      </div>

      <div class="col-12 col-lg-6">
        <section
          class="card h-100"
          aria-labelledby="jaringan"
        >
          <div class="card-header">
            <h2
              id="jaringan"
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
                  {{ remote.jarkom.name }}
                </dd>
              </div>
              <div class="datagrid-item">
                <dt class="datagrid-title">
                  IP SNMP
                </dt>
                <dd class="datagrid-content font-monospace">
                  {{ dash(remote.ipSnmp) }}
                </dd>
              </div>
              <div class="datagrid-item">
                <dt class="datagrid-title">
                  IP LAN
                </dt>
                <dd class="datagrid-content font-monospace">
                  {{ dash(remote.ipLan) }}
                </dd>
              </div>
              <div class="datagrid-item">
                <dt class="datagrid-title">
                  User IP
                </dt>
                <dd class="datagrid-content font-monospace">
                  {{ dash(remote.userIp) }}
                </dd>
              </div>
              <div class="datagrid-item">
                <dt class="datagrid-title">
                  User ID
                </dt>
                <dd class="datagrid-content font-monospace">
                  {{ dash(remote.userId) }}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      <div class="col-12 col-lg-6">
        <section
          class="card h-100"
          aria-labelledby="kantor"
        >
          <div class="card-header">
            <h2
              id="kantor"
              class="card-title"
            >
              Kantor dan operasional
            </h2>
          </div>
          <div class="card-body">
            <dl class="datagrid">
              <div class="datagrid-item">
                <dt class="datagrid-title">
                  Kanwil
                </dt>
                <dd class="datagrid-content">
                  {{ dash(remote.kanwil) }}
                </dd>
              </div>
              <div class="datagrid-item">
                <dt class="datagrid-title">
                  Kanca
                </dt>
                <dd class="datagrid-content">
                  {{ dash(remote.kanca) }}
                </dd>
              </div>
              <div class="datagrid-item">
                <dt class="datagrid-title">
                  Tanggal online
                </dt>
                <dd class="datagrid-content">
                  {{ remote.onlineDate ? formatDate(remote.onlineDate) : '—' }}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      <div class="col-12 col-lg-6">
        <section
          class="card h-100"
          aria-labelledby="kontak"
        >
          <div class="card-header">
            <h2
              id="kontak"
              class="card-title"
            >
              Kontak
            </h2>
          </div>
          <p
            v-if="remote.contacts.length === 0"
            class="card-body text-secondary mb-0"
          >
            Belum ada kontak.
          </p>
          <ul
            v-else
            class="list-group list-group-flush"
          >
            <li
              v-for="(contact, index) in remote.contacts"
              :key="index"
              class="list-group-item d-flex align-items-center gap-3"
            >
              <div class="me-auto">
                <div class="fw-bold">
                  {{ contact.name }}
                </div>
                <div
                  v-if="contact.role"
                  class="small text-secondary"
                >
                  {{ contact.role }}
                </div>
              </div>
              <a
                class="btn btn-ghost-primary phone-link"
                :href="`tel:${contact.phone.replace(/[^\d+]/g, '')}`"
                :aria-label="`Telepon ${contact.name}, ${contact.phone}`"
              >
                <IconPhone
                  class="icon"
                  :size="18"
                  aria-hidden="true"
                />
                {{ contact.phone }}
              </a>
            </li>
          </ul>
        </section>
      </div>

      <div
        v-if="canOpenTickets"
        class="col-12"
      >
        <RemoteTicketHistory
          :remote-id="remote.id"
          :time-zone="remote.timeZone"
        />
      </div>
    </div>
  </template>
</template>

<style scoped>
.back-link,
.phone-link {
  min-height: 44px;
}
/* dl/dt/dd dipakai demi aksesibilitas; margin bawaan browser dihapus agar sama dengan datagrid Tabler. */
.datagrid,
.datagrid dd {
  margin: 0;
}
/* Dua kolom di kartu setengah lebar (bawaan Tabler 15rem membuatnya satu kolom). */
.datagrid {
  --tblr-datagrid-item-width: 11rem;
}
.datagrid-wide {
  grid-column: 1 / -1;
}
</style>
