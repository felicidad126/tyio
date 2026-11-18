import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type {
  NotificationDeliveriesResponse,
  NotificationSettingsResponse,
  NotificationTestResponse,
  TelegramChannelResponse,
  TelegramChatsResponse,
} from '@tyio/shared';
import type { Actor } from '../../common/audit/actor.js';
import { AllTenants } from '../../common/tenant/tenant-policy.js';
import { CurrentActor, RequireModule } from '../auth/auth.decorators.js';
import { parseChannelInput } from './channel-input.js';
import { NotificationSettingsService } from './notification-settings.service.js';

/** Admin › Notifikasi (R5): grup Telegram penerima, uji kirim, dan log pengiriman. */
@RequireModule('admin')
@AllTenants('Grup penerima bisa menerima kejadian semua customer, jadi hanya diatur admin dengan akses semua customer.')
@Controller('admin/notifications')
export class NotificationsController {
  constructor(private readonly settings: NotificationSettingsService) {}

  @Get()
  async get(): Promise<NotificationSettingsResponse> {
    return this.settings.settings();
  }

  @Post('channels')
  async create(@Body() body: unknown, @CurrentActor() actor: Actor): Promise<TelegramChannelResponse> {
    return { channel: await this.settings.create(parseChannelInput(body), actor) };
  }

  @Patch('channels/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ): Promise<TelegramChannelResponse> {
    return { channel: await this.settings.update(id, parseChannelInput(body), actor) };
  }

  @Delete('channels/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor): Promise<void> {
    await this.settings.remove(id, actor);
  }

  @Post('channels/:id/test')
  @HttpCode(HttpStatus.OK)
  async test(@Param('id', ParseUUIDPipe) id: string): Promise<NotificationTestResponse> {
    await this.settings.test(id);
    return { ok: true };
  }

  @Get('chats')
  async chats(): Promise<TelegramChatsResponse> {
    return { chats: await this.settings.chats() };
  }

  @Get('deliveries')
  async deliveries(@Query() query: Record<string, unknown>): Promise<NotificationDeliveriesResponse> {
    return this.settings.deliveries(query);
  }

  @Post('deliveries/:id/retry')
  @HttpCode(HttpStatus.NO_CONTENT)
  async retry(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.settings.retry(id);
  }
}
