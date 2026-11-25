<script setup lang="ts">
import { APP_NAME, COMPANY_NAME, EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '@npr/shared';
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../../api';
import AppFooter from '../../components/AppFooter.vue';
import AppLogo from '../../components/AppLogo.vue';
import { safeNextPath } from '../../router/next-path';
import { useSessionStore } from '../../stores/session';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const submitting = ref(false);
const emailError = ref<string | null>(null);
const passwordError = ref<string | null>(null);
const formError = ref<string | null>(null);

const emailInput = useTemplateRef<HTMLInputElement>('emailInput');
const passwordInput = useTemplateRef<HTMLInputElement>('passwordInput');

const sessionEnded = computed(() => route.query.sesi === 'berakhir');

onMounted(() => emailInput.value?.focus());

async function submit(): Promise<void> {
  if (submitting.value) return;
  formError.value = null;
  emailError.value = email.value.trim() === '' ? 'Isi email Anda.' : null;
  passwordError.value = password.value === '' ? 'Isi kata sandi Anda.' : null;
  if (emailError.value) return emailInput.value?.focus();
  if (passwordError.value) return passwordInput.value?.focus();

  submitting.value = true;
  try {
    await session.login({ email: email.value, password: password.value });
    await router.replace(safeNextPath(route.query.next) ?? '/');
  } catch (error) {
    formError.value =
      error instanceof ApiError ? error.message : 'Gagal masuk. Muat ulang halaman, lalu coba lagi.';
    if (error instanceof ApiError && error.status === 401) {
      password.value = '';
      await nextTick();
      passwordInput.value?.focus();
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login">
    <main class="page page-center login__main">
      <div class="container container-tight py-4">
        <div class="card card-md">
          <div class="card-body">
            <div class="d-flex align-items-center gap-3 mb-3">
              <AppLogo class="login__logo" />
              <div>
                <h1 class="h2 mb-0">
                  {{ APP_NAME }}
                </h1>
                <p class="text-secondary mb-0">
                  {{ COMPANY_NAME }}
                </p>
              </div>
            </div>
            <p class="text-secondary mb-4">
              Masuk dengan akun NOC Anda.
            </p>

            <p
              v-if="sessionEnded && !formError"
              class="alert alert-info"
              role="status"
            >
              Sesi Anda sudah berakhir. Silakan masuk lagi.
            </p>

            <form
              novalidate
              @submit.prevent="submit"
            >
              <div class="mb-3">
                <label
                  class="form-label"
                  for="login-email"
                >Email</label>
                <input
                  id="login-email"
                  ref="emailInput"
                  v-model="email"
                  class="form-control"
                  :class="{ 'is-invalid': emailError }"
                  type="email"
                  name="email"
                  autocomplete="username"
                  autocapitalize="none"
                  spellcheck="false"
                  :maxlength="EMAIL_MAX_LENGTH"
                  :aria-invalid="emailError ? 'true' : undefined"
                  :aria-describedby="emailError ? 'login-email-error' : undefined"
                  @input="emailError = null"
                >
                <p
                  v-if="emailError"
                  id="login-email-error"
                  class="invalid-feedback"
                >
                  {{ emailError }}
                </p>
              </div>

              <div class="mb-3">
                <div class="d-flex justify-content-between align-items-baseline">
                  <label
                    class="form-label"
                    for="login-password"
                  >Kata sandi</label>
                  <button
                    type="button"
                    class="btn btn-link btn-sm p-0 login__toggle"
                    :aria-pressed="showPassword"
                    aria-controls="login-password"
                    @click="showPassword = !showPassword"
                  >
                    {{ showPassword ? 'Sembunyikan' : 'Tampilkan' }}
                  </button>
                </div>
                <input
                  id="login-password"
                  ref="passwordInput"
                  v-model="password"
                  class="form-control"
                  :class="{ 'is-invalid': passwordError }"
                  :type="showPassword ? 'text' : 'password'"
                  name="password"
                  autocomplete="current-password"
                  :maxlength="PASSWORD_MAX_LENGTH"
                  :aria-invalid="passwordError ? 'true' : undefined"
                  :aria-describedby="passwordError ? 'login-password-error' : undefined"
                  @input="passwordError = null"
                >
                <p
                  v-if="passwordError"
                  id="login-password-error"
                  class="invalid-feedback"
                >
                  {{ passwordError }}
                </p>
              </div>

              <p
                v-if="formError"
                class="alert alert-danger"
                role="alert"
              >
                {{ formError }}
              </p>

              <button
                type="submit"
                class="btn btn-primary w-100"
                :aria-disabled="submitting"
              >
                {{ submitting ? 'Memeriksa…' : 'Masuk' }}
              </button>
            </form>
          </div>
        </div>
        <p class="text-center text-secondary mt-3">
          Lupa kata sandi atau akun terkunci? Hubungi admin NOC.
        </p>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<style scoped>
.login {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.login__main {
  flex: 1 0 auto;
  min-height: 0;
}

.login__logo {
  flex: 0 0 auto;
  width: 56px;
  height: 56px;
}

/* Area klik minimal 32px (ATURAN.md §5) untuk tombol teks kecil. */
.login__toggle {
  min-height: 32px;
}

.alert {
  margin-bottom: 1rem;
}

.btn[aria-disabled='true'] {
  cursor: progress;
  opacity: 0.8;
}
</style>
