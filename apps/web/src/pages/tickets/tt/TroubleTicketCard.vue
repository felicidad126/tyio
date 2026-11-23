<script setup lang="ts">
import { IconCheck, IconCircleCheck, IconCopy } from '@tabler/icons-vue';
import { isRole, ROLE_LABELS, type RemoteZone, type TroubleTicket } from '@tyio/shared';
import { computed, nextTick, ref, useTemplateRef } from 'vue';
import { ticketApi } from '../ticket-api';
import { formatZoned } from '../zoned-time';
import TroubleTicketStatusPill from './TroubleTicketStatusPill.vue';

// Satu TT di halaman NPR (mockup DetailTiket "TT ke SD"). SD tidak login ke portal (K23):
// operator meneruskan TT lewat "Salin ringkasan TT", dan setiap salin tercatat (K25). TT ditutup
// L2/admin dengan hasil kunjungan (1.6, K21, T100); TT yang sudah ditutup tidak disalin lagi.

const props = defineProps<{
  tt: TroubleTicket;
  zone: RemoteZone;
  /** NPR induk masih berjalan (TT di NPR Ditutup tidak menerima entri). */
  ticketOpen: boolean;
  /** Pengguna L2/admin (K21). */
  canClose: boolean;
}>();
const emit = defineEmits<{ copied: []; close: [tt: TroubleTicket] }>();

const open = computed(() => props.ticketOpen && props.tt.status !== 'ditutup');
const roleLabel = (role: string) => (isRole(role) ? ROLE_LABELS[role] : role);

const copying = ref(false);
const justCopied = ref(false);
const error = ref('');
/** Bila clipboard tidak bisa dipakai: ringkasan ditampilkan untuk disalin manual. */
const manual = ref(false);
const manualField = useTemplateRef<HTMLTextAreaElement>('manualField');

const copyNote = computed(() => {
  if (props.tt.copiedCount === 0) return 'Belum, ringkasan belum disalin';
  const last = props.tt.lastCopiedAt ? formatZoned(props.tt.lastCopiedAt, props.zone) : '';
  return props.tt.copiedCount === 1 ? `Ringkasan disalin ${last}` : `Disalin ${props.tt.copiedCount} kali, terakhir ${last}`;
});

async function copy(): Promise<void> {
  copying.value = true;
  error.value = '';
  try {
    await navigator.clipboard.writeText(props.tt.summary);
  } catch {
    copying.value = false;
    manual.value = true;
    await nextTick();
    manualField.value?.select();
    return;
  }
  try {
    await ticketApi.troubleTicketCopied(props.tt.id);
    justCopied.value = true;
    emit('copied');
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Ringkasan tersalin, tetapi gagal dicatat.';
  } finally {
    copying.value = false;
  }
}
</script>

<template>
  <article
    :id="`tt-${tt.id}`"
    class="tt-card"
    :class="{ 'tt-card--closed': tt.status === 'ditutup' }"
    tabindex="-1"
    :aria-labelledby="`tt-${tt.id}-judul`"
  >
    <header class="tt-card__head">
      <h3
        :id="`tt-${tt.id}-judul`"
        class="tt-card__number font-monospace"
      >
        {{ tt.number }}
      </h3>
      <TroubleTicketStatusPill :status="tt.status" />
    </header>
    <dl class="tt-card__facts">
      <dt>Problem jarkom</dt>
      <dd>{{ tt.problem }}</dd>
      <dt>Kontak di lokasi</dt>
      <dd>{{ tt.contact ?? 'Belum ada' }}</dd>
      <dt>Dibuat</dt>
      <dd>{{ formatZoned(tt.createdAt, zone) }} · {{ tt.createdBy.name }}</dd>
      <dt>Diteruskan ke SD</dt>
      <dd>{{ copyNote }}</dd>
      <template v-if="tt.closure">
        <dt>Ditutup</dt>
        <dd>
          {{ formatZoned(tt.closure.closedAt, zone) }} · {{ tt.closure.closedBy.name }}
          <span class="text-secondary">· {{ roleLabel(tt.closure.closedBy.role) }}</span>
        </dd>
        <dt>Hasil kunjungan</dt>
        <dd>{{ tt.closure.resolution }}</dd>
      </template>
    </dl>
    <div
      v-if="open"
      class="tt-card__actions"
    >
      <button
        type="button"
        class="btn"
        :disabled="copying"
        @click="copy"
      >
        <IconCheck
          v-if="justCopied"
          size="18"
          aria-hidden="true"
        />
        <IconCopy
          v-else
          size="18"
          aria-hidden="true"
        />
        {{ justCopied ? 'Ringkasan disalin' : 'Salin ringkasan TT' }}
      </button>
      <button
        v-if="canClose"
        type="button"
        class="btn btn-close-tt"
        @click="emit('close', tt)"
      >
        <IconCircleCheck
          size="18"
          aria-hidden="true"
        />
        Tutup TT
      </button>
      <span
        class="text-secondary small"
        role="status"
      >{{ justCopied ? 'Tercatat di linimasa. Tempel ke chat SD.' : '' }}</span>
    </div>
    <p
      v-if="open && !canClose"
      class="text-secondary small m-0"
    >
      TT ditutup oleh L2 atau admin setelah hasil kunjungan SD masuk.
    </p>
    <div
      v-if="manual"
      class="tt-card__manual"
    >
      <label
        :for="`tt-${tt.id}-ringkasan`"
        class="form-label"
      >Peramban tidak mengizinkan salin otomatis. Salin teks ini (Ctrl+C):</label>
      <textarea
        :id="`tt-${tt.id}-ringkasan`"
        ref="manualField"
        class="form-control font-monospace"
        rows="5"
        readonly
        :value="tt.summary"
      />
    </div>
    <p
      v-if="error"
      class="text-danger small mb-0"
      role="alert"
    >
      {{ error }}
    </p>
  </article>
</template>

<style scoped>
.tt-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--tblr-border-color);
  border-left: 3px solid #9a3d0d;
  border-radius: 6px;
}

.tt-card--closed {
  border-left-color: #8a96a3;
}

.tt-card:target,
.tt-card:focus {
  outline: 2px solid var(--tblr-primary);
  outline-offset: 2px;
}

.tt-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tt-card__number {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.tt-card__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0;
  font-size: 14px;
}

.tt-card__facts dt {
  color: var(--tblr-secondary);
  font-weight: 400;
}

.tt-card__facts dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tt-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.tt-card__actions .btn {
  gap: 6px;
  min-height: 44px;
}

/* Penutupan: garis hijau seperti "Tutup NPR" di mockup, bukan tombol utama. */
.btn-close-tt {
  border-color: #1b6430;
  color: #1b6430;
}

:global([data-bs-theme='dark']) .btn-close-tt {
  border-color: #6fcf8a;
  color: #6fcf8a;
}

@media (max-width: 575.98px) {
  .tt-card__facts {
    grid-template-columns: 1fr;
  }

  .tt-card__facts dd {
    margin-bottom: 6px;
  }
}
</style>
