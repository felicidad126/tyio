import { Module } from '@nestjs/common';
import { RemotesModule } from '../remotes/remotes.module.js';
import { TicketActionsController } from './actions/ticket-actions.controller.js';
import { TicketActionsService } from './actions/ticket-actions.service.js';
import { TicketQueueService } from './list/ticket-queue.service.js';
import {
  TicketTroubleTicketsController,
  TroubleTicketsController,
} from '../trouble-tickets/trouble-tickets.controller.js';
import { TroubleTicketsService } from '../trouble-tickets/trouble-tickets.service.js';
import { RemoteOpenTicketsController, TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

/** NPR: buat NPR bernomor dan NPR terbuka per remote (1.3); linimasa, status, lampiran (1.4); antrean dan penanggung (1.5); TT ke SD (1.5b). */
@Module({
  imports: [RemotesModule],
  controllers: [
    TicketsController,
    RemoteOpenTicketsController,
    TicketActionsController,
    TicketTroubleTicketsController,
    TroubleTicketsController,
  ],
  providers: [TicketsService, TicketActionsService, TicketQueueService, TroubleTicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
