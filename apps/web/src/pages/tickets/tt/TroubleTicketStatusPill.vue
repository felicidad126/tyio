<script setup lang="ts">
import { TROUBLE_TICKET_STATUS_LABELS, type TroubleTicketStatus } from '@npr/shared';

// Label status TT, teks dan warna persis ATURAN.md §3 ("Menunggu SD" oranye, "Ditutup" abu).
defineProps<{ status: TroubleTicketStatus }>();
</script>

<template>
  <span
    class="tt-pill"
    :class="`tt-pill--${status}`"
  >{{ TROUBLE_TICKET_STATUS_LABELS[status] }}</span>
</template>

<style scoped>
.tt-pill {
  display: inline-flex;
  align-self: center;
  align-items: center;
  min-height: 22px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.tt-pill--menunggu_sd {
  background: #fde4d5;
  color: #9a3d0d;
}

.tt-pill--ditutup {
  background: #eaedf1;
  color: #454f5c;
}
</style>
