<script setup lang="ts">
import { APP_NAME } from '@tyio/shared';
import { computed, nextTick, reactive, ref, useTemplateRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../../api/client';
import { safeRedirectTarget } from '../../router/safe-redirect';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const form = reactive({ username: '', password: '' });
// Kolom yang pernah diisi lalu ditinggalkan. Kolom yang belum disentuh tidak ditandai saat
// kehilangan fokus: pesan yang muncul tiba-tiba menggeser tombol Masuk tepat saat diklik.
const dirty = reactive({ username: false, password: false });
const touched = reactive({ username: false, password: false });
const submitted = ref(false);
const submitting = ref(false);
const showPassword = ref(false);
const formError = ref('');
const passwordInput = useTemplateRef<HTMLInputElement>('password-input');

// Galat kolom muncul setelah kolom ditinggalkan atau setelah form dikirim, tidak saat mengetik.
const usernameError = computed(() =>
  (touched.username || submitted.value) && !form.username.trim() ? 'Isi nama pengguna.' : '',
);
const passwordError = computed(() =>
  (touched.password || submitted.value) && !form.password ? 'Isi kata sandi.' : '',
);

async function submit(): Promise<void> {
  submitted.value = true;
  formError.value = '';
  if (usernameError.value || passwordError.value) return;

  submitting.value = true;
  try {
    await auth.login({ username: form.username, password: form.password });
    await router.replace(safeRedirectTarget(route.query.next));
  } catch (error) {
    formError.value =
      error instanceof ApiError ? error.message : 'Terjadi kesalahan. Muat ulang halaman lalu coba lagi.';
    // Kosongkan sandi untuk diketik ulang, tanpa menandai kolomnya: pesan di atas sudah
    // menjelaskan masalahnya, dan "Isi kata sandi." di sini justru menyesatkan.
    form.password = '';
    submitted.value = false;
    dirty.password = false;
    touched.password = false;
    await nextTick();
    passwordInput.value?.focus();
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="page page-center">
    <div class="container container-tight py-4">
      <p class="text-center h2 mb-4">
        {{ APP_NAME }}
      </p>
      <div class="card card-md">
        <div class="card-body">
          <h1 class="h2 text-center mb-4">
            Masuk ke portal
          </h1>
          <div
            v-if="formError"
            class="alert alert-danger"
            role="alert"
          >
            {{ formError }}
          </div>
          <form
            novalidate
            @submit.prevent="submit"
          >
            <div class="mb-3">
              <label
                class="form-label"
                for="username"
              >Nama pengguna</label>
              <input
                id="username"
                v-model="form.username"
                class="form-control"
                :class="{ 'is-invalid': usernameError }"
                type="text"
                autocomplete="username"
                autocapitalize="none"
                spellcheck="false"
                autofocus
                :aria-invalid="usernameError ? 'true' : undefined"
                :aria-describedby="usernameError ? 'username-error' : undefined"
                @input="dirty.username = true"
                @blur="touched.username = dirty.username"
              >
              <div
                v-if="usernameError"
                id="username-error"
                class="invalid-feedback"
              >
                {{ usernameError }}
              </div>
            </div>
            <div class="mb-3">
              <label
                class="form-label"
                for="password"
              >Kata sandi</label>
              <div class="input-group input-group-flat">
                <input
                  id="password"
                  ref="password-input"
                  v-model="form.password"
                  class="form-control"
                  :class="{ 'is-invalid': passwordError }"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  :aria-invalid="passwordError ? 'true' : undefined"
                  :aria-describedby="passwordError ? 'password-error' : undefined"
                  @input="dirty.password = true"
                  @blur="touched.password = dirty.password"
                >
                <span class="input-group-text">
                  <button
                    type="button"
                    class="link-secondary bg-transparent border-0 p-0"
                    aria-controls="password"
                    @click="showPassword = !showPassword"
                  >
                    {{ showPassword ? 'Sembunyikan' : 'Tampilkan' }}
                  </button>
                </span>
              </div>
              <!-- Di luar grup input: di dalamnya, bayangan grup ikut membungkus pesan ini. -->
              <div
                v-if="passwordError"
                id="password-error"
                class="invalid-feedback d-block"
              >
                {{ passwordError }}
              </div>
            </div>
            <div class="form-footer">
              <button
                type="submit"
                class="btn btn-primary w-100"
                :disabled="submitting"
              >
                <span
                  v-if="submitting"
                  class="spinner-border spinner-border-sm me-2"
                  aria-hidden="true"
                />
                {{ submitting ? 'Memeriksa…' : 'Masuk' }}
              </button>
            </div>
          </form>
        </div>
      </div>
      <p class="text-center text-secondary mt-3">
        Lupa kata sandi atau akun terkunci? Hubungi admin portal.
      </p>
    </div>
  </div>
</template>
