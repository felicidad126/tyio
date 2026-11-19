import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { SessionUser } from '@tyio/shared';
import { DataSource, type Repository } from 'typeorm';
import { TenantsService } from '../tenants/tenants.service.js';
import { type NewUser, normalizeEmail, saveUser, toSessionUser } from './user-accounts.js';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tenants: TenantsService,
    private readonly dataSource: DataSource,
  ) {}

  create(input: NewUser): Promise<User> {
    return this.dataSource.transaction((manager) => saveUser(manager, input));
  }

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

  async toSessionUser(user: User): Promise<SessionUser> {
    const allActive = user.allTenants ? await this.tenants.listActive() : [];
    return toSessionUser(user, allActive);
  }
}
