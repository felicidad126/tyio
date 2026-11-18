import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module.js';
import { OverviewController } from './overview.controller.js';
import { OverviewService } from './overview.service.js';

/** Overview (langkah 2.1): kondisi tiket sekarang dan analitik kejadian. */
@Module({
  imports: [TicketsModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
