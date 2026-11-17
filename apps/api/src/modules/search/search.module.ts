import { Module } from '@nestjs/common';
import { RemotesModule } from '../remotes/remotes.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { SearchController } from './search.controller.js';

/** Pencarian global (langkah 1.5): satu kotak cari untuk tiket dan remote. */
@Module({
  imports: [TicketsModule, RemotesModule],
  controllers: [SearchController],
})
export class SearchModule {}
