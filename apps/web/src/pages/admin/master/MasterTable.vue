<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { errorText } from './master-api';

// Tabel data master: ganti nama di tempat, aktifkan/nonaktifkan, dan hapus dengan
// konfirmasi yang menyebut nilainya. Pemanggilan API dilakukan induknya.

export interface MasterRow {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
}

const props = defineProps<{
  rows: readonly MasterRow[];
  /** Mis. "kategori"; dipakai di label tombol dan pesan. */
  noun: string;
  showCode: boolean;
  /** Kolom kode ditampilkan lebih dulu (customer); selain itu nama dulu. */
  codeFirst?: boolean;
  canEdit: boolean;
  /** Bila diisi, menonaktifkan meminta konfirmasi dengan akibat ini. */
  deactivateWarning?: (row: MasterRow) => string;
  rename: (row: MasterRow, name: string) => Promise<void>;
  setActive: (row: MasterRow, active: boolean) => Promise<void>;
  remove: (row: MasterRow) => Promise<void>;
}>();

type Mode = { kind: 'idle' } | { kind: 'rename'; name: string } | { kind: 'confirm-delete' } | { kind: 'confirm-deactivate' };

const modes = ref<Record<string, Mode>>({});
const errors = ref<Record<string, string>>({});
const busy = ref<string | null>(null);

const modeOf = (row: MasterRow): Mode => modes.value[row.id] ?? { kind: 'idle' };

async function setMode(row: MasterRow, mode: Mode, focusSelector?: string): Promise<void> {
  modes.value = { ...modes.value, [row.id]: mode };
  delete errors.value[row.id];
  if (focusSelector) {
    await nextTick();
    document.querySelector<HTMLElement>(`[data-row="${row.id}"] ${focusSelector}`)?.focus();
  }
}

/**
 * Menjalankan satu aksi baris. Selama berjalan, semua tombol baris itu nonaktif. Setelah
 * selesai, baris kembali ke tampilan biasa hanya bila mode-nya belum diganti pengguna,
 * agar konfirmasi yang baru dibuka tidak tertutup oleh aksi sebelumnya.
 */
async function run(row: MasterRow, work: () => Promise<void>, focusAfter = '.js-actions button'): Promise<void> {
  busy.value = row.id;
  const startedIn = modes.value[row.id];
  delete errors.value[row.id];
  try {
    await work();
    busy.value = null;
    if (modes.value[row.id] === startedIn) await setMode(row, { kind: 'idle' }, focusAfter);
  } catch (error) {
    errors.value = { ...errors.value, [row.id]: errorText(error) };
  } finally {
    busy.value = null;
  }
}

function saveName(row: MasterRow): Promise<void> {
  const mode = modeOf(row);
  if (mode.kind !== 'rename') return Promise.resolve();
  return run(row, () => props.rename(row, mode.name));
}

function toggleActive(row: MasterRow): void {
  if (row.active && props.deactivateWarning && modeOf(row).kind !== 'confirm-deactivate') {
    void setMode(row, { kind: 'confirm-deactivate' }, '.js-confirm');
    return;
  }
  void run(row, () => props.setActive(row, !row.active));
}
</script>

<template>
  <div class="table-responsive">
    <table class="table table-vcenter card-table master-table">
      <thead>
        <tr>
          <th
            v-if="showCode && codeFirst"
            class="w-1"
          >
            Kode
          </th>
          <th>Nama</th>
          <th
            v-if="showCode && !codeFirst"
            class="w-1"
          >
            Kode
          </th>
          <th class="w-1">
            Status
          </th>
          <th
            v-if="canEdit"
            class="w-1"
          >
            <span class="visually-hidden">Aksi</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.id"
          :data-row="row.id"
          :class="{ 'text-secondary': !row.active }"
        >
          <td
            v-if="showCode && codeFirst"
            class="font-monospace"
          >
            {{ row.code }}
          </td>
          <td>
            <form
              v-if="modeOf(row).kind === 'rename'"
              class="d-flex gap-2 flex-wrap align-items-center"
              @submit.prevent="saveName(row)"
              @keydown.esc="setMode(row, { kind: 'idle' }, '.js-actions button')"
            >
              <label
                class="visually-hidden"
                :for="`nama-${row.id}`"
              >Nama baru untuk {{ row.name }}</label>
              <input
                :id="`nama-${row.id}`"
                v-model="(modes[row.id] as { name: string }).name"
                class="form-control form-control-sm js-name"
                maxlength="80"
                required
              >
              <button
                type="submit"
                class="btn btn-sm btn-primary"
                :disabled="busy === row.id"
              >
                Simpan nama
              </button>
              <button
                type="button"
                class="btn btn-sm"
                @click="setMode(row, { kind: 'idle' }, '.js-actions button')"
              >
                Batal
              </button>
            </form>
            <span v-else>{{ row.name }}</span>
            <div
              v-if="modeOf(row).kind === 'confirm-delete'"
              class="confirm mt-2"
              role="group"
              :aria-label="`Konfirmasi hapus ${row.name}`"
            >
              <span>Hapus {{ noun }} <strong>{{ row.name }}</strong>? Tindakan ini tidak bisa dibatalkan.</span>
              <span class="d-flex gap-2">
                <button
                  type="button"
                  class="btn btn-sm btn-danger js-confirm"
                  :disabled="busy === row.id"
                  @click="run(row, () => remove(row))"
                >
                  Hapus {{ row.name }}
                </button>
                <button
                  type="button"
                  class="btn btn-sm"
                  @click="setMode(row, { kind: 'idle' }, '.js-actions button')"
                >
                  Batal
                </button>
              </span>
            </div>
            <div
              v-if="modeOf(row).kind === 'confirm-deactivate' && deactivateWarning"
              class="confirm mt-2"
              role="group"
              :aria-label="`Konfirmasi nonaktifkan ${row.name}`"
            >
              <span>{{ deactivateWarning(row) }}</span>
              <span class="d-flex gap-2">
                <button
                  type="button"
                  class="btn btn-sm btn-warning js-confirm"
                  :disabled="busy === row.id"
                  @click="toggleActive(row)"
                >
                  Nonaktifkan {{ row.name }}
                </button>
                <button
                  type="button"
                  class="btn btn-sm"
                  @click="setMode(row, { kind: 'idle' }, '.js-actions button')"
                >
                  Batal
                </button>
              </span>
            </div>
            <div
              v-if="errors[row.id]"
              class="text-danger small mt-1"
              role="alert"
            >
              {{ errors[row.id] }}
            </div>
          </td>
          <td
            v-if="showCode && !codeFirst"
            class="font-monospace"
          >
            {{ row.code }}
          </td>
          <td>
            <span
              class="pill"
              :class="row.active ? 'pill--on' : 'pill--off'"
            >{{ row.active ? 'Aktif' : 'Nonaktif' }}</span>
          </td>
          <td
            v-if="canEdit"
            class="text-nowrap actions-cell"
          >
            <div class="d-flex gap-2 js-actions">
              <button
                type="button"
                class="btn btn-sm"
                :aria-label="`Ganti nama ${row.name}`"
                :disabled="busy === row.id"
                @click="setMode(row, { kind: 'rename', name: row.name }, '.js-name')"
              >
                Ganti nama
              </button>
              <button
                type="button"
                class="btn btn-sm"
                :aria-label="`${row.active ? 'Nonaktifkan' : 'Aktifkan'} ${row.name}`"
                :disabled="busy === row.id"
                @click="toggleActive(row)"
              >
                {{ row.active ? 'Nonaktifkan' : 'Aktifkan' }}
              </button>
              <button
                type="button"
                class="btn btn-sm btn-ghost-danger"
                :aria-label="`Hapus ${row.name}`"
                :disabled="busy === row.id"
                @click="setMode(row, { kind: 'confirm-delete' }, '.js-confirm')"
              >
                Hapus
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/* Pil ukuran S (ATURAN.md §5): tinggi 22 px, huruf 12 px tebal 600. */
.pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.pill--on {
  background: #dcf2e1;
  color: #1b6430;
}

.pill--off {
  background: #eaedf1;
  color: #454f5c;
}

.confirm {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.btn-sm {
  min-height: 32px;
}

/* Ponsel: setiap baris bertumpuk (nama, kode, status, lalu aksi) agar tombol tidak
   tersembunyi di balik gulir mendatar. */
@media (max-width: 575.98px) {
  .btn-sm {
    min-height: 44px;
  }

  .master-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .master-table tr {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--tblr-border-color);
  }

  .master-table.card-table td,
  .master-table.card-table td:first-child,
  .master-table.card-table td:last-child {
    display: block;
    padding: 0;
    border: 0;
  }

  .master-table td:first-child {
    flex: 1 1 60%;
  }

  .master-table .actions-cell {
    flex-basis: 100%;
    white-space: normal;
  }

  .js-actions {
    flex-wrap: wrap;
  }
}
</style>
