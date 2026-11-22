<script setup lang="ts">
import { IconSearch } from '@tabler/icons-vue';
import { type GlobalSearchResult, SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH } from '@tyio/shared';
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';
import TicketStatusPill from '../pages/tickets/TicketStatusPill.vue';
import { ticketApi } from '../pages/tickets/ticket-api';

// Pencarian global (langkah 1.5, T84): daftar langsung di bawah kotak cari saat mengetik,
// dikelompokkan NPR dan Remote. Pola combobox ARIA: panah atas/bawah memilih, Enter membuka
// (hasil pertama bila belum ada yang dipilih), Escape menutup. "/" memfokuskan kotak cari.

interface Option {
  id: string;
  kind: 'npr' | 'remote';
  to: { name: string; params: { id: string } };
}

const router = useRouter();
const input = useTemplateRef<HTMLInputElement>('input');
const query = ref('');
const result = ref<GlobalSearchResult | null>(null);
const open = ref(false);
const loading = ref(false);
const failed = ref(false);
const active = ref(-1);
let sequence = 0;
let debounce: ReturnType<typeof setTimeout> | undefined;

const options = computed<Option[]>(() => [
  ...(result.value?.tickets ?? []).map((hit) => ({
    id: hit.id,
    kind: 'npr' as const,
    to: { name: 'ticket-detail', params: { id: hit.id } },
  })),
  ...(result.value?.remotes ?? []).map((hit) => ({
    id: hit.id,
    kind: 'remote' as const,
    to: { name: 'remote-detail', params: { id: hit.id } },
  })),
]);
const optionId = (index: number) => `cari-global-${index}`;
const indexOf = (kind: Option['kind'], id: string) => options.value.findIndex((o) => o.kind === kind && o.id === id);
const tooShort = computed(() => query.value.trim().length < SEARCH_MIN_LENGTH);
const showPanel = computed(() => open.value && !tooShort.value);

function onInput(): void {
  clearTimeout(debounce);
  active.value = -1;
  open.value = true;
  if (tooShort.value) {
    result.value = null;
    return;
  }
  debounce = setTimeout(() => void run(query.value.trim()), 200);
}

async function run(q: string): Promise<void> {
  const mine = ++sequence;
  loading.value = true;
  failed.value = false;
  try {
    const found = await ticketApi.search(q);
    if (mine === sequence) result.value = found;
  } catch {
    if (mine === sequence) failed.value = true;
  } finally {
    if (mine === sequence) loading.value = false;
  }
}

function go(index: number): void {
  const option = options.value[index];
  if (!option) return;
  close();
  query.value = '';
  result.value = null;
  input.value?.blur();
  void router.push(option.to);
}

function close(): void {
  open.value = false;
  active.value = -1;
}

function onKeydown(event: KeyboardEvent): void {
  const count = options.value.length;
  if (event.key === 'ArrowDown' && count > 0) {
    event.preventDefault();
    open.value = true;
    active.value = (active.value + 1) % count;
  } else if (event.key === 'ArrowUp' && count > 0) {
    event.preventDefault();
    open.value = true;
    active.value = active.value <= 0 ? count - 1 : active.value - 1;
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (showPanel.value && count > 0) go(Math.max(active.value, 0));
  } else if (event.key === 'Escape') {
    if (open.value && !tooShort.value) {
      event.preventDefault();
      close();
    } else if (query.value) {
      query.value = '';
      result.value = null;
    }
  }
}

/** "/" di mana pun (selain saat mengetik di isian) memfokuskan kotak cari. */
function onShortcut(event: KeyboardEvent): void {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  if (target && (target.closest('input, textarea, select, [contenteditable="true"]') || target.isContentEditable)) return;
  if (document.querySelector('dialog[open]')) return;
  event.preventDefault();
  input.value?.focus();
}

onMounted(() => document.addEventListener('keydown', onShortcut));
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onShortcut);
  clearTimeout(debounce);
});

/** Menutup daftar saat fokus keluar dari komponen (klik di luar atau Tab). */
function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null;
  if (!next || !(event.currentTarget as HTMLElement).contains(next)) close();
}
</script>

<template>
  <div
    class="global-search"
    @focusout="onFocusOut"
  >
    <label
      for="cari-global"
      class="visually-hidden"
    >Cari di seluruh portal</label>
    <div class="input-icon">
      <span
        class="input-icon-addon"
        aria-hidden="true"
      ><IconSearch size="16" /></span>
      <input
        id="cari-global"
        ref="input"
        v-model="query"
        type="search"
        class="form-control global-search__input"
        placeholder="Cari NPR, no. tiket customer, remote"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="cari-global-hasil"
        :aria-expanded="showPanel ? 'true' : 'false'"
        :aria-activedescendant="showPanel && active >= 0 ? optionId(active) : undefined"
        aria-keyshortcuts="/"
        :maxlength="SEARCH_MAX_LENGTH"
        @input="onInput"
        @focus="open = true"
        @keydown="onKeydown"
      >
      <kbd
        class="global-search__kbd"
        aria-hidden="true"
      >/</kbd>
    </div>

    <div
      v-show="showPanel"
      class="global-search__panel"
    >
      <div
        id="cari-global-hasil"
        role="listbox"
        aria-label="Hasil pencarian"
      >
        <div
          v-if="result && result.tickets.length > 0"
          role="group"
          aria-labelledby="cari-global-npr"
        >
          <div
            id="cari-global-npr"
            class="global-search__group"
            role="presentation"
          >
            NPR
          </div>
          <div
            v-for="hit in result.tickets"
            :id="optionId(indexOf('npr', hit.id))"
            :key="hit.id"
            role="option"
            class="global-search__option"
            :aria-selected="active === indexOf('npr', hit.id) ? 'true' : 'false'"
            @mousedown.prevent
            @click="go(indexOf('npr', hit.id))"
            @mousemove="active = indexOf('npr', hit.id)"
          >
            <span class="global-search__main">
              <span class="font-monospace">{{ hit.number }}</span>
              <span class="text-secondary small">
                {{ hit.remote.name }} · {{ hit.customerName
                }}<template v-if="hit.customerTicketNumber"> · {{ hit.customerTicketNumber }}</template>
              </span>
            </span>
            <TicketStatusPill :status="hit.status" />
          </div>
        </div>
        <div
          v-if="result && result.remotes.length > 0"
          role="group"
          aria-labelledby="cari-global-remote"
        >
          <div
            id="cari-global-remote"
            class="global-search__group"
            role="presentation"
          >
            Remote
          </div>
          <div
            v-for="hit in result.remotes"
            :id="optionId(indexOf('remote', hit.id))"
            :key="hit.id"
            role="option"
            class="global-search__option"
            :aria-selected="active === indexOf('remote', hit.id) ? 'true' : 'false'"
            @mousedown.prevent
            @click="go(indexOf('remote', hit.id))"
            @mousemove="active = indexOf('remote', hit.id)"
          >
            <span class="global-search__main">
              <span>{{ hit.name }}</span>
              <span class="text-secondary small">
                <span class="font-monospace">{{ hit.code }}</span>
                <template v-if="hit.city"> · {{ hit.city }}</template> · {{ hit.customerName }}
              </span>
            </span>
          </div>
        </div>
      </div>
      <p
        class="global-search__status text-secondary"
        role="status"
      >
        <template v-if="failed">
          Pencarian gagal. Coba lagi sebentar lagi.
        </template>
        <template v-else-if="loading && !result">
          Mencari…
        </template>
        <template v-else-if="result && options.length === 0">
          Tidak ada NPR atau remote yang cocok dengan "{{ query.trim() }}".
        </template>
        <template v-else-if="result">
          {{ result.tickets.length }} NPR, {{ result.remotes.length }} remote. Enter membuka yang pertama.
        </template>
      </p>
    </div>
  </div>
</template>

<style scoped>
.global-search {
  position: relative;
  flex: 0 1 380px;
  min-width: 0;
  margin-right: auto;
}

.global-search__input {
  min-height: 36px;
  padding-right: 32px;
}

.global-search__kbd {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  padding: 0 6px;
  border: 1px solid var(--tblr-border-color);
  border-radius: 4px;
  background: var(--tblr-bg-surface-secondary);
  color: var(--tblr-secondary);
  font-size: 12px;
  box-shadow: none;
}

.global-search__panel {
  position: absolute;
  z-index: 1050;
  top: calc(100% + 6px);
  left: 0;
  width: min(520px, calc(100vw - 32px));
  max-height: min(70vh, 520px);
  overflow-y: auto;
  border: 1px solid var(--tblr-border-color);
  border-radius: 8px;
  background: var(--tblr-bg-surface);
  box-shadow: 0 8px 24px rgba(24, 36, 51, 0.16);
}

.global-search__group {
  padding: 10px 14px 4px;
  color: var(--tblr-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.global-search__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  padding: 6px 14px;
  cursor: pointer;
}

.global-search__option[aria-selected='true'] {
  background: var(--tblr-active-bg);
}

.global-search__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-wrap: anywhere;
}

.global-search__status {
  margin: 0;
  padding: 8px 14px 10px;
  border-top: 1px solid var(--tblr-border-color-translucent);
  font-size: 12px;
}

/* Ponsel: kotak cari mendapat baris sendiri di bawah jam dan tombol bilah atas. */
@media (max-width: 640px) {
  .global-search {
    flex: 1 1 100%;
    order: 10;
    margin-right: 0;
  }

  .global-search__input {
    min-height: 44px;
  }

  .global-search__kbd {
    display: none;
  }

  .global-search__panel {
    position: fixed;
    top: auto;
    left: 16px;
    right: 16px;
    width: auto;
    margin-top: 6px;
  }
}
</style>
