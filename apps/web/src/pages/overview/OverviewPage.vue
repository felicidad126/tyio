<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { navItem } from '../../navigation';
import { ROLE_LABELS, tenantScopeLabel } from '../../labels';
import { useAuthStore } from '../../stores/auth';

const { user } = storeToRefs(useAuthStore());
const overview = navItem('overview');
</script>

<template>
  <div class="page-header mb-3">
    <div class="page-pretitle">
      Overview
    </div>
    <h1 class="page-title">
      Selamat datang, {{ user?.displayName }}
    </h1>
  </div>
  <div class="row row-cards">
    <div class="col-md-6">
      <div class="card">
        <div class="card-body">
          <h2 class="card-title">
            Akun Anda
          </h2>
          <dl class="mb-0">
            <dt>Peran</dt>
            <dd>
              <span
                v-if="user"
                class="badge bg-blue-lt"
              >{{ ROLE_LABELS[user.role] }}</span>
            </dd>
            <dt>Customer yang terlihat</dt>
            <dd class="mb-0">
              {{ user ? tenantScopeLabel(user.tenantScope) : '' }}
            </dd>
          </dl>
        </div>
      </div>
    </div>
    <div class="col-md-6">
      <div class="card">
        <div class="card-body">
          <h2 class="card-title">
            Ringkasan monitoring
          </h2>
          <p class="text-secondary mb-0">
            {{ overview.summary }} Hadir di rilis {{ overview.release }}.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
