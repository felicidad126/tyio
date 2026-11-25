<script setup lang="ts">
import { IconAlertTriangle, IconSearch } from '@tabler/icons-vue';
import {
  type MasterValue,
  type RemoteDetail,
  type RemoteSummary,
  TICKET_DESCRIPTION_MAX_LENGTH,
  TICKET_STARTED_MAX_AGE_DAYS,
  type TicketSummary,
} from '@npr/shared';
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../../../components/PageHeader.vue';
import { useSessionStore } from '../../../stores/session';
import RemoteFacts from '../RemoteFacts.vue';
import { openTicketsFromError, ticketApi } from '../ticket-api';
import { formatZoned, fromZonedInput, toZonedInput } from '../zoned-time';

// Buat NPR (langkah 1.3): pilih remote → lokasi dan jaringan tampil hanya-baca; kategori,
// system, mulai gangguan (T57), keterangan. Nomor dibuat sistem saat disimpan. Remote yang
// masih punya NPR terbuka memberi peringatan; NPR baru hanya dibuat setelah dikonfirmasi.

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const query = ref('');
const results = ref<RemoteSummary[]>([]);
const searched = ref('');
const searching = ref(false);
const searchInput = useTemplateRef<HTMLInputElement>('searchInput');

const remote = ref<RemoteDetail | null>(null);
const loadingRemote = ref(false);
const openTickets = ref<TicketSummary[]>([]);
const categories = ref<MasterValue[]>([]);
const systems = ref<MasterValue[]>([]);

const categoryId = ref('');
const systemId = ref('');
const startedAt = ref('');
const description = ref('');
const acknowledged = ref(false);
const busy = ref(false);
const error = ref('');
const remoteHeading = useTemplateRef<HTMLElement>('remoteHeading');
const warning = useTemplateRef<HTMLElement>('warning');

const customerName = (tenantId: string) => session.user?.tenants.find((tenant) => tenant.id === tenantId)?.name ?? '';
const message = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback);

// ---------- cari remote ----------

let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchSeq = 0;

watch(query, (value) => {
  clearTimeout(searchTimer);
  const q = value.trim();
  if (q.length < 2) {
    searchSeq++;
    results.value = [];
    searched.value = '';
    searching.value = false;
    return;
  }
  searchTimer = setTimeout(() => void search(q), 250);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

async function search(q: string): Promise<void> {
  const seq = ++searchSeq;
  searching.value = true;
  try {
    const page = await ticketApi.searchRemotes(q);
    if (seq !== searchSeq) return; // jawaban lama tidak menimpa hasil kata kunci terbaru
    results.value = page.items;
    searched.value = q;
    error.value = '';
  } catch (cause) {
    if (seq === searchSeq) error.value = message(cause, 'Pencarian remote gagal. Coba lagi.');
  } finally {
    if (seq === searchSeq) searching.value = false;
  }
}

// ---------- pilih remote ----------

let selectSeq = 0;

async function selectRemote(id: string): Promise<void> {
  const seq = ++selectSeq;
  loadingRemote.value = true;
  error.value = '';
  try {
    const detail = await ticketApi.remote(id);
    const [open, categoryList, systemList] = await Promise.all([
      ticketApi.openTicketsOf(id),
      ticketApi.categories(detail.tenantId),
      ticketApi.systems(detail.tenantId),
    ]);
    if (seq !== selectSeq) return;
    remote.value = detail;
    openTickets.value = open;
    // Formulir hanya menawarkan nilai yang aktif (aturan tenant §5).
    categories.value = categoryList.filter((value) => value.active);
    systems.value = systemList.filter((value) => value.active);
    categoryId.value = categories.value.length === 1 ? (categories.value[0]?.id ?? '') : '';
    systemId.value = systems.value.length === 1 ? (systems.value[0]?.id ?? '') : '';
    startedAt.value = toZonedInput(new Date(), detail.zone);
    acknowledged.value = false;
    if (route.query.remote !== id) void router.replace({ query: { remote: id } });
    await nextTick();
    remoteHeading.value?.focus();
  } catch (cause) {
    if (seq === selectSeq) error.value = message(cause, 'Remote gagal dimuat.');
  } finally {
    if (seq === selectSeq) loadingRemote.value = false;
  }
}

async function changeRemote(): Promise<void> {
  selectSeq++;
  remote.value = null;
  openTickets.value = [];
  error.value = '';
  void router.replace({ query: {} });
  await nextTick();
  searchInput.value?.focus();
}

// Dari halaman remote: /tiket/baru?remote=<id>.
if (typeof route.query.remote === 'string' && route.query.remote !== '') void selectRemote(route.query.remote);

// ---------- simpan ----------

const zoneLabel = computed(() => remote.value?.zone ?? '');
const needsAcknowledgement = computed(() => openTickets.value.length > 0);

async function submit(): Promise<void> {
  const current = remote.value;
  if (!current || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const ticket = await ticketApi.create({
      remoteId: current.id,
      categoryId: categoryId.value,
      systemId: systemId.value,
      ...(startedAt.value ? { startedAt: fromZonedInput(startedAt.value, current.zone) } : {}),
      description: description.value,
      acknowledgeOpenTickets: needsAcknowledgement.value && acknowledged.value,
    });
    await router.push({ name: 'ticket-detail', params: { id: ticket.id }, query: { baru: '1' } });
  } catch (cause) {
    // Operator lain membuat NPR untuk remote ini setelah formulir dibuka.
    const open = openTicketsFromError(cause);
    if (open) {
      openTickets.value = open;
      acknowledged.value = false;
      await nextTick();
      warning.value?.focus();
    } else {
      error.value = message(cause, 'NPR gagal disimpan. Coba lagi.');
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="ticket-new">
    <PageHeader
      title="Buat NPR"
      subtitle="Catat gangguan satu remote. Lokasi dan jaringan diambil dari data remote; nomor NPR dibuat sistem saat disimpan."
    >
      <template #pretitle>
        <RouterLink :to="{ name: 'tiket' }">
          Tiket
        </RouterLink>
      </template>
    </PageHeader>

    <section
      class="card mb-3"
      aria-labelledby="judul-remote"
    >
      <div class="card-header">
        <h2
          id="judul-remote"
          ref="remoteHeading"
          class="card-title"
          tabindex="-1"
        >
          <template v-if="remote">
            {{ remote.name }}
            <span class="remote-sub">
              <span class="font-monospace">{{ remote.code }}</span> · {{ customerName(remote.tenantId) }}
            </span>
          </template>
          <template v-else>
            Remote
          </template>
        </h2>
        <div
          v-if="remote"
          class="card-actions"
        >
          <button
            type="button"
            class="btn"
            @click="changeRemote"
          >
            Ganti remote
          </button>
        </div>
      </div>

      <div
        v-if="remote"
        class="card-body"
      >
        <RemoteFacts :remote="remote" />
      </div>

      <div
        v-else
        class="card-body"
      >
        <label
          class="form-label"
          for="cari-remote"
        >Cari remote</label>
        <div class="input-icon">
          <span class="input-icon-addon">
            <IconSearch
              size="18"
              aria-hidden="true"
            />
          </span>
          <input
            id="cari-remote"
            ref="searchInput"
            v-model="query"
            type="search"
            class="form-control"
            autocomplete="off"
            aria-describedby="cari-remote-bantuan"
            aria-controls="hasil-remote"
          >
        </div>
        <div
          id="cari-remote-bantuan"
          class="form-hint"
        >
          Ketik minimal 2 huruf: kode, nama, kota, atau IP. Hanya remote aktif yang bisa dipilih.
        </div>

        <p
          v-if="loadingRemote"
          class="text-secondary mt-3 mb-0"
          role="status"
        >
          Memuat remote…
        </p>
        <div
          id="hasil-remote"
          class="mt-3"
          aria-live="polite"
        >
          <p
            v-if="searching"
            class="text-secondary m-0"
          >
            Mencari…
          </p>
          <p
            v-else-if="searched && results.length === 0"
            class="text-secondary m-0"
          >
            Tidak ada remote aktif yang cocok dengan "{{ searched }}".
          </p>
          <ul
            v-else-if="results.length > 0"
            class="list-group results"
            aria-label="Hasil pencarian remote"
          >
            <li
              v-for="item in results"
              :key="item.id"
              class="list-group-item p-0"
            >
              <button
                type="button"
                class="results__item"
                @click="selectRemote(item.id)"
              >
                <span class="font-monospace fw-semibold">{{ item.code }}</span>
                <span>{{ item.name }}</span>
                <span class="text-secondary">
                  {{ [item.city, customerName(item.tenantId)].filter(Boolean).join(' · ') }}
                </span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section
      v-if="remote && needsAcknowledgement"
      ref="warning"
      class="alert alert-warning open-warning"
      tabindex="-1"
      aria-labelledby="judul-npr-terbuka"
    >
      <div class="d-flex gap-2">
        <IconAlertTriangle
          size="20"
          class="flex-shrink-0 mt-1 text-warning"
          aria-hidden="true"
        />
        <div>
          <h2
            id="judul-npr-terbuka"
            class="alert-title"
          >
            Remote ini masih punya {{ openTickets.length }} NPR terbuka
          </h2>
          <p class="mb-2">
            Periksa dulu apakah gangguannya sama. Bila sama, tambahkan tindakan di NPR itu, bukan NPR baru.
          </p>
          <ul class="open-warning__list">
            <li
              v-for="ticket in openTickets"
              :key="ticket.id"
            >
              <RouterLink
                :to="{ name: 'ticket-detail', params: { id: ticket.id } }"
                class="font-monospace"
              >
                {{ ticket.number }}
              </RouterLink>
              · {{ ticket.categoryName }} · dibuat {{ formatZoned(ticket.createdAt, remote.zone) }} oleh
              {{ ticket.createdByName }}
              <span class="d-block text-secondary">{{ ticket.description }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section
      v-if="remote"
      class="card"
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
      <form
        class="card-body ticket-form"
        @submit.prevent="submit"
      >
        <div>
          <label
            class="form-label required"
            for="npr-kategori"
          >Kategori</label>
          <select
            id="npr-kategori"
            v-model="categoryId"
            class="form-select"
            required
          >
            <option
              value=""
              disabled
            >
              Pilih kategori
            </option>
            <option
              v-for="value in categories"
              :key="value.id"
              :value="value.id"
            >
              {{ value.name }}
            </option>
          </select>
        </div>
        <div>
          <label
            class="form-label required"
            for="npr-system"
          >System</label>
          <select
            id="npr-system"
            v-model="systemId"
            class="form-select"
            required
            aria-describedby="npr-system-bantuan"
          >
            <option
              value=""
              disabled
            >
              Pilih system
            </option>
            <option
              v-for="value in systems"
              :key="value.id"
              :value="value.id"
            >
              {{ value.name }}
            </option>
          </select>
          <div
            id="npr-system-bantuan"
            class="form-hint"
          >
            Alat monitoring tempat gangguan terlihat.
          </div>
        </div>
        <div>
          <label
            class="form-label"
            for="npr-mulai"
          >Mulai gangguan ({{ zoneLabel }})</label>
          <input
            id="npr-mulai"
            v-model="startedAt"
            type="datetime-local"
            class="form-control"
            aria-describedby="npr-mulai-bantuan"
          >
          <div
            id="npr-mulai-bantuan"
            class="form-hint"
          >
            Waktu setempat remote. Ubah bila gangguan sudah berjalan sebelum NPR dibuat (paling lama
            {{ TICKET_STARTED_MAX_AGE_DAYS }} hari lalu); kosongkan untuk memakai waktu NPR disimpan.
          </div>
        </div>
        <div class="ticket-form__wide">
          <label
            class="form-label required"
            for="npr-keterangan"
          >Keterangan</label>
          <textarea
            id="npr-keterangan"
            v-model="description"
            class="form-control"
            rows="3"
            required
            :maxlength="TICKET_DESCRIPTION_MAX_LENGTH"
            aria-describedby="npr-keterangan-bantuan"
          />
          <div
            id="npr-keterangan-bantuan"
            class="form-hint"
          >
            Gejala atau laporan awal, mis. "Ping gagal 100%, remote lain di hub normal".
          </div>
        </div>
        <label
          v-if="needsAcknowledgement"
          class="form-check ticket-form__wide"
        >
          <input
            v-model="acknowledged"
            type="checkbox"
            class="form-check-input"
            required
          >
          <span class="form-check-label">Gangguan ini berbeda dari NPR terbuka di atas; tetap buat NPR baru.</span>
        </label>

        <div
          v-if="error"
          class="text-danger ticket-form__wide"
          role="alert"
        >
          {{ error }}
        </div>
        <div class="ticket-form__wide d-flex flex-wrap gap-2">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="busy"
          >
            {{ busy ? 'Menyimpan…' : 'Buat NPR' }}
          </button>
          <RouterLink
            :to="{ name: 'tiket' }"
            class="btn btn-link"
          >
            Batal
          </RouterLink>
        </div>
      </form>
    </section>

    <div
      v-else-if="error"
      class="text-danger"
      role="alert"
    >
      {{ error }}
    </div>
  </div>
</template>

<style scoped>
.ticket-new {
  max-width: 1080px;
}

.results {
  max-width: 720px;
}

.results__item {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  width: 100%;
  min-height: 44px;
  padding: 10px 16px;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
}

.results__item:hover {
  background: var(--tblr-bg-surface-secondary);
}

.open-warning:focus,
h2[tabindex='-1']:focus {
  outline: none;
}

/* Isi peringatan memakai warna teks biasa agar terbaca di kedua tema; ikon tetap kuning. */
.open-warning {
  color: var(--tblr-body-color);
}

.open-warning .alert-title {
  color: inherit;
  font-size: 15px;
}

.remote-sub {
  display: block;
  margin-top: 2px;
  color: var(--tblr-secondary);
  font-size: 13px;
  font-weight: 400;
}

.open-warning__list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 1.1rem;
}

.ticket-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.ticket-form__wide {
  grid-column: 1 / -1;
}

.form-check {
  min-height: 32px;
}

@media (max-width: 767.98px) {
  .ticket-form {
    grid-template-columns: 1fr;
  }

  .ticket-form .btn {
    min-height: 44px;
  }

  .ticket-form .btn-primary {
    flex: 1 1 auto;
  }

  .form-check {
    min-height: 44px;
  }
}
</style>
