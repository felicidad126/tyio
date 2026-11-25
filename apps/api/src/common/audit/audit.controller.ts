import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { AUDIT_PAGE_DEFAULT, AUDIT_PAGE_MAX, type AuditPage } from '@npr/shared';
import { RequireRole } from '../../modules/auth/roles.guard.js';
import { CurrentScope, TenantScoped } from '../tenant/tenancy.js';
import type { TenantScope } from '../tenant/tenant-scope.js';
import { type AuditQuery, AuditService } from './audit.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Jejak audit untuk admin, dalam cakupan customer admin itu. */
@Controller('audit')
@TenantScoped()
@RequireRole('admin')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentScope() scope: TenantScope, @Query() query: Record<string, unknown>): Promise<AuditPage> {
    return this.audit.list(scope, parseAuditQuery(query));
  }
}

function parseAuditQuery(query: Record<string, unknown>): AuditQuery {
  const { limit, before, tenantId } = query;
  const parsed: AuditQuery = { limit: AUDIT_PAGE_DEFAULT };

  if (limit !== undefined) {
    const value = typeof limit === 'string' && /^\d{1,4}$/.test(limit) ? Number(limit) : NaN;
    if (!(value >= 1 && value <= AUDIT_PAGE_MAX)) {
      throw new BadRequestException(`limit harus bilangan 1–${AUDIT_PAGE_MAX}.`);
    }
    parsed.limit = value;
  }
  if (before !== undefined) {
    if (typeof before !== 'string' || !/^[1-9]\d{0,18}$/.test(before)) {
      throw new BadRequestException('before harus id catatan audit.');
    }
    parsed.before = before;
  }
  if (tenantId !== undefined) {
    if (typeof tenantId !== 'string' || !UUID.test(tenantId)) {
      throw new BadRequestException('tenantId harus id customer.');
    }
    parsed.tenantId = tenantId.toLowerCase();
  }
  return parsed;
}
