<script setup lang="ts">
import { IconPaperclip, IconX } from '@tabler/icons-vue';
import {
  type CreateTicketAction,
  PENDING_TICKET_STATUSES,
  selectableNextStatuses,
  TICKET_ACTION_KIND_LABELS,
  TICKET_ACTION_KINDS_SELECTABLE,
  TICKET_ACTION_NOTE_MAX_LENGTH,
  TICKET_ATTACHMENT_ACCEPT,
  TICKET_ATTACHMENT_MAX_BYTES,
  TICKET_ATTACHMENT_TYPES,
  TICKET_ATTACHMENTS_PER_ACTION,
  TICKET_PENDING_REASON_MAX_LENGTH,
  TICKET_STATUS_LABELS,
  CUSTOMER_TICKET_NUMBER_MAX_LENGTH,
  type TicketAction,
  type TicketDetail,
  type TicketStatus,
  type TicketTimeline,
} from '@tyio/shared';
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue';
import { ApiError } from '../../../api';
import { ticketApi } from '../ticket-api';
import { formatZoned, fromZonedInput } from '../zoned-time';

// Panel "Tambah tindakan" (langkah 1.4, mockup DetailTiket). Dialog modal bawaan peramban:
// fokus terkunci di dalam panel, Escape menutup, fokus kembali ke tombol pembuka.
// Status sesudah tindakan dipilih di sini (T64); pending wajib alasan (T68); lampiran lewat
// klik, seret, atau tempel (T70). Penutupan NPR menyusul di 1.6 (T69).

const props = defineProps<{
  ticket: TicketDetail;
  /** Entri yang dikoreksi; panel menjadi "Koreksi entri". */
  correcting: TicketAction | null;
  /** Status awal yang dipilih (mis. Dikerjakan untuk "Buka kembali"). */
  initialStatus: TicketStatus | null;
}>();

const emit = defineEmits<{ saved: [timeline: TicketTimeline]; close: [] }>();

const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const noteField = useTemplateRef<HTMLTextAreaElement>('noteField');
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');

const zone = computed(() => props.ticket.remote.zone);
const reopening = computed(() => props.ticket.status === 'ditutup');
const kind = ref<CreateTicketAction['kind']>(props.correcting ? 'koreksi' : 'cek_jaringan');
const note = ref('');
const occurredAt = ref('');
const statusTo = ref<TicketStatus | ''>(props.initialStatus ?? '');
const pendingReason = ref('');
const customerTicketNumber = ref(props.ticket.customerTicketNumber ?? '');
const startedAt = ref('');
const files = ref<File[]>([]);
const errors = ref<Record<string, string>>({});
const formError = ref('');
const saving = ref(false);

const statusOptions = computed(() => selectableNextStatuses(props.ticket.status));
const isPending = computed(() => statusTo.value !== '' && PENDING_TICKET_STATUSES.includes(statusTo.value));
const correctsStart = computed(() => props.correcting?.kind === 'dibuat');
const title = computed(() => {
  if (props.correcting) return 'Koreksi entri';
  return reopening.value ? 'Buka kembali NPR' : 'Tambah tindakan';
});

onMounted(async () => {
  dialog.value?.showModal();
  await nextTick();
  noteField.value?.focus();
});

function close(): void {
  dialog.value?.close();
}

function addFiles(list: Iterable<File>): void {
  const problems: string[] = [];
  for (const file of list) {
    const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
    if (!TICKET_ATTACHMENT_TYPES[extension]) {
      problems.push(`${file.name}: jenis ini tidak diterima.`);
    } else if (file.size > TICKET_ATTACHMENT_MAX_BYTES) {
      problems.push(`${file.name}: lebih dari 10 MB.`);
    } else if (file.size === 0) {
      problems.push(`${file.name}: berkas kosong.`);
    } else if (files.value.length >= TICKET_ATTACHMENTS_PER_ACTION) {
      problems.push(`Paling banyak ${TICKET_ATTACHMENTS_PER_ACTION} lampiran per tindakan.`);
      break;
    } else {
      files.value = [...files.value, file];
    }
  }
  if (problems.length > 0) errors.value = { ...errors.value, files: problems.join(' ') };
  else delete errors.value.files;
}

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement;
  addFiles(Array.from(input.files ?? []));
  input.value = '';
}

/** Tempel gambar (Ctrl+V) di mana pun di panel; teks biasa tetap ditempel ke isian. */
function onPaste(event: ClipboardEvent): void {
  const pasted = Array.from(event.clipboardData?.files ?? []);
  if (pasted.length === 0) return;
  event.preventDefault();
  const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
  addFiles(
    pasted.map((file, index) => {
      const extension = file.type === 'image/jpeg' ? 'jpg' : (file.type.split('/')[1] ?? 'png');
      const suffix = pasted.length > 1 ? `-${index + 1}` : '';
      return new File([file], `tempel-${stamp}${suffix}.${extension}`, { type: file.type });
    }),
  );
}

function onDrop(event: DragEvent): void {
  addFiles(Array.from(event.dataTransfer?.files ?? []));
}

function removeFile(index: number): void {
  files.value = files.value.filter((_, i) => i !== index);
  delete errors.value.files;
  fileInput.value?.focus();
}

function validate(): boolean {
  const next: Record<string, string> = {};
  if (note.value.trim() === '') next.note = 'Catatan wajib diisi.';
  if (isPending.value && pendingReason.value.trim() === '') next.pendingReason = 'Alasan pending wajib diisi.';
  if (reopening.value && statusTo.value === '') next.status = 'Pilih status sesudah dibuka kembali.';
  if (errors.value.files) next.files = errors.value.files;
  errors.value = next;
  return Object.keys(next).length === 0;
}

async function submit(): Promise<void> {
  formError.value = '';
  if (!validate()) {
    await nextTick();
    dialog.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    return;
  }
  const input: CreateTicketAction = { kind: kind.value, note: note.value };
  if (occurredAt.value) input.occurredAt = fromZonedInput(occurredAt.value, zone.value);
  if (statusTo.value) {
    input.statusTo = statusTo.value;
    input.statusFrom = props.ticket.status;
  }
  if (isPending.value) input.pendingReason = pendingReason.value;
  if (props.correcting) input.correctsId = props.correcting.id;
  if (correctsStart.value && startedAt.value) input.startedAt = fromZonedInput(startedAt.value, zone.value);
  if (customerTicketNumber.value.trim() !== (props.ticket.customerTicketNumber ?? '')) {
    input.customerTicketNumber = customerTicketNumber.value;
  }

  saving.value = true;
  try {
    const timeline = await ticketApi.addAction(props.ticket.id, input, files.value);
    emit('saved', timeline);
    close();
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : 'Tindakan gagal disimpan.';
    // Status berubah oleh orang lain: pilihan status dikembalikan agar diperiksa ulang.
    if (cause instanceof ApiError && cause.status === 409) statusTo.value = '';
  } finally {
    saving.value = false;
  }
}

const describedBy = (id: string, field: string) => [id, errors.value[field] ? `${id}-galat` : ''].filter(Boolean).join(' ');
</script>

<template>
  <dialog
    ref="dialog"
    class="action-dialog"
    aria-labelledby="judul-tindakan"
    @close="emit('close')"
    @paste="onPaste"
  >
    <form
      class="action-dialog__form"
      novalidate
      @submit.prevent="submit"
    >
      <header class="action-dialog__head">
        <div>
          <h2
            id="judul-tindakan"
            class="action-dialog__title"
          >
            {{ title }}
          </h2>
          <p class="action-dialog__sub text-secondary">
            <span class="font-monospace">{{ ticket.number }}</span> · {{ ticket.remote.name }}
          </p>
        </div>
        <button
          type="button"
          class="btn btn-icon btn-ghost-secondary action-dialog__close"
          aria-label="Tutup panel"
          @click="close"
        >
          <IconX
            size="20"
            aria-hidden="true"
          />
        </button>
      </header>

      <div class="action-dialog__body">
        <div
          v-if="correcting"
          class="corrected-ref"
        >
          <span class="text-secondary">Mengoreksi entri {{ TICKET_ACTION_KIND_LABELS[correcting.kind] }}
            {{ formatZoned(correcting.createdAt, zone) }} · {{ correcting.createdBy.name }}</span>
          <q class="corrected-ref__note">{{ correcting.note }}</q>
          <span class="form-hint">Entri lama tetap ada dan ditandai "dikoreksi".</span>
        </div>

        <div v-else>
          <label
            class="form-label required"
            for="tindakan-jenis"
          >Apa yang dikerjakan</label>
          <select
            id="tindakan-jenis"
            v-model="kind"
            class="form-select"
          >
            <option
              v-for="value in TICKET_ACTION_KINDS_SELECTABLE"
              :key="value"
              :value="value"
            >
              {{ TICKET_ACTION_KIND_LABELS[value] }}
            </option>
          </select>
        </div>

        <div>
          <label
            class="form-label required"
            for="tindakan-catatan"
          >{{ correcting ? 'Isi koreksi' : 'Catatan' }}</label>
          <textarea
            id="tindakan-catatan"
            ref="noteField"
            v-model="note"
            class="form-control"
            :class="{ 'is-invalid': errors.note }"
            rows="4"
            :maxlength="TICKET_ACTION_NOTE_MAX_LENGTH"
            :aria-invalid="errors.note ? 'true' : undefined"
            :aria-describedby="describedBy('tindakan-catatan-bantuan', 'note')"
            @input="delete errors.note"
          />
          <div
            v-if="errors.note"
            id="tindakan-catatan-bantuan-galat"
            class="invalid-feedback d-block"
          >
            {{ errors.note }}
          </div>
          <div
            id="tindakan-catatan-bantuan"
            class="form-hint"
          >
            {{ correcting ? 'Tulis apa yang benar, mis. "Waktu mulai 14:12 dari log NMS, bukan 14:30".'
              : 'Hasil cek atau apa yang disampaikan, mis. "Ping gagal 100%, remote lain di hub normal".' }}
          </div>
        </div>

        <div v-if="correctsStart">
          <label
            class="form-label"
            for="tindakan-mulai"
          >Mulai gangguan yang benar ({{ zone }})</label>
          <input
            id="tindakan-mulai"
            v-model="startedAt"
            type="datetime-local"
            class="form-control"
            aria-describedby="tindakan-mulai-bantuan"
          >
          <div
            id="tindakan-mulai-bantuan"
            class="form-hint"
          >
            Sekarang {{ formatZoned(ticket.startedAt, zone) }}. Kosongkan bila tidak berubah.
          </div>
        </div>

        <div>
          <label
            class="form-label"
            for="tindakan-waktu"
          >Waktu kejadian ({{ zone }})</label>
          <input
            id="tindakan-waktu"
            v-model="occurredAt"
            type="datetime-local"
            class="form-control"
            aria-describedby="tindakan-waktu-bantuan"
          >
          <div
            id="tindakan-waktu-bantuan"
            class="form-hint"
          >
            Kosongkan untuk saat ini. Waktu pencatatan diisi sistem dan tidak bisa diubah.
          </div>
        </div>

        <fieldset v-if="!correcting">
          <legend class="form-label">
            Status sesudah tindakan ini
          </legend>
          <div
            class="status-options"
            :aria-invalid="errors.status ? 'true' : undefined"
          >
            <label
              v-if="!reopening"
              class="status-option"
            >
              <input
                v-model="statusTo"
                type="radio"
                name="tindakan-status"
                value=""
                class="form-check-input"
              >
              Tetap {{ TICKET_STATUS_LABELS[ticket.status] }}
            </label>
            <label
              v-for="option in statusOptions"
              :key="option"
              class="status-option"
            >
              <input
                v-model="statusTo"
                type="radio"
                name="tindakan-status"
                :value="option"
                class="form-check-input"
              >
              {{ reopening ? `Buka kembali → ${TICKET_STATUS_LABELS[option]}` : TICKET_STATUS_LABELS[option] }}
            </label>
          </div>
          <div
            v-if="errors.status"
            class="invalid-feedback d-block"
          >
            {{ errors.status }}
          </div>
          <div
            v-if="!reopening"
            class="form-hint"
          >
            Pending · Customer atau Pending · TM: pilih pihak yang ditunggu. Menutup NPR belum tersedia di versi ini.
          </div>
        </fieldset>

        <div v-if="isPending">
          <label
            class="form-label required"
            for="tindakan-alasan"
          >Alasan pending</label>
          <textarea
            id="tindakan-alasan"
            v-model="pendingReason"
            class="form-control"
            :class="{ 'is-invalid': errors.pendingReason }"
            rows="2"
            :maxlength="TICKET_PENDING_REASON_MAX_LENGTH"
            :aria-invalid="errors.pendingReason ? 'true' : undefined"
            :aria-describedby="describedBy('tindakan-alasan-bantuan', 'pendingReason')"
            @input="delete errors.pendingReason"
          />
          <div
            v-if="errors.pendingReason"
            id="tindakan-alasan-bantuan-galat"
            class="invalid-feedback d-block"
          >
            {{ errors.pendingReason }}
          </div>
          <div
            id="tindakan-alasan-bantuan"
            class="form-hint"
          >
            Mis. "Menunggu PIC cabang menyalakan ulang modem".
          </div>
        </div>

        <div v-if="!correcting">
          <label
            class="form-label"
            for="tindakan-tiket-customer"
          >No. tiket customer</label>
          <input
            id="tindakan-tiket-customer"
            v-model="customerTicketNumber"
            type="text"
            class="form-control font-monospace"
            :maxlength="CUSTOMER_TICKET_NUMBER_MAX_LENGTH"
            autocomplete="off"
            aria-describedby="tindakan-tiket-customer-bantuan"
          >
          <div
            id="tindakan-tiket-customer-bantuan"
            class="form-hint"
          >
            Nomor dari sistem customer, mis. INC-88213. Perubahannya tercatat di linimasa.
          </div>
        </div>

        <div>
          <span
            id="tindakan-lampiran-label"
            class="form-label"
          >Lampiran</span>
          <label
            class="dropzone"
            :class="{ 'is-invalid': errors.files }"
            @dragover.prevent
            @drop.prevent="onDrop"
          >
            <IconPaperclip
              size="18"
              aria-hidden="true"
            />
            <span>Klik untuk memilih berkas, atau tempel gambar (Ctrl+V)</span>
            <input
              ref="fileInput"
              type="file"
              multiple
              class="visually-hidden"
              :accept="TICKET_ATTACHMENT_ACCEPT"
              aria-labelledby="tindakan-lampiran-label"
              :aria-describedby="describedBy('tindakan-lampiran-bantuan', 'files')"
              :aria-invalid="errors.files ? 'true' : undefined"
              @change="onPick"
            >
          </label>
          <div
            v-if="errors.files"
            id="tindakan-lampiran-bantuan-galat"
            class="invalid-feedback d-block"
          >
            {{ errors.files }}
          </div>
          <div
            id="tindakan-lampiran-bantuan"
            class="form-hint"
          >
            Gambar, PDF, teks/log/CSV, Excel, atau Word. Paling besar 10 MB, paling banyak
            {{ TICKET_ATTACHMENTS_PER_ACTION }} berkas.
          </div>
          <ul
            v-if="files.length > 0"
            class="picked-files"
            aria-label="Berkas yang akan dilampirkan"
          >
            <li
              v-for="(file, index) in files"
              :key="`${file.name}-${index}`"
            >
              <span class="picked-files__name">{{ file.name }}</span>
              <button
                type="button"
                class="btn btn-sm btn-ghost-danger"
                :aria-label="`Hapus ${file.name} dari lampiran`"
                @click="removeFile(index)"
              >
                Hapus
              </button>
            </li>
          </ul>
        </div>

        <div
          v-if="formError"
          class="alert alert-danger mb-0"
          role="alert"
        >
          {{ formError }}
        </div>
      </div>

      <footer class="action-dialog__foot">
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
          {{ saving ? 'Menyimpan…' : correcting ? 'Simpan koreksi' : reopening ? 'Buka kembali NPR' : 'Simpan tindakan' }}
        </button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.action-dialog {
  width: min(560px, 100vw);
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

.action-dialog::backdrop {
  background: rgba(24, 36, 51, 0.45);
}

.action-dialog__form {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.action-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--tblr-border-color);
}

.action-dialog__title {
  margin: 0;
  font-size: 18px;
}

.action-dialog__sub {
  margin: 2px 0 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.action-dialog__close {
  min-width: 44px;
  min-height: 44px;
}

.action-dialog__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  overflow-y: auto;
}

.action-dialog__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--tblr-border-color);
}

.action-dialog__foot .btn {
  min-height: 44px;
}

fieldset {
  margin: 0;
  padding: 0;
  border: 0;
}

.status-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 6px;
}

.status-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 10px;
  border: 1px solid var(--tblr-border-color);
  border-radius: 6px;
  cursor: pointer;
}

.status-option:has(input:checked) {
  border-color: var(--tblr-primary);
  background: var(--tblr-primary-lt);
}

.status-option .form-check-input {
  margin: 0;
  flex-shrink: 0;
}

.corrected-ref {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-left: 3px solid #4a37a3;
  background: var(--tblr-bg-surface-secondary);
  font-size: 13px;
}

.corrected-ref__note {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.dropzone {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding: 10px 14px;
  border: 1px dashed var(--tblr-border-color);
  border-radius: 6px;
  cursor: pointer;
}

.dropzone:focus-within {
  outline: 2px solid var(--tblr-primary);
  outline-offset: 2px;
}

.dropzone.is-invalid {
  border-color: var(--tblr-danger);
}

.picked-files {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.picked-files li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 44px;
  border-bottom: 1px solid var(--tblr-border-color-translucent);
}

.picked-files__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picked-files .btn {
  min-height: 36px;
}
</style>
