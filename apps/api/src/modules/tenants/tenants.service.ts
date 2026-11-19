import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { TenantSummary } from '@tyio/shared';
import type { Repository } from 'typeorm';
import { applyTenantScope, type TenantScope } from '../../common/tenant/tenant-scope.js';
import { Tenant } from './tenant.entity.js';

const byName = new Intl.Collator('id', { sensitivity: 'base', numeric: true });

@Injectable()
export class TenantsService {
  constructor(@InjectRepository(Tenant) private readonly tenants: Repository<Tenant>) {}

  /**
   * Customer aktif dalam cakupan pengguna, urut nama. Diurutkan di aplikasi, bukan di
   * database, karena urutan database bergantung pada collation server (C vs en_US).
   */
  async listVisible(scope: TenantScope): Promise<Tenant[]> {
    const tenants = await this.visible(scope).getMany();
    return tenants.sort((a, b) => byName.compare(a.name, b.name) || a.code.localeCompare(b.code));
  }

  /** Customer aktif dalam cakupan, atau `null` bila tidak ada atau di luar cakupan. */
  findVisible(scope: TenantScope, id: string): Promise<Tenant | null> {
    return this.visible(scope).andWhere('tenant.id = :id', { id }).getOne();
  }

  private visible(scope: TenantScope) {
    return applyTenantScope(
      this.tenants.createQueryBuilder('tenant').where('tenant.active'),
      scope,
      'tenant.id',
    );
  }
}

export function toTenantSummary(tenant: Tenant): TenantSummary {
  return { id: tenant.id, code: tenant.code, name: tenant.name };
}
