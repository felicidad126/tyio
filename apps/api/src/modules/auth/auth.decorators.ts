import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { SessionUser } from '@tyio/shared';
import type { Request } from 'express';

export const IS_PUBLIC = 'tyio:public';

/**
 * Endpoint yang boleh dipanggil tanpa login. Semua endpoint lain wajib login
 * (SessionGuard dipasang global), jadi endpoint baru otomatis terlindungi.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthedRequest extends Request {
  user?: SessionUser;
}

/** Pengguna sesi yang sudah diperiksa SessionGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});
