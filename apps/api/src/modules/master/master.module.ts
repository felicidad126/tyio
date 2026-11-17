import { Module } from '@nestjs/common';
import { MASTER_LISTS } from '@tyio/shared';
import { MasterOptionsController } from './master-options.controller.js';
import { masterController } from './master.controller.js';
import { MasterService } from './master.service.js';

/** Master data (langkah 1.1): dikelola admin; pilihan aktifnya dibaca semua peran. */
@Module({
  controllers: [...MASTER_LISTS.map(masterController), MasterOptionsController],
  providers: [MasterService],
})
export class MasterModule {}
