import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Actor } from './actor.js';
import { AuditEntryEntity, type Json } from './audit-entry.entity.js';

/** Peristiwa aplikasi yang bukan perubahan baris data (perubahan data dicatat trigger DB). */
export type AuditEvent = 'auth.login' | 'auth.logout' | 'auth.login_ditolak' | 'auth.login_ditahan';

@Injectable()
export class AuditService {
  constructor(private readonly dataSource: DataSource) {}

  async record(action: AuditEvent, actor: Actor, data?: { [key: string]: Json }): Promise<void> {
    await this.dataSource.getRepository(AuditEntryEntity).insert({
      action,
      actor: actor.name.slice(0, 120),
      actorUserId: actor.userId ?? null,
      ip: actor.ip?.slice(0, 64) ?? null,
      userAgent: actor.userAgent?.slice(0, 512) ?? null,
      data: data ?? null,
    });
  }
}
