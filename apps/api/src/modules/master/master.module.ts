import { Module } from '@nestjs/common';
import { MASTER_LISTS } from '@tyio/shared';
import { masterController } from './master.controller.js';
import { MasterService } from './master.service.js';

/** Master data (langkah 1.1): customer, kategori, system, jarkom; khusus admin. */
@Module({
  controllers: MASTER_LISTS.map(masterController),
  providers: [MasterService],
})
export class MasterModule {}
