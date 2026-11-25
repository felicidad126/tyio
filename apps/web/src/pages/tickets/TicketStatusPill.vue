<script setup lang="ts">
import { TICKET_STATUS_LABELS, type TicketStatus } from '@npr/shared';

// Label status NPR dengan teks dan warna persis ATURAN.md §3. Warna tidak pernah sendirian:
// labelnya selalu tertulis.
defineProps<{ status: TicketStatus }>();
</script>

<template>
  <span
    class="status-pill"
    :class="`status-pill--${status}`"
  >{{ TICKET_STATUS_LABELS[status] }}</span>
</template>

<style scoped>
.status-pill {
  display: inline-flex;
  align-self: center;
  align-items: center;
  min-height: 26px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
}

.status-pill--terbuka {
  background: #dfeafb;
  color: #0b4f99;
}

.status-pill--dikerjakan {
  background: #d5f0ec;
  color: #0d5c55;
}

.status-pill--pending_customer,
.status-pill--pending_tm {
  background: #fcefd2;
  color: #7a4a00;
}

.status-pill--eskalasi_l2,
.status-pill--eskalasi_sd {
  background: #fde4d5;
  color: #9a3d0d;
}

.status-pill--pulih {
  background: #dcf2e1;
  color: #1b6430;
}

.status-pill--ditutup {
  background: #eaedf1;
  color: #454f5c;
}
</style>
