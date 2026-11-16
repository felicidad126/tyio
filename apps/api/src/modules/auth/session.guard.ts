import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { UsersService } from '../users/users.service.js';
import { type AuthedRequest, IS_PUBLIC } from './auth.decorators.js';
import { readCookie, sessionCookieName } from './session-cookie.js';
import { SessionService } from './session.service.js';

/** Dipasang global: setiap endpoint wajib sesi yang sah kecuali ditandai @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = readCookie(req.headers.cookie, sessionCookieName(this.config));
    const userId = token ? await this.sessions.resolve(token) : null;
    const user = userId ? await this.users.findActiveById(userId) : null;
    if (!user) {
      throw new UnauthorizedException({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Sesi tidak ada atau sudah berakhir. Silakan masuk lagi.',
      });
    }
    req.user = await this.users.toSessionUser(user);
    return true;
  }
}
