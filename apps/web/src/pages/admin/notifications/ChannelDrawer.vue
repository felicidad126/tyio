<script setup lang="ts">
import { IconSearch, IconX } from '@tabler/icons-vue';
import {
  CHANNEL_NAME_MAX,
  channelNameError,
  DEFAULT_NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_HINTS,
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
  type TelegramChannel,
  type TelegramChannelInput,
  type TelegramChatCandidate,
  telegramChatIdError,
  type TenantRef,
} from '@tyio/shared';
import { computed, reactive, ref, useId, watch } from 'vue';
import { ApiError } from '../../../api/client';
import { notificationsApi } from '../../../api/notifications';
import AppDialog from '../../../components/AppDialog.vue';

// Form tambah/ubah grup penerima (panel samping). `channel` null = grup baru.
const props = defineProps<{ channel: TelegramChannel | null; tenants: TenantRef[]; botConfigured: boolean }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ saved: [channel: TelegramChannel] }>();

const ids = { title: useId(), name: useId(), chat: useId(), thread: useId(), events: useId(), scope: useId() };
type Field = 'name' | 'chatId' | 'threadId' | 'events' | 'tenantIds';

const form = reactive({
  name: '',
  chatId: '',
  threadId: '',
  events: [] as NotificationEvent[],
  scope: 'semua' as 'semua' | 'tertentu',
  tenantIds: [] as string[],
  active: true,
});
const touched = reactive<Record<Field, boolean>>({ name: false, chatId: false, threadId: false, events: false, tenantIds: false });
const serverErrors = reactive<Record<Field, string>>({ name: '', chatId: '', threadId: '', events: '', tenantIds: '' });
const submitted = ref(false);
const saving = ref(false);
const formError = ref('');
// Hasil "Cari grup" (chat yang baru terlihat bot).
const chats = ref<TelegramChatCandidate[] | null>(null);
const chatsLoading = ref(false);
const chatsError = ref('');

// Isi ulang setiap kali panel dibuka: dari grup yang diubah, atau isian bawaan grup baru.
watch(
  open,
  (value) => {
    if (!value) return;
    const c = props.channel;
    Object.assign(form, {
      name: c?.name ?? '',
      chatId: c?.chatId ?? '',
      threadId: c?.threadId ? String(c.threadId) : '',
      events: c ? [...c.events] : [...DEFAULT_NOTIFICATION_EVENTS],
      scope: c && !c.allTenants ? 'tertentu' : 'semua',
      tenantIds: c?.tenants.map((t) => t.id) ?? [],
      active: c?.active ?? true,
    });
    for (const key of Object.keys(touched) as Field[]) {
      touched[key] = false;
      serverErrors[key] = '';
    }
    submitted.value = false;
    formError.value = '';
    chats.value = null;
    chatsError.value = '';
  },
  { immediate: true },
);

// Customer yang dipilih tetap tampil walau sudah nonaktif (tidak ada di daftar customer aktif).
const tenantOptions = computed(() => {
  const list = [...props.tenants];
  for (const t of props.channel?.tenants ?? []) if (!list.some((x) => x.id === t.id)) list.push(t);
  return list.sort((x, y) => x.name.localeCompare(y.name, 'id'));
});

const show = (field: Field) => touched[field] || submitted.value;
const errors = computed<Record<Field, string>>(() => ({
  name: serverErrors.name || (show('name') ? channelNameError(form.name.trim()) : ''),
  chatId: serverErrors.chatId || (show('chatId') ? telegramChatIdError(form.chatId.trim()) : ''),
  threadId:
    serverErrors.threadId ||
    (show('threadId') && form.threadId.trim() && !/^[1-9]\d{0,9}$/.test(form.threadId.trim())
      ? 'ID topik berupa angka, atau kosongkan untuk topik umum.'
      : ''),
  events: serverErrors.events || (show('events') && form.events.length === 0 ? 'Pilih minimal satu kejadian.' : ''),
  tenantIds:
    serverErrors.tenantIds ||
    (show('tenantIds') && form.scope === 'tertentu' && form.tenantIds.length === 0
      ? 'Pilih minimal satu customer, atau Semua customer.'
      : ''),
}));

function edited(field: Field): void {
  serverErrors[field] = '';
}

// Cari grup: chat yang baru terlihat bot, untuk dipilih tanpa mencari ID chat sendiri.
async function findChats(): Promise<void> {
  chatsLoading.value = true;
  chatsError.value = '';
  try {
    chats.value = await notificationsApi.chats();
  } catch (error) {
    chatsError.value = error instanceof ApiError ? error.message : 'Daftar grup gagal dibaca.';
  } finally {
    chatsLoading.value = false;
  }
}
function pick(chat: TelegramChatCandidate): void {
  form.chatId = chat.chatId;
  if (!form.name.trim()) form.name = chat.title.slice(0, CHANNEL_NAME_MAX);
  edited('chatId');
}

async function submit(): Promise<void> {
  submitted.value = true;
  formError.value = '';
  if (Object.values(errors.value).some(Boolean)) return;
  const input: TelegramChannelInput = {
    name: form.name.trim(),
    chatId: form.chatId.trim(),
    threadId: form.threadId.trim() ? Number(form.threadId.trim()) : null,
    events: NOTIFICATION_EVENTS.filter((e) => form.events.includes(e)),
    allTenants: form.scope === 'semua',
    tenantIds: form.scope === 'semua' ? [] : form.tenantIds,
    active: form.active,
  };
  saving.value = true;
  try {
    const saved = props.channel
      ? await notificationsApi.update(props.channel.id, input)
      : await notificationsApi.create(input);
    open.value = false;
    emit('saved', saved);
  } catch (error) {
    const field = error instanceof ApiError ? (error.field as Field | undefined) : undefined;
    if (error instanceof ApiError && field && field in serverErrors) serverErrors[field] = error.message;
    else formError.value = error instanceof ApiError ? error.message : 'Gagal menyimpan. Coba lagi.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppDialog
    v-model:open="open"
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
          {{ channel ? `Ubah ${channel.name}` : 'Tambah grup Telegram' }}
        </h2>
        <div class="card-actions">
          <button
            type="button"
            class="btn btn-ghost-secondary btn-icon touch"
            aria-label="Tutup"
            title="Tutup"
            @click="open = false"
          >
            <IconX
              :size="20"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
      <div class="card-body overflow-auto">
        <div
          v-if="formError"
          class="alert alert-danger"
          role="alert"
        >
          {{ formError }}
        </div>

        <div class="mb-3">
          <label
            class="form-label required"
            :for="ids.name"
          >Nama</label>
          <input
            :id="ids.name"
            v-model="form.name"
            class="form-control"
            :class="{ 'is-invalid': errors.name }"
            type="text"
            :maxlength="CHANNEL_NAME_MAX"
            autocomplete="off"
            placeholder="mis. NOC Shift, Service Delivery"
            :aria-invalid="errors.name ? 'true' : undefined"
            :aria-describedby="errors.name ? `${ids.name}-error` : undefined"
            @input="edited('name')"
            @blur="touched.name = form.name !== ''"
          >
          <div
            v-if="errors.name"
            :id="`${ids.name}-error`"
            class="invalid-feedback"
          >
            {{ errors.name }}
          </div>
        </div>

        <div class="mb-3">
          <label
            class="form-label required"
            :for="ids.chat"
          >ID chat grup</label>
          <div class="input-group">
            <input
              :id="ids.chat"
              v-model="form.chatId"
              class="form-control font-monospace"
              :class="{ 'is-invalid': errors.chatId }"
              type="text"
              inputmode="text"
              maxlength="40"
              autocomplete="off"
              spellcheck="false"
              placeholder="-1001234567890"
              :aria-invalid="errors.chatId ? 'true' : undefined"
              :aria-describedby="`${ids.chat}-hint${errors.chatId ? ` ${ids.chat}-error` : ''}`"
              @input="edited('chatId')"
              @blur="touched.chatId = form.chatId !== ''"
            >
            <button
              v-if="botConfigured"
              type="button"
              class="btn touch"
              :disabled="chatsLoading"
              @click="findChats"
            >
              <IconSearch
                class="icon"
                :size="18"
                aria-hidden="true"
              />
              {{ chatsLoading ? 'Mencari…' : 'Cari grup' }}
            </button>
          </div>
          <div
            v-if="errors.chatId"
            :id="`${ids.chat}-error`"
            class="invalid-feedback d-block"
          >
            {{ errors.chatId }}
          </div>
          <div
            :id="`${ids.chat}-hint`"
            class="form-hint"
          >
            Tambahkan bot ke grup Telegram dulu, lalu tekan <strong>Cari grup</strong> dan pilih grupnya.
          </div>
          <p
            v-if="chatsError"
            class="text-danger small mt-2 mb-0"
            role="alert"
          >
            {{ chatsError }}
          </p>
          <div
            v-else-if="chats && chats.length === 0"
            class="alert alert-info mt-2 mb-0"
            role="status"
          >
            Belum ada grup yang terlihat bot dalam 24 jam terakhir. Tambahkan bot ke grup (atau kirim satu
            pesan di grup itu), lalu tekan Cari grup lagi.
          </div>
          <div
            v-else-if="chats"
            class="list-group mt-2"
            role="list"
            aria-label="Grup yang terlihat bot"
          >
            <button
              v-for="c in chats"
              :key="c.chatId"
              type="button"
              class="list-group-item list-group-item-action d-flex justify-content-between align-items-center touch"
              :class="{ active: form.chatId === c.chatId }"
              :aria-pressed="form.chatId === c.chatId"
              role="listitem"
              @click="pick(c)"
            >
              <span>
                {{ c.title }}
                <span class="d-block small font-monospace opacity-75">{{ c.chatId }}</span>
              </span>
              <span
                v-if="c.used"
                class="badge bg-secondary-lt"
              >sudah dipakai</span>
            </button>
          </div>
        </div>

        <div class="mb-3">
          <label
            class="form-label"
            :for="ids.thread"
          >ID topik <span class="text-secondary fw-normal">(opsional)</span></label>
          <input
            :id="ids.thread"
            v-model="form.threadId"
            class="form-control"
            :class="{ 'is-invalid': errors.threadId }"
            type="text"
            inputmode="numeric"
            maxlength="10"
            autocomplete="off"
            :aria-invalid="errors.threadId ? 'true' : undefined"
            :aria-describedby="`${ids.thread}-hint${errors.threadId ? ` ${ids.thread}-error` : ''}`"
            @input="edited('threadId')"
            @blur="touched.threadId = true"
          >
          <div
            v-if="errors.threadId"
            :id="`${ids.thread}-error`"
            class="invalid-feedback"
          >
            {{ errors.threadId }}
          </div>
          <div
            :id="`${ids.thread}-hint`"
            class="form-hint"
          >
            Hanya untuk grup dengan topik (forum). Kosongkan untuk mengirim ke topik umum.
          </div>
        </div>

        <fieldset
          class="mb-3"
          :aria-describedby="errors.events ? `${ids.events}-error` : undefined"
        >
          <legend class="form-label required">
            Kejadian yang dikirim
          </legend>
          <label
            v-for="event in NOTIFICATION_EVENTS"
            :key="event"
            class="form-check option"
          >
            <input
              v-model="form.events"
              class="form-check-input"
              type="checkbox"
              :value="event"
              @change="edited('events'); touched.events = true"
            >
            <span class="form-check-label">
              {{ NOTIFICATION_EVENT_LABELS[event] }}
              <span class="d-block small text-secondary">{{ NOTIFICATION_EVENT_HINTS[event] }}</span>
            </span>
          </label>
          <div
            v-if="errors.events"
            :id="`${ids.events}-error`"
            class="text-danger small"
          >
            {{ errors.events }}
          </div>
        </fieldset>

        <fieldset
          class="mb-3"
          :aria-describedby="errors.tenantIds ? `${ids.scope}-error` : undefined"
        >
          <legend class="form-label required">
            Customer
          </legend>
          <label class="form-check option">
            <input
              v-model="form.scope"
              class="form-check-input"
              type="radio"
              value="semua"
              @change="edited('tenantIds')"
            >
            <span class="form-check-label">Semua customer, termasuk yang ditambahkan nanti</span>
          </label>
          <label class="form-check option">
            <input
              v-model="form.scope"
              class="form-check-input"
              type="radio"
              value="tertentu"
              @change="edited('tenantIds')"
            >
            <span class="form-check-label">Customer tertentu</span>
          </label>
          <div
            v-if="form.scope === 'tertentu'"
            class="ms-4"
          >
            <label
              v-for="t in tenantOptions"
              :key="t.id"
              class="form-check option"
            >
              <input
                v-model="form.tenantIds"
                class="form-check-input"
                type="checkbox"
                :value="t.id"
                @change="edited('tenantIds'); touched.tenantIds = true"
              >
              <span class="form-check-label">{{ t.name }}</span>
            </label>
          </div>
          <div
            v-if="errors.tenantIds"
            :id="`${ids.scope}-error`"
            class="text-danger small"
          >
            {{ errors.tenantIds }}
          </div>
        </fieldset>

        <label class="form-check form-switch option">
          <input
            v-model="form.active"
            class="form-check-input"
            type="checkbox"
          >
          <span class="form-check-label">Aktif (nonaktifkan untuk berhenti mengirim sementara)</span>
        </label>
      </div>
      <div class="card-footer d-flex gap-2 justify-content-end">
        <button
          type="button"
          class="btn touch"
          @click="open = false"
        >
          Batal
        </button>
        <button
          type="submit"
          class="btn btn-primary touch"
          :disabled="saving"
        >
          <span
            v-if="saving"
            class="spinner-border spinner-border-sm me-2"
            aria-hidden="true"
          />
          {{ channel ? 'Simpan perubahan' : 'Tambah grup' }}
        </button>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.touch {
  min-height: 44px;
  min-width: 44px;
}
/* Pilihan setinggi jari: label dan kotaknya satu bidang sentuh. */
.option {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  min-height: 44px;
  padding-block: 0.5rem;
  margin-bottom: 0;
}
.option .form-check-input {
  flex-shrink: 0;
  margin-left: 0;
  margin-top: 0.15rem;
}
.form-check.option {
  padding-left: 0;
}
</style>
