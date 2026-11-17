<script setup lang="ts">
import { IconAlertTriangle } from '@tabler/icons-vue';
import { MASTER_LABELS, type MasterItem, type MasterList } from '@tyio/shared';
import { computed, ref, useId, watch } from 'vue';
import { ApiError } from '../../../api/client';
import { masterApi } from '../../../api/master';
import AppDialog from '../../../components/AppDialog.vue';

const props = defineProps<{ list: MasterList; item: MasterItem | null }>();
const emit = defineEmits<{
  close: [];
  removed: [item: MasterItem];
  updated: [item: MasterItem];
}>();

const titleId = useId();
const label = computed(() => MASTER_LABELS[props.list].toLowerCase());
const open = computed({
  get: () => props.item !== null,
  set: (value) => {
    if (!value) emit('close');
  },
});

// Ditolak karena sudah dipakai: pesan dari API, dan tawaran menonaktifkan sebagai gantinya.
const inUseMessage = ref('');
const error = ref('');
const busy = ref(false);
watch(
  () => props.item?.id,
  () => {
    inUseMessage.value = '';
    error.value = '';
  },
);

async function run(work: (item: MasterItem) => Promise<void>): Promise<void> {
  const item = props.item;
  if (!item || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await work(item);
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === 409) inUseMessage.value = failure.message;
    else error.value = failure instanceof ApiError ? failure.message : 'Gagal. Coba lagi.';
  } finally {
    busy.value = false;
  }
}

const remove = () =>
  run(async (item) => {
    await masterApi.remove(props.list, item.id);
    emit('removed', item);
  });

const deactivate = () =>
  run(async (item) => {
    emit('updated', await masterApi.update(props.list, item.id, { active: false }));
    emit('close');
  });
</script>

<template>
  <AppDialog
    v-model:open="open"
    variant="confirm"
    :labelledby="titleId"
  >
    <!-- Kartu, bukan .modal-content: gaya modal Tabler butuh variabel dari induk .modal. -->
    <div
      v-if="item"
      class="card"
    >
      <div class="card-status-top bg-danger" />
      <div class="card-body text-center py-4">
        <IconAlertTriangle
          class="text-danger mb-2"
          :size="40"
          aria-hidden="true"
        />
        <h2
          :id="titleId"
          class="h3"
        >
          Hapus {{ label }} "{{ item.name }}"?
        </h2>
        <p
          v-if="!inUseMessage"
          class="text-secondary mb-0"
        >
          Hanya bisa dihapus bila belum dipakai di data mana pun. Tidak bisa dibatalkan.
        </p>
        <div
          v-if="inUseMessage"
          class="alert alert-warning text-start mb-0"
          role="alert"
        >
          {{ inUseMessage }}
        </div>
        <div
          v-if="error"
          class="alert alert-danger text-start mt-3 mb-0"
          role="alert"
        >
          {{ error }}
        </div>
      </div>
      <div class="card-footer">
        <div class="d-flex gap-2 w-100">
          <button
            type="button"
            class="btn flex-fill"
            autofocus
            @click="emit('close')"
          >
            {{ inUseMessage ? 'Tutup' : 'Batal' }}
          </button>
          <button
            v-if="!inUseMessage"
            type="button"
            class="btn btn-danger flex-fill"
            :disabled="busy"
            @click="remove"
          >
            Hapus {{ label }}
          </button>
          <button
            v-else-if="item.active"
            type="button"
            class="btn btn-primary flex-fill"
            :disabled="busy"
            @click="deactivate"
          >
            Nonaktifkan
          </button>
        </div>
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.card-footer .btn {
  min-height: 44px;
}
</style>
