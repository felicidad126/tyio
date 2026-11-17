<script setup lang="ts">
import { IconPencil, IconTrash } from '@tabler/icons-vue';
import { type MasterItem, type MasterList, masterNameError, normalizeMasterName } from '@tyio/shared';
import { nextTick, ref, useId, useTemplateRef } from 'vue';
import { ApiError } from '../../../api/client';
import { masterApi } from '../../../api/master';

const props = defineProps<{ list: MasterList; item: MasterItem }>();
const emit = defineEmits<{
  updated: [item: MasterItem];
  /** Pesan untuk pengguna saat perubahan status gagal. */
  failed: [message: string];
  remove: [item: MasterItem];
}>();

const errorId = useId();
const display = useTemplateRef<HTMLButtonElement>('display');
const input = useTemplateRef<HTMLInputElement>('input');

// Ganti nama langsung di sel: tampilan dan kolom isian menempati kotak yang sama, jadi
// baris lain tidak bergeser. Enter menyimpan, Escape membatalkan.
const editing = ref(false);
const draft = ref('');
const renameError = ref('');
const saving = ref(false);
const toggling = ref(false);

async function startEdit(): Promise<void> {
  draft.value = props.item.name;
  renameError.value = '';
  editing.value = true;
  await nextTick();
  input.value?.select();
}

async function stopEdit(): Promise<void> {
  editing.value = false;
  renameError.value = '';
  await nextTick();
  display.value?.focus();
}

async function save(): Promise<void> {
  if (saving.value) return;
  const name = normalizeMasterName(draft.value);
  if (name === props.item.name) return stopEdit();
  renameError.value = masterNameError(name) ?? '';
  if (renameError.value) return;

  saving.value = true;
  try {
    emit('updated', await masterApi.update(props.list, props.item.id, { name }));
    await stopEdit();
  } catch (error) {
    renameError.value = error instanceof ApiError ? error.message : 'Gagal menyimpan. Coba lagi.';
  } finally {
    saving.value = false;
  }
}

/** Meninggalkan kolom dengan perubahan sama dengan Enter; tanpa perubahan sama dengan Escape. */
function onBlur(): void {
  if (!editing.value || saving.value) return;
  if (normalizeMasterName(draft.value) === props.item.name) void stopEdit();
  else void save();
}

async function toggleActive(event: Event): Promise<void> {
  const checkbox = event.target as HTMLInputElement;
  toggling.value = true;
  try {
    emit('updated', await masterApi.update(props.list, props.item.id, { active: checkbox.checked }));
  } catch (error) {
    checkbox.checked = props.item.active;
    emit('failed', error instanceof ApiError ? error.message : 'Gagal mengubah status. Coba lagi.');
  } finally {
    toggling.value = false;
  }
}
</script>

<template>
  <tr>
    <td class="d-none d-md-table-cell font-monospace text-nowrap">
      {{ item.code }}
    </td>
    <td class="w-100">
      <div class="name-cell">
        <button
          v-show="!editing"
          ref="display"
          type="button"
          class="name-display"
          :aria-label="`Ganti nama ${item.name}`"
          @click="startEdit"
        >
          <span class="text-truncate">{{ item.name }}</span>
          <IconPencil
            class="name-pencil"
            :size="16"
            aria-hidden="true"
          />
        </button>
        <input
          v-if="editing"
          ref="input"
          v-model="draft"
          class="form-control name-input"
          :class="{ 'is-invalid': renameError }"
          type="text"
          maxlength="120"
          :aria-label="`Nama baru untuk ${item.name}`"
          :aria-invalid="renameError ? 'true' : undefined"
          :aria-describedby="renameError ? errorId : undefined"
          :readonly="saving"
          @keydown.enter.prevent="save"
          @keydown.esc.prevent="stopEdit"
          @blur="onBlur"
        >
        <div
          v-if="editing && renameError"
          :id="errorId"
          class="invalid-tooltip d-block"
          role="alert"
        >
          {{ renameError }}
        </div>
      </div>
      <div class="d-md-none small text-secondary font-monospace">
        {{ item.code }}
      </div>
    </td>
    <td class="status-cell">
      <label class="form-check form-switch m-0 status-switch">
        <input
          class="form-check-input"
          type="checkbox"
          :checked="item.active"
          :disabled="toggling"
          :aria-label="`Aktif: ${item.name}`"
          @change="toggleActive"
        >
        <span
          class="form-check-label"
          aria-hidden="true"
        >{{ item.active ? 'Aktif' : 'Nonaktif' }}</span>
      </label>
    </td>
    <td class="text-end">
      <button
        type="button"
        class="btn btn-ghost-danger btn-icon action-button"
        :aria-label="`Hapus ${item.name}`"
        :title="`Hapus ${item.name}`"
        @click="emit('remove', item)"
      >
        <IconTrash
          :size="18"
          aria-hidden="true"
        />
      </button>
    </td>
  </tr>
</template>

<style scoped>
/* Tampilan dan kolom isian nama menumpuk di satu kotak bertinggi tetap: tanpa geseran. */
.name-cell {
  position: relative;
  display: grid;
  height: 2.25rem;
  min-width: 8rem;
  /* Teks nama sejajar dengan judul kolom; bingkai saat disorot/disunting menjorok ke kiri. */
  margin-inline-start: calc(-0.75rem - 1px);
}
.name-cell > .name-display,
.name-cell > .name-input {
  grid-area: 1 / 1;
  height: 100%;
  width: 100%;
  margin: 0;
}
.name-display {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.75rem;
  border: 1px solid transparent;
  border-radius: var(--tblr-border-radius);
  background: none;
  color: inherit;
  text-align: start;
  min-width: 0;
}
.name-display:hover,
.name-display:focus-visible {
  border-color: var(--tblr-border-color);
}
.name-pencil {
  flex: none;
  opacity: 0;
  color: var(--tblr-secondary);
}
.name-display:hover .name-pencil,
.name-display:focus-visible .name-pencil {
  opacity: 1;
}
.invalid-tooltip {
  white-space: normal;
}
/* Lebar tetap agar "Aktif"/"Nonaktif" tidak menggeser kolom lain. */
.status-cell {
  width: 8.5rem;
}
.status-switch {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  padding-inline-start: 0;
}
.status-switch .form-check-input {
  float: none;
  margin: 0;
}
.action-button {
  min-height: 44px;
  min-width: 44px;
}
td {
  vertical-align: middle;
}
</style>
