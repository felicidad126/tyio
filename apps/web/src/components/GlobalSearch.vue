<script setup lang="ts">
import { IconSearch } from '@tabler/icons-vue';
import { ref, useId, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

// Pencarian global (1.5): satu kotak untuk tiket dan remote, selalu terjangkau dari header
// (layar lebar) atau dari menu (ponsel). Hasilnya di halaman /cari.
const route = useRoute();
const router = useRouter();
const id = useId();
const q = ref('');

// Di halaman hasil, kotak ini menampilkan kata yang sedang dicari; di halaman lain kosong.
watch(
  () => (route.name === 'search' && typeof route.query.q === 'string' ? route.query.q : ''),
  (value) => (q.value = value),
  { immediate: true },
);

function submit(): void {
  const value = q.value.trim();
  void router.push({ name: 'search', query: value ? { q: value } : {} });
}
</script>

<template>
  <form
    class="global-search"
    role="search"
    @submit.prevent="submit"
  >
    <label
      class="visually-hidden"
      :for="id"
    >Cari tiket atau remote</label>
    <div class="input-icon">
      <span
        class="input-icon-addon"
        aria-hidden="true"
      ><IconSearch :size="18" /></span>
      <input
        :id="id"
        v-model="q"
        type="search"
        class="form-control"
        placeholder="Cari no. NPR, tiket customer, atau remote"
        autocomplete="off"
        maxlength="100"
        enterkeyhint="search"
      >
    </div>
  </form>
</template>

<style scoped>
.global-search {
  width: 100%;
  max-width: 26rem;
}
.form-control {
  min-height: 44px;
}
</style>
