<script setup lang="ts">
import { IconLogout, IconUser } from '@tabler/icons-vue';
import { ROLE_LABELS } from '@tyio/shared';
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../api';
import { useSessionStore } from '../stores/session';
import { THEME_OPTIONS, useThemeStore } from '../stores/theme';

// Menu akun berpola disclosure (tombol + panel), dikendalikan Vue, bukan JS dropdown
// Bootstrap (lihat catatan Tabler: komponen JS vanilla bentrok dengan Vue).
const session = useSessionStore();
const theme = useThemeStore();
const route = useRoute();
const router = useRouter();

const open = ref(false);
const leaving = ref(false);
const error = ref<string | null>(null);
const root = useTemplateRef<HTMLElement>('root');
const trigger = useTemplateRef<HTMLButtonElement>('trigger');

function close(returnFocus = false): void {
  if (!open.value) return;
  open.value = false;
  if (returnFocus) trigger.value?.focus();
}

function onDocumentClick(event: MouseEvent): void {
  if (open.value && !root.value?.contains(event.target as Node)) close();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close(true);
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));
watch(() => route.fullPath, () => close());

async function leave(): Promise<void> {
  if (leaving.value) return;
  leaving.value = true;
  error.value = null;
  try {
    await session.logout();
    await router.replace({ name: 'login' });
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : 'Gagal keluar. Coba lagi.';
  } finally {
    leaving.value = false;
  }
}
</script>

<template>
  <div
    v-if="session.user"
    ref="root"
    class="dropdown user-menu"
    @keydown="onKeydown"
  >
    <button
      ref="trigger"
      type="button"
      class="user-menu__trigger"
      :aria-expanded="open"
      aria-controls="menu-akun"
      @click="open = !open"
    >
      <span
        class="avatar avatar-sm user-menu__avatar"
        aria-hidden="true"
      >{{ session.initials }}</span>
      <span class="user-menu__text">
        <span class="user-menu__name">{{ session.user.name }}</span>
        <span class="user-menu__role">{{ ROLE_LABELS[session.user.role] }}</span>
      </span>
      <span class="visually-hidden">, menu akun</span>
    </button>

    <div
      v-show="open"
      id="menu-akun"
      class="dropdown-menu dropdown-menu-end show user-menu__panel"
    >
      <div class="dropdown-header user-menu__who">
        <strong>{{ session.user.name }}</strong>
        <span>{{ session.user.email }}</span>
      </div>
      <RouterLink
        :to="{ name: 'akun' }"
        class="dropdown-item"
      >
        <IconUser
          class="dropdown-item-icon"
          aria-hidden="true"
        />
        Akun
      </RouterLink>

      <div class="dropdown-divider" />
      <fieldset class="user-menu__theme">
        <legend class="dropdown-header">
          Tampilan
        </legend>
        <label
          v-for="option in THEME_OPTIONS"
          :key="option.value"
          class="dropdown-item user-menu__option"
        >
          <input
            type="radio"
            name="tema"
            class="form-check-input m-0 me-2"
            :value="option.value"
            :checked="theme.preference === option.value"
            @change="theme.choose(option.value)"
          >
          {{ option.label }}
        </label>
      </fieldset>

      <div class="dropdown-divider" />
      <p
        v-if="error"
        class="text-danger small px-3 mb-2"
        role="alert"
      >
        {{ error }}
      </p>
      <button
        type="button"
        class="dropdown-item"
        :aria-disabled="leaving"
        @click="leave"
      >
        <IconLogout
          class="dropdown-item-icon"
          aria-hidden="true"
        />
        Keluar
      </button>
    </div>
  </div>
</template>

<style scoped>
.user-menu {
  position: relative;
}

.user-menu__trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 8px 0 4px;
  border: 0;
  border-radius: var(--tblr-border-radius);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.user-menu__trigger:hover {
  background: var(--tblr-bg-surface-secondary);
}

.user-menu__trigger:focus-visible {
  outline: 2px solid var(--tblr-primary);
}

/* Mockup: biru muda dengan teks biru tua; di tema gelap dibalik agar tetap terbaca. */
.user-menu__avatar {
  background: light-dark(#dfeafb, #1d3a5c);
  color: light-dark(#0b4f99, #cfe1f7);
  font-weight: 700;
}

.user-menu__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
}

.user-menu__name {
  font-size: 13px;
  font-weight: 600;
}

.user-menu__role {
  font-size: 12px;
  color: var(--tblr-secondary);
}

.user-menu__panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 240px;
}

.user-menu__who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-transform: none;
  letter-spacing: normal;
  font-size: 13px;
  color: var(--tblr-body-color);
}

.user-menu__who span {
  color: var(--tblr-secondary);
  overflow-wrap: anywhere;
}

.user-menu__theme {
  margin: 0;
  padding: 0;
  border: 0;
}

.user-menu__option {
  cursor: pointer;
}

/* Di ponsel nama dan peran tidak terlihat, tetapi tetap dibacakan pembaca layar
   (tidak memakai display: none, yang ikut menghapusnya dari nama tombol). */
@media (max-width: 640px) {
  .user-menu__text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
