<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ROLE_LABELS, tenantScopeLabel } from '../../labels';
import { useAuthStore } from '../../stores/auth';

// Beranda sementara: membuktikan sesi berjalan. Tata letak dan menu menyusul di 0.5.
const auth = useAuthStore();
const { user } = storeToRefs(auth);
const router = useRouter();
const leaving = ref(false);

async function logout(): Promise<void> {
  leaving.value = true;
  try {
    await auth.logout();
  } finally {
    await router.replace({ name: 'login' });
  }
}
</script>

<template>
  <div class="page">
    <div class="container-xl py-4">
      <div
        v-if="user"
        class="card"
      >
        <div class="card-body">
          <h1 class="h2 mb-3">
            Selamat datang, {{ user.displayName }}
          </h1>
          <dl class="row mb-4">
            <dt class="col-sm-3">
              Peran
            </dt>
            <dd class="col-sm-9">
              <span class="badge bg-blue-lt">{{ ROLE_LABELS[user.role] }}</span>
            </dd>
            <dt class="col-sm-3">
              Customer yang terlihat
            </dt>
            <dd class="col-sm-9">
              {{ tenantScopeLabel(user.tenantScope) }}
            </dd>
          </dl>
          <p class="text-secondary">
            Menu dan tata letak portal menyusul di langkah berikutnya.
          </p>
          <button
            type="button"
            class="btn btn-outline-secondary"
            :disabled="leaving"
            @click="logout"
          >
            Keluar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
