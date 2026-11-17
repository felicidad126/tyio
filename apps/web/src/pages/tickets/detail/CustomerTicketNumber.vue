<script setup lang="ts">
import { IconPencil } from '@tabler/icons-vue';
import { CUSTOMER_TICKET_NUMBER_MAX, type TicketDetail } from '@tyio/shared';
import { nextTick, ref, useId, useTemplateRef } from 'vue';
import { ApiError } from '../../../api/client';
import { ticketsApi } from '../../../api/tickets';

// Satu kolom: diubah langsung di tempat. Enter menyimpan, Escape membatalkan.
const props = defineProps<{ ticket: TicketDetail }>();
const emit = defineEmits<{ updated: [ticket: TicketDetail] }>();

const errorId = useId();
const display = useTemplateRef<HTMLButtonElement>('display');
const input = useTemplateRef<HTMLInputElement>('input');
const editing = ref(false);
const draft = ref('');
const error = ref('');
const saving = ref(false);

async function start(): Promise<void> {
  draft.value = props.ticket.customerTicketNumber ?? '';
  error.value = '';
  editing.value = true;
  await nextTick();
  input.value?.select();
}

async function stop(): Promise<void> {
  editing.value = false;
  error.value = '';
  await nextTick();
  display.value?.focus();
}

async function save(): Promise<void> {
  if (saving.value) return;
  const value = draft.value.trim() || null;
  if (value === props.ticket.customerTicketNumber) return stop();
  saving.value = true;
  try {
    emit('updated', await ticketsApi.setCustomerTicketNumber(props.ticket.id, value));
    await stop();
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Gagal menyimpan. Coba lagi.';
  } finally {
    saving.value = false;
  }
}

function onBlur(): void {
  if (editing.value && !saving.value && !error.value) void save();
}
</script>

<template>
  <div class="d-flex flex-wrap align-items-center gap-2">
    <span class="text-secondary">No. tiket customer:</span>
    <div class="number-cell">
      <button
        v-show="!editing"
        ref="display"
        type="button"
        class="number-display"
        :aria-label="ticket.customerTicketNumber ? `Ubah nomor tiket customer ${ticket.customerTicketNumber}` : 'Isi nomor tiket customer'"
        @click="start"
      >
        <span :class="{ 'text-secondary': !ticket.customerTicketNumber }">{{ ticket.customerTicketNumber ?? 'Belum diisi' }}</span>
        <IconPencil
          :size="16"
          aria-hidden="true"
        />
      </button>
      <input
        v-if="editing"
        ref="input"
        v-model="draft"
        class="form-control number-input"
        :class="{ 'is-invalid': error }"
        type="text"
        :maxlength="CUSTOMER_TICKET_NUMBER_MAX"
        aria-label="Nomor tiket customer"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? errorId : undefined"
        :readonly="saving"
        @keydown.enter.prevent="save"
        @keydown.esc.prevent="stop"
        @blur="onBlur"
      >
      <div
        v-if="editing && error"
        :id="errorId"
        class="invalid-tooltip d-block"
        role="alert"
      >
        {{ error }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.number-cell {
  position: relative;
  display: grid;
  height: 2.25rem;
  min-width: 12rem;
}
.number-cell > * {
  grid-area: 1 / 1;
  height: 100%;
  margin: 0;
}
.number-display {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.75rem;
  border: 1px solid transparent;
  border-radius: var(--tblr-border-radius);
  background: none;
  color: inherit;
  font-family: var(--tblr-font-monospace);
}
.number-display:hover,
.number-display:focus-visible {
  border-color: var(--tblr-border-color);
}
</style>
