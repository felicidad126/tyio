<script setup lang="ts">
import { IconFileTypePdf } from '@tabler/icons-vue';
import {
  ACTION_NOTE_MAX,
  formatInZone,
  PENDING_PARTY_LABELS,
  REPLACED_PART_LABELS,
  TICKET_ACTION_TYPE_LABELS,
  TICKET_STATUS_LABELS,
  type AddTicketActionResponse,
  type TicketAction,
  type TimeZoneName,
} from '@tyio/shared';
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue';
import { ApiError } from '../../../api/client';
import { ticketsApi } from '../../../api/tickets';
import { formatBytes, TICKET_STATUS_BADGE } from './ticket-display';

const props = defineProps<{ ticketId: string; action: TicketAction; zone: TimeZoneName; byId: Map<string, TicketAction> }>();
const emit = defineEmits<{ corrected: [result: AddTicketActionResponse] }>();

const noteId = useId();
const textarea = useTemplateRef<HTMLTextAreaElement>('textarea');
const correcting = ref(false);
const draft = ref('');
const error = ref('');
const saving = ref(false);

const corrects = computed(() => (props.action.correctsId ? props.byId.get(props.action.correctsId) : undefined));
const isCreation = computed(() => props.action.statusTo === 'terbuka' && props.action.statusFrom === null);
const parts = computed(() => props.action.replacedParts?.map((p) => REPLACED_PART_LABELS[p]).join(', '));

async function startCorrection(): Promise<void> {
  correcting.value = true;
  draft.value = '';
  error.value = '';
  await nextTick();
  textarea.value?.focus();
}

async function saveCorrection(): Promise<void> {
  if (!draft.value.trim()) {
    error.value = 'Tulis koreksinya.';
    return;
  }
  saving.value = true;
  try {
    emit('corrected', await ticketsApi.addAction(props.ticketId, { correctsId: props.action.id, note: draft.value.trim() }, []));
    correcting.value = false;
  } catch (failure) {
    error.value = failure instanceof ApiError ? failure.message : 'Koreksi gagal disimpan.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <li
    :id="`entri-${action.id}`"
    class="list-group-item entry"
  >
    <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
      <strong>{{ formatInZone(action.occurredAt, zone) }}</strong>
      <span
        v-if="action.type !== 'catatan'"
        class="badge bg-azure-lt"
      >{{ TICKET_ACTION_TYPE_LABELS[action.type] }}</span>
      <span class="text-secondary small">· dicatat {{ formatInZone(action.createdAt, zone) }} oleh {{ action.createdBy.displayName }}</span>
      <span
        v-if="action.correctedBy.length > 0"
        class="badge bg-secondary-subtle text-secondary-emphasis"
      >Dikoreksi</span>
    </div>

    <p
      v-if="isCreation"
      class="mb-1"
    >
      Tiket dibuat <span :class="TICKET_STATUS_BADGE.terbuka">{{ TICKET_STATUS_LABELS.terbuka }}</span>
    </p>
    <p
      v-else-if="action.statusTo"
      class="mb-1 d-flex flex-wrap align-items-center gap-1"
    >
      Status
      <span
        v-if="action.statusFrom"
        :class="TICKET_STATUS_BADGE[action.statusFrom]"
      >{{ TICKET_STATUS_LABELS[action.statusFrom] }}</span>
      <span aria-hidden="true">→</span>
      <span class="visually-hidden">menjadi</span>
      <span :class="TICKET_STATUS_BADGE[action.statusTo]">{{ TICKET_STATUS_LABELS[action.statusTo] }}</span>
    </p>
    <p
      v-if="action.pending"
      class="mb-1 text-secondary"
    >
      Menunggu {{ PENDING_PARTY_LABELS[action.pending.party] }}: {{ action.pending.reason }}
    </p>
    <p
      v-if="action.replacedParts"
      class="mb-1"
    >
      {{ parts ? `Part diganti: ${parts}` : 'Tidak ada part yang diganti' }}
    </p>
    <p
      v-if="corrects"
      class="mb-1 small"
    >
      Koreksi atas entri
      <a :href="`#entri-${corrects.id}`">{{ formatInZone(corrects.occurredAt, zone) }}</a>
    </p>
    <p
      v-if="action.note"
      class="mb-1 note"
    >
      {{ action.note }}
    </p>

    <ul
      v-if="action.attachments.length > 0"
      class="list-inline mb-1"
      aria-label="Lampiran"
    >
      <li
        v-for="file in action.attachments"
        :key="file.id"
        class="list-inline-item mb-2"
      >
        <a
          :href="ticketsApi.attachmentUrl(file.id)"
          target="_blank"
          rel="noopener"
          class="attachment"
          :aria-label="`Buka lampiran ${file.fileName}`"
        >
          <img
            v-if="file.contentType !== 'application/pdf'"
            :src="ticketsApi.attachmentUrl(file.id)"
            :alt="file.fileName"
            class="thumb"
            loading="lazy"
          >
          <span
            v-else
            class="d-inline-flex align-items-center gap-1"
          >
            <IconFileTypePdf
              :size="20"
              aria-hidden="true"
            />
            {{ file.fileName }} <span class="text-secondary small">({{ formatBytes(file.sizeBytes) }})</span>
          </span>
        </a>
      </li>
    </ul>

    <p
      v-if="action.correctedBy.length > 0"
      class="mb-1 small text-secondary"
    >
      Lihat koreksi:
      <a
        v-for="id in action.correctedBy"
        :key="id"
        :href="`#entri-${id}`"
        class="me-2"
      >{{ byId.get(id) ? formatInZone(byId.get(id)!.createdAt, zone) : 'entri' }}</a>
    </p>

    <div
      v-if="correcting"
      class="mt-2"
    >
      <label
        class="form-label"
        :for="noteId"
      >Koreksi untuk entri ini</label>
      <textarea
        :id="noteId"
        ref="textarea"
        v-model="draft"
        class="form-control"
        :class="{ 'is-invalid': error }"
        rows="2"
        :maxlength="ACTION_NOTE_MAX"
        placeholder="Tulis apa yang benar. Entri lama tetap tersimpan."
        @keydown.esc.prevent="correcting = false"
      />
      <div
        v-if="error"
        class="invalid-feedback"
      >
        {{ error }}
      </div>
      <div class="d-flex gap-2 mt-2">
        <button
          type="button"
          class="btn btn-primary target"
          :disabled="saving"
          @click="saveCorrection"
        >
          Simpan koreksi
        </button>
        <button
          type="button"
          class="btn target"
          @click="correcting = false"
        >
          Batal
        </button>
      </div>
    </div>
    <button
      v-else-if="!isCreation"
      type="button"
      class="btn btn-link px-0 target"
      :aria-label="`Koreksi entri ${formatInZone(action.occurredAt, zone)}`"
      @click="startCorrection"
    >
      Koreksi
    </button>
  </li>
</template>

<style scoped>
.note {
  white-space: pre-line;
}
.thumb {
  min-width: 4rem;
  min-height: 3rem;
  max-width: 10rem;
  max-height: 7rem;
  background: var(--tblr-bg-surface-secondary);
  border: 1px solid var(--tblr-border-color);
  border-radius: var(--tblr-border-radius);
  object-fit: contain;
}
.attachment {
  display: inline-block;
  min-height: 44px;
}
.target {
  min-height: 44px;
}
.entry:target {
  background: var(--tblr-highlight-bg, var(--tblr-yellow-lt));
}
</style>
