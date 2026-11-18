<script setup lang="ts">
import { IconPaperclip, IconX } from '@tabler/icons-vue';
import {
  ACTION_NOTE_MAX,
  type AddTicketActionResponse,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  ATTACHMENT_TYPES,
  canCloseTicket,
  localInputToUtc,
  manualStatusTargets,
  PENDING_PARTIES,
  PENDING_PARTY_HINTS,
  PENDING_PARTY_LABELS,
  PENDING_REASON_MAX,
  PENDING_REASON_MIN,
  type PendingParty,
  REPLACED_PART_LABELS,
  REPLACED_PARTS,
  type ReplacedPart,
  TICKET_ACTION_TYPE_HINTS,
  TICKET_ACTION_TYPE_LABELS,
  MANUAL_ACTION_TYPES,
  TICKET_FUTURE_TOLERANCE_MINUTES,
  TICKET_STATUS_LABELS,
  type ManualActionType,
  type TicketDetail,
  type TicketStatus,
  timeZoneLabel,
  utcToLocalInput,
} from '@tyio/shared';
import { computed, reactive, ref, useId, useTemplateRef, watch } from 'vue';
import { ApiError } from '../../../api/client';
import { ticketsApi } from '../../../api/tickets';
import { formatBytes, TICKET_STATUS_BADGE } from './ticket-display';

// Pola permukaan: form di halaman detail (bukan dialog), karena isinya beberapa kolom dan
// operator sering menempel tangkapan layar sambil membaca linimasa.
const props = defineProps<{ ticket: TicketDetail }>();
const emit = defineEmits<{ saved: [result: AddTicketActionResponse]; stale: [message: string]; busy: [busy: boolean] }>();

const ids = {
  type: useId(),
  time: useId(),
  status: useId(),
  reason: useId(),
  note: useId(),
  files: useId(),
  parts: useId(),
};
const fileInput = useTemplateRef<HTMLInputElement>('file-input');
const zone = computed(() => props.ticket.remote.timeZone);
// Selesai tidak dipilih di sini: NPR ditutup lewat jenis tindakan Close (T74).
const nextStatuses = computed(() => manualStatusTargets(props.ticket.status));
const canClose = computed(() => canCloseTicket(props.ticket.status));
const closeUnavailable = computed(() =>
  props.ticket.status === 'selesai'
    ? 'NPR sudah Selesai.'
    : `Close dari ${TICKET_STATUS_LABELS[props.ticket.status]}: ubah ke Dikerjakan dulu.`,
);

const form = reactive({
  type: 'catatan' as ManualActionType,
  occurredAt: utcToLocalInput(new Date(), zone.value),
  statusTo: '' as TicketStatus | '',
  pendingParty: '' as PendingParty | '',
  pendingReason: '',
  note: '',
  parts: [] as ReplacedPart[],
  noParts: false,
});
const files = ref<File[]>([]);
const closing = computed(() => form.type === 'close');
/** Close NPR yang punya TT: ada kunjungan teknisi, jadi laporan dan part wajib (K32, T75). */
const visit = computed(() => closing.value && props.ticket.tt !== null);
const typeHint = computed(() =>
  visit.value
    ? `${TICKET_ACTION_TYPE_HINTS.close} Ada TT: lampirkan laporan teknisi dan pilih part yang diganti.`
    : TICKET_ACTION_TYPE_HINTS[form.type],
);
const occurredLocal = computed(() => utcToLocalInput(new Date(props.ticket.occurredAt), zone.value));
const submitted = ref(false);
const saving = ref(false);
const serverErrors = reactive<Record<string, string>>({});
const formError = ref('');

const latestAllowed = () =>
  utcToLocalInput(new Date(Date.now() + TICKET_FUTURE_TOLERANCE_MINUTES * 60_000), zone.value);

const errors = computed(() => {
  const show = submitted.value;
  const pending = !closing.value && form.statusTo === 'pending';
  const reason = form.pendingReason.trim();
  const timeName = closing.value ? 'Waktu online kembali' : 'Waktu tindakan';
  return {
    occurredAt:
      serverErrors.occurredAt ||
      (show && !localInputToUtc(form.occurredAt, zone.value)
        ? `Isi ${timeName.toLowerCase()}.`
        : show && form.occurredAt > latestAllowed()
          ? `${timeName} tidak boleh di masa depan.`
          : show && closing.value && form.occurredAt < occurredLocal.value
            ? 'Waktu online kembali tidak boleh sebelum waktu kejadian NPR.'
            : ''),
    pendingParty:
      serverErrors.pendingParty || (show && pending && !form.pendingParty ? 'Pilih pihak yang ditunggu.' : ''),
    pendingReason:
      serverErrors.pendingReason ||
      (show && pending && (reason.length < PENDING_REASON_MIN || reason.length > PENDING_REASON_MAX)
        ? `Alasan pending ${PENDING_REASON_MIN}–${PENDING_REASON_MAX} karakter.`
        : ''),
    note:
      serverErrors.note ||
      (show && !form.note.trim() && closing.value
        ? 'Tulis catatan penyelesaian: apa yang membuat jarkom online kembali.'
        : show && !form.note.trim() && form.type !== 'catatan'
          ? `Tulis catatan untuk tindakan ${TICKET_ACTION_TYPE_LABELS[form.type]}.`
          : show && !form.note.trim() && !form.statusTo
            ? 'Tulis catatan atau ubah status.'
            : ''),
    type: serverErrors.type || '',
    statusTo: serverErrors.statusTo || '',
    replacedParts:
      serverErrors.replacedParts ||
      (show && visit.value && form.parts.length === 0 && !form.noParts
        ? 'Pilih part yang diganti, atau "Tidak ada part yang diganti".'
        : ''),
    lampiran:
      serverErrors.lampiran || (show && visit.value && files.value.length === 0 ? 'Lampirkan laporan teknisi.' : ''),
  };
});

// Status berubah dari luar form (rekan lewat pembaruan langsung, atau jawaban 409): pilihan
// yang bergantung pada status dikosongkan; catatan, waktu, dan lampiran yang sedang diisi tetap.
watch(
  () => props.ticket.status,
  () => {
    Object.assign(form, { type: 'catatan', statusTo: '', pendingParty: '', pendingReason: '', parts: [], noParts: false });
    submitted.value = false;
    for (const key of Object.keys(serverErrors)) serverErrors[key] = '';
  },
);

function clearServer(field: string): void {
  serverErrors[field] = '';
}

/** Part dan "Tidak ada part yang diganti" saling meniadakan. */
function onPart(): void {
  form.noParts = false;
  clearServer('replacedParts');
}
function onNoParts(): void {
  if (form.noParts) form.parts = [];
  clearServer('replacedParts');
}

/** Menambah berkas dari pilihan atau tempelan, dengan batas jenis, ukuran, dan jumlah. */
function addFiles(incoming: File[]): void {
  serverErrors.lampiran = '';
  for (const file of incoming) {
    if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
      serverErrors.lampiran = `${file.name}: hanya gambar PNG, JPEG, WebP, atau PDF.`;
    } else if (file.size > ATTACHMENT_MAX_BYTES) {
      serverErrors.lampiran = `${file.name} lebih dari 5 MB.`;
    } else if (files.value.length >= ATTACHMENT_MAX_FILES) {
      serverErrors.lampiran = `Paling banyak ${ATTACHMENT_MAX_FILES} lampiran per tindakan.`;
    } else {
      files.value = [...files.value, file];
    }
  }
}

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement;
  addFiles([...(input.files ?? [])]);
  input.value = '';
}

/** Tangkapan layar yang ditempel di kolom catatan menjadi lampiran; teks tetap tertempel biasa. */
function onPaste(event: ClipboardEvent): void {
  const images = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
  if (images.length === 0) return;
  event.preventDefault();
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  addFiles(images.map((f, i) => new File([f], `tempelan-${stamp}${i ? `-${i}` : ''}.${f.type.split('/')[1]}`, { type: f.type })));
}

function removeFile(index: number): void {
  files.value = files.value.filter((_, i) => i !== index);
}

async function submit(): Promise<void> {
  submitted.value = true;
  formError.value = '';
  if (Object.values(errors.value).some(Boolean)) return;
  saving.value = true;
  emit('busy', true);
  const statusTo = closing.value ? 'selesai' : form.statusTo;
  try {
    const result = await ticketsApi.addAction(
      props.ticket.id,
      {
        type: form.type,
        occurredAt: localInputToUtc(form.occurredAt, zone.value)!,
        note: form.note.trim() || undefined,
        ...(statusTo
          ? {
              statusTo,
              expectedStatus: props.ticket.status,
              ...(statusTo === 'pending'
                ? { pendingParty: form.pendingParty as PendingParty, pendingReason: form.pendingReason.trim() }
                : {}),
            }
          : {}),
        ...(visit.value ? { replacedParts: form.noParts ? [] : form.parts } : {}),
      },
      files.value,
    );
    emit('saved', result);
    Object.assign(form, {
      type: 'catatan',
      occurredAt: utcToLocalInput(new Date(), zone.value),
      statusTo: '',
      pendingParty: '',
      pendingReason: '',
      note: '',
      parts: [],
      noParts: false,
    });
    files.value = [];
    submitted.value = false;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      // Halaman memuat ulang tiket dan menampilkan pesannya; form ini dibuat ulang untuk
      // status yang baru, jadi pesannya tidak disimpan di sini.
      emit('stale', error.message);
    } else if (error instanceof ApiError && error.field) {
      serverErrors[error.field] = error.message;
    } else {
      formError.value = error instanceof ApiError ? error.message : 'Tindakan gagal disimpan. Coba lagi.';
    }
  } finally {
    saving.value = false;
    emit('busy', false);
  }
}
</script>

<template>
  <form
    class="card"
    novalidate
    aria-labelledby="tambah-tindakan"
    @submit.prevent="submit"
  >
    <div class="card-header">
      <h2
        id="tambah-tindakan"
        class="card-title"
      >
        Tambah tindakan
      </h2>
    </div>
    <div class="card-body">
      <div
        v-if="formError"
        class="alert alert-warning"
        role="alert"
      >
        {{ formError }}
      </div>
      <div class="row g-3">
        <fieldset class="col-12">
          <legend class="form-label">
            Jenis tindakan
          </legend>
          <div
            class="form-selectgroup"
            :aria-describedby="`${ids.type}-hint`"
          >
            <label
              v-for="type in MANUAL_ACTION_TYPES"
              :key="type"
              class="form-selectgroup-item"
            >
              <input
                v-model="form.type"
                type="radio"
                name="jenis-tindakan"
                :value="type"
                class="form-selectgroup-input"
                :disabled="type === 'close' && !canClose"
                :aria-describedby="type === 'close' && !canClose ? `${ids.type}-close` : undefined"
                @change="clearServer('type'); clearServer('note'); clearServer('statusTo')"
              >
              <span class="form-selectgroup-label target-type">{{ TICKET_ACTION_TYPE_LABELS[type] }}</span>
            </label>
          </div>
          <div
            :id="`${ids.type}-hint`"
            class="form-hint mt-1"
          >
            {{ typeHint }}
          </div>
          <div
            v-if="!canClose"
            :id="`${ids.type}-close`"
            class="form-hint"
          >
            {{ closeUnavailable }}
          </div>
          <div
            v-if="errors.type"
            class="invalid-feedback d-block"
          >
            {{ errors.type }}
          </div>
        </fieldset>
        <div class="col-12 col-md-6">
          <label
            class="form-label required"
            :for="ids.time"
          >{{ closing ? 'Waktu online kembali' : 'Waktu tindakan' }} ({{ timeZoneLabel(zone) }})</label>
          <input
            :id="ids.time"
            v-model="form.occurredAt"
            type="datetime-local"
            class="form-control target"
            :class="{ 'is-invalid': errors.occurredAt }"
            :max="latestAllowed()"
            @input="clearServer('occurredAt')"
          >
          <div
            v-if="errors.occurredAt"
            class="invalid-feedback"
          >
            {{ errors.occurredAt }}
          </div>
        </div>
        <div
          v-if="closing"
          class="col-12 col-md-6"
        >
          <span class="form-label">Status</span>
          <p
            class="mb-0 d-flex flex-wrap align-items-center gap-1 close-status"
            data-testid="status-close"
          >
            <span :class="TICKET_STATUS_BADGE[ticket.status]">{{ TICKET_STATUS_LABELS[ticket.status] }}</span>
            <span aria-hidden="true">→</span>
            <span class="visually-hidden">menjadi</span>
            <span :class="TICKET_STATUS_BADGE.selesai">{{ TICKET_STATUS_LABELS.selesai }}</span>
          </p>
          <div
            v-if="ticket.tt"
            class="form-hint"
          >
            {{ ticket.tt.number }} ikut ditutup.
          </div>
          <div
            v-if="errors.statusTo"
            class="invalid-feedback d-block"
          >
            {{ errors.statusTo }}
          </div>
        </div>
        <div
          v-else
          class="col-12 col-md-6"
        >
          <label
            class="form-label"
            :for="ids.status"
          >Ubah status</label>
          <select
            :id="ids.status"
            v-model="form.statusTo"
            class="form-select target"
            :class="{ 'is-invalid': errors.statusTo }"
            @change="clearServer('statusTo')"
          >
            <option value="">
              Tetap {{ TICKET_STATUS_LABELS[ticket.status] }}
            </option>
            <option
              v-for="status in nextStatuses"
              :key="status"
              :value="status"
            >
              {{ TICKET_STATUS_LABELS[status] }}
            </option>
          </select>
          <div
            v-if="errors.statusTo"
            class="invalid-feedback"
          >
            {{ errors.statusTo }}
          </div>
        </div>

        <fieldset
          v-if="visit"
          class="col-12"
          :aria-describedby="errors.replacedParts ? `${ids.parts}-error` : undefined"
        >
          <legend class="form-label required">
            Part yang diganti teknisi
          </legend>
          <div class="d-flex flex-wrap column-gap-4">
            <label
              v-for="part in REPLACED_PARTS"
              :key="part"
              class="form-check target-check mb-0"
            >
              <input
                v-model="form.parts"
                class="form-check-input"
                type="checkbox"
                :value="part"
                @change="onPart"
              >
              <span class="form-check-label">{{ REPLACED_PART_LABELS[part] }}</span>
            </label>
            <label class="form-check target-check mb-0">
              <input
                v-model="form.noParts"
                class="form-check-input"
                type="checkbox"
                @change="onNoParts"
              >
              <span class="form-check-label">Tidak ada part yang diganti</span>
            </label>
          </div>
          <div
            v-if="errors.replacedParts"
            :id="`${ids.parts}-error`"
            class="invalid-feedback d-block"
          >
            {{ errors.replacedParts }}
          </div>
        </fieldset>

        <template v-if="!closing && form.statusTo === 'pending'">
          <fieldset class="col-12 col-md-6">
            <legend class="form-label required">
              Menunggu pihak
            </legend>
            <div class="d-flex flex-column gap-1">
              <div
                v-for="party in PENDING_PARTIES"
                :key="party"
              >
                <label class="form-check target-check mb-0">
                  <input
                    v-model="form.pendingParty"
                    class="form-check-input"
                    :class="{ 'is-invalid': errors.pendingParty }"
                    type="radio"
                    name="pihak-pending"
                    :value="party"
                    :aria-describedby="`${ids.reason}-${party}`"
                    @change="clearServer('pendingParty')"
                  >
                  <span class="form-check-label">{{ PENDING_PARTY_LABELS[party] }}</span>
                </label>
                <!-- Keterangan di luar label: nama radio tetap "TM"/"Customer", keterangan sebagai deskripsi. -->
                <div
                  :id="`${ids.reason}-${party}`"
                  class="small text-secondary party-hint"
                >
                  {{ PENDING_PARTY_HINTS[party] }}
                </div>
              </div>
            </div>
            <div
              v-if="errors.pendingParty"
              class="invalid-feedback d-block"
            >
              {{ errors.pendingParty }}
            </div>
          </fieldset>
          <div class="col-12 col-md-6">
            <label
              class="form-label required"
              :for="ids.reason"
            >Alasan pending</label>
            <input
              :id="ids.reason"
              v-model="form.pendingReason"
              type="text"
              class="form-control target"
              :class="{ 'is-invalid': errors.pendingReason }"
              :maxlength="PENDING_REASON_MAX"
              placeholder="mis. lokasi tutup, buka besok pagi"
              @input="clearServer('pendingReason')"
            >
            <div
              v-if="errors.pendingReason"
              class="invalid-feedback"
            >
              {{ errors.pendingReason }}
            </div>
          </div>
        </template>

        <div class="col-12">
          <label
            class="form-label"
            :class="{ required: closing }"
            :for="ids.note"
          >{{ closing ? 'Catatan penyelesaian' : 'Catatan' }}</label>
          <textarea
            :id="ids.note"
            v-model="form.note"
            class="form-control"
            :class="{ 'is-invalid': errors.note }"
            rows="3"
            :maxlength="ACTION_NOTE_MAX"
            :placeholder="
              closing
                ? 'mis. Listrik PLN pulih, modem menyala, jarkom terpantau online.'
                : 'Apa yang dilakukan atau ditemukan. Tangkapan layar bisa langsung ditempel di sini.'
            "
            :aria-describedby="`${ids.note}-hint`"
            @input="clearServer('note')"
            @paste="onPaste"
          />
          <div
            v-if="errors.note"
            class="invalid-feedback"
          >
            {{ errors.note }}
          </div>
          <div
            :id="`${ids.note}-hint`"
            class="form-hint"
          >
            Tempel (Ctrl+V) tangkapan layar di kolom ini untuk melampirkannya.
          </div>
        </div>

        <div class="col-12">
          <input
            :id="ids.files"
            ref="file-input"
            type="file"
            class="visually-hidden"
            multiple
            :accept="ATTACHMENT_TYPES.join(',')"
            @change="onPick"
          >
          <button
            type="button"
            class="btn target"
            @click="fileInput?.click()"
          >
            <IconPaperclip
              class="icon"
              :size="18"
              aria-hidden="true"
            />
            {{ visit ? 'Lampirkan laporan teknisi' : 'Lampirkan berkas' }}
          </button>
          <span class="text-secondary small ms-2">
            <template v-if="visit">Wajib untuk NPR dengan TT. </template>Gambar atau PDF, maks. 5 MB,
            {{ ATTACHMENT_MAX_FILES }} berkas.
          </span>
          <div
            v-if="errors.lampiran"
            class="invalid-feedback d-block"
            role="alert"
          >
            {{ errors.lampiran }}
          </div>
          <ul
            v-if="files.length > 0"
            class="list-unstyled mt-2 mb-0"
            aria-label="Lampiran yang akan disimpan"
          >
            <li
              v-for="(file, index) in files"
              :key="`${file.name}-${index}`"
              class="d-flex align-items-center gap-2"
            >
              <span class="text-truncate">{{ file.name }}</span>
              <span class="text-secondary small">{{ formatBytes(file.size) }}</span>
              <button
                type="button"
                class="btn btn-ghost-secondary btn-icon target"
                :aria-label="`Lepas ${file.name}`"
                :title="`Lepas ${file.name}`"
                @click="removeFile(index)"
              >
                <IconX
                  :size="16"
                  aria-hidden="true"
                />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div class="card-footer d-flex justify-content-end">
      <button
        type="submit"
        class="btn btn-primary target"
        :disabled="saving"
      >
        <span
          v-if="saving"
          class="spinner-border spinner-border-sm me-2"
          aria-hidden="true"
        />
        {{ closing ? 'Close NPR' : 'Simpan tindakan' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
/* Keterangan pihak pending sejajar dengan teks pilihannya. */
.party-hint {
  margin-left: 2rem;
  margin-top: -0.25rem;
}
/* Pilihan jenis tindakan memenuhi tinggi sentuh. */
.target-type {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
.target {
  min-height: 44px;
  min-width: 44px;
}
/* Close yang belum bisa dipilih (Pending, Selesai) tampak redup; alasannya tertulis di bawah. */
.form-selectgroup-input:disabled + .form-selectgroup-label {
  opacity: 0.5;
  cursor: not-allowed;
}
/* Sejajar dengan kolom waktu di sebelahnya. */
.close-status {
  min-height: 44px;
}
.target-check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  margin: 0;
}
.target-check .form-check-input {
  float: none;
  margin: 0;
}
</style>
