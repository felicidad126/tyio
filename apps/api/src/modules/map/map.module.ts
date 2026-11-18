import { Module } from '@nestjs/common';
import { MapController } from './map.controller.js';
import { MapService } from './map.service.js';

/** Peta remote (langkah 2.3). */
@Module({
  controllers: [MapController],
  providers: [MapService],
})
export class MapModule {}
