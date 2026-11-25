<script setup lang="ts">
import { ROLE_LABELS } from '@npr/shared';
import { computed } from 'vue';
import PageHeader from '../../components/PageHeader.vue';
import { useSessionStore } from '../../stores/session';

const session = useSessionStore();
const user = computed(() => session.user);
</script>

<template>
  <div v-if="user">
    <PageHeader
      title="Akun"
      subtitle="Data akun dan customer yang boleh Anda lihat. Perubahan akun dilakukan admin."
    />
    <div class="card">
      <div class="card-body">
        <dl class="datagrid">
          <div class="datagrid-item">
            <dt class="datagrid-title">
              Nama
            </dt>
            <dd class="datagrid-content">
              {{ user.name }}
            </dd>
          </div>
          <div class="datagrid-item">
            <dt class="datagrid-title">
              Email
            </dt>
            <dd class="datagrid-content">
              {{ user.email }}
            </dd>
          </div>
          <div class="datagrid-item">
            <dt class="datagrid-title">
              Peran
            </dt>
            <dd class="datagrid-content">
              {{ ROLE_LABELS[user.role] }}
            </dd>
          </div>
          <div class="datagrid-item">
            <dt class="datagrid-title">
              Customer
            </dt>
            <dd class="datagrid-content">
              <template v-if="user.tenants.length === 0">
                Belum ada customer yang bisa dilihat. Hubungi admin NOC.
              </template>
              <template v-else>
                {{ user.allTenants ? 'Semua customer:' : 'Dibatasi ke:' }}
                {{ user.tenants.map((tenant) => `${tenant.name} (${tenant.code})`).join(', ') }}
              </template>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>

<style scoped>
.datagrid,
.datagrid dd {
  margin: 0;
}
</style>
