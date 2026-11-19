import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { APP_CONFIG } from '../../config.module.js';
import type { AppConfig } from '../../config.js';
import { type AuthenticatedRequest, IS_PUBLIC_KEY } from './auth-request.js';
import { AuthService } from './auth.service.js';
import { readCookie, SESSION_COOKIE, sessionCookieOptions } from './cookies.js';

export const SESSION_REQUIRED_MESSAGE = 'Sesi tidak ada atau sudah berakhir. Silakan masuk lagi.';

/**
 * Guard global: setiap endpoint wajib sesi yang masih berlaku, kecuali yang ditandai
 * `@Public()`. Endpoint baru otomatis terlindungi tanpa perlu diingat.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    const user = token ? await this.auth.authenticate(token) : null;
    if (!token || !user) {
      if (token) {
        // Cookie basi dibuang agar peramban tidak terus mengirimnya.
        http
          .getResponse<Response>()
          .clearCookie(SESSION_COOKIE, sessionCookieOptions(this.config.session.cookieSecure));
      }
      throw new UnauthorizedException(SESSION_REQUIRED_MESSAGE);
    }
    request.auth = { user, token };
    return true;
  }
}
