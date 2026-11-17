<script setup lang="ts">
import { IconX } from '@tabler/icons-vue';
import {
  MASTER_LABELS,
  type MasterItem,
  type MasterList,
  masterCodeError,
  masterNameError,
  normalizeMasterCode,
  normalizeMasterName,
} from '@tyio/shared';
import { computed, reactive, ref, useId } from 'vue';
import { ApiError } from '../../../api/client';
import { masterApi } from '../../../api/master';
import AppDialog from '../../../components/AppDialog.vue';
import { MASTER_COPY } from './master-copy';

const props = defineProps<{ list: MasterList }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ created: [item: MasterItem] }>();

const ids = { title: useId(), code: useId(), name: useId() };
const label = computed(() => MASTER_LABELS[props.list]);
const copy = computed(() => MASTER_COPY[props.list]);

// Isian tetap tersimpan bila panel ditutup tanpa menyimpan, dan dikosongkan setelah berhasil.
const form = reactive({ code: '', name: '' });
const touched = reactive({ code: false, name: false });
const serverErrors = reactive<{ code: string; name: string }>({ code: '', name: '' });
const formError = ref('');
const submitted = ref(false);
const saving = ref(false);

// Galat kolom tampil setelah kolom ditinggalkan atau form dikirim, tidak saat mengetik;
// galat dari server hilang begitu kolomnya diubah.
const codeError = computed(
  () =>
    serverErrors.code ||
    ((touched.code || submitted.value) && masterCodeError(normalizeMasterCode(form.code))) ||
    '',
);
const nameError = computed(
  () =>
    serverErrors.name ||
    ((touched.name || submitted.value) && masterNameError(normalizeMasterName(form.name))) ||
    '',
);

function edited(field: 'code' | 'name'): void {
  serverErrors[field] = '';
}

async function submit(): Promise<void> {
  submitted.value = true;
  formError.value = '';
  if (codeError.value || nameError.value) return;

  saving.value = true;
  try {
    const item = await masterApi.create(props.list, {
      code: normalizeMasterCode(form.code),
      name: normalizeMasterName(form.name),
    });
    Object.assign(form, { code: '', name: '' });
    Object.assign(touched, { code: false, name: false });
    submitted.value = false;
    open.value = false;
    emit('created', item);
  } catch (error) {
    if (error instanceof ApiError && (error.field === 'code' || error.field === 'name')) {
      serverErrors[error.field] = error.message;
    } else {
      formError.value = error instanceof ApiError ? error.message : 'Gagal menyimpan. Coba lagi.';
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    variant="drawer"
    :labelledby="ids.title"
  >
    <form
      class="card h-100 rounded-0 border-0"
      novalidate
      @submit.prevent="submit"
    >
      <div class="card-header">
        <h2
          :id="ids.title"
          class="card-title"
        >
          Tambah {{ label.toLowerCase() }}
        </h2>
        <div class="card-actions">
          <button
            type="button"
            class="btn btn-ghost-secondary btn-icon close-button"
            aria-label="Tutup"
            title="Tutup"
            @click="open = false"
          >
            <IconX
              :size="20"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
      <div class="card-body overflow-auto">
        <div
          v-if="formError"
          class="alert alert-danger"
          role="alert"
        >
          {{ formError }}
        </div>
        <div class="mb-3">
          <label
            class="form-label required"
            :for="ids.code"
          >Kode</label>
          <input
            :id="ids.code"
            v-model="form.code"
            class="form-control text-uppercase"
            :class="{ 'is-invalid': codeError }"
            type="text"
            maxlength="16"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            autofocus
            :aria-invalid="codeError ? 'true' : undefined"
            :aria-describedby="`${ids.code}-hint${codeError ? ` ${ids.code}-error` : ''}`"
            @input="edited('code')"
            @blur="touched.code = form.code !== ''"
          >
          <div
            v-if="codeError"
            :id="`${ids.code}-error`"
            class="invalid-feedback"
          >
            {{ codeError }}
          </div>
          <div
            :id="`${ids.code}-hint`"
            class="form-hint"
          >
            {{ copy.codeHint }}
          </div>
        </div>
        <div class="mb-3">
          <label
            class="form-label required"
            :for="ids.name"
          >Nama</label>
          <input
            :id="ids.name"
            v-model="form.name"
            class="form-control"
            :class="{ 'is-invalid': nameError }"
            type="text"
            maxlength="120"
            autocomplete="off"
            :placeholder="copy.namePlaceholder"
            :aria-invalid="nameError ? 'true' : undefined"
            :aria-describedby="nameError ? `${ids.name}-error` : undefined"
            @input="edited('name')"
            @blur="touched.name = form.name !== ''"
          >
          <div
            v-if="nameError"
            :id="`${ids.name}-error`"
            class="invalid-feedback"
          >
            {{ nameError }}
          </div>
        </div>
      </div>
      <div class="card-footer d-flex gap-2 justify-content-end">
        <button
          type="button"
          class="btn"
          @click="open = false"
        >
          Batal
        </button>
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="saving"
        >
          <span
            v-if="saving"
            class="spinner-border spinner-border-sm me-2"
            aria-hidden="true"
          />
          Tambah {{ label.toLowerCase() }}
        </button>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.close-button,
.card-footer .btn {
  min-height: 44px;
  min-width: 44px;
}
</style>
