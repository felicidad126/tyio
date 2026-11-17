import { Module } from '@nestjs/common';
import { RemotesAdminController, RemotesController } from './remotes.controller.js';
import { RemotesService } from './remotes.service.js';

/** Remote (langkah 1.2): daftar, detail, dan impor dari Excel. */
@Module({
  controllers: [RemotesController, RemotesAdminController],
  providers: [RemotesService],
})
export class RemotesModule {}
