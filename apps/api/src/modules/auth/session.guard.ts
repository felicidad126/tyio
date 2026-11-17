import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AppModule, canOpenModule, type SessionUser } from '@tyio/shared';
import { TENANT_POLICY, type TenantPolicy } from '../../common/tenant/tenant-policy.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { UsersService } from '../users/users.service.js';
import { type AuthedRequest, IS_PUBLIC, REQUIRED_MODULE } from './auth.decorators.js';
import { readCookie, sessionCookieName } from './session-cookie.js';
import { SessionService } from './session.service.js';

/**
 * Dipasang global: setiap endpoint wajib sesi yang sah kecuali ditandai @Public(). Setelah
 * itu hak akses rute diperiksa: peran untuk @RequireModule(), dan akses semua customer untuk
 * @AllTenants(). Penjaga berjalan sebelum isian dibaca, jadi yang ditolak tidak mengubah apa pun.
 */
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
    this.authorize(context, req.user);
    return true;
  }

  private authorize(context: ExecutionContext, user: SessionUser): void {
    const targets = [context.getHandler(), context.getClass()];
    const module = this.reflector.getAllAndOverride<AppModule | undefined>(REQUIRED_MODULE, targets);
    if (module && !canOpenModule(user.role, module)) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Fitur ini tidak tersedia untuk peran Anda.',
      });
    }
    const policy = this.reflector.getAllAndOverride<TenantPolicy | undefined>(TENANT_POLICY, targets);
    if (policy?.kind === 'all' && !user.tenantScope.all) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Fitur ini khusus pengguna dengan akses ke semua customer.',
      });
    }
  }
}
