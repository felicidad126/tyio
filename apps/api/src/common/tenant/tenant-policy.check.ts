import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { listRoutes } from './tenant-policy.js';

/**
 * Aplikasi menolak start bila ada rute tanpa kebijakan tenant, sehingga rute baru tidak
 * bisa lolos tanpa diputuskan apakah ia menyentuh data milik customer.
 */
@Injectable()
export class TenantPolicyCheck implements OnApplicationBootstrap {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    const missing = listRoutes(this.discovery, this.scanner, this.reflector).filter(
      (r) => !r.policy,
    );
    if (missing.length > 0) {
      const list = missing.map((r) => `${r.method} ${r.path} (${r.route})`).join(', ');
      throw new Error(
        `Rute tanpa kebijakan tenant; tandai dengan @TenantScoped(), @NoTenantData('alasan'), atau @AllTenants('alasan'): ${list}`,
      );
    }
  }
}
