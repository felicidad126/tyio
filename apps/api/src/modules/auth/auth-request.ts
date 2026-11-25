import {
  createParamDecorator,
  type ExecutionContext,
  InternalServerErrorException,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuditActor } from '../../common/audit/audit-context.js';
import type { User } from '../users/user.entity.js';
import type { ClientInfo } from './sessions.service.js';

/** Permintaan yang sudah lolos AuthGuard membawa pengguna dan token sesinya. */
export interface AuthenticatedRequest extends Request {
  auth?: { user: User; token: string };
}

const IS_PUBLIC = 'npr:public';

/**
 * Menandai endpoint yang boleh diakses tanpa sesi (mis. health dan login).
 * Semua endpoint lain wajib sesi secara bawaan.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
export const IS_PUBLIC_KEY = IS_PUBLIC;

/** Pengguna yang sedang login, di endpoint yang tidak ditandai `@Public()`. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.auth) {
    // Hanya terjadi bila @CurrentUser dipakai di endpoint publik: salah pakai di kode.
    throw new InternalServerErrorException();
  }
  return request.auth.user;
});

export function clientInfo(request: Request): ClientInfo {
  return {
    ip: request.ip ?? request.socket.remoteAddress ?? 'tidak-diketahui',
    userAgent: request.get('user-agent'),
  };
}

/**
 * Pelaku perubahan untuk `auditedTransaction`: pengguna yang sedang login beserta IP-nya.
 * Dipakai di endpoint yang menulis data atas nama pengguna.
 */
export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuditActor => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.auth) throw new InternalServerErrorException();
  const { user } = request.auth;
  return { source: 'api', userId: user.id, label: user.email, clientIp: clientInfo(request).ip };
});
