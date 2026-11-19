<script setup lang="ts">
import { APP_NAME, ROLE_LABELS } from '@tyio/shared';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '../../api';
import { logout, sessionUser } from '../../session';

// Halaman sementara setelah login. Dashboard, layout, dan navigasi menyusul di langkah 0.5.

const router = useRouter();
const leaving = ref(false);
const error = ref<string | null>(null);

async function leave(): Promise<void> {
  if (leaving.value) return;
  leaving.value = true;
  error.value = null;
  try {
    await logout();
    await router.replace({ name: 'login' });
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : 'Gagal keluar. Coba lagi.';
  } finally {
    leaving.value = false;
  }
}
</script>

<template>
  <main
    v-if="sessionUser"
    class="home"
  >
    <header class="home__header">
      <h1 class="home__title">
        {{ APP_NAME }}
      </h1>
      <button
        type="button"
        class="button"
        :aria-disabled="leaving"
        @click="leave"
      >
        Keluar
      </button>
    </header>

    <p
      v-if="error"
      class="notice notice--error"
      role="alert"
    >
      {{ error }}
    </p>

    <dl class="home__facts">
      <dt>Masuk sebagai</dt>
      <dd>{{ sessionUser.name }} · {{ ROLE_LABELS[sessionUser.role] }}</dd>
      <dt>Customer</dt>
      <dd>
        <template v-if="sessionUser.tenants.length === 0">
          Belum ada customer yang bisa dilihat.
        </template>
        <template v-else>
          {{ sessionUser.allTenants ? 'Semua customer:' : 'Dibatasi ke:' }}
          {{ sessionUser.tenants.map((tenant) => `${tenant.name} (${tenant.code})`).join(', ') }}
        </template>
      </dd>
    </dl>

    <p class="home__note">
      Dashboard dan menu menyusul di langkah berikutnya.
    </p>
  </main>
</template>

<style scoped>
.home {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
}

.home__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.home__title {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
}

.home__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 24px;
  margin: 0;
  padding: 16px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 8px;
}

.home__facts dt {
  color: var(--c-muted);
}

.home__facts dd {
  margin: 0;
}

.home__note {
  color: var(--c-muted);
}

.notice {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: 6px;
}

.notice--error {
  color: var(--c-danger-text);
  background: var(--c-danger-bg);
}

.button {
  min-height: 40px;
  padding: 0 16px;
  font: inherit;
  font-weight: 600;
  color: var(--c-text);
  background: var(--c-surface);
  border: 1px solid var(--c-input-border);
  border-radius: 6px;
  cursor: pointer;
}

.button:focus-visible {
  outline: 3px solid var(--c-focus);
  outline-offset: 2px;
}

@media (max-width: 480px) {
  .home__facts {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .home__facts dd + dt {
    margin-top: 8px;
  }
}
</style>
