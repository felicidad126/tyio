import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@tyio/shared';
import type { AuthenticatedRequest } from './auth-request.js';

const ROLES_KEY = 'tyio:roles';

export const FORBIDDEN_ROLE_MESSAGE = 'Akun Anda tidak punya akses ke fitur ini.';

/** Endpoint hanya untuk peran tertentu. Tanpa dekorator ini, semua peran yang login boleh. */
export const RequireRole = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** Guard global, berjalan setelah AuthGuard sehingga pengguna sudah diketahui. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().auth?.user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException(FORBIDDEN_ROLE_MESSAGE);
    }
    return true;
  }
}
