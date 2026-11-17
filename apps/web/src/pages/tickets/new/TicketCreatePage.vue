<script setup lang="ts">
import { IconAlertTriangle, IconArrowsExchange } from '@tabler/icons-vue';
import {
  formatInZone,
  localInputToUtc,
  type MasterItem,
  type OpenTicketsConflict,
  type RemoteDetail,
  type RemoteSummary,
  TICKET_FUTURE_TOLERANCE_MINUTES,
  TICKET_PROBLEM_MAX,
  TICKET_PROBLEM_MIN,
  type TicketSummary,
  timeZoneLabel,
  utcToLocalInput,
} from '@tyio/shared';
import { computed, reactive, ref, useId, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ApiError } from '../../../api/client';
import { masterApi } from '../../../api/master';
import { remotesApi } from '../../../api/remotes';
import { ticketsApi } from '../../../api/tickets';
import RemotePicker from './RemotePicker.vue';

// Pola halaman: form. Data remote (lokasi, jaringan) diambil dari master remote dan hanya
// dibaca; operator hanya mengisi apa yang terjadi.
const route = useRoute();
const router = useRouter();
const ids = { category: useId(), system: useId(), occurred: useId(), problem: useId(), confirm: useId() };

const categories = ref<MasterItem[]>([]);
const systems = ref<MasterItem[]>([]);
void masterApi.options('kategori').then((list) => (categories.value = list)).catch(() => undefined);
void masterApi.options('system').then((list) => (systems.value = list)).catch(() => undefined);

const remote = ref<RemoteDetail | null>(null);
const openTickets = ref<TicketSummary[]>([]);
const form = reactive({ categoryId: '', systemId: '', occurredAt: '', problem: '', confirm: false });
const touched = reactive({ categoryId: false, occurredAt: false, problem: false });
const serverErrors = reactive<Record<string, string>>({});
const submitted = ref(false);
const saving = ref(false);
const formError = ref('');

const zone = computed(() => remote.value?.timeZone ?? 'Asia/Jakarta');
const nowInZone = () => utcToLocalInput(new Date(), zone.value);
const latestAllowed = computed(() =>
  utcToLocalInput(new Date(Date.now() + TICKET_FUTURE_TOLERANCE_MINUTES * 60_000), zone.value),
);

async function selectRemote(summary: Pick<RemoteSummary, 'id'>): Promise<void> {
  formError.value = '';
  serverErrors.remoteId = '';
  try {
    const [detail, open] = await Promise.all([remotesApi.get(summary.id), ticketsApi.openForRemote(summary.id)]);
    remote.value = detail;
    openTickets.value = open;
    form.confirm = false;
    form.occurredAt = nowInZone();
    void router.replace({ query: { remote: detail.id } });
  } catch (error) {
    formError.value = error instanceof ApiError ? error.message : 'Data remote gagal dimuat.';
  }
}

function changeRemote(): void {
  remote.value = null;
  openTickets.value = [];
  void router.replace({ query: {} });
}

// Dibuka dari halaman remote ("Buat tiket untuk remote ini"): remote langsung terpilih.
watch(
  () => route.query.remote,
  (id) => {
    if (typeof id === 'string' && id !== remote.value?.id) void selectRemote({ id });
  },
  { immediate: true },
);

// Galat kolom tampil setelah kolom ditinggalkan atau form dikirim; galat server hilang saat diubah.
const errors = computed(() => {
  const show = (field: keyof typeof touched) => touched[field] || submitted.value;
  const occurredUtc = form.occurredAt ? localInputToUtc(form.occurredAt, zone.value) : null;
  return {
    remoteId: serverErrors.remoteId || (submitted.value && !remote.value ? 'Pilih remote.' : ''),
    categoryId: serverErrors.categoryId || (show('categoryId') && !form.categoryId ? 'Pilih kategori.' : ''),
    systemId: serverErrors.systemId || '',
    occurredAt:
      serverErrors.occurredAt ||
      (show('occurredAt') && !occurredUtc
        ? 'Isi waktu kejadian.'
        : show('occurredAt') && form.occurredAt > latestAllowed.value
          ? 'Waktu kejadian tidak boleh di masa depan.'
          : ''),
    problem:
      serverErrors.problem ||
      (show('problem') &&
      (form.problem.trim().length < TICKET_PROBLEM_MIN || form.problem.trim().length > TICKET_PROBLEM_MAX)
        ? `Keterangan ${TICKET_PROBLEM_MIN}–${TICKET_PROBLEM_MAX.toLocaleString('id-ID')} karakter.`
        : ''),
    confirm:
      submitted.value && openTickets.value.length > 0 && !form.confirm
        ? 'Centang konfirmasi, atau buka tiket yang sudah ada.'
        : '',
  };
});
const hasErrors = computed(() => Object.values(errors.value).some(Boolean));

function edited(field: string): void {
  serverErrors[field] = '';
}

async function submit(): Promise<void> {
  submitted.value = true;
  formError.value = '';
  if (hasErrors.value || !remote.value) return;
  saving.value = true;
  try {
    const ticket = await ticketsApi.create({
      remoteId: remote.value.id,
      categoryId: form.categoryId,
      systemId: form.systemId || null,
      occurredAt: localInputToUtc(form.occurredAt, zone.value)!,
      problem: form.problem,
      confirmOpenTickets: openTickets.value.length > 0 && form.confirm,
    });
    await router.push({ name: 'ticket-detail', params: { id: ticket.id }, query: { baru: '1' } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && error.body) {
      // Operator lain baru saja membuat tiket untuk remote ini.
      openTickets.value = (error.body as OpenTicketsConflict).openTickets;
      form.confirm = false;
      formError.value = error.message;
    } else if (error instanceof ApiError && error.field) {
      serverErrors[error.field] = error.message;
    } else {
      formError.value = error instanceof ApiError ? error.message : 'Tiket gagal dibuat. Coba lagi.';
    }
  } finally {
    saving.value = false;
  }
}

const dash = (value: string | null | undefined) => value || '—';
</script>

<template>
  <div class="page-header mb-3">
    <div class="page-pretitle">
      Tiket
    </div>
    <h1 class="page-title">
      Buat tiket
    </h1>
    <p class="text-secondary mb-0 mt-1">
      Nomor tiket dibuat sistem saat disimpan.
    </p>
  </div>

  <div
    v-if="formError"
    class="alert alert-danger"
    role="alert"
  >
    {{ formError }}
  </div>

  <form
    novalidate
    @submit.prevent="submit"
  >
    <section
      class="card mb-3"
      aria-labelledby="bagian-remote"
    >
      <div class="card-header">
        <h2
          id="bagian-remote"
          class="card-title"
        >
          Remote
        </h2>
        <div
          v-if="remote"
          class="card-actions"
        >
          <button
            type="button"
            class="btn btn-ghost-secondary target"
            @click="changeRemote"
          >
            <IconArrowsExchange
              class="icon"
              :size="18"
              aria-hidden="true"
            />
            Ganti remote
          </button>
        </div>
      </div>
      <div class="card-body">
        <RemotePicker
          v-if="!remote"
          :error="errors.remoteId"
          @select="selectRemote"
        />
        <template v-else>
          <!-- Hanya-baca: berasal dari data remote, diubah lewat master remote. -->
          <dl class="datagrid">
            <div class="datagrid-item">
              <dt class="datagrid-title">
                Remote
              </dt>
              <dd class="datagrid-content">
                <span class="font-monospace">{{ remote.siteId }}</span> · {{ remote.name }}
              </dd>
            </div>
            <div class="datagrid-item">
              <dt class="datagrid-title">
                Customer
              </dt>
              <dd class="datagrid-content">
                {{ remote.tenant.name }}
              </dd>
            </div>
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
                Alamat
              </dt>
              <dd class="datagrid-content">
                {{ dash(remote.address) }}
              </dd>
            </div>
            <div class="datagrid-item">
              <dt class="datagrid-title">
                Kota, provinsi
              </dt>
              <dd class="datagrid-content">
                {{ remote.city }}, {{ remote.province }} ({{ timeZoneLabel(remote.timeZone) }})
              </dd>
            </div>
            <div class="datagrid-item">
              <dt class="datagrid-title">
                IP SNMP · IP LAN
              </dt>
              <dd class="datagrid-content font-monospace">
                {{ dash(remote.ipSnmp) }} · {{ dash(remote.ipLan) }}
              </dd>
            </div>
            <div class="datagrid-item">
              <dt class="datagrid-title">
                Kontak
              </dt>
              <dd class="datagrid-content">
                <template v-if="remote.contacts[0]">
                  {{ remote.contacts[0].name }} · {{ remote.contacts[0].phone }}
                </template>
                <template v-else>
                  —
                </template>
              </dd>
            </div>
          </dl>

          <div
            v-if="openTickets.length > 0"
            class="alert alert-warning mt-3 mb-0"
            role="alert"
          >
            <div class="d-flex gap-2">
              <IconAlertTriangle
                class="flex-none"
                :size="20"
                aria-hidden="true"
              />
              <div>
                <p class="fw-bold mb-1">
                  Remote ini masih punya {{ openTickets.length }} tiket terbuka
                </p>
                <ul class="mb-2 ps-3">
                  <li
                    v-for="t in openTickets.slice(0, 5)"
                    :key="t.id"
                  >
                    <RouterLink :to="{ name: 'ticket-detail', params: { id: t.id } }">
                      {{ t.number }}
                    </RouterLink>
                    · {{ t.category.name }} · {{ formatInZone(t.occurredAt, remote.timeZone) }}
                  </li>
                  <li v-if="openTickets.length > 5">
                    dan {{ openTickets.length - 5 }} tiket terbuka lainnya
                  </li>
                </ul>
                <label class="form-check mb-0">
                  <input
                    :id="ids.confirm"
                    v-model="form.confirm"
                    class="form-check-input"
                    :class="{ 'is-invalid': errors.confirm }"
                    type="checkbox"
                  >
                  <span class="form-check-label">Saya sudah memeriksa; ini gangguan lain, tetap buat tiket baru.</span>
                  <span
                    v-if="errors.confirm"
                    class="invalid-feedback d-block"
                  >{{ errors.confirm }}</span>
                </label>
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>

    <section
      class="card mb-3"
      aria-labelledby="bagian-gangguan"
    >
      <div class="card-header">
        <h2
          id="bagian-gangguan"
          class="card-title"
        >
          Gangguan
        </h2>
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-12 col-md-6">
            <label
              class="form-label required"
              :for="ids.category"
            >Kategori</label>
            <select
              :id="ids.category"
              v-model="form.categoryId"
              class="form-select target"
              :class="{ 'is-invalid': errors.categoryId }"
              :aria-invalid="errors.categoryId ? 'true' : undefined"
              :aria-describedby="errors.categoryId ? `${ids.category}-error` : undefined"
              @change="edited('categoryId')"
              @blur="touched.categoryId = true"
            >
              <option
                value=""
                disabled
              >
                Pilih kategori
              </option>
              <option
                v-for="c in categories"
                :key="c.id"
                :value="c.id"
              >
                {{ c.name }}
              </option>
            </select>
            <div
              v-if="errors.categoryId"
              :id="`${ids.category}-error`"
              class="invalid-feedback"
            >
              {{ errors.categoryId }}
            </div>
          </div>
          <div class="col-12 col-md-6">
            <label
              class="form-label"
              :for="ids.system"
            >System</label>
            <select
              :id="ids.system"
              v-model="form.systemId"
              class="form-select target"
              :class="{ 'is-invalid': errors.systemId }"
              @change="edited('systemId')"
            >
              <option value="">
                Tidak diisi
              </option>
              <option
                v-for="sys in systems"
                :key="sys.id"
                :value="sys.id"
              >
                {{ sys.name }}
              </option>
            </select>
            <div
              v-if="errors.systemId"
              class="invalid-feedback"
            >
              {{ errors.systemId }}
            </div>
          </div>
          <div class="col-12 col-md-6">
            <label
              class="form-label required"
              :for="ids.occurred"
            >Waktu kejadian ({{ timeZoneLabel(zone) }})</label>
            <input
              :id="ids.occurred"
              v-model="form.occurredAt"
              type="datetime-local"
              class="form-control target"
              :class="{ 'is-invalid': errors.occurredAt }"
              :max="latestAllowed"
              :aria-invalid="errors.occurredAt ? 'true' : undefined"
              :aria-describedby="`${ids.occurred}-hint${errors.occurredAt ? ` ${ids.occurred}-error` : ''}`"
              @input="edited('occurredAt')"
              @blur="touched.occurredAt = true"
            >
            <div
              v-if="errors.occurredAt"
              :id="`${ids.occurred}-error`"
              class="invalid-feedback"
            >
              {{ errors.occurredAt }}
            </div>
            <div
              :id="`${ids.occurred}-hint`"
              class="form-hint"
            >
              Jam di lokasi remote. Waktu pencatatan diisi sistem.
            </div>
          </div>
          <div class="col-12">
            <label
              class="form-label required"
              :for="ids.problem"
            >Keterangan</label>
            <textarea
              :id="ids.problem"
              v-model="form.problem"
              class="form-control"
              :class="{ 'is-invalid': errors.problem }"
              rows="4"
              :maxlength="TICKET_PROBLEM_MAX"
              placeholder="Apa yang terjadi, mis. remote down, listrik padam sejak pukul 08.00."
              :aria-invalid="errors.problem ? 'true' : undefined"
              :aria-describedby="errors.problem ? `${ids.problem}-error` : undefined"
              @input="edited('problem')"
              @blur="touched.problem = form.problem !== ''"
            />
            <div
              v-if="errors.problem"
              :id="`${ids.problem}-error`"
              class="invalid-feedback"
            >
              {{ errors.problem }}
            </div>
          </div>
        </div>
      </div>
      <div class="card-footer d-flex flex-wrap gap-2 justify-content-end">
        <RouterLink
          :to="{ name: 'tiket' }"
          class="btn target"
        >
          Batal
        </RouterLink>
        <button
          type="submit"
          class="btn btn-primary target"
          :disabled="saving"
        >
          <span
            v-if="saving"
            class="spinner-border spinner-border-sm me-2"
            aria-hidden="true"
          />
          Buat tiket
        </button>
      </div>
    </section>
  </form>
</template>

<style scoped>
.target {
  min-height: 44px;
}
.datagrid,
.datagrid dd {
  margin: 0;
}
.datagrid {
  --tblr-datagrid-item-width: 11rem;
}
</style>
