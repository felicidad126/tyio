<script setup lang="ts">
import { IconArrowLeft, IconDownload } from '@tabler/icons-vue';
import {
  REMOTE_IMPORT_COLUMNS,
  type RemoteImportResult,
  type RemoteImportRow,
  type TenantRef,
} from '@tyio/shared';
import { computed, ref, useTemplateRef } from 'vue';
import { RouterLink } from 'vue-router';
import { ApiError } from '../../api/client';
import { remotesApi } from '../../api/remotes';
import { tenantsApi } from '../../api/tenants';
import { readFirstSheet, XlsxError } from '../../lib/xlsx/read';
import { writeXlsx } from '../../lib/xlsx/write';
import { ImportFileError, mapSheet } from './import/import-rows';

// Pola halaman: alur bertahap di satu halaman. Pilih customer dan file → periksa → simpan.
// Tidak ada yang tersimpan sebelum pemeriksaan bersih dan admin menekan Simpan.
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SHOWN_FAILURES = 200;

const tenants = ref<TenantRef[]>([]);
const tenantId = ref('');
void tenantsApi.list().then((list) => {
  tenants.value = list;
  if (list.length === 1) tenantId.value = list[0]!.id;
});
const tenantName = computed(() => tenants.value.find((t) => t.id === tenantId.value)?.name ?? '');

const fileInput = useTemplateRef<HTMLInputElement>('file');
const fileName = ref('');
const rows = ref<RemoteImportRow[]>([]);
const ignoredHeaders = ref<string[]>([]);
const report = ref<RemoteImportResult | null>(null);
const state = ref<'idle' | 'checking' | 'checked' | 'saving' | 'saved'>('idle');
const fileError = ref('');
const formError = ref('');

const changes = computed(() => (report.value ? report.value.created + report.value.updated : 0));
const failedRows = computed(() => report.value?.failed.slice(0, SHOWN_FAILURES) ?? []);

async function check(): Promise<void> {
  fileError.value = '';
  formError.value = '';
  report.value = null;
  state.value = 'idle';
  const file = fileInput.value?.files?.[0];
  if (!file) return;
  fileName.value = file.name;
  if (!tenantId.value) {
    formError.value = 'Pilih customer dulu, lalu pilih file lagi.';
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    fileError.value = 'File lebih dari 20 MB. Bagi menjadi beberapa file.';
    return;
  }

  state.value = 'checking';
  try {
    const mapped = mapSheet(readFirstSheet(new Uint8Array(await file.arrayBuffer())));
    rows.value = mapped.rows;
    ignoredHeaders.value = mapped.ignoredHeaders;
    report.value = await remotesApi.import({ tenantId: tenantId.value, rows: mapped.rows, dryRun: true });
    state.value = 'checked';
  } catch (error) {
    state.value = 'idle';
    if (error instanceof XlsxError || error instanceof ImportFileError) fileError.value = error.message;
    else formError.value = error instanceof ApiError ? error.message : 'File gagal diperiksa. Coba lagi.';
  }
}

async function save(): Promise<void> {
  state.value = 'saving';
  formError.value = '';
  try {
    report.value = await remotesApi.import({ tenantId: tenantId.value, rows: rows.value, dryRun: false });
    state.value = 'saved';
  } catch (error) {
    state.value = 'checked';
    // 422: data berubah sejak diperiksa dan kini ada baris gagal; tampilkan laporan terbaru.
    if (error instanceof ApiError && error.status === 422 && error.body) {
      report.value = error.body as RemoteImportResult;
    }
    formError.value = error instanceof ApiError ? error.message : 'Impor gagal disimpan. Coba lagi.';
  }
}

function startOver(): void {
  report.value = null;
  rows.value = [];
  fileName.value = '';
  state.value = 'idle';
  if (fileInput.value) fileInput.value.value = '';
  fileInput.value?.focus();
}

/** Template: lembar "Remote" berisi judul kolom, lembar "Petunjuk" berisi aturan tiap kolom. */
function downloadTemplate(): void {
  const data = writeXlsx([
    {
      name: 'Remote',
      rows: [REMOTE_IMPORT_COLUMNS.map((c) => c.header)],
      widths: REMOTE_IMPORT_COLUMNS.map((c) => Math.max(12, c.header.length + 2)),
    },
    {
      name: 'Petunjuk',
      rows: [
        ['Kolom', 'Wajib', 'Keterangan'],
        ...REMOTE_IMPORT_COLUMNS.map((c) => [c.header, c.required ? 'Ya' : '', c.hint]),
        [],
        ['Catatan', '', 'Site ID yang sudah ada diperbarui. Kolom yang dihapus dari file tidak mengubah data; sel kosong mengosongkan nilainya.'],
      ],
      widths: [22, 8, 90],
    },
  ]);
  const url = URL.createObjectURL(
    new Blob([data.slice().buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'template-impor-remote.xlsx';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const n = (value: number) => value.toLocaleString('id-ID');
</script>

<template>
  <RouterLink
    :to="{ name: 'remote' }"
    class="btn btn-ghost-secondary mb-3 target"
  >
    <IconArrowLeft
      class="icon"
      :size="18"
      aria-hidden="true"
    />
    Daftar remote
  </RouterLink>

  <div class="page-header mb-3">
    <div class="page-pretitle">
      Remote
    </div>
    <h1 class="page-title">
      Impor dari Excel
    </h1>
    <p class="text-secondary mb-0 mt-1">
      Remote baru ditambahkan; Site ID yang sudah ada diperbarui. Tidak ada yang tersimpan
      sebelum Anda menekan Simpan.
    </p>
  </div>

  <div
    v-if="formError"
    class="alert alert-danger"
    role="alert"
  >
    {{ formError }}
  </div>

  <section
    class="card mb-3"
    aria-labelledby="langkah-1"
  >
    <div class="card-header">
      <h2
        id="langkah-1"
        class="card-title"
      >
        1. Pilih customer dan file
      </h2>
    </div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-12 col-md-5">
          <label
            class="form-label required"
            for="import-customer"
          >Customer</label>
          <select
            id="import-customer"
            v-model="tenantId"
            class="form-select target"
            :disabled="state === 'checking' || state === 'saving'"
            @change="startOver"
          >
            <option
              value=""
              disabled
            >
              Pilih customer
            </option>
            <option
              v-for="t in tenants"
              :key="t.id"
              :value="t.id"
            >
              {{ t.name }}
            </option>
          </select>
        </div>
        <div class="col-12 col-md-7">
          <label
            class="form-label required"
            for="import-file"
          >File Excel (.xlsx)</label>
          <input
            id="import-file"
            ref="file"
            type="file"
            class="form-control target"
            :class="{ 'is-invalid': fileError }"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            :disabled="!tenantId || state === 'checking' || state === 'saving'"
            :aria-describedby="fileError ? 'import-file-error import-file-hint' : 'import-file-hint'"
            @change="check"
          >
          <div
            v-if="fileError"
            id="import-file-error"
            class="invalid-feedback"
          >
            {{ fileError }}
          </div>
          <div
            id="import-file-hint"
            class="form-hint"
          >
            Baris 1 berisi judul kolom seperti di template; paling banyak 10.000 remote per file.
          </div>
        </div>
      </div>
      <button
        type="button"
        class="btn mt-3 target"
        @click="downloadTemplate"
      >
        <IconDownload
          class="icon"
          :size="18"
          aria-hidden="true"
        />
        Unduh template
      </button>
    </div>
  </section>

  <p
    v-if="state === 'checking'"
    class="text-secondary"
    role="status"
  >
    Memeriksa {{ fileName }}…
  </p>

  <section
    v-if="report && (state === 'checked' || state === 'saving')"
    class="card mb-3"
    aria-labelledby="langkah-2"
  >
    <div class="card-header">
      <h2
        id="langkah-2"
        class="card-title"
      >
        2. Hasil pemeriksaan {{ fileName }}
      </h2>
    </div>
    <div class="card-body">
      <dl class="row g-3 mb-0 text-center counts">
        <div class="col-6 col-md-3">
          <dt class="text-secondary fw-normal">
            Baru
          </dt>
          <dd class="h2 m-0">
            {{ n(report.created) }}
          </dd>
        </div>
        <div class="col-6 col-md-3">
          <dt class="text-secondary fw-normal">
            Diperbarui
          </dt>
          <dd class="h2 m-0">
            {{ n(report.updated) }}
          </dd>
        </div>
        <div class="col-6 col-md-3">
          <dt class="text-secondary fw-normal">
            Tidak berubah
          </dt>
          <dd class="h2 m-0">
            {{ n(report.unchanged) }}
          </dd>
        </div>
        <div class="col-6 col-md-3">
          <dt class="text-secondary fw-normal">
            Gagal
          </dt>
          <dd
            class="h2 m-0"
            :class="{ 'text-danger': report.failed.length > 0 }"
          >
            {{ n(report.failed.length) }}
          </dd>
        </div>
      </dl>
      <p
        v-if="ignoredHeaders.length > 0"
        class="text-secondary mt-3 mb-0"
      >
        Kolom yang tidak dikenal dan diabaikan: {{ ignoredHeaders.join(', ') }}.
      </p>
    </div>

    <template v-if="report.failed.length > 0">
      <div
        class="alert alert-warning mx-3"
        role="alert"
      >
        {{ n(report.failed.length) }} baris gagal, jadi belum ada yang disimpan. Perbaiki baris di
        bawah ini di file Excel, lalu pilih filenya lagi.
      </div>
      <div class="table-responsive">
        <table class="table table-vcenter card-table">
          <caption class="visually-hidden">
            Baris yang gagal
          </caption>
          <thead>
            <tr>
              <th scope="col">
                Baris
              </th>
              <th scope="col">
                Kolom
              </th>
              <th scope="col">
                Masalah
              </th>
            </tr>
          </thead>
          <tbody>
            <template
              v-for="failure in failedRows"
              :key="failure.row"
            >
              <tr
                v-for="(error, i) in failure.errors"
                :key="`${failure.row}-${i}`"
              >
                <td class="font-monospace">
                  {{ failure.row }}
                </td>
                <td class="text-nowrap">
                  {{ error.column }}
                </td>
                <td>{{ error.message }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <p
        v-if="report.failed.length > SHOWN_FAILURES"
        class="card-body text-secondary mb-0"
      >
        Dan {{ n(report.failed.length - SHOWN_FAILURES) }} baris gagal lainnya.
      </p>
    </template>

    <div class="card-footer d-flex flex-wrap gap-2 justify-content-end">
      <button
        type="button"
        class="btn target"
        @click="startOver"
      >
        Pilih file lain
      </button>
      <button
        v-if="report.failed.length === 0"
        type="button"
        class="btn btn-primary target"
        :disabled="changes === 0 || state === 'saving'"
        @click="save"
      >
        {{ changes === 0 ? 'Tidak ada perubahan' : `Simpan ${n(changes)} remote` }}
      </button>
    </div>
  </section>

  <div
    v-if="report && state === 'saved'"
    class="alert alert-success"
    role="status"
  >
    <p class="mb-2">
      Impor selesai untuk {{ tenantName }}: {{ n(report.created) }} baru, {{ n(report.updated) }} diperbarui.
    </p>
    <div class="d-flex flex-wrap gap-2">
      <RouterLink
        :to="{ name: 'remote', query: { customer: tenantId } }"
        class="btn btn-primary target"
      >
        Lihat remote {{ tenantName }}
      </RouterLink>
      <button
        type="button"
        class="btn target"
        @click="startOver"
      >
        Impor file lain
      </button>
    </div>
  </div>
</template>

<style scoped>
.target {
  min-height: 44px;
}
.counts dd {
  margin: 0;
}
</style>
