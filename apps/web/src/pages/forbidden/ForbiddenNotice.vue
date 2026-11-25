<script setup lang="ts">
import { IconLock } from '@tabler/icons-vue';
import { ROLE_LABELS } from '@npr/shared';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '../../components/PageHeader.vue';

// Ditampilkan di alamat yang diminta (tanpa pengalihan) bila peran pengguna tidak cukup.
// Ini hanya penjelasan; API tetap menolak sendiri permintaan yang tidak boleh.
const route = useRoute();
const who = computed(() => (route.meta.roles ?? []).map((role) => ROLE_LABELS[role]).join(' atau '));
</script>

<template>
  <div>
    <PageHeader title="Tidak punya akses" />
    <div class="card">
      <div class="empty">
        <div
          class="empty-icon"
          aria-hidden="true"
        >
          <IconLock
            size="48"
            stroke="1.5"
          />
        </div>
        <p class="empty-title">
          Halaman {{ route.meta.title }} hanya untuk {{ who }}
        </p>
        <p class="empty-subtitle text-secondary">
          Bila Anda perlu membukanya, minta admin NOC mengubah peran akun Anda.
        </p>
        <div class="empty-action">
          <RouterLink
            :to="{ name: 'overview' }"
            class="btn btn-primary"
          >
            Kembali ke Overview
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
