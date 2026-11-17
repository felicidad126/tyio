import {
  Brackets,
  type ObjectLiteral,
  type Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import type { TenantAccess } from './tenant-access.js';

const REPLACING_METHODS = ['where', 'orWhere', 'whereInIds', 'orWhereInIds'] as const;

/**
 * Satu-satunya tempat filter tenant ditulis (T9). Data milik tenant hanya dibaca lewat
 * `query()`, yang mengembalikan query builder yang sudah dibatasi dan dikunci:
 *  - `andWhere` selalu dibungkus kurung, jadi `a OR b` tidak bisa melewati filter;
 *  - `where`, `orWhere`, `whereInIds`, `orWhereInIds` ditolak karena akan mengganti atau
 *    melewati filter tenant.
 */
export class TenantScopedRepository<T extends ObjectLiteral> {
  constructor(
    private readonly repo: Repository<T>,
    /** Properti entity yang berisi id tenant (`tenantId`; untuk entity tenant sendiri: `id`). */
    private readonly tenantProperty: string,
  ) {}

  query(access: TenantAccess, alias: string): SelectQueryBuilder<T> {
    const qb = this.repo.createQueryBuilder(alias);
    const column = `${alias}.${this.tenantProperty}`;
    if (!access.all) {
      if (access.tenantIds.length === 0) {
        qb.where('1 = 0');
      } else {
        qb.where(`${column} IN (:...tyioTenantIds)`, { tyioTenantIds: access.tenantIds });
      }
    }
    return lockTenantFilter(qb);
  }
}

function lockTenantFilter<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>): SelectQueryBuilder<T> {
  const andWhere = qb.andWhere.bind(qb);
  // Kondisi tambahan: teks SQL atau Brackets, selalu dikurung sebelum digabung dengan AND.
  qb.andWhere = ((condition: string | Brackets, parameters?: ObjectLiteral) =>
    andWhere(
      new Brackets((inner) => {
        inner.where(condition as string, parameters);
      }),
    )) as typeof qb.andWhere;
  for (const method of REPLACING_METHODS) {
    qb[method] = (() => {
      throw new Error(
        `${method}() tidak boleh dipakai pada query terbatas tenant: akan mengganti atau melewati ` +
          'filter tenant. Pakai andWhere() (bisa berisi OR, otomatis dikurung).',
      );
    }) as never;
  }
  return qb;
}
