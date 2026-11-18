<script setup lang="ts">
import { IconAlertTriangle, IconBrandTelegram, IconPlus, IconRefresh } from '@tabler/icons-vue';
import {
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUSES,
  type DeliveryStatus,
  formatInZone,
  NOTIFICATION_EVENT_LABELS,
  type NotificationDeliveriesResponse,
  type NotificationSettingsResponse,
  type TelegramChannel,
  type TenantRef,
} from '@tyio/shared';
import { computed, onBeforeUnmount, ref, useId } from 'vue';
import { RouterLink } from 'vue-router';
import { ApiError } from '../../../api/client';
import { notificationsApi } from '../../../api/notifications';
import { tenantsApi } from '../../../api/tenants';
import AppDialog from '../../../components/AppDialog.vue';
import TicketNumber from '../../../components/TicketNumber.vue';
import { useLiveNotices } from '../../../stores/live';
import AdminNav from '../AdminNav.vue';
import ChannelDrawer from './ChannelDrawer.vue';

// Pola halaman: pengaturan. Status bot di atas, grup penerima (daftar dengan aksi per baris),
// lalu log pengiriman untuk memeriksa notifikasi yang terlambat atau gagal.
const WIB = 'Asia/Jakarta';
const settings = ref<NotificationSettingsResponse | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref('');
const announcement = ref('');
const tenants = ref<TenantRef[]>([]);
void tenantsApi.list().then((list) => (tenants.value = list)).catch(() => undefined);

async function loadSettings(): Promise<void> {
  try {
    settings.value = await notificationsApi.settings();
    state.value = 'ready';
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : 'Pengaturan notifikasi gagal dimuat.';
    if (!settings.value) state.value = 'error';
  }
}
void loadSettings();

// Panel tambah/ubah.
const drawerOpen = ref(false);
const editing = ref<TelegramChannel | null>(null);
function openDrawer(channel: TelegramChannel | null): void {
  editing.value = channel;
  drawerOpen.value = true;
}
function onSaved(channel: TelegramChannel): void {
  const list = settings.value!.channels.filter((c) => c.id !== channel.id);
  settings.value!.channels = [...list, channel].sort((x, y) => x.name.localeCompare(y.name, 'id'));
  announcement.value = `Grup ${channel.name} disimpan${channel.active ? '' : ' (nonaktif)'}.`;
}

// Pesan uji per grup: hasilnya tampil di baris itu.
const testing = ref<string | null>(null);
const testResult = ref<Record<string, { ok: boolean; message: string }>>({});
async function sendTest(channel: TelegramChannel): Promise<void> {
  testing.value = channel.id;
  try {
    await notificationsApi.test(channel.id);
    testResult.value = { ...testResult.value, [channel.id]: { ok: true, message: 'Pesan uji terkirim. Periksa grupnya di Telegram.' } };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Pesan uji gagal dikirim.';
    testResult.value = { ...testResult.value, [channel.id]: { ok: false, message } };
  } finally {
    testing.value = null;
    announcement.value = testResult.value[channel.id]!.message;
  }
}

// Hapus dengan konfirmasi yang menyebut nama grupnya.
const removing = ref<TelegramChannel | null>(null);
const removeTitle = useId();
const removeError = ref('');
const removeBusy = ref(false);
const removeOpen = computed({
  get: () => removing.value !== null,
  set: (value) => {
    if (!value) removing.value = null;
  },
});
async function confirmRemove(): Promise<void> {
  const channel = removing.value;
  if (!channel) return;
  removeBusy.value = true;
  removeError.value = '';
  try {
    await notificationsApi.remove(channel.id);
    settings.value!.channels = settings.value!.channels.filter((c) => c.id !== channel.id);
    removing.value = null;
    announcement.value = `Grup ${channel.name} dihapus.`;
    void loadDeliveries();
  } catch (error) {
    removeError.value = error instanceof ApiError ? error.message : 'Gagal menghapus. Coba lagi.';
  } finally {
    removeBusy.value = false;
  }
}

// Log pengiriman.
const deliveries = ref<NotificationDeliveriesResponse | null>(null);
const statusFilter = ref<DeliveryStatus | ''>('');
const page = ref(1);
const deliveriesError = ref('');
async function loadDeliveries(): Promise<void> {
  try {
    deliveries.value = await notificationsApi.deliveries({ status: statusFilter.value || undefined, page: page.value });
    deliveriesError.value = '';
  } catch (error) {
    deliveriesError.value = error instanceof ApiError ? error.message : 'Log pengiriman gagal dimuat.';
  }
}
void loadDeliveries();
function setStatus(value: string): void {
  statusFilter.value = value as DeliveryStatus | '';
  page.value = 1;
  void loadDeliveries();
}
function goToPage(next: number): void {
  page.value = next;
  void loadDeliveries();
}
const lastPage = computed(() =>
  deliveries.value ? Math.max(1, Math.ceil(deliveries.value.total / deliveries.value.pageSize)) : 1,
);
const retrying = ref<string | null>(null);
async function retry(id: string): Promise<void> {
  retrying.value = id;
  try {
    await notificationsApi.retry(id);
    announcement.value = 'Kiriman dimasukkan lagi ke antrean.';
    await Promise.all([loadDeliveries(), loadSettings()]);
  } catch (error) {
    deliveriesError.value = error instanceof ApiError ? error.message : 'Gagal mengirim ulang.';
  } finally {
    retrying.value = null;
  }
}

async function reload(): Promise<void> {
  await Promise.all([loadSettings(), loadDeliveries()]);
}
// Ada perubahan tiket: notifikasinya dikirim di latar, jadi log dimuat ulang sesaat kemudian.
let pending: ReturnType<typeof setTimeout> | undefined;
useLiveNotices(() => {
  clearTimeout(pending);
  pending = setTimeout(() => void reload(), 2000);
});
onBeforeUnmount(() => clearTimeout(pending));

const STATUS_BADGE: Record<DeliveryStatus, string> = {
  menunggu: 'badge bg-warning-subtle text-warning-emphasis',
  mengirim: 'badge bg-info-subtle text-info-emphasis',
  terkirim: 'badge bg-success-subtle text-success-emphasis',
  gagal: 'badge bg-danger-subtle text-danger-emphasis',
};
const at = (iso: string) => formatInZone(iso, WIB);
const scopeText = (c: TelegramChannel) => (c.allTenants ? 'Semua customer' : c.tenants.map((t) => t.name).join(', '));
</script>

<template>
  <AdminNav />
  <div class="page-header mb-3 d-flex align-items-start gap-2">
    <div class="me-auto header-main">
      <div class="page-pretitle">
        Admin
      </div>
      <h1 class="page-title">
        Notifikasi
      </h1>
      <p class="text-secondary mb-0 mt-1">
        Kejadian tiket dikirim otomatis ke grup Telegram: NPR baru, TT untuk Service Delivery, NPR Selesai.
      </p>
    </div>
    <button
      type="button"
      class="btn btn-icon touch"
      aria-label="Muat ulang"
      title="Muat ulang"
      @click="reload"
    >
      <IconRefresh
        :size="18"
        aria-hidden="true"
      />
    </button>
  </div>

  <div
    class="visually-hidden"
    role="status"
  >
    {{ announcement }}
  </div>

  <p
    v-if="state === 'loading'"
    class="text-secondary"
    aria-busy="true"
  >
    Memuat pengaturan notifikasi…
  </p>

  <div
    v-else-if="state === 'error'"
    class="card"
  >
    <div class="empty">
      <div class="empty-icon text-danger">
        <IconAlertTriangle
          :size="40"
          aria-hidden="true"
        />
      </div>
      <p class="empty-title">
        Pengaturan notifikasi gagal dimuat
      </p>
      <p class="empty-subtitle text-secondary">
        {{ loadError }}
      </p>
      <div class="empty-action">
        <button
          type="button"
          class="btn btn-primary"
          @click="reload"
        >
          Muat ulang
        </button>
      </div>
    </div>
  </div>

  <template v-else-if="settings">
    <section
      class="card mb-3"
      aria-labelledby="bot-telegram"
      data-testid="status-bot"
    >
      <div class="card-body d-flex gap-3 align-items-start">
        <IconBrandTelegram
          :size="32"
          class="text-azure flex-shrink-0"
          aria-hidden="true"
        />
        <div>
          <h2
            id="bot-telegram"
            class="card-title mb-1"
          >
            Bot Telegram
          </h2>
          <template v-if="!settings.bot.configured">
            <p class="mb-1">
              <span class="badge bg-warning-subtle text-warning-emphasis">Belum dipasang</span>
              Notifikasi dicatat tetapi belum dikirim.
            </p>
            <p class="text-secondary small mb-0">
              Buat bot lewat @BotFather di Telegram, lalu pasang tokennya di server:
              <code>deploy/scripts/server.sh telegram</code>. Grup penerima sudah bisa diatur sekarang.
            </p>
          </template>
          <template v-else-if="settings.bot.error">
            <p class="mb-1">
              <span class="badge bg-danger-subtle text-danger-emphasis">Bermasalah</span>
              {{ settings.bot.error }}
            </p>
          </template>
          <p
            v-else
            class="mb-0"
          >
            <span class="badge bg-success-subtle text-success-emphasis">Tersambung</span>
            <span class="font-monospace ms-1">@{{ settings.bot.username }}</span>
            <span class="text-secondary small d-block mt-1">Tambahkan bot ini ke grup Telegram yang akan menerima notifikasi.</span>
          </p>
          <p
            v-if="!settings.publicUrl"
            class="text-secondary small mb-0 mt-1"
          >
            Pesan belum memuat tautan ke portal (PUBLIC_URL belum diisi di server).
          </p>
        </div>
      </div>
    </section>

    <section
      class="card mb-3"
      aria-labelledby="grup-penerima"
    >
      <div class="card-header flex-wrap gap-2">
        <div class="me-auto">
          <h2
            id="grup-penerima"
            class="card-title"
          >
            Grup penerima
          </h2>
          <p class="card-subtitle mb-0">
            Setiap kejadian dikirim sekali ke setiap grup aktif yang memilih kejadian dan customer-nya.
          </p>
        </div>
        <button
          v-if="settings.channels.length > 0"
          type="button"
          class="btn btn-primary touch"
          @click="openDrawer(null)"
        >
          <IconPlus
            class="icon"
            :size="18"
            aria-hidden="true"
          />
          Tambah grup
        </button>
      </div>

      <div
        v-if="settings.channels.length === 0"
        class="empty"
      >
        <p class="empty-title">
          Belum ada grup penerima
        </p>
        <p class="empty-subtitle text-secondary">
          Tambahkan bot ke grup Telegram NOC atau Service Delivery, lalu daftarkan grupnya di sini dan
          pilih kejadian yang dikirim.
        </p>
        <div class="empty-action">
          <button
            type="button"
            class="btn btn-primary touch"
            @click="openDrawer(null)"
          >
            <IconPlus
              class="icon"
              :size="18"
              aria-hidden="true"
            />
            Tambah grup
          </button>
        </div>
      </div>

      <ul
        v-else
        class="list-group list-group-flush"
        data-testid="daftar-grup"
      >
        <li
          v-for="c in settings.channels"
          :key="c.id"
          class="list-group-item"
          :data-testid="`grup-${c.name}`"
        >
          <div class="d-flex flex-wrap gap-2 align-items-start">
            <div class="me-auto channel-main">
              <div class="fw-bold">
                {{ c.name }}
                <span
                  v-if="!c.active"
                  class="badge bg-secondary-lt ms-1"
                >Nonaktif</span>
              </div>
              <div class="small text-secondary">
                <span class="font-monospace">{{ c.chatId }}</span><template v-if="c.threadId">
                  · topik {{ c.threadId }}
                </template> · {{ scopeText(c) }}
              </div>
              <div class="d-flex flex-wrap gap-1 mt-1">
                <span
                  v-for="e in c.events"
                  :key="e"
                  class="badge bg-azure-lt"
                >{{ NOTIFICATION_EVENT_LABELS[e] }}</span>
              </div>
              <p
                v-if="c.lastError"
                class="text-danger small mt-2 mb-0"
              >
                Gagal {{ at(c.lastError.at) }}: {{ c.lastError.message }}
              </p>
              <p
                v-else-if="c.lastSentAt"
                class="text-secondary small mt-2 mb-0"
              >
                Terkirim terakhir {{ at(c.lastSentAt) }}
              </p>
              <p
                v-if="c.waiting > 0"
                class="text-warning-emphasis small mt-1 mb-0"
              >
                {{ c.waiting }} notifikasi menunggu dikirim
              </p>
              <p
                v-if="testResult[c.id]"
                class="small mt-1 mb-0"
                :class="testResult[c.id]!.ok ? 'text-success' : 'text-danger'"
              >
                {{ testResult[c.id]!.message }}
              </p>
            </div>
            <div class="d-flex flex-wrap gap-2">
              <button
                type="button"
                class="btn touch"
                :disabled="!settings.bot.configured || testing === c.id"
                :title="settings.bot.configured ? 'Kirim satu pesan uji ke grup ini sekarang' : 'Token bot belum dipasang di server'"
                @click="sendTest(c)"
              >
                {{ testing === c.id ? 'Mengirim…' : 'Kirim uji' }}
              </button>
              <button
                type="button"
                class="btn touch"
                :aria-label="`Ubah ${c.name}`"
                @click="openDrawer(c)"
              >
                Ubah
              </button>
              <button
                type="button"
                class="btn btn-ghost-danger touch"
                :aria-label="`Hapus ${c.name}`"
                @click="removing = c; removeError = ''"
              >
                Hapus
              </button>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <section
      class="card"
      aria-labelledby="log-pengiriman"
    >
      <div class="card-header flex-wrap gap-2">
        <div class="me-auto">
          <h2
            id="log-pengiriman"
            class="card-title"
          >
            Log pengiriman
          </h2>
          <p class="card-subtitle mb-0">
            Kiriman gagal dicoba ulang otomatis sampai 24 jam; yang ditolak Telegram bisa dikirim ulang dari sini.
          </p>
        </div>
        <label
          class="visually-hidden"
          for="log-status"
        >Status kiriman</label>
        <select
          id="log-status"
          class="form-select w-auto touch"
          :value="statusFilter"
          @change="setStatus(($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            Semua status
          </option>
          <option
            v-for="s in DELIVERY_STATUSES"
            :key="s"
            :value="s"
          >
            {{ DELIVERY_STATUS_LABELS[s] }}
          </option>
        </select>
      </div>
      <p
        v-if="deliveriesError"
        class="text-danger card-body mb-0"
        role="alert"
      >
        {{ deliveriesError }}
      </p>
      <p
        v-else-if="deliveries && deliveries.items.length === 0"
        class="card-body text-secondary mb-0"
      >
        {{ statusFilter ? 'Tidak ada kiriman dengan status ini.' : 'Belum ada notifikasi yang dicatat.' }}
      </p>
      <table
        v-else-if="deliveries"
        class="table table-vcenter card-table"
        data-testid="log-pengiriman"
      >
        <thead>
          <tr>
            <th scope="col">
              Kejadian
            </th>
            <th
              scope="col"
              class="d-none d-md-table-cell"
            >
              Grup
            </th>
            <th scope="col">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="d in deliveries.items"
            :key="d.id"
          >
            <td>
              <div>{{ NOTIFICATION_EVENT_LABELS[d.event] }}</div>
              <RouterLink
                :to="{ name: 'ticket-detail', params: { id: d.ticketId } }"
                class="font-monospace small ticket-link"
              >
                <TicketNumber :number="d.ticketNumber" />
              </RouterLink>
              <div class="small text-secondary">
                {{ d.tenant }} · {{ at(d.createdAt) }}
              </div>
              <div class="d-md-none small text-secondary">
                {{ d.channel.name }}
              </div>
            </td>
            <td class="d-none d-md-table-cell">
              {{ d.channel.name }}
            </td>
            <td class="status-cell">
              <span :class="STATUS_BADGE[d.status]">{{ DELIVERY_STATUS_LABELS[d.status] }}</span>
              <div
                v-if="d.sentAt"
                class="small text-secondary"
              >
                {{ at(d.sentAt) }}
              </div>
              <div
                v-if="d.lastError && d.status !== 'terkirim'"
                class="small text-danger"
              >
                {{ d.lastError }}<template v-if="d.attempts > 1">
                  ({{ d.attempts }}× dicoba)
                </template>
              </div>
              <button
                v-if="d.status === 'gagal'"
                type="button"
                class="btn btn-sm mt-1 touch"
                :disabled="retrying === d.id"
                @click="retry(d.id)"
              >
                Kirim ulang
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <nav
        v-if="deliveries && deliveries.total > deliveries.pageSize"
        class="card-footer d-flex flex-wrap align-items-center gap-2"
        aria-label="Halaman log pengiriman"
      >
        <p class="m-0 me-auto text-secondary">
          Halaman {{ deliveries.page }} dari {{ lastPage }}
        </p>
        <button
          type="button"
          class="btn touch"
          :disabled="deliveries.page <= 1"
          @click="goToPage(deliveries.page - 1)"
        >
          Sebelumnya
        </button>
        <button
          type="button"
          class="btn touch"
          :disabled="deliveries.page >= lastPage"
          @click="goToPage(deliveries.page + 1)"
        >
          Berikutnya
        </button>
      </nav>
    </section>

    <ChannelDrawer
      v-model:open="drawerOpen"
      :channel="editing"
      :tenants="tenants"
      :bot-configured="settings.bot.configured"
      @saved="onSaved"
    />

    <AppDialog
      v-model:open="removeOpen"
      variant="confirm"
      :labelledby="removeTitle"
    >
      <div
        v-if="removing"
        class="card"
      >
        <div class="card-body">
          <h2
            :id="removeTitle"
            class="card-title"
          >
            Hapus grup {{ removing.name }}?
          </h2>
          <p class="text-secondary mb-0">
            Grup ini tidak menerima notifikasi lagi; antrean dan log kirimannya ikut terhapus. Untuk berhenti
            sementara, nonaktifkan lewat Ubah.
          </p>
          <p
            v-if="removeError"
            class="text-danger mt-2 mb-0"
            role="alert"
          >
            {{ removeError }}
          </p>
        </div>
        <div class="card-footer d-flex gap-2 justify-content-end">
          <button
            type="button"
            class="btn touch"
            autofocus
            @click="removing = null"
          >
            Batal
          </button>
          <button
            type="button"
            class="btn btn-danger touch"
            :disabled="removeBusy"
            @click="confirmRemove"
          >
            Hapus {{ removing.name }}
          </button>
        </div>
      </div>
    </AppDialog>
  </template>
</template>

<style scoped>
.header-main {
  flex: 1 1 auto;
  min-width: 0;
}
.touch {
  min-height: 44px;
  min-width: 44px;
}
.channel-main {
  min-width: 0;
  overflow-wrap: anywhere;
}
.ticket-link {
  display: inline-block;
  padding-block: 0.25rem;
  font-weight: 600;
}
.status-cell {
  min-width: 8rem;
  max-width: 18rem;
}
</style>
