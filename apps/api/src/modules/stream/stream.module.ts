import { Module } from '@nestjs/common';
import { ChangeFeed } from './change-feed.service.js';
import { StreamController } from './stream.controller.js';

/** Pembaruan langsung (langkah 2.2): kabar perubahan tiket ke browser. */
@Module({
  controllers: [StreamController],
  providers: [ChangeFeed],
  exports: [ChangeFeed],
})
export class StreamModule {}
