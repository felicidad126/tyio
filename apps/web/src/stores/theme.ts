import { defineStore } from 'pinia';
import { computed, ref, watchEffect } from 'vue';

// Tema tampilan: ikut sistem (bawaan), terang, atau gelap. Disimpan per peramban;
// Tabler membaca atribut `data-bs-theme` di <html>.

export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Ikuti sistem' },
  { value: 'light', label: 'Terang' },
  { value: 'dark', label: 'Gelap' },
];

const STORAGE_KEY = 'tyio:tema';

function readStored(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system'; // penyimpanan diblokir (mode privat): tetap jalan tanpa ingatan
  }
}

export const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemePreference>(readStored());
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const systemDark = ref(media.matches);
  media.addEventListener('change', (event) => (systemDark.value = event.matches));

  const effective = computed<'light' | 'dark'>(() =>
    preference.value === 'system' ? (systemDark.value ? 'dark' : 'light') : preference.value,
  );

  watchEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', effective.value);
  });

  function choose(value: ThemePreference): void {
    preference.value = value;
    try {
      if (value === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // tidak tersimpan; pilihan tetap berlaku sampai halaman ditutup
    }
  }

  return { preference, effective, choose };
});
