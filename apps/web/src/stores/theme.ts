import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'tyio-tema';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Pilihan tema per perangkat. Bawaan: mengikuti sistem. */
export const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemePreference>(readStoredPreference());

  function apply(): void {
    const dark = preference.value === 'dark' || (preference.value === 'system' && darkQuery().matches);
    document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
  }

  watch(preference, (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Penyimpanan diblokir (mode privat): pilihan berlaku sampai halaman ditutup.
    }
    apply();
  });
  darkQuery().addEventListener('change', apply);
  apply();

  return { preference };
});

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Penyimpanan tidak bisa dibaca: pakai bawaan.
  }
  return 'system';
}
