import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  type CreateCustomer,
  type CreateMasterValue,
  type CustomerRecord,
  MASTER_KIND_LABELS,
  MASTER_KINDS_WITH_CODE,
  type MasterKind,
  type MasterValue,
  type UpdateCustomer,
  type UpdateMasterValue,
} from '@npr/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { type AuditActor, auditedTransaction } from '../../common/audit/audit-context.js';
import { applyTenantScope, scopeIncludes, type TenantScope } from '../../common/tenant/tenant-scope.js';
import { Tenant } from '../tenants/tenant.entity.js';
import { TENANT_NOT_FOUND_MESSAGE } from '../tenants/tenants.controller.js';
import { isInUseError, postgresError, UNIQUE_VIOLATION } from './master-input.js';
import { MASTER_ENTITIES, type MasterNetwork } from './master-value.entity.js';

const byName = new Intl.Collator('id', { sensitivity: 'base', numeric: true });

export const CUSTOMER_ADMIN_ONLY_MESSAGE =
  'Daftar customer hanya bisa diubah admin yang mengelola semua customer.';

export function notFoundMessage(kind: MasterKind): string {
  return `${MASTER_KIND_LABELS[kind]} tidak ditemukan.`;
}

/**
 * Data master per customer (langkah 1.1). Semua baca dan tulis melewati cakupan customer
 * pengguna (T9); nilai di luar cakupan diperlakukan seperti tidak ada (T29). Semua tulisan
 * lewat `auditedTransaction` (T25).
 */
@Injectable()
export class MasterService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // ---------- kategori, system, jarkom ----------

  /** Semua nilai (aktif dan nonaktif) dalam cakupan, urut customer lalu nama. */
  async listValues(kind: MasterKind, scope: TenantScope, tenantId?: string): Promise<MasterValue[]> {
    const query = this.valueQuery(this.dataSource.manager, kind, scope);
    if (tenantId !== undefined) query.andWhere('value.tenantId = :tenantId', { tenantId });
    const values = await query.getMany();
    return values
      .sort((a, b) => a.tenantId.localeCompare(b.tenantId) || byName.compare(a.name, b.name))
      .map((value) => toMasterValue(value));
  }

  async createValue(
    kind: MasterKind,
    scope: TenantScope,
    actor: AuditActor,
    input: CreateMasterValue,
  ): Promise<MasterValue> {
    return this.write(kind, actor, async (manager) => {
      // Hanya ke customer aktif dalam cakupan; selain itu seperti customer tidak ada.
      const tenant = await this.visibleTenant(manager, scope, input.tenantId, { activeOnly: true });
      if (!tenant) throw new NotFoundException(TENANT_NOT_FOUND_MESSAGE);

      const repository = manager.getRepository(MASTER_ENTITIES[kind]);
      const created = await repository.save(
        repository.create({
          tenantId: tenant.id,
          name: input.name,
          ...(MASTER_KINDS_WITH_CODE.includes(kind) ? { code: input.code } : {}),
        }),
      );
      return toMasterValue(created);
    });
  }

  async updateValue(
    kind: MasterKind,
    scope: TenantScope,
    actor: AuditActor,
    id: string,
    patch: UpdateMasterValue,
  ): Promise<MasterValue> {
    return this.write(kind, actor, async (manager) => {
      const value = await this.valueQuery(manager, kind, scope)
        .andWhere('value.id = :id', { id })
        .setLock('pessimistic_write')
        .getOne();
      if (!value) throw new NotFoundException(notFoundMessage(kind));

      if (patch.name !== undefined) value.name = patch.name;
      if (patch.active !== undefined) value.active = patch.active;
      const saved = await manager.getRepository(MASTER_ENTITIES[kind]).save(value);
      return toMasterValue(saved);
    });
  }

  /**
   * Menghapus nilai yang belum pernah dipakai. Nilai yang sudah dipakai ditolak database
   * (foreign key dari tabel pemakai), lalu dijawab 409 dengan saran menonaktifkan (T45).
   */
  async deleteValue(kind: MasterKind, scope: TenantScope, actor: AuditActor, id: string): Promise<void> {
    await this.write(kind, actor, async (manager) => {
      const value = await this.valueQuery(manager, kind, scope)
        .andWhere('value.id = :id', { id })
        .setLock('pessimistic_write')
        .getOne();
      if (!value) throw new NotFoundException(notFoundMessage(kind));
      await manager.getRepository(MASTER_ENTITIES[kind]).delete({ id: value.id });
    });
  }

  // ---------- customer ----------

  /** Customer dalam cakupan, termasuk yang nonaktif bagi admin semua customer. */
  async listCustomers(scope: TenantScope): Promise<CustomerRecord[]> {
    const tenants = await applyTenantScope(
      this.dataSource.manager.getRepository(Tenant).createQueryBuilder('tenant'),
      scope,
      'tenant.id',
    ).getMany();
    return tenants
      .sort((a, b) => byName.compare(a.name, b.name) || a.code.localeCompare(b.code))
      .map(toCustomerRecord);
  }

  async createCustomer(scope: TenantScope, actor: AuditActor, input: CreateCustomer): Promise<CustomerRecord> {
    requireAllTenants(scope);
    return this.writeCustomer(actor, async (manager) => {
      const repository = manager.getRepository(Tenant);
      return toCustomerRecord(await repository.save(repository.create({ code: input.code, name: input.name })));
    });
  }

  async updateCustomer(
    scope: TenantScope,
    actor: AuditActor,
    id: string,
    patch: UpdateCustomer,
  ): Promise<CustomerRecord> {
    requireAllTenants(scope);
    return this.writeCustomer(actor, async (manager) => {
      const tenant = await this.visibleTenant(manager, scope, id, { activeOnly: false, lock: true });
      if (!tenant) throw new NotFoundException(TENANT_NOT_FOUND_MESSAGE);
      if (patch.name !== undefined) tenant.name = patch.name;
      if (patch.active !== undefined) tenant.active = patch.active;
      return toCustomerRecord(await manager.getRepository(Tenant).save(tenant));
    });
  }

  /** Customer yang sudah punya pengguna, data master, atau data lain hanya bisa dinonaktifkan. */
  async deleteCustomer(scope: TenantScope, actor: AuditActor, id: string): Promise<void> {
    requireAllTenants(scope);
    await this.writeCustomer(actor, async (manager) => {
      const tenant = await this.visibleTenant(manager, scope, id, { activeOnly: false, lock: true });
      if (!tenant) throw new NotFoundException(TENANT_NOT_FOUND_MESSAGE);
      await manager.getRepository(Tenant).delete({ id: tenant.id });
    });
  }

  // ---------- bantuan ----------

  private valueQuery(manager: EntityManager, kind: MasterKind, scope: TenantScope) {
    return applyTenantScope(
      manager.getRepository(MASTER_ENTITIES[kind]).createQueryBuilder('value'),
      scope,
      'value.tenantId',
    );
  }

  private visibleTenant(
    manager: EntityManager,
    scope: TenantScope,
    id: string,
    options: { activeOnly: boolean; lock?: boolean },
  ): Promise<Tenant | null> {
    if (!scopeIncludes(scope, id)) return Promise.resolve(null);
    const query = manager.getRepository(Tenant).createQueryBuilder('tenant').where('tenant.id = :id', { id });
    if (options.activeOnly) query.andWhere('tenant.active');
    if (options.lock) query.setLock('pessimistic_write');
    return query.getOne();
  }

  private async write<T>(kind: MasterKind, actor: AuditActor, work: (manager: EntityManager) => Promise<T>) {
    const label = MASTER_KIND_LABELS[kind];
    try {
      return await auditedTransaction(this.dataSource, actor, work);
    } catch (error) {
      const pg = postgresError(error);
      if (pg?.code === UNIQUE_VIOLATION) {
        throw new ConflictException(
          pg.constraint?.endsWith('_code_key')
            ? `Kode ${label.toLowerCase()} ini sudah ada di customer tersebut.`
            : `${label} dengan nama ini sudah ada di customer tersebut.`,
        );
      }
      if (isInUseError(pg)) {
        throw new ConflictException(`${label} ini sudah dipakai, jadi tidak bisa dihapus. Nonaktifkan saja.`);
      }
      throw error;
    }
  }

  private async writeCustomer<T>(actor: AuditActor, work: (manager: EntityManager) => Promise<T>) {
    try {
      return await auditedTransaction(this.dataSource, actor, work);
    } catch (error) {
      const pg = postgresError(error);
      if (pg?.code === UNIQUE_VIOLATION) throw new ConflictException('Kode customer ini sudah dipakai.');
      if (isInUseError(pg)) {
        throw new ConflictException(
          'Customer ini sudah punya pengguna atau data, jadi tidak bisa dihapus. Nonaktifkan saja.',
        );
      }
      throw error;
    }
  }
}

/** Hanya admin semua customer yang mengubah daftar customer itu sendiri (T44). */
function requireAllTenants(scope: TenantScope): void {
  if (!scope.all) throw new ForbiddenException(CUSTOMER_ADMIN_ONLY_MESSAGE);
}

function toMasterValue(value: { id: string; tenantId: string; name: string; active: boolean }): MasterValue {
  const code = (value as Partial<MasterNetwork>).code;
  return {
    id: value.id,
    tenantId: value.tenantId,
    name: value.name,
    code: code ?? null,
    active: value.active,
  };
}

function toCustomerRecord(tenant: Tenant): CustomerRecord {
  return { id: tenant.id, code: tenant.code, name: tenant.name, active: tenant.active };
}
