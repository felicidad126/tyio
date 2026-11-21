import { Module } from '@nestjs/common';
import { RemoteImportController, RemotesController } from './remotes.controller.js';
import { RemotesService } from './remotes.service.js';

/** Remote per customer (langkah 1.2): daftar, halaman remote, dan impor dari Excel. */
@Module({
  controllers: [RemoteImportController, RemotesController],
  providers: [RemotesService],
  exports: [RemotesService],
})
export class RemotesModule {}
