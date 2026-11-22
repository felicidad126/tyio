<script setup lang="ts">
import { IconX } from '@tabler/icons-vue';
import {
  type TicketDetail,
  type TicketTimeline,
  TROUBLE_TICKET_CONTACT_MAX_LENGTH,
  TROUBLE_TICKET_PROBLEM_MAX_LENGTH,
} from '@tyio/shared';
import { nextTick, onMounted, ref, useTemplateRef } from 'vue';
import { ticketApi } from '../ticket-api';

// Panel "Buat TT ke SD" (langkah 1.5b): problem jarkom dan kontak di lokasi. Kontak terisi
// dari kontak remote pertama dan boleh diubah untuk TT ini (T92). Status NPR tidak berubah
// (T90). Sesudah disimpan, operator meneruskan TT dengan "Salin ringkasan TT" (K25).

const props = defineProps<{ ticket: TicketDetail }>();
const emit = defineEmits<{ saved: [timeline: TicketTimeline]; close: [] }>();

const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const problemField = useTemplateRef<HTMLTextAreaElement>('problemField');
const firstContact = props.ticket.remote.contacts[0];
const problem = ref('');
const contact = ref(
  firstContact
    ? [firstContact.name, firstContact.role].filter(Boolean).join(', ') + (firstContact.phone ? ` · ${firstContact.phone}` : '')
    : '',
);
const problemError = ref('');
const formError = ref('');
const saving = ref(false);

onMounted(async () => {
  dialog.value?.showModal();
  await nextTick();
  problemField.value?.focus();
});

function close(): void {
  dialog.value?.close();
}

async function submit(): Promise<void> {
  formError.value = '';
  if (problem.value.trim() === '') {
    problemError.value = 'Problem jarkom wajib diisi.';
    problemField.value?.focus();
    return;
  }
  saving.value = true;
  try {
    const timeline = await ticketApi.createTroubleTicket(props.ticket.id, {
      problem: problem.value,
      contact: contact.value,
    });
    emit('saved', timeline);
    close();
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : 'TT gagal disimpan.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="tt-dialog"
    aria-labelledby="judul-tt-baru"
    @close="emit('close')"
  >
    <form
      class="tt-dialog__form"
      novalidate
      @submit.prevent="submit"
    >
      <header class="tt-dialog__head">
        <div>
          <h2
            id="judul-tt-baru"
            class="tt-dialog__title"
          >
            Buat TT ke SD
          </h2>
          <p class="tt-dialog__sub text-secondary">
            <span class="font-monospace">{{ ticket.number }}</span> · {{ ticket.remote.name }}
          </p>
        </div>
        <button
          type="button"
          class="btn btn-icon btn-ghost-secondary tt-dialog__close"
          aria-label="Tutup panel"
          @click="close"
        >
          <IconX
            size="20"
            aria-hidden="true"
          />
        </button>
      </header>

      <div class="tt-dialog__body">
        <div>
          <label
            class="form-label required"
            for="tt-problem"
          >Problem jarkom</label>
          <textarea
            id="tt-problem"
            ref="problemField"
            v-model="problem"
            class="form-control"
            :class="{ 'is-invalid': problemError }"
            rows="4"
            :maxlength="TROUBLE_TICKET_PROBLEM_MAX_LENGTH"
            :aria-invalid="problemError ? 'true' : undefined"
            aria-describedby="tt-problem-bantuan"
            @input="problemError = ''"
          />
          <div
            v-if="problemError"
            class="invalid-feedback d-block"
          >
            {{ problemError }}
          </div>
          <div
            id="tt-problem-bantuan"
            class="form-hint"
          >
            Yang perlu dicek teknisi, mis. "Modem VSAT tidak sinkron, perlu cek BUC/LNB dan kabel IFL".
          </div>
        </div>
        <div>
          <label
            class="form-label"
            for="tt-kontak"
          >Kontak di lokasi</label>
          <input
            id="tt-kontak"
            v-model="contact"
            type="text"
            class="form-control"
            :maxlength="TROUBLE_TICKET_CONTACT_MAX_LENGTH"
            autocomplete="off"
            aria-describedby="tt-kontak-bantuan"
          >
          <div
            id="tt-kontak-bantuan"
            class="form-hint"
          >
            Terisi dari data remote; ubah bila PIC di lokasi berbeda. Hanya untuk TT ini.
          </div>
        </div>
        <p class="text-secondary small m-0">
          Status NPR tidak berubah. Sesudah disimpan, teruskan TT ke SD dengan "Salin ringkasan TT";
          SD tidak menerima notifikasi di portal.
        </p>
        <div
          v-if="formError"
          class="alert alert-danger mb-0"
          role="alert"
        >
          {{ formError }}
        </div>
      </div>

      <footer class="tt-dialog__foot">
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
          {{ saving ? 'Menyimpan…' : 'Simpan TT' }}
        </button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.tt-dialog {
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

.tt-dialog::backdrop {
  background: rgba(24, 36, 51, 0.45);
}

.tt-dialog__form {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tt-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--tblr-border-color);
}

.tt-dialog__title {
  margin: 0;
  font-size: 18px;
}

.tt-dialog__sub {
  margin: 2px 0 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.tt-dialog__close {
  min-width: 44px;
  min-height: 44px;
}

.tt-dialog__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  overflow-y: auto;
}

.tt-dialog__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--tblr-border-color);
}

.tt-dialog__foot .btn {
  min-height: 44px;
}
</style>
