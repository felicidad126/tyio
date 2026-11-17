import { BadRequestException, ConflictException, HttpStatus } from '@nestjs/common';
import { canTransition, TICKET_STATUS_LABELS, type TicketStatus } from '@tyio/shared';

/**
 * Menegakkan alur status (tabel TICKET_TRANSITIONS di @tyio/shared, disetujui user di 1.4).
 * `expected` adalah status yang dilihat operator: bila tiket sudah berubah oleh orang lain,
 * perubahan ditolak 409 agar tidak menimpa keputusan rekan tanpa sadar.
 */
export function assertTransition(current: TicketStatus, expected: TicketStatus, to: TicketStatus): void {
  if (current !== expected) {
    throw new ConflictException({
      statusCode: HttpStatus.CONFLICT,
      message: `Status tiket sudah berubah menjadi ${TICKET_STATUS_LABELS[current]}. Muat ulang tiket, lalu ulangi.`,
      currentStatus: current,
    });
  }
  if (!canTransition(current, to)) {
    throw new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      message: `Status ${TICKET_STATUS_LABELS[current]} tidak bisa langsung menjadi ${TICKET_STATUS_LABELS[to]}.`,
      field: 'statusTo',
    });
  }
}
