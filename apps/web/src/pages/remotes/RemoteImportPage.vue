<script setup lang="ts">
import { IconDownload } from '@tabler/icons-vue';
import { REMOTE_IMPORT_MAX_BYTES, type RemoteImportReport, type TenantSummary } from '@npr/shared';
import { computed, nextTick, ref, useTemplateRef } from 'vue';
import PageHeader from '../../components/PageHeader.vue';
import { ApiError } from '../../api';
import { remoteApi, TEMPLATE_URL } from './remote-api';

// Impor remote dari Excel (langkah 1.2, T50–T52): periksa dulu, lihat laporan baris gagal,
// lalu simpan baris yang benar saja atau batal dan perbaiki berkasnya.

const customers = ref<TenantSummary[]>([]);
const customerId = ref('');
const file = ref<File | null>(null);
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');
const report = ref<RemoteImportReport | null>(null);
const saved = ref<RemoteImportReport | null>(null);
const busy = ref<'' | 'preview' | 'save'>('');
const error = ref('');
const resultHeading = useTemplateRef<HTMLElement>('resultHeading');
const number = new Intl.NumberFormat('id-ID');

void remoteApi
  .customers()
  .then((list) => {
    customers.value = list;
    customerId.value = list[0]?.id ?? '';
  })
  .catch((cause: unknown) => (error.value = message(cause)));

const customerName = computed(() => customers.value.find((c) => c.id === customerId.value)?.name ?? '');
const validRows = computed(() => (report.value ? report.value.created + report.value.updated + report.value.unchanged : 0));
const savedSummary = computed(() => {
  if (!saved.value) return '';
  const parts = [
    `${number.format(saved.value.created)} remote baru`,
    `${number.format(saved.value.updated)} diperbarui`,
    `${number.format(saved.value.unchanged)} tidak berubah`,
  ];
  if (saved.value.failed.length > 0) parts.push(`${number.format(saved.value.failed.length)} baris gagal tidak disimpan`);
  return `${parts.join(', ')}.`;
});
const toWrite = computed(() => (report.value ? report.value.created + report.value.updated : 0));

function reset(): void {
  report.value = null;
  saved.value = null;
  error.value = '';
}

function pickFile(event: Event): void {
  reset();
  const picked = (event.target as HTMLInputElement).files?.[0] ?? null;
  if (picked && picked.size > REMOTE_IMPORT_MAX_BYTES) {
    error.value = 'Berkas lebih dari 5 MB. Bagi menjadi beberapa berkas.';
    file.value = null;
    return;
  }
  file.value = picked;
}

function message(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 413) return 'Berkas lebih dari 5 MB. Bagi menjadi beberapa berkas.';
  return cause instanceof Error ? cause.message : 'Impor gagal. Coba lagi.';
}

async function run(mode: 'preview' | 'save'): Promise<void> {
  if (!file.value || !customerId.value) return;
  busy.value = mode;
  error.value = '';
  try {
    const result = await remoteApi.importFile(customerId.value, file.value, mode);
    if (mode === 'preview') report.value = result;
    else {
      saved.value = result;
      report.value = null;
    }
    await nextTick();
    resultHeading.value?.focus();
  } catch (cause) {
    error.value = message(cause);
  } finally {
    busy.value = '';
  }
}

function startOver(): void {
  reset();
  file.value = null;
  if (fileInput.value) fileInput.value.value = '';
  fileInput.value?.focus();
}
</script>

<template>
  <div>
    <PageHeader
      title="Impor remote"
      subtitle="Tambah atau perbarui banyak remote sekaligus dari berkas Excel. Berkas diperiksa dulu sebelum disimpan."
    >
      <template #pretitle>
        <RouterLink :to="{ name: 'remote' }">
          Remote
        </RouterLink>
      </template>
    </PageHeader>

    <div class="card mb-3">
      <div class="card-body">
        <ol class="import-steps">
          <li>
            <a
              :href="TEMPLATE_URL"
              class="btn btn-sm"
              download
            >
              <IconDownload
                size="16"
                class="me-1"
                aria-hidden="true"
              />
              Unduh templat
            </a>
            lalu isi satu remote per baris. Kode jarkom diambil dari Admin › Data master › Jarkom customer itu.
          </li>
          <li>Pilih customer dan berkasnya, lalu periksa. Belum ada yang disimpan pada langkah ini.</li>
          <li>
            Baca laporannya, lalu simpan baris yang benar. Kode remote yang sudah ada memperbarui remote itu;
            kolom yang tidak ada di berkas tidak diubah.
          </li>
        </ol>

        <form
          class="import-form"
          @submit.prevent="run('preview')"
        >
          <div>
            <label
              class="form-label"
              for="impor-customer"
            >Customer</label>
            <select
              id="impor-customer"
              v-model="customerId"
              class="form-select"
              required
              @change="reset"
            >
              <option
                v-for="customer in customers"
                :key="customer.id"
                :value="customer.id"
              >
                {{ customer.name }} ({{ customer.code }})
              </option>
            </select>
          </div>
          <div>
            <label
              class="form-label"
              for="impor-berkas"
            >Berkas Excel (.xlsx)</label>
            <input
              id="impor-berkas"
              ref="fileInput"
              type="file"
              class="form-control"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-describedby="impor-berkas-bantuan"
              required
              @change="pickFile"
            >
            <div
              id="impor-berkas-bantuan"
              class="form-hint"
            >
              Paling besar 5 MB, paling banyak 10.000 baris.
            </div>
          </div>
          <div class="import-form__submit">
            <button
              type="submit"
              class="btn"
              :class="report ? '' : 'btn-primary'"
              :disabled="!file || !customerId || busy !== ''"
            >
              {{ busy === 'preview' ? 'Memeriksa…' : 'Periksa berkas' }}
            </button>
          </div>
        </form>
        <div
          v-if="error"
          class="text-danger mt-3"
          role="alert"
        >
          {{ error }}
        </div>
      </div>
    </div>

    <section
      v-if="report"
      class="card"
      aria-labelledby="judul-pratinjau"
    >
      <div class="card-header">
        <h2
          id="judul-pratinjau"
          ref="resultHeading"
          class="card-title"
          tabindex="-1"
        >
          Hasil pemeriksaan untuk {{ customerName }}
        </h2>
      </div>
      <div class="card-body">
        <ul class="summary">
          <li><strong>{{ number.format(report.totalRows) }}</strong> baris dibaca</li>
          <li><strong>{{ number.format(report.created) }}</strong> remote baru</li>
          <li><strong>{{ number.format(report.updated) }}</strong> diperbarui</li>
          <li><strong>{{ number.format(report.unchanged) }}</strong> tidak berubah</li>
          <li :class="{ 'text-danger': report.failed.length > 0 }">
            <strong>{{ number.format(report.failed.length) }}</strong> gagal
          </li>
        </ul>
        <p
          v-if="report.failed.length > 0"
          class="text-secondary mb-0"
        >
          Baris yang gagal tidak akan disimpan. Perbaiki di berkas lalu impor ulang; baris yang sudah tersimpan
          akan dilewati karena tidak berubah.
        </p>
      </div>

      <div
        v-if="report.failed.length > 0"
        class="table-responsive failed"
      >
        <table class="table table-vcenter card-table">
          <caption class="visually-hidden">
            Baris yang gagal
          </caption>
          <thead>
            <tr>
              <th class="w-1">
                Baris
              </th>
              <th class="w-1">
                Kode
              </th>
              <th>Alasan</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="failure in report.failed"
              :key="failure.row"
            >
              <td>{{ failure.row }}</td>
              <td class="font-monospace text-nowrap">
                {{ failure.code ?? '—' }}
              </td>
              <td>
                <ul class="m-0 ps-3">
                  <li
                    v-for="reason in failure.errors"
                    :key="reason"
                  >
                    {{ reason }}
                  </li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card-footer d-flex flex-wrap gap-2">
        <button
          v-if="toWrite > 0"
          type="button"
          class="btn btn-primary"
          :disabled="busy !== ''"
          @click="run('save')"
        >
          {{ busy === 'save' ? 'Menyimpan…' : `Simpan ${number.format(toWrite)} remote` }}
        </button>
        <p
          v-else
          class="m-0 align-self-center text-secondary"
        >
          {{ validRows > 0 ? 'Semua baris yang benar sudah sama dengan data tersimpan.' : 'Tidak ada baris yang bisa disimpan.' }}
        </p>
        <button
          type="button"
          class="btn ms-auto"
          @click="startOver"
        >
          Batal dan pilih berkas lain
        </button>
      </div>
    </section>

    <section
      v-if="saved"
      class="card"
      aria-labelledby="judul-tersimpan"
    >
      <div class="card-body">
        <h2
          id="judul-tersimpan"
          ref="resultHeading"
          class="card-title text-success"
          tabindex="-1"
        >
          Impor selesai untuk {{ customerName }}
        </h2>
        <p class="mb-0">
          {{ savedSummary }}
        </p>
      </div>
      <div class="card-footer d-flex flex-wrap gap-2">
        <RouterLink
          :to="{ name: 'remote', query: { customer: customerId } }"
          class="btn btn-primary"
        >
          Lihat remote {{ customerName }}
        </RouterLink>
        <button
          type="button"
          class="btn"
          @click="startOver"
        >
          Impor berkas lain
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.import-steps {
  margin: 0 0 16px;
  padding-left: 1.25rem;
  display: grid;
  gap: 6px;
}

.import-form {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) minmax(240px, 2fr) auto;
  gap: 12px;
  align-items: start;
}

.import-form__submit {
  padding-top: calc(1.25rem + 0.5rem);
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}

.failed {
  max-height: 480px;
  overflow-y: auto;
}

h2[tabindex='-1']:focus {
  outline: none;
}

@media (max-width: 767.98px) {
  .import-form {
    grid-template-columns: 1fr;
  }

  .import-form__submit {
    padding-top: 0;
  }

  .import-form__submit .btn {
    width: 100%;
    min-height: 44px;
  }
}
</style>
