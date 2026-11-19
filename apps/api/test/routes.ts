import { type INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { API_PREFIX } from '@tyio/shared';
import { TENANCY_KEY, type Tenancy } from '../src/common/tenant/tenancy.js';
import { IS_PUBLIC_KEY } from '../src/modules/auth/auth-request.js';

/** Satu endpoint terdaftar di aplikasi, dibaca dari metadata Nest (butuh DiscoveryModule). */
export interface RegisteredRoute {
  /** Mis. `GET /api/tenants/:id`. */
  key: string;
  method: string;
  path: string;
  isPublic: boolean;
  tenancy: Tenancy | undefined;
}

export function registeredRoutes(app: INestApplication): RegisteredRoute[] {
  const discovery = app.get(DiscoveryService);
  const reflector = app.get(Reflector);
  const scanner = new MetadataScanner();
  const routes: RegisteredRoute[] = [];

  for (const wrapper of discovery.getControllers()) {
    const controller = wrapper.metatype;
    const instance: unknown = wrapper.instance;
    if (!controller || !instance) continue;
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
    const base = single(Reflect.getMetadata(PATH_METADATA, controller), controller.name);

    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name];
      if (typeof handler !== 'function') continue;
      const path: unknown = Reflect.getMetadata(PATH_METADATA, handler);
      if (path === undefined) continue; // bukan handler rute
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
      const fullPath = `/${[API_PREFIX, base, single(path, `${controller.name}.${name}`)]
        .flatMap((part) => part.split('/'))
        .filter((part) => part !== '')
        .join('/')}`;
      const targets = [handler, controller];
      routes.push({
        key: `${method} ${fullPath}`,
        method,
        path: fullPath,
        isPublic: reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) === true,
        tenancy: reflector.getAllAndOverride<Tenancy | undefined>(TENANCY_KEY, targets),
      });
    }
  }
  return routes.sort((a, b) => a.key.localeCompare(b.key));
}

function single(value: unknown, where: string): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') {
    throw new Error(`${where}: daftar beberapa path belum didukung uji rute; pakai satu path.`);
  }
  return value;
}
