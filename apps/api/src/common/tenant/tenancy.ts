import {
  createParamDecorator,
  type ExecutionContext,
  InternalServerErrorException,
  SetMetadata,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../modules/auth/auth-request.js';
import { scopeFor, type TenantScope } from './tenant-scope.js';

export const TENANCY_KEY = 'tyio:tenancy';
export type Tenancy = 'scoped' | 'none';

/**
 * Endpoint ini membaca atau mengubah data milik customer. Wajib punya uji lintas-tenant
 * di `test/tenant-isolation.test.ts`; uji itu gagal bila belum ada.
 */
export const TenantScoped = (): MethodDecorator & ClassDecorator =>
  SetMetadata(TENANCY_KEY, 'scoped' satisfies Tenancy);

/** Endpoint ini tidak menyentuh data customer (mis. health, logout). */
export const NoTenantData = (): MethodDecorator & ClassDecorator =>
  SetMetadata(TENANCY_KEY, 'none' satisfies Tenancy);

/** Cakupan customer pengguna yang sedang login, untuk dipakai di `applyTenantScope`. */
export const CurrentScope = createParamDecorator((_data: unknown, ctx: ExecutionContext): TenantScope => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.auth) {
    // Hanya terjadi bila dipakai di endpoint publik: salah pakai di kode.
    throw new InternalServerErrorException();
  }
  return scopeFor(request.auth.user);
});
