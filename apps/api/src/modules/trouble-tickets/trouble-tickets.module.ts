import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module.js';
import { TroubleTicketsController } from './trouble-tickets.controller.js';
import { TroubleTicketsService } from './trouble-tickets.service.js';

/** Trouble Ticket (langkah 1.5b): eskalasi NPR ke Service Delivery untuk kunjungan teknisi. */
@Module({
  imports: [TicketsModule],
  controllers: [TroubleTicketsController],
  providers: [TroubleTicketsService],
})
export class TroubleTicketsModule {}
