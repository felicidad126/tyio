import { Module } from '@nestjs/common';
import { AttachmentStorage } from './actions/attachment-storage.js';
import { TicketActionsController } from './actions/ticket-actions.controller.js';
import { TicketActionsService } from './actions/ticket-actions.service.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

/** Tiket NPR: membuat tiket (1.3), linimasa tindakan, alur status, dan lampiran (1.4). */
@Module({
  controllers: [TicketsController, TicketActionsController],
  providers: [TicketsService, TicketActionsService, AttachmentStorage],
})
export class TicketsModule {}
