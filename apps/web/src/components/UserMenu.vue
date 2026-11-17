<script setup lang="ts">
import { IconDeviceDesktop, IconLogout, IconMoon, IconSun } from '@tabler/icons-vue';
import { storeToRefs } from 'pinia';
import { computed, ref, useId, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';
import { useDismiss } from '../composables/useDismiss';
import { ROLE_LABELS, tenantScopeLabel } from '../labels';
import { useAuthStore } from '../stores/auth';
import { type ThemePreference, useThemeStore } from '../stores/theme';

const auth = useAuthStore();
const { user } = storeToRefs(auth);
const theme = useThemeStore();
const router = useRouter();

const open = ref(false);
const leaving = ref(false);
const panelId = useId();
const container = useTemplateRef<HTMLElement>('container');
const trigger = useTemplateRef<HTMLElement>('trigger');
useDismiss(open, container, trigger);

const initials = computed(() =>
  (user.value?.displayName ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join(''),
);

const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof IconSun }> = [
  { value: 'system', label: 'Ikuti sistem', icon: IconDeviceDesktop },
  { value: 'light', label: 'Terang', icon: IconSun },
  { value: 'dark', label: 'Gelap', icon: IconMoon },
];

async function logout(): Promise<void> {
  leaving.value = true;
  try {
    await auth.logout();
  } finally {
    open.value = false;
    await router.replace({ name: 'login' });
  }
}
</script>

<template>
  <div
    v-if="user"
    ref="container"
    class="nav-item dropdown user-menu"
  >
    <button
      ref="trigger"
      type="button"
      class="nav-link d-flex lh-1 p-1 user-menu-trigger"
      :aria-label="`Menu pengguna ${user.displayName}`"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <span
        class="avatar avatar-sm bg-primary-lt"
        aria-hidden="true"
      >{{ initials }}</span>
      <span class="d-none d-xl-block ps-2 text-start">
        <span class="d-block">{{ user.displayName }}</span>
        <span class="d-block mt-1 small text-secondary">{{ ROLE_LABELS[user.role] }}</span>
      </span>
    </button>
    <div
      v-if="open"
      :id="panelId"
      class="dropdown-menu dropdown-menu-end dropdown-menu-arrow show user-menu-panel"
    >
      <!-- Teks biasa, bukan .dropdown-header: gaya huruf besar mengubah tampilan nama pengguna. -->
      <div class="px-3 py-2">
        <div class="fw-bold">
          {{ user.displayName }}
        </div>
        <div class="small text-secondary">
          {{ ROLE_LABELS[user.role] }} · {{ user.username }}
        </div>
        <div class="small text-secondary mt-1">
          Customer: {{ tenantScopeLabel(user.tenantScope) }}
        </div>
      </div>
      <div class="dropdown-divider" />
      <fieldset class="px-3 py-1">
        <legend class="dropdown-header p-0 mb-1">
          Tema
        </legend>
        <div
          class="btn-group w-100"
          role="group"
        >
          <button
            v-for="option in THEMES"
            :key="option.value"
            type="button"
            class="btn btn-sm theme-option"
            :class="theme.preference === option.value ? 'btn-primary' : 'btn-outline-secondary'"
            :aria-pressed="theme.preference === option.value"
            :title="option.label"
            @click="theme.preference = option.value"
          >
            <component
              :is="option.icon"
              :size="18"
              aria-hidden="true"
            />
            <span class="visually-hidden">{{ option.label }}</span>
          </button>
        </div>
      </fieldset>
      <div class="dropdown-divider" />
      <button
        type="button"
        class="dropdown-item"
        :disabled="leaving"
        @click="logout"
      >
        <IconLogout
          class="dropdown-item-icon"
          :size="18"
          aria-hidden="true"
        />
        Keluar
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Target sentuh minimal 44×44 px. */
.user-menu-trigger,
.theme-option,
.user-menu-panel .dropdown-item {
  min-height: 44px;
  min-width: 44px;
}
.user-menu-trigger {
  align-items: center;
  border: 0;
  background: none;
  color: inherit;
}
/* Tanpa JS Bootstrap (atribut data-bs-popper), posisi dropdown harus diatur sendiri:
   tepat di bawah pemicu, rata kanan, tidak keluar layar. */
.user-menu {
  position: relative;
}
.user-menu-panel {
  position: absolute;
  top: 100%;
  right: 0;
  left: auto;
  margin-top: 0.25rem;
  min-width: 17rem;
  max-width: calc(100vw - 2rem);
  white-space: normal;
}
</style>
