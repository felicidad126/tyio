import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { Tenant } from './tenant.entity.js';

@Injectable()
export class TenantsService {
  constructor(@InjectRepository(Tenant) private readonly tenants: Repository<Tenant>) {}

  /** Customer aktif, urut nama. */
  listActive(): Promise<Tenant[]> {
    return this.tenants.find({ where: { active: true }, order: { name: 'ASC' } });
  }

  /** Customer aktif dengan kode tertentu; kode yang tidak ada atau nonaktif tidak ikut. */
  findActiveByCodes(codes: readonly string[]): Promise<Tenant[]> {
    if (codes.length === 0) return Promise.resolve([]);
    return this.tenants.find({ where: { code: In([...codes]), active: true } });
  }
}
