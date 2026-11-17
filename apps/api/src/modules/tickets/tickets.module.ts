import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

/** Tiket NPR. 1.3: membuat tiket; linimasa dan status menyusul di 1.4. */
@Module({
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
