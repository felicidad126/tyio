<script setup lang="ts">
import { IconX } from '@tabler/icons-vue';
import {
  TICKET_CLOSE_CAUSE_LABELS,
  TICKET_CLOSE_CAUSES,
  TICKET_RESOLUTION_MAX_LENGTH,
  type TicketCloseCause,
  type TicketDetail,
  type TicketTimeline,
  type TroubleTicket,
} from '@npr/shared';
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue';
import { ticketApi } from '../ticket-api';

// Panel penutupan (langkah 1.6). "Tutup NPR": penyebab dari daftar tetap dan penyelesaian
// (T98). "Tutup TT": hasil kunjungan / penyelesaian (T100). Aturan peran K21 dan TT yang masih
// berjalan (T99) diperiksa server; tombol pembuka sudah mati bila aturannya tidak terpenuhi.

const props = defineProps<{ ticket: TicketDetail; troubleTicket: TroubleTicket | null }>();
const emit = defineEmits<{ saved: [timeline: TicketTimeline]; close: [] }>();

const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const causeField = useTemplateRef<HTMLSelectElement>('causeField');
const resolutionField = useTemplateRef<HTMLTextAreaElement>('resolutionField');
const cause = ref<TicketCloseCause | ''>('');
const resolution = ref('');
const causeError = ref('');
const resolutionError = ref('');
const formError = ref('');
const saving = ref(false);

const forTt = computed(() => props.troubleTicket !== null);
const title = computed(() => (forTt.value ? 'Tutup TT' : 'Tutup NPR'));
const resolutionLabel = computed(() => (forTt.value ? 'Hasil kunjungan / penyelesaian' : 'Penyelesaian'));

onMounted(async () => {
  dialog.value?.showModal();
  await nextTick();
  (forTt.value ? resolutionField.value : causeField.value)?.focus();
});

function close(): void {
  dialog.value?.close();
}

async function submit(): Promise<void> {
  formError.value = '';
  causeError.value = !forTt.value && cause.value === '' ? 'Pilih penyebab gangguan.' : '';
  resolutionError.value = resolution.value.trim() === '' ? `${resolutionLabel.value} wajib diisi.` : '';
  if (causeError.value) {
    causeField.value?.focus();
    return;
  }
  if (resolutionError.value) {
    resolutionField.value?.focus();
    return;
  }
  saving.value = true;
  try {
    const timeline = props.troubleTicket
      ? await ticketApi.closeTroubleTicket(props.troubleTicket.id, { resolution: resolution.value })
      : await ticketApi.close(props.ticket.id, { cause: cause.value as TicketCloseCause, resolution: resolution.value });
    emit('saved', timeline);
    close();
  } catch (failure) {
    formError.value = failure instanceof Error ? failure.message : `${title.value} gagal.`;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="close-dialog"
    aria-labelledby="judul-tutup"
    @close="emit('close')"
  >
    <form
      class="close-dialog__form"
      novalidate
      @submit.prevent="submit"
    >
      <header class="close-dialog__head">
        <div>
          <h2
            id="judul-tutup"
            class="close-dialog__title"
          >
            {{ title }}
          </h2>
          <p class="close-dialog__sub text-secondary">
            <span class="font-monospace">{{ troubleTicket ? troubleTicket.number : ticket.number }}</span>
            · {{ ticket.remote.name }}
          </p>
        </div>
        <button
          type="button"
          class="btn btn-icon btn-ghost-secondary close-dialog__close"
          aria-label="Tutup panel"
          @click="close"
        >
          <IconX
            size="20"
            aria-hidden="true"
          />
        </button>
      </header>

      <div class="close-dialog__body">
        <div v-if="!forTt">
          <label
            class="form-label required"
            for="tutup-penyebab"
          >Penyebab</label>
          <select
            id="tutup-penyebab"
            ref="causeField"
            v-model="cause"
            class="form-select"
            :class="{ 'is-invalid': causeError }"
            :aria-invalid="causeError ? 'true' : undefined"
            @change="causeError = ''"
          >
            <option
              value=""
              disabled
            >
              Pilih penyebab
            </option>
            <option
              v-for="value in TICKET_CLOSE_CAUSES"
              :key="value"
              :value="value"
            >
              {{ TICKET_CLOSE_CAUSE_LABELS[value] }}
            </option>
          </select>
          <div
            v-if="causeError"
            class="invalid-feedback d-block"
          >
            {{ causeError }}
          </div>
        </div>
        <div>
          <label
            class="form-label required"
            for="tutup-penyelesaian"
          >{{ resolutionLabel }}</label>
          <textarea
            id="tutup-penyelesaian"
            ref="resolutionField"
            v-model="resolution"
            class="form-control"
            :class="{ 'is-invalid': resolutionError }"
            rows="4"
            :maxlength="TICKET_RESOLUTION_MAX_LENGTH"
            :aria-invalid="resolutionError ? 'true' : undefined"
            aria-describedby="tutup-penyelesaian-bantuan"
            @input="resolutionError = ''"
          />
          <div
            v-if="resolutionError"
            class="invalid-feedback d-block"
          >
            {{ resolutionError }}
          </div>
          <div
            id="tutup-penyelesaian-bantuan"
            class="form-hint"
          >
            <template v-if="forTt">
              Temuan teknisi SD dan perbaikannya, mis. "Teknisi tiba 14:05, modem VSAT diganti, remote up 14:40".
            </template>
            <template v-else>
              Apa yang membuat remote pulih, mis. "PLN menyalakan kembali listrik gedung, remote up 15:10".
            </template>
          </div>
        </div>
        <p class="text-secondary small m-0">
          <template v-if="forTt">
            Status NPR tidak berubah. TT yang sudah ditutup tidak bisa disalin atau ditutup lagi.
          </template>
          <template v-else>
            NPR pindah ke Ditutup dan tidak menerima tindakan lagi. L2 atau admin bisa membukanya kembali.
          </template>
        </p>
        <div
          v-if="formError"
          class="alert alert-danger mb-0"
          role="alert"
        >
          {{ formError }}
        </div>
      </div>

      <footer class="close-dialog__foot">
        <button
          type="button"
          class="btn"
          @click="close"
        >
          Batal
        </button>
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="saving"
        >
          {{ saving ? 'Menyimpan…' : title }}
        </button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.close-dialog {
  width: min(520px, 100vw);
  max-width: 100vw;
  height: 100dvh;
  max-height: 100dvh;
  margin: 0 0 0 auto;
  padding: 0;
  border: 0;
  border-left: 1px solid var(--tblr-border-color);
  background: var(--tblr-bg-surface);
  color: var(--tblr-body-color);
  box-shadow: 0 0 24px rgba(24, 36, 51, 0.18);
}

.close-dialog::backdrop {
  background: rgba(24, 36, 51, 0.45);
}

.close-dialog__form {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.close-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--tblr-border-color);
}

.close-dialog__title {
  margin: 0;
  font-size: 18px;
}

.close-dialog__sub {
  margin: 2px 0 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.close-dialog__close {
  min-width: 44px;
  min-height: 44px;
}

.close-dialog__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  overflow-y: auto;
}

.close-dialog__body .form-select {
  min-height: 44px;
}

.close-dialog__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--tblr-border-color);
}

.close-dialog__foot .btn {
  min-height: 44px;
}
</style>
