import { Module } from '@nestjs/common';
import {
  MasterCategoriesController,
  MasterCustomersController,
  MasterNetworksController,
  MasterSystemsController,
} from './master.controller.js';
import { MasterService } from './master.service.js';

/** Data master per customer (langkah 1.1): customer, kategori, system, jarkom. */
@Module({
  controllers: [
    MasterCustomersController,
    MasterCategoriesController,
    MasterSystemsController,
    MasterNetworksController,
  ],
  providers: [MasterService],
  exports: [MasterService],
})
export class MasterModule {}
