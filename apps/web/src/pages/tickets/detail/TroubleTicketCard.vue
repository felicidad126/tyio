<script setup lang="ts">
import { IconCopy, IconTruck, IconX } from '@tabler/icons-vue';
import { canOpenTroubleTicket, formatInZone, type TicketDetail, TT_PROBLEM_MAX, TT_PROBLEM_MIN } from '@tyio/shared';
import { computed, ref, useId } from 'vue';
import { ApiError } from '../../../api/client';
import { ticketsApi } from '../../../api/tickets';
import AppDialog from '../../../components/AppDialog.vue';

// TT (1.5b, K27/K44/T69): "Eskalasi To SD" membuka TT sekali per NPR untuk kunjungan teknisi;
// ringkasannya disalin untuk chat Service Delivery (K25). Pola permukaan: panel dari kanan
// (form singkat satu kolom), bukan halaman sendiri.
const props = defineProps<{ ticket: TicketDetail }>();
const emit = defineEmits<{ opened: [ticket: TicketDetail]; stale: [message: string]; copied: [] }>();

const ids = { title: useId(), problem: useId(), summary: useId() };
const drawer = ref(false);
const problem = ref('');
const submitted = ref(false);
const saving = ref(false);
const serverError = ref('');
const formError = ref('');

const problemError = computed(() => {
  if (serverError.value) return serverError.value;
  const length = problem.value.trim().length;
  return submitted.value && (length < TT_PROBLEM_MIN || length > TT_PROBLEM_MAX)
    ? `Problem untuk teknisi ${TT_PROBLEM_MIN}–${TT_PROBLEM_MAX.toLocaleString('id-ID')} karakter.`
    : '';
});

function start(): void {
  // Keterangan NPR sebagai titik awal; Helpdesk menyesuaikannya untuk teknisi.
  problem.value = props.ticket.problem;
  submitted.value = false;
  serverError.value = '';
  formError.value = '';
  drawer.value = true;
}

async function submit(): Promise<void> {
  submitted.value = true;
  formError.value = '';
  if (problemError.value) return;
  saving.value = true;
  try {
    const ticket = await ticketsApi.openTroubleTicket(props.ticket.id, {
      problem: problem.value.trim(),
      expectedStatus: props.ticket.status,
    });
    drawer.value = false;
    emit('opened', ticket);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      // Status berubah atau rekan sudah membuka TT: halaman memuat ulang tiket.
      drawer.value = false;
      emit('stale', error.message);
    } else if (error instanceof ApiError && error.field === 'problem') {
      serverError.value = error.message;
    } else {
      formError.value = error instanceof ApiError ? error.message : 'TT gagal dibuka. Coba lagi.';
    }
  } finally {
    saving.value = false;
  }
}

const copyState = ref<'idle' | 'copying' | 'copied' | 'manual' | 'error'>('idle');
const summaryText = ref('');
const copyError = ref('');

async function copy(): Promise<void> {
  copyState.value = 'copying';
  try {
    summaryText.value = await ticketsApi.troubleTicketSummary(props.ticket.id);
    try {
      await navigator.clipboard.writeText(summaryText.value);
      copyState.value = 'copied';
    } catch {
      // Clipboard ditolak browser: tampilkan teksnya untuk disalin manual.
      copyState.value = 'manual';
    }
    emit('copied');
  } catch (error) {
    copyState.value = 'error';
    copyError.value = error instanceof ApiError ? error.message : 'Ringkasan TT gagal dibuat. Coba lagi.';
  }
}
</script>

<template>
  <section
    class="card"
    aria-labelledby="trouble-ticket"
  >
    <div class="card-header">
      <h2
        id="trouble-ticket"
        class="card-title"
      >
        Trouble Ticket (TT)
      </h2>
    </div>
    <div class="card-body">
      <template v-if="ticket.tt">
        <p
          class="font-monospace fw-bold mb-1"
          data-testid="nomor-tt"
        >
          {{ ticket.tt.number }}
        </p>
        <p class="small text-secondary mb-2">
          Dibuka {{ formatInZone(ticket.tt.createdAt, ticket.remote.timeZone) }} oleh {{ ticket.tt.createdBy.displayName }}
          <template v-if="ticket.tt.closedAt">
            · ditutup bersama NPR {{ formatInZone(ticket.tt.closedAt, ticket.remote.timeZone) }}
          </template>
        </p>
        <p class="mb-3 tt-problem">
          {{ ticket.tt.problem }}
        </p>
        <button
          type="button"
          class="btn action-target"
          :disabled="copyState === 'copying'"
          @click="copy"
        >
          <IconCopy
            class="icon"
            :size="18"
            aria-hidden="true"
          />
          Salin ringkasan TT
        </button>
        <p
          v-if="copyState === 'copied'"
          class="text-success small mt-2 mb-0"
          role="status"
        >
          Ringkasan disalin. Tempel di chat Service Delivery.
        </p>
        <div
          v-else-if="copyState === 'manual'"
          class="mt-2"
        >
          <label
            class="form-label"
            :for="ids.summary"
          >Browser tidak mengizinkan salin otomatis; salin teks ini</label>
          <textarea
            :id="ids.summary"
            class="form-control font-monospace small"
            rows="8"
            readonly
            :value="summaryText"
          />
        </div>
        <p
          v-else-if="copyState === 'error'"
          class="text-danger small mt-2 mb-0"
          role="alert"
        >
          {{ copyError }}
        </p>
      </template>
      <template v-else-if="canOpenTroubleTicket(ticket.status)">
        <p class="text-secondary">
          Buka TT bila perlu kunjungan teknisi untuk problem jaringan (pihak TM). Satu NPR satu TT;
          status menjadi Eskalasi sampai teknisi datang.
        </p>
        <button
          type="button"
          class="btn btn-primary action-target"
          @click="start"
        >
          <IconTruck
            class="icon"
            :size="18"
            aria-hidden="true"
          />
          Eskalasi To SD
        </button>
      </template>
      <p
        v-else
        class="text-secondary mb-0"
      >
        Tiket sudah Selesai. Ubah ke Dikerjakan dulu bila masih perlu kunjungan teknisi.
      </p>
    </div>

    <AppDialog
      v-model:open="drawer"
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
            Eskalasi To SD
          </h2>
          <div class="card-actions">
            <button
              type="button"
              class="btn btn-ghost-secondary btn-icon close-button"
              aria-label="Tutup"
              title="Tutup"
              @click="drawer = false"
            >
              <IconX
                :size="20"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
        <div class="card-body overflow-auto">
          <p class="text-secondary">
            TT untuk kunjungan teknisi jaringan ke {{ ticket.remote.name }} ({{ ticket.remote.siteId }}). Nomor TT dibuat
            sistem; status tiket menjadi Eskalasi.
          </p>
          <div
            v-if="formError"
            class="alert alert-danger"
            role="alert"
          >
            {{ formError }}
          </div>
          <label
            class="form-label required"
            :for="ids.problem"
          >Problem untuk teknisi</label>
          <textarea
            :id="ids.problem"
            v-model="problem"
            class="form-control"
            :class="{ 'is-invalid': problemError }"
            rows="6"
            :maxlength="TT_PROBLEM_MAX"
            autofocus
            :aria-invalid="problemError ? 'true' : undefined"
            :aria-describedby="`${ids.problem}-hint${problemError ? ` ${ids.problem}-error` : ''}`"
            @input="serverError = ''"
          />
          <div
            v-if="problemError"
            :id="`${ids.problem}-error`"
            class="invalid-feedback"
          >
            {{ problemError }}
          </div>
          <div
            :id="`${ids.problem}-hint`"
            class="form-hint"
          >
            Apa yang perlu dicek atau diganti di lokasi, mis. modem, adaptor, BUC, atau LNB.
          </div>
        </div>
        <div class="card-footer d-flex gap-2 justify-content-end">
          <button
            type="button"
            class="btn action-target"
            @click="drawer = false"
          >
            Batal
          </button>
          <button
            type="submit"
            class="btn btn-primary action-target"
            :disabled="saving"
          >
            Buka TT
          </button>
        </div>
      </form>
    </AppDialog>
  </section>
</template>

<style scoped>
.action-target {
  min-height: 44px;
}
.close-button {
  min-width: 44px;
  min-height: 44px;
}
.tt-problem {
  white-space: pre-line;
}
</style>
