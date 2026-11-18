import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { StreamModule } from '../stream/stream.module.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { NotificationWorker, TELEGRAM_CLIENT } from './notification-worker.service.js';
import { NotificationsController } from './notifications.controller.js';
import { TelegramClient } from './telegram.client.js';

/**
 * Notifikasi (R5): kejadian tiket dicatat di transaksi tiketnya (`recordNotification`), lalu
 * pekerja mengirimnya ke grup Telegram. Tanpa TELEGRAM_BOT_TOKEN tidak ada yang dikirim.
 */
@Module({
  imports: [StreamModule],
  controllers: [NotificationsController],
  providers: [
    {
      provide: TELEGRAM_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.telegramBotToken ? new TelegramClient(config.telegramApiUrl, config.telegramBotToken) : null,
    },
    NotificationWorker,
    NotificationSettingsService,
  ],
  exports: [NotificationWorker],
})
export class NotificationsModule {}
