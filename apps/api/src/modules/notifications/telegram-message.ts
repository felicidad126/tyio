import { formatInZone, formatMinutes, type NotificationEvent, REPLACED_PART_LABELS } from '@tyio/shared';
import type { TicketNotificationPayload } from './notification-record.js';

/** Batas panjang teks satu pesan Telegram (setelah entitas HTML dibaca). */
export const TELEGRAM_TEXT_MAX = 4096;
/** Paling banyak kejadian dalam satu pesan gabungan. */
export const MESSAGES_PER_BATCH = 10;
/** Teks bebas (masalah, catatan) dipotong agar satu pesan selalu muat. */
const FREE_TEXT_MAX = 700;
const SUMMARY_MAX = 2500;

const HEADERS: Readonly<Record<NotificationEvent, string>> = {
  npr_baru: '🔴 <b>NPR baru</b>',
  tt_dibuka: '🟠 <b>TT untuk Service Delivery</b>',
  npr_selesai: '✅ <b>NPR Selesai</b>',
  npr_dibuka_lagi: '🔁 <b>NPR dibuka lagi</b>',
};

/** Satu kejadian sebagai teks HTML Telegram. Semua isi dari data di-escape. */
export function renderNotification(type: NotificationEvent, p: TicketNotificationPayload, publicUrl?: string): string {
  const lines: string[] = [`${HEADERS[type]} · ${esc(p.tenant)}`];
  const at = (iso: string) => formatInZone(iso, p.timeZone);
  const remoteLine = `${esc(p.siteId)} · ${esc(p.remote)}, ${esc(p.city)}`;
  const numbers = `<b>${esc(p.number)}</b>${p.ttNumber ? ` · ${esc(p.ttNumber)}` : ''}`;

  if (type === 'tt_dibuka' && p.summary) {
    lines.push(esc(cut(p.summary, SUMMARY_MAX)));
  } else {
    lines.push(numbers, remoteLine);
    if (type === 'npr_baru') {
      lines.push(`Kategori: ${esc(p.category)}`);
      lines.push(`Kejadian: ${at(p.occurredAt)}`);
      if (p.customerTicketNumber) lines.push(`No. tiket customer: ${esc(p.customerTicketNumber)}`);
      lines.push(`Masalah: ${esc(cut(p.problem, FREE_TEXT_MAX))}`);
      lines.push(`Dibuat oleh: ${esc(p.createdBy)}`);
    } else if (p.action) {
      const a = p.action;
      if (type === 'npr_selesai' && a.closedAt) {
        const duration = a.durationMinutes === null ? '' : ` · lama ${formatMinutes(a.durationMinutes)}`;
        lines.push(`Online lagi: ${at(a.closedAt)}${duration}`);
        if (a.replacedParts?.length) {
          lines.push(`Part diganti: ${a.replacedParts.map((part) => REPLACED_PART_LABELS[part]).join(', ')}`);
        }
      }
      if (a.note) lines.push(`Catatan: ${esc(cut(a.note, FREE_TEXT_MAX))}`);
      lines.push(`${type === 'npr_selesai' ? 'Ditutup' : 'Dibuka lagi'} oleh: ${esc(a.by)}`);
    }
  }
  if (publicUrl) lines.push(`<a href="${esc(`${publicUrl}/tiket/${p.ticketId}`)}">Buka di portal</a>`);
  return lines.join('\n');
}

/**
 * Menyusun beberapa kejadian menjadi pesan-pesan gabungan, berurutan, masing-masing paling
 * banyak MESSAGES_PER_BATCH kejadian dan TELEGRAM_TEXT_MAX karakter. Mengembalikan indeks
 * kejadian per pesan, agar hasil kirim bisa dicatat per kejadian.
 */
export function packMessages(parts: string[]): Array<{ text: string; indexes: number[] }> {
  const separator = '\n\n';
  const batches: Array<{ text: string; indexes: number[] }> = [];
  let current: { text: string; indexes: number[] } | null = null;
  parts.forEach((part, index) => {
    const text = part.length > TELEGRAM_TEXT_MAX ? part.slice(0, TELEGRAM_TEXT_MAX) : part;
    if (
      current &&
      current.indexes.length < MESSAGES_PER_BATCH &&
      current.text.length + separator.length + text.length <= TELEGRAM_TEXT_MAX
    ) {
      current.text += separator + text;
      current.indexes.push(index);
    } else {
      current = { text, indexes: [index] };
      batches.push(current);
    }
  });
  return batches;
}

/** Pesan uji dari halaman Admin: memastikan bot bisa mengirim ke grup ini. */
export function renderTestMessage(channelName: string, events: string[], scope: string): string {
  return [
    '🧪 <b>Pesan uji Portal NOC</b>',
    `Grup penerima: ${esc(channelName)}`,
    `Kejadian: ${esc(events.join(', '))}`,
    `Customer: ${esc(scope)}`,
    'Bila pesan ini sampai, notifikasi siap dikirim ke grup ini.',
  ].join('\n');
}

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Escape untuk mode HTML Telegram (juga dipakai di dalam atribut href). */
export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
