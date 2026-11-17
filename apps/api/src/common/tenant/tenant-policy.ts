import {
  createParamDecorator,
  type ExecutionContext,
  RequestMethod,
  SetMetadata,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import type { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { API_PREFIX } from '@tyio/shared';
import type { AuthedRequest } from '../../modules/auth/auth.decorators.js';
import { type TenantAccess, tenantAccessOf } from './tenant-access.js';

export const TENANT_POLICY = 'tyio:tenant-policy';

export type TenantPolicy = { kind: 'scoped' } | { kind: 'none'; reason: string };

/**
 * Rute ini membaca atau mengubah data milik tenant. Wajib memakai TenantScopedRepository;
 * uji lintas-tenant memeriksa setiap rute bertanda ini.
 */
export const TenantScoped = () => SetMetadata(TENANT_POLICY, { kind: 'scoped' } satisfies TenantPolicy);

/** Rute ini tidak menyentuh data milik tenant; alasannya wajib ditulis. */
export const NoTenantData = (reason: string) =>
  SetMetadata(TENANT_POLICY, { kind: 'none', reason } satisfies TenantPolicy);

/** Tenant yang boleh dibaca pengguna sesi pada permintaan ini. */
export const CurrentTenantAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantAccess =>
    tenantAccessOf(ctx.switchToHttp().getRequest<AuthedRequest>().user),
);

type Handler = (...args: never[]) => unknown;

export interface RouteInfo {
  method: string;
  path: string;
  route: string;
  policy: TenantPolicy | undefined;
}

/** Semua rute yang terdaftar di aplikasi, dengan kebijakan tenant masing-masing. */
export function listRoutes(
  discovery: DiscoveryService,
  scanner: MetadataScanner,
  reflector: Reflector,
): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
    const prototype = Object.getPrototypeOf(instance) as Record<string, Handler | undefined>;
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name];
      if (!handler) continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const sub = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '');
      const path = ['', API_PREFIX, base, sub]
        .map((part) => part.replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .join('/');
      routes.push({
        method: RequestMethod[method],
        path: `/${path}`,
        route: `${metatype.name}.${name}`,
        policy: reflector.getAllAndOverride<TenantPolicy | undefined>(TENANT_POLICY, [
          handler,
          metatype,
        ]),
      });
    }
  }
  return routes;
}
