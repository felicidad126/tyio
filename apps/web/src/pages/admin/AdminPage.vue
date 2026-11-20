<script setup lang="ts">
import { IconChevronRight, IconClockHour4, IconDatabase } from '@tabler/icons-vue';
import PageHeader from '../../components/PageHeader.vue';

// Beranda Admin: bagian yang sudah ada dan yang menyusul (rencana §8).
const UPCOMING = [
  { title: 'Pengguna dan peran', release: 'R8 · Go-live penuh' },
  { title: 'Aturan SLA', release: 'R4 · SLA dan laporan' },
];
</script>

<template>
  <div>
    <PageHeader
      title="Admin"
      subtitle="Pengaturan yang hanya diubah admin. Operator hanya melihat hasilnya."
    />
    <div class="row row-cards">
      <div class="col-12 col-md-6 col-xl-4">
        <RouterLink
          :to="{ name: 'admin-master', params: { jenis: 'kategori' } }"
          class="card card-link h-100"
        >
          <div class="card-body d-flex gap-3 align-items-start">
            <IconDatabase
              class="text-primary flex-shrink-0"
              size="28"
              stroke="1.5"
              aria-hidden="true"
            />
            <div class="flex-grow-1">
              <h2 class="card-title mb-1">
                Data master
              </h2>
              <p class="text-secondary mb-0">
                Customer, kategori, system, dan jarkom per customer.
              </p>
            </div>
            <IconChevronRight
              class="text-secondary flex-shrink-0"
              size="20"
              aria-hidden="true"
            />
          </div>
        </RouterLink>
      </div>
      <div
        v-for="item in UPCOMING"
        :key="item.title"
        class="col-12 col-md-6 col-xl-4"
      >
        <div class="card h-100">
          <div class="card-body d-flex gap-3 align-items-start">
            <IconClockHour4
              class="text-secondary flex-shrink-0"
              size="28"
              stroke="1.5"
              aria-hidden="true"
            />
            <div>
              <h2 class="card-title mb-1">
                {{ item.title }}
              </h2>
              <p class="text-secondary mb-0">
                Menyusul di rilis {{ item.release }}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
