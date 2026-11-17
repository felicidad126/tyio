<script setup lang="ts">
import { IconAlertTriangle, IconDatabase, IconPlus } from '@tabler/icons-vue';
import { MASTER_LABELS, type MasterItem, type MasterList } from '@tyio/shared';
import { ADMIN_MASTER_LISTS } from '../../../navigation';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { ApiError } from '../../../api/client';
import { masterApi } from '../../../api/master';
import MasterCreateDrawer from './MasterCreateDrawer.vue';
import MasterDeleteDialog from './MasterDeleteDialog.vue';
import MasterRow from './MasterRow.vue';
import { MASTER_COPY } from './master-copy';

// Pola halaman: daftar (satu tabel per daftar master, dipilih lewat tab yang punya alamat).
const route = useRoute();
const list = computed(() => route.params.list as MasterList);
const label = computed(() => MASTER_LABELS[list.value]);

const items = ref<MasterItem[]>([]);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref('');
const notice = ref('');
const announcement = ref('');
const creating = ref(false);
const removing = ref<MasterItem | null>(null);

async function load(): Promise<void> {
  const requested = list.value;
  state.value = 'loading';
  notice.value = '';
  try {
    const result = await masterApi.list(requested);
    if (requested !== list.value) return; // tab sudah berganti sementara menunggu
    items.value = result;
    state.value = 'ready';
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : 'Daftar gagal dimuat.';
    state.value = 'error';
  }
}
watch(list, load, { immediate: true });

function byCode(a: MasterItem, b: MasterItem): number {
  return a.code.localeCompare(b.code);
}

function onCreated(item: MasterItem): void {
  items.value = [...items.value, item].sort(byCode);
  announcement.value = `${label.value} ${item.name} ditambahkan.`;
}

function onUpdated(item: MasterItem): void {
  items.value = items.value.map((existing) => (existing.id === item.id ? item : existing));
  notice.value = '';
  announcement.value = `${label.value} ${item.name} disimpan${item.active ? '' : ' (nonaktif)'}.`;
}

function onRemoved(item: MasterItem): void {
  items.value = items.value.filter((existing) => existing.id !== item.id);
  removing.value = null;
  announcement.value = `${label.value} ${item.name} dihapus.`;
}
</script>

<template>
  <div class="page-header mb-3">
    <div class="page-pretitle">
      Admin
    </div>
    <h1 class="page-title">
      Master data
    </h1>
  </div>

  <nav
    class="master-tabs mb-3"
    aria-label="Daftar master"
  >
    <ul class="nav nav-tabs flex-nowrap">
      <li
        v-for="option in ADMIN_MASTER_LISTS"
        :key="option"
        class="nav-item"
      >
        <RouterLink
          :to="{ name: 'admin-master', params: { list: option } }"
          class="nav-link tab-target"
          :class="{ active: option === list }"
          :aria-current="option === list ? 'page' : undefined"
        >
          {{ MASTER_LABELS[option] }}
        </RouterLink>
      </li>
    </ul>
  </nav>

  <div class="card">
    <div class="card-header flex-wrap gap-2">
      <div class="me-auto">
        <h2 class="card-title">
          {{ label }}
        </h2>
        <p class="card-subtitle mb-0">
          {{ MASTER_COPY[list].description }}
        </p>
      </div>
      <button
        v-if="state === 'ready' && items.length > 0"
        type="button"
        class="btn btn-primary add-button"
        @click="creating = true"
      >
        <IconPlus
          class="icon"
          :size="18"
          aria-hidden="true"
        />
        Tambah {{ label.toLowerCase() }}
      </button>
    </div>

    <div
      class="visually-hidden"
      role="status"
    >
      {{ announcement }}
    </div>
    <div
      v-if="notice"
      class="alert alert-danger m-3"
      role="alert"
    >
      {{ notice }}
    </div>

    <p
      v-if="state === 'loading'"
      class="card-body text-secondary mb-0"
    >
      Memuat {{ label.toLowerCase() }}…
    </p>

    <div
      v-else-if="state === 'error'"
      class="empty"
    >
      <div class="empty-icon text-danger">
        <IconAlertTriangle
          :size="40"
          aria-hidden="true"
        />
      </div>
      <p class="empty-title">
        Daftar {{ label.toLowerCase() }} gagal dimuat
      </p>
      <p class="empty-subtitle text-secondary">
        {{ loadError }}
      </p>
      <div class="empty-action">
        <button
          type="button"
          class="btn btn-primary"
          @click="load"
        >
          Muat ulang daftar
        </button>
      </div>
    </div>

    <div
      v-else-if="items.length === 0"
      class="empty"
    >
      <div class="empty-icon">
        <IconDatabase
          :size="40"
          aria-hidden="true"
        />
      </div>
      <p class="empty-title">
        Belum ada {{ label.toLowerCase() }}
      </p>
      <p class="empty-subtitle text-secondary">
        Tambahkan yang pertama agar bisa dipilih saat mencatat remote dan tiket.
      </p>
      <div class="empty-action">
        <button
          type="button"
          class="btn btn-primary"
          @click="creating = true"
        >
          <IconPlus
            class="icon"
            :size="18"
            aria-hidden="true"
          />
          Tambah {{ label.toLowerCase() }}
        </button>
      </div>
    </div>

    <table
      v-else
      class="table table-vcenter card-table"
    >
      <caption class="visually-hidden">
        Daftar {{ label.toLowerCase() }}
      </caption>
      <thead>
        <tr>
          <th
            scope="col"
            class="d-none d-md-table-cell"
          >
            Kode
          </th>
          <th scope="col">
            Nama
          </th>
          <th scope="col">
            Status
          </th>
          <th scope="col">
            <span class="visually-hidden">Aksi</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <MasterRow
          v-for="item in items"
          :key="item.id"
          :list="list"
          :item="item"
          @updated="onUpdated"
          @failed="notice = $event"
          @remove="removing = $event"
        />
      </tbody>
    </table>
  </div>

  <MasterCreateDrawer
    :key="list"
    v-model:open="creating"
    :list="list"
    @created="onCreated"
  />
  <MasterDeleteDialog
    :list="list"
    :item="removing"
    @close="removing = null"
    @removed="onRemoved"
    @updated="onUpdated"
  />
</template>

<style scoped>
/* Tab bergulir di dalam barisnya sendiri bila sempit, tidak menggeser halaman. */
.master-tabs {
  overflow-x: auto;
}
.tab-target,
.add-button {
  min-height: 44px;
}
</style>
