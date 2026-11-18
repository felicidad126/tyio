import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/** Laporan (langkah 4.2): rekap NPR per periode, JSON dan Excel. */
@Module({
  imports: [TicketsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
