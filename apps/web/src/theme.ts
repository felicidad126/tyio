/** Mengikuti mode terang/gelap sistem, sampai ada pengaturan tema di langkah 0.5. */
export function followSystemTheme(): void {
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () =>
    document.documentElement.setAttribute('data-bs-theme', dark.matches ? 'dark' : 'light');
  apply();
  dark.addEventListener('change', apply);
}
