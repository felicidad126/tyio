import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { SessionUser } from '@tyio/shared';
import type { Repository } from 'typeorm';
import { scopeFor } from '../../common/tenant/tenant-scope.js';
import { TenantsService, toTenantSummary } from '../tenants/tenants.service.js';
import { normalizeEmail } from './user-accounts.js';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tenants: TenantsService,
  ) {}

  /** Pengguna aktif beserta hash kata sandinya, untuk verifikasi login. */
  findActiveForLogin(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.tenants', 'tenant')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .andWhere('user.active')
      .getOne();
  }

  findActiveById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id, active: true }, relations: { tenants: true } });
  }

  /** Bentuk pengguna untuk aplikasi web; daftar customer memakai cakupan yang sama dengan API. */
  async toSessionUser(user: User): Promise<SessionUser> {
    const tenants = await this.tenants.listVisible(scopeFor(user));
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      allTenants: user.allTenants,
      tenants: tenants.map(toTenantSummary),
    };
  }
}
