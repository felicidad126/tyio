<script setup lang="ts">
import { IconEdit, IconFile, IconPhoto } from '@tabler/icons-vue';
import {
  isRole,
  ROLE_LABELS,
  type RemoteZone,
  TICKET_ACTION_KIND_LABELS,
  TICKET_CLOSE_CAUSE_LABELS,
  TICKET_STATUS_LABELS,
  type TicketAction,
} from '@npr/shared';
import { computed } from 'vue';
import { formatZoned } from '../zoned-time';

// Linimasa NPR (langkah 1.4): terbaru di atas, entri tidak pernah diubah atau dihapus.
// Koreksi tampil sebagai entri baru yang merujuk entri lama; entri lama ditandai "dikoreksi".

const props = defineProps<{
  actions: TicketAction[];
  zone: RemoteZone;
  /** Tombol "Koreksi" per entri; tidak ditampilkan untuk NPR yang sudah ditutup. */
  canCorrect: boolean;
}>();

const emit = defineEmits<{ correct: [action: TicketAction, opener: HTMLElement] }>();

const byId = computed(() => new Map(props.actions.map((action) => [action.id, action])));

const time = (iso: string) => formatZoned(iso, props.zone);
const roleLabel = (role: string) => (isRole(role) ? ROLE_LABELS[role] : role);
const anchor = (id: string) => `entri-${id}`;

/** Waktu kejadian ditulis terpisah bila berbeda dari waktu pencatatan (lebih dari 1 menit). */
const occurredDiffers = (action: TicketAction) =>
  Math.abs(new Date(action.occurredAt).getTime() - new Date(action.createdAt).getTime()) >= 60_000;

function refLabel(id: string): string {
  const target = byId.value.get(id);
  return target ? `${TICKET_ACTION_KIND_LABELS[target.kind]} ${time(target.createdAt)}` : 'entri lain';
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function onCorrect(action: TicketAction, event: MouseEvent): void {
  emit('correct', action, event.currentTarget as HTMLElement);
}
</script>

<template>
  <ol class="timeline-list">
    <li
      v-for="action in actions"
      :id="anchor(action.id)"
      :key="action.id"
      class="timeline-entry"
      :class="{ 'timeline-entry--corrected': action.correctedByIds.length > 0 }"
      tabindex="-1"
    >
      <div class="timeline-entry__head">
        <span
          class="kind-tag"
          :class="`kind-tag--${action.kind}`"
        >{{ TICKET_ACTION_KIND_LABELS[action.kind] }}</span>
        <span class="timeline-entry__who">
          {{ action.createdBy.name }}
          <span class="text-secondary">· {{ roleLabel(action.createdBy.role) }}</span>
        </span>
        <time
          class="timeline-entry__time text-secondary"
          :datetime="action.createdAt"
        >{{ time(action.createdAt) }}</time>
      </div>

      <p class="timeline-entry__note">
        {{ action.note }}
      </p>

      <ul class="timeline-entry__facts">
        <li v-if="action.statusChange">
          Status:
          <template v-if="action.statusChange.from">
            {{ TICKET_STATUS_LABELS[action.statusChange.from] }} →
          </template>
          <strong>{{ TICKET_STATUS_LABELS[action.statusChange.to] }}</strong>
        </li>
        <li v-if="action.assignee">
          Penanggung:
          <template v-if="action.assigneeFrom">
            {{ action.assigneeFrom.name }} →
          </template>
          <strong>{{ action.assignee.name }}</strong>
        </li>
        <li v-if="action.closeCause">
          Penyebab: <strong>{{ TICKET_CLOSE_CAUSE_LABELS[action.closeCause] }}</strong>
        </li>
        <li v-if="action.troubleTicket">
          TT: <a
            :href="`#tt-${action.troubleTicket.id}`"
            class="font-monospace"
          >{{ action.troubleTicket.number }}</a>
        </li>
        <li v-if="action.pendingReason">
          Alasan pending: {{ action.pendingReason }}
        </li>
        <li v-if="occurredDiffers(action)">
          Waktu kejadian: {{ time(action.occurredAt) }}
        </li>
        <li v-if="action.customerTicketNumber !== null">
          <template v-if="action.customerTicketNumber">
            No. tiket customer: <span class="font-monospace">{{ action.customerTicketNumber }}</span>
          </template>
          <template v-else>
            No. tiket customer dikosongkan
          </template>
        </li>
        <li v-if="action.startedAtCorrection">
          Mulai gangguan dikoreksi menjadi {{ time(action.startedAtCorrection) }}
        </li>
        <li v-if="action.correctsId">
          Mengoreksi entri
          <a :href="`#${anchor(action.correctsId)}`">{{ refLabel(action.correctsId) }}</a>
        </li>
        <li
          v-if="action.correctedByIds.length > 0"
          class="timeline-entry__corrected"
        >
          Dikoreksi oleh entri
          <template
            v-for="(id, index) in action.correctedByIds"
            :key="id"
          >
            <template v-if="index > 0">
              ,
            </template>
            <a :href="`#${anchor(id)}`">{{ refLabel(id) }}</a>
          </template>
        </li>
      </ul>

      <ul
        v-if="action.attachments.length > 0"
        class="timeline-entry__files"
        :aria-label="`Lampiran entri ${time(action.createdAt)}`"
      >
        <li
          v-for="file in action.attachments"
          :key="file.id"
        >
          <a
            :href="file.url"
            :target="file.contentType.startsWith('image/') ? '_blank' : undefined"
            :rel="file.contentType.startsWith('image/') ? 'noopener' : undefined"
            class="file-link"
          >
            <IconPhoto
              v-if="file.contentType.startsWith('image/')"
              size="16"
              aria-hidden="true"
            />
            <IconFile
              v-else
              size="16"
              aria-hidden="true"
            />
            <span class="file-link__name">{{ file.fileName }}</span>
            <span class="text-secondary">{{ sizeLabel(file.sizeBytes) }}</span>
          </a>
        </li>
      </ul>

      <button
        v-if="canCorrect"
        type="button"
        class="btn btn-sm btn-ghost-secondary timeline-entry__correct"
        :aria-label="`Koreksi entri ${TICKET_ACTION_KIND_LABELS[action.kind]} ${time(action.createdAt)}`"
        @click="onCorrect(action, $event)"
      >
        <IconEdit
          size="16"
          aria-hidden="true"
        />
        Koreksi
      </button>
    </li>
  </ol>
</template>

<style scoped>
.timeline-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.timeline-entry {
  position: relative;
  padding: 14px 0 14px 18px;
  border-left: 2px solid var(--tblr-border-color);
}

.timeline-entry + .timeline-entry {
  border-top: 1px solid var(--tblr-border-color-translucent);
}

.timeline-entry:target,
.timeline-entry:focus {
  outline: none;
  background: var(--tblr-bg-surface-secondary);
}

.timeline-entry__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}

.timeline-entry__who {
  font-weight: 600;
}

.timeline-entry__time {
  margin-left: auto;
  font-size: 13px;
}

.timeline-entry__note {
  margin: 8px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.timeline-entry--corrected .timeline-entry__note {
  color: var(--tblr-secondary);
}

.timeline-entry__facts,
.timeline-entry__files {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
}

.timeline-entry__facts li + li {
  margin-top: 2px;
}

.timeline-entry__corrected {
  font-style: italic;
}

.timeline-entry__files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.file-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid var(--tblr-border-color);
  border-radius: 6px;
}

.file-link__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-entry__correct {
  gap: 4px;
  margin-top: 6px;
  min-height: 32px;
}

.kind-tag {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: #dfeafb;
  color: #0b4f99;
}

/* Warna tag mengikuti mockup DetailTiket: sistem abu, koreksi ungu, ambil hijau toska,
   TT dibuat oranye (eskalasi), salin ringkasan abu; penutupan NPR dan TT abu seperti Ditutup. */
.kind-tag--tutup,
.kind-tag--tt_ditutup {
  background: #eaedf1;
  color: #454f5c;
}

.kind-tag--tt_dibuat {
  background: #fde4d5;
  color: #9a3d0d;
}

.kind-tag--tt_disalin {
  background: #eaedf1;
  color: #454f5c;
}

.kind-tag--ambil {
  background: #d5f0ec;
  color: #0d5c55;
}

.kind-tag--dibuat {
  background: #eaedf1;
  color: #454f5c;
}

.kind-tag--koreksi {
  background: #ebe7fb;
  color: #4a37a3;
}

@media (max-width: 575.98px) {
  .timeline-entry__time {
    flex-basis: 100%;
    margin-left: 0;
  }

  .timeline-entry__correct {
    min-height: 44px;
  }
}
</style>
