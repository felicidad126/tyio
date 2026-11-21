import { Module } from '@nestjs/common';
import { RemotesModule } from '../remotes/remotes.module.js';
import { RemoteOpenTicketsController, TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

/** NPR (langkah 1.3): buat NPR bernomor, halaman NPR, dan NPR terbuka per remote. */
@Module({
  imports: [RemotesModule],
  controllers: [TicketsController, RemoteOpenTicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
