<script setup lang="ts">
import { IconSearch } from '@tabler/icons-vue';
import { type RemoteSummary, REMOTE_STATUS_LABELS } from '@tyio/shared';
import { onBeforeUnmount, ref, useId, watch } from 'vue';
import { ApiError } from '../../../api/client';
import { remotesApi } from '../../../api/remotes';

// Mencari remote untuk tiket: ketik, lalu pilih dari hasilnya. Remote yang dibongkar tampil
// tetapi tidak bisa dipilih.
defineProps<{ error?: string }>();
const emit = defineEmits<{ select: [remote: RemoteSummary] }>();

const ids = { input: useId(), hint: useId(), error: useId(), results: useId() };
const query = ref('');
const results = ref<RemoteSummary[]>([]);
const total = ref(0);
const state = ref<'idle' | 'searching' | 'done' | 'failed'>('idle');
const message = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
let latest = 0;

watch(query, (value) => {
  clearTimeout(timer);
  const q = value.trim();
  if (q.length < 2) {
    state.value = 'idle';
    results.value = [];
    return;
  }
  timer = setTimeout(() => void search(q), 250);
});
onBeforeUnmount(() => clearTimeout(timer));

async function search(q: string): Promise<void> {
  const request = ++latest;
  state.value = 'searching';
  try {
    const page = await remotesApi.list({ q });
    if (request !== latest) return;
    results.value = page.items.slice(0, 8);
    total.value = page.total;
    state.value = 'done';
  } catch (error) {
    if (request !== latest) return;
    message.value = error instanceof ApiError ? error.message : 'Pencarian gagal. Coba lagi.';
    state.value = 'failed';
  }
}
</script>

<template>
  <div>
    <label
      class="form-label required"
      :for="ids.input"
    >Remote</label>
    <div class="input-icon">
      <span
        class="input-icon-addon"
        aria-hidden="true"
      ><IconSearch :size="18" /></span>
      <input
        :id="ids.input"
        v-model="query"
        type="search"
        class="form-control picker-input"
        :class="{ 'is-invalid': error }"
        autocomplete="off"
        placeholder="Site ID, nama, kota, atau kanca"
        :aria-describedby="error ? `${ids.hint} ${ids.error}` : ids.hint"
        :aria-controls="ids.results"
      >
    </div>
    <div
      v-if="error"
      :id="ids.error"
      class="invalid-feedback d-block"
    >
      {{ error }}
    </div>
    <div
      :id="ids.hint"
      class="form-hint"
    >
      Ketik minimal 2 huruf, lalu pilih remote dari hasilnya.
    </div>

    <div
      :id="ids.results"
      class="mt-2"
      role="status"
    >
      <p
        v-if="state === 'searching'"
        class="text-secondary mb-0"
      >
        Mencari…
      </p>
      <p
        v-else-if="state === 'failed'"
        class="text-danger mb-0"
      >
        {{ message }}
      </p>
      <p
        v-else-if="state === 'done' && results.length === 0"
        class="text-secondary mb-0"
      >
        Tidak ada remote yang cocok.
      </p>
      <ul
        v-else-if="state === 'done'"
        class="list-group"
        aria-label="Hasil pencarian remote"
      >
        <li
          v-for="remote in results"
          :key="remote.id"
          class="list-group-item p-0"
        >
          <button
            type="button"
            class="btn btn-ghost-secondary w-100 text-start justify-content-start result"
            :disabled="remote.status === 'dibongkar'"
            @click="emit('select', remote)"
          >
            <span class="font-monospace me-2">{{ remote.siteId }}</span>
            <span class="me-auto text-body">{{ remote.name }}</span>
            <span class="small text-secondary d-none d-sm-inline">
              {{ remote.tenant.name }} · {{ remote.city }}
            </span>
            <span
              v-if="remote.status !== 'aktif'"
              class="badge bg-secondary-subtle text-secondary-emphasis ms-2"
            >{{ REMOTE_STATUS_LABELS[remote.status] }}</span>
          </button>
        </li>
        <li
          v-if="total > results.length"
          class="list-group-item text-secondary small"
        >
          {{ total - results.length }} remote lain cocok; ketik lebih spesifik.
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.picker-input,
.result {
  min-height: 44px;
}
.result {
  flex-wrap: wrap;
  gap: 0.25rem;
}
</style>
