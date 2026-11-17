import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AppModule, SessionUser } from '@tyio/shared';
import type { Request } from 'express';
import { type Actor, userActor } from '../../common/audit/actor.js';

export const IS_PUBLIC = 'tyio:public';

/**
 * Endpoint yang boleh dipanggil tanpa login. Semua endpoint lain wajib login
 * (SessionGuard dipasang global), jadi endpoint baru otomatis terlindungi.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const REQUIRED_MODULE = 'tyio:module';

/**
 * Rute milik modul ini. Peran yang boleh dibaca dari MODULE_ROLES di @tyio/shared, sumber
 * yang sama dengan menu web; SessionGuard menolak peran lain dengan 403.
 */
export const RequireModule = (module: AppModule) => SetMetadata(REQUIRED_MODULE, module);

export interface AuthedRequest extends Request {
  user?: SessionUser;
}

/** Pengguna sesi yang sudah diperiksa SessionGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});

/** Pelaku perubahan data (pengguna sesi, IP, peramban) untuk withActor(). */
export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new Error('CurrentActor dipakai di rute tanpa sesi');
  return userActor(req.user, req);
});
