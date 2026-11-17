import { onBeforeUnmount, onMounted, type Ref } from 'vue';

/**
 * Menutup panel yang terbuka saat klik di luar `container` atau saat tombol Escape.
 * Setelah Escape, fokus kembali ke `trigger` agar pengguna keyboard tidak kehilangan posisi.
 */
export function useDismiss(
  open: Ref<boolean>,
  container: Ref<HTMLElement | null>,
  trigger: Ref<HTMLElement | null>,
): void {
  function onPointerDown(event: PointerEvent): void {
    if (open.value && !container.value?.contains(event.target as Node)) open.value = false;
  }
  function onKeyDown(event: KeyboardEvent): void {
    if (open.value && event.key === 'Escape') {
      open.value = false;
      trigger.value?.focus();
    }
  }
  onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
  });
  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('keydown', onKeyDown);
  });
}
