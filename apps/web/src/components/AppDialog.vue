<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from 'vue';

// Dialog modal memakai <dialog> bawaan browser, bukan JS modal Bootstrap: browser sudah
// mengurus lapisan teratas, latar yang tidak bisa disentuh, fokus, dan tombol Escape.
// Isi hanya dirender saat terbuka, sehingga `autofocus` di dalamnya berlaku tiap kali dibuka.
defineProps<{
  /** `drawer`: panel dari tepi kanan untuk form singkat; `confirm`: dialog di tengah. */
  variant: 'drawer' | 'confirm';
  /** id judul di dalam isi, untuk nama dialog yang dibacakan pembaca layar. */
  labelledby: string;
}>();
const open = defineModel<boolean>('open', { required: true });
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
let returnFocus: HTMLElement | null = null;

watch(
  open,
  async (value) => {
    await nextTick();
    const el = dialog.value;
    if (!el) return;
    if (value && !el.open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      el.showModal();
    } else if (!value && el.open) {
      el.close();
    }
  },
  { immediate: true },
);

/** Ditutup lewat Escape atau dari kode: kembalikan fokus ke pemicunya. */
function onClose(): void {
  open.value = false;
  // Pemicu bisa sudah hilang (mis. baris yang baru dihapus): pindah ke isi halaman.
  const target = returnFocus?.isConnected ? returnFocus : document.getElementById('konten');
  target?.focus();
  returnFocus = null;
}
</script>

<template>
  <dialog
    ref="dialog"
    class="app-dialog"
    :class="variant === 'drawer' ? 'app-dialog-drawer' : 'app-dialog-confirm'"
    :aria-labelledby="labelledby"
    @close="onClose"
  >
    <slot v-if="open" />
  </dialog>
</template>

<style scoped>
.app-dialog {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  max-width: 100vw;
}
.app-dialog::backdrop {
  background: rgb(0 0 0 / 0.45);
}
.app-dialog-confirm {
  width: min(28rem, calc(100vw - 2rem));
}
/* Panel penuh tinggi dari tepi kanan; di ponsel selebar layar. */
.app-dialog-drawer {
  margin: 0 0 0 auto;
  width: min(28rem, 100vw);
  height: 100dvh;
  max-height: 100dvh;
}
</style>
