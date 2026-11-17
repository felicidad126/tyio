import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { TenantRef } from '@tyio/shared';
import { DataSource } from 'typeorm';
import type { TenantAccess } from '../../common/tenant/tenant-access.js';
import { TenantScopedRepository } from '../../common/tenant/tenant-scoped.repository.js';
import { TenantEntity, type Tenant } from './tenant.entity.js';

@Injectable()
export class TenantsService {
  // Entity tenant: "tenant milik baris" adalah id-nya sendiri.
  private readonly tenants: TenantScopedRepository<Tenant>;

  constructor(dataSource: DataSource) {
    this.tenants = new TenantScopedRepository(dataSource.getRepository(TenantEntity), 'id');
  }

  /** Customer aktif yang boleh dilihat, urut kode. */
  async list(access: TenantAccess): Promise<TenantRef[]> {
    const rows = await this.tenants
      .query(access, 't')
      .andWhere('t.active = true')
      .orderBy('t.code')
      .getMany();
    return rows.map(toRef);
  }

  /** 404 juga untuk customer di luar cakupan, agar keberadaannya tidak terungkap. */
  async get(access: TenantAccess, id: string): Promise<TenantRef> {
    const row = await this.tenants.query(access, 't').andWhere('t.id = :id', { id }).getOne();
    if (!row) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Customer tidak ditemukan.',
      });
    }
    return toRef(row);
  }
}

function toRef({ id, code, name }: Tenant): TenantRef {
  return { id, code, name };
}
