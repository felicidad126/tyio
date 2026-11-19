<script setup lang="ts">
import { APP_NAME, EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '@tyio/shared';
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../../api';
import { safeNextPath } from '../../router/next-path';
import { login } from '../../session';

const route = useRoute();
const router = useRouter();

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
    await login({ email: email.value, password: password.value });
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
  <main class="login">
    <div class="login__card">
      <h1 class="login__title">
        {{ APP_NAME }}
      </h1>
      <p class="login__lead">
        Masuk dengan akun NOC Anda.
      </p>

      <p
        v-if="sessionEnded && !formError"
        class="notice notice--info"
        role="status"
      >
        Sesi Anda sudah berakhir. Silakan masuk lagi.
      </p>

      <form
        novalidate
        @submit.prevent="submit"
      >
        <div class="field">
          <label
            class="field__label"
            for="login-email"
          >Email</label>
          <input
            id="login-email"
            ref="emailInput"
            v-model="email"
            class="field__input"
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
            class="field__error"
          >
            {{ emailError }}
          </p>
        </div>

        <div class="field">
          <div class="field__label-row">
            <label
              class="field__label"
              for="login-password"
            >Kata sandi</label>
            <button
              type="button"
              class="link-button"
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
            class="field__input"
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
            class="field__error"
          >
            {{ passwordError }}
          </p>
        </div>

        <p
          v-if="formError"
          class="notice notice--error"
          role="alert"
        >
          {{ formError }}
        </p>

        <button
          type="submit"
          class="button button--primary"
          :aria-disabled="submitting"
        >
          {{ submitting ? 'Memeriksa…' : 'Masuk' }}
        </button>
      </form>

      <p class="login__help">
        Lupa kata sandi atau akun terkunci? Hubungi admin NOC.
      </p>
    </div>
  </main>
</template>

<style scoped>
.login {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px 16px;
}

.login__card {
  width: 100%;
  max-width: 400px;
  padding: 32px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 8px;
  box-shadow: 0 1px 2px rgb(24 36 51 / 0.06);
}

.login__title {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
}

.login__lead {
  margin: 4px 0 24px;
  color: var(--c-muted);
}

.login__help {
  margin: 24px 0 0;
  color: var(--c-muted);
}

.field {
  margin-bottom: 16px;
}

.field__label-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.field__label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
}

.field__input {
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  font: inherit;
  color: inherit;
  background: var(--c-surface);
  border: 1px solid var(--c-input-border);
  border-radius: 6px;
}

.field__input:focus-visible {
  outline: 3px solid var(--c-focus);
  outline-offset: 0;
  border-color: var(--c-primary);
}

.field__input[aria-invalid='true'] {
  border-color: var(--c-danger-text);
}

.field__error {
  margin: 6px 0 0;
  color: var(--c-danger-text);
}

.link-button {
  min-height: 32px;
  padding: 0 4px;
  font: inherit;
  color: var(--c-primary);
  background: none;
  border: 0;
  cursor: pointer;
}

.link-button:focus-visible {
  outline: 3px solid var(--c-focus);
  border-radius: 4px;
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

.notice--info {
  color: var(--c-info-text);
  background: var(--c-info-bg);
}

.button {
  width: 100%;
  min-height: 44px;
  padding: 0 16px;
  font: inherit;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
}

.button--primary {
  color: #fff;
  background: var(--c-primary);
  border: 1px solid var(--c-primary);
}

.button--primary:hover {
  background: var(--c-primary-hover);
}

.button--primary[aria-disabled='true'] {
  cursor: progress;
  opacity: 0.8;
}

.button:focus-visible {
  outline: 3px solid var(--c-focus);
  outline-offset: 2px;
}

@media (max-width: 480px) {
  .login__card {
    padding: 24px 20px;
  }
}
</style>
