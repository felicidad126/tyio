import { Injectable } from '@nestjs/common';
import type { SessionUser, TenantRef, TenantScope } from '@tyio/shared';
import { DataSource } from 'typeorm';
import { TenantEntity } from '../tenants/tenant.entity.js';
import { UserTenantEntity } from './user-tenant.entity.js';
import { UserEntity, type User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(private readonly dataSource: DataSource) {}

  private get repo() {
    return this.dataSource.getRepository(UserEntity);
  }

  /** `username` harus sudah dinormalkan (huruf kecil, tanpa spasi di tepi). */
  findByUsername(username: string): Promise<User | null> {
    return this.repo.findOneBy({ username });
  }

  findActiveById(id: string): Promise<User | null> {
    return this.repo.findOneBy({ id, active: true });
  }

  /** Bentuk pengguna yang dikirim ke aplikasi web, termasuk tenant yang boleh dilihatnya. */
  async toSessionUser(user: User): Promise<SessionUser> {
    const tenantScope: TenantScope = user.allTenants
      ? { all: true }
      : { all: false, tenants: await this.scopedTenants(user.id) };
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      tenantScope,
    };
  }

  private async scopedTenants(userId: string): Promise<TenantRef[]> {
    const tenants = await this.dataSource
      .getRepository(TenantEntity)
      .createQueryBuilder('t')
      .innerJoin(UserTenantEntity.options.name, 'ut', 'ut.tenantId = t.id')
      .where('ut.userId = :userId', { userId })
      .andWhere('t.active = true')
      .select(['t.id', 't.code', 't.name'])
      .orderBy('t.code')
      .getMany();
    return tenants.map(({ id, code, name }) => ({ id, code, name }));
  }
}
