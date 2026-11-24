import { Module } from '@nestjs/common';
import { RemoteImportController, RemoteMapController, RemotesController } from './remotes.controller.js';
import { RemotesService } from './remotes.service.js';

/** Remote per customer (langkah 1.2): daftar, halaman remote, dan impor dari Excel. */
@Module({
  controllers: [RemoteImportController, RemotesController, RemoteMapController],
  providers: [RemotesService],
  exports: [RemotesService],
})
export class RemotesModule {}
